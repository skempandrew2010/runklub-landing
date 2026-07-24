-- Passport v2: city + club stamps with visit counts, replacing the single
-- check_ins event-log table (empty, no real usage yet) with per-user
-- upsert-and-increment rows so "checkin_count" and "first_checkin_at" are
-- available directly for the stamp grid.

drop table if exists public.check_ins;

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text,
  population integer,
  lat double precision,
  lng double precision,
  flag_asset_url text,
  created_at timestamptz not null default now(),
  unique (name)
);

alter table public.cities enable row level security;

create policy "Anyone can view cities"
  on public.cities for select
  using (true);

-- Seed from existing clubs' city field ("City" or "City, ST").
-- Note: grouped by city name only (not name+state) — the current club
-- dataset has exactly one name collision across states (none observed
-- besides "Boulder"/"Boulder, CO"), so this is an acceptable simplification
-- for a city list scoped to markets where clubs already exist.
insert into public.cities (name, state, lat, lng)
select
  trim(split_part(city, ',', 1)) as name,
  max(nullif(trim(split_part(city, ',', 2)), '')) as state,
  avg(latitude) as lat,
  avg(longitude) as lng
from public.clubs
where city is not null and city <> ''
group by trim(split_part(city, ',', 1))
on conflict (name) do nothing;

create table public.city_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  city_id uuid not null references public.cities(id) on delete cascade,
  first_checkin_at timestamptz not null default now(),
  checkin_count integer not null default 1,
  unique (user_id, city_id)
);

create index city_checkins_user_id_idx on public.city_checkins(user_id);

alter table public.city_checkins enable row level security;

create policy "Users can view their own city check-ins"
  on public.city_checkins for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own city check-ins"
  on public.city_checkins for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own city check-ins"
  on public.city_checkins for update
  to authenticated
  using (auth.uid() = user_id);

create table public.club_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  city_id uuid references public.cities(id) on delete set null,
  first_checkin_at timestamptz not null default now(),
  checkin_count integer not null default 1,
  unique (user_id, club_id)
);

create index club_checkins_user_id_idx on public.club_checkins(user_id);
create index club_checkins_club_id_idx on public.club_checkins(club_id);

alter table public.club_checkins enable row level security;

create policy "Users can view their own club check-ins"
  on public.club_checkins for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own club check-ins"
  on public.club_checkins for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own club check-ins"
  on public.club_checkins for update
  to authenticated
  using (auth.uid() = user_id);

-- Atomic upsert-and-increment for a club check-in, with automatic city
-- rollup. Runs as the caller (auth.uid()), never on behalf of anyone else.
-- Returns whether this was a first-time unlock for the club and/or city so
-- the client only plays the unlock animation once.
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

  return json_build_object(
    'club_first', v_club_first,
    'club_count', v_club_count,
    'city_first', v_city_first,
    'city_count', v_city_count,
    'city_id', v_city_id
  );
end;
$$;

grant execute on function public.checkin_to_club(uuid) to authenticated;
