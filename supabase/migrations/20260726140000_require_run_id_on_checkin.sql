-- Every check-in that feeds Passport stamps/badges/leaderboards must now be
-- tied to a real, existing run — not just "some club" in the abstract.
-- checkin_log gains run_id (nullable, since pre-existing rows predate this
-- and have no run to backfill), and _checkin_core/checkin_to_club_admin now
-- require a valid run_id and raise if one isn't supplied or doesn't exist.
-- Real users could never bypass this anyway (both functions are already
-- revoked from anon/authenticated — only the /api/checkin route, running as
-- service role, calls them) but this closes the gap for direct backend/SQL
-- access too, so a check-in literally cannot be recorded without a run.
alter table public.checkin_log add column run_id uuid references public.runs(id);

drop function if exists public.checkin_to_club_admin(uuid, uuid);
drop function if exists public._checkin_core(uuid, uuid);

create or replace function public._checkin_core(p_user_id uuid, p_club_id uuid, p_run_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_city_id uuid;
  v_club_city text;
  v_club_first boolean := false;
  v_club_count integer;
  v_city_first boolean := false;
  v_city_count integer;
  v_is_home boolean;
  v_new_badges json;
begin
  if p_run_id is null or not exists (select 1 from public.runs where id = p_run_id) then
    raise exception 'A valid run_id is required to check in';
  end if;

  select trim(split_part(city, ',', 1)) into v_club_city
  from public.clubs where id = p_club_id;

  if v_club_city is not null then
    select id into v_city_id from public.cities where name = v_club_city;
  end if;

  v_is_home := exists(
    select 1 from public.subscriptions s where s.club_id = p_club_id and s.user_id = p_user_id
  ) or exists(
    select 1 from public.members m where m.club_id = p_club_id and m.user_id = p_user_id and m.status = 'active'
  );

  update public.club_checkins
    set checkin_count = checkin_count + 1,
        is_home = v_is_home
    where user_id = p_user_id and club_id = p_club_id
    returning checkin_count into v_club_count;

  if not found then
    insert into public.club_checkins (user_id, club_id, city_id, is_home)
    values (p_user_id, p_club_id, v_city_id, v_is_home)
    returning checkin_count into v_club_count;
    v_club_first := true;
  end if;

  if v_city_id is not null then
    update public.city_checkins
      set checkin_count = checkin_count + 1
      where user_id = p_user_id and city_id = v_city_id
      returning checkin_count into v_city_count;

    if not found then
      insert into public.city_checkins (user_id, city_id)
      values (p_user_id, v_city_id)
      returning checkin_count into v_city_count;
      v_city_first := true;
    end if;
  end if;

  insert into public.checkin_log (user_id, club_id, city_id, run_id)
  values (p_user_id, p_club_id, v_city_id, p_run_id);

  v_new_badges := public.evaluate_and_award_badges(p_user_id, p_club_id, v_city_id);

  return json_build_object(
    'club_first', v_club_first,
    'club_count', v_club_count,
    'city_first', v_city_first,
    'city_count', v_city_count,
    'city_id', v_city_id,
    'is_home', v_is_home,
    'new_badges', v_new_badges
  );
end;
$$;

create or replace function public.checkin_to_club_admin(p_user_id uuid, p_club_id uuid, p_run_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return public._checkin_core(p_user_id, p_club_id, p_run_id);
end;
$$;

revoke all on function public.checkin_to_club_admin(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public._checkin_core(uuid, uuid, uuid) from public, anon, authenticated;
