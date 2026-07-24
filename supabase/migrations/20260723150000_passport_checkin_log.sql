-- Event log of every check-in (not just first-time unlocks), needed to
-- compute real streaks/analytics — club_checkins/city_checkins only track
-- an aggregate count + first_checkin_at, not per-visit history.
create table public.checkin_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  city_id uuid references public.cities(id) on delete set null,
  checked_in_at timestamptz not null default now()
);

create index checkin_log_user_id_idx on public.checkin_log(user_id);

alter table public.checkin_log enable row level security;

create policy "Users can view their own checkin log"
  on public.checkin_log for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own checkin log"
  on public.checkin_log for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Log every call (not just first-time unlocks) so streaks/analytics reflect
-- real visit history.
create or replace function public.checkin_to_club(p_club_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_city_id uuid;
  v_club_city text;
  v_club_first boolean := false;
  v_club_count integer;
  v_city_first boolean := false;
  v_city_count integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select trim(split_part(city, ',', 1)) into v_club_city
  from public.clubs where id = p_club_id;

  if v_club_city is not null then
    select id into v_city_id from public.cities where name = v_club_city;
  end if;

  update public.club_checkins
    set checkin_count = checkin_count + 1
    where user_id = v_user_id and club_id = p_club_id
    returning checkin_count into v_club_count;

  if not found then
    insert into public.club_checkins (user_id, club_id, city_id)
    values (v_user_id, p_club_id, v_city_id)
    returning checkin_count into v_club_count;
    v_club_first := true;
  end if;

  if v_city_id is not null then
    update public.city_checkins
      set checkin_count = checkin_count + 1
      where user_id = v_user_id and city_id = v_city_id
      returning checkin_count into v_city_count;

    if not found then
      insert into public.city_checkins (user_id, city_id)
      values (v_user_id, v_city_id)
      returning checkin_count into v_city_count;
      v_city_first := true;
    end if;
  end if;

  insert into public.checkin_log (user_id, club_id, city_id)
  values (v_user_id, p_club_id, v_city_id);

  return json_build_object(
    'club_first', v_club_first,
    'club_count', v_club_count,
    'city_first', v_city_first,
    'city_count', v_city_count,
    'city_id', v_city_id
  );
end;
$$;
