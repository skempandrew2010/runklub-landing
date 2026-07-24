-- Passport "collection psychology" rebuild — Section 1 (data model).
-- Additive only: makes club->city membership explicit (instead of inferred
-- via string-matching at query time), adds per-club custom stamp art,
-- flags home vs. away/travel check-ins, and adds a get_user_passport()
-- function that computes per-city progress and surfaces the single
-- nearest-incomplete city (fewest stamps remaining to complete it).

-- 1. Explicit club -> city membership
alter table public.clubs add column city_id uuid references public.cities(id);

update public.clubs c
set city_id = ci.id
from public.cities ci
where c.city is not null and c.city <> ''
  and ci.name = trim(split_part(c.city, ',', 1));

create index clubs_city_id_idx on public.clubs(city_id);

-- 2. Per-club custom stamp art
create table public.stamps (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null unique references public.clubs(id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now()
);

alter table public.stamps enable row level security;

create policy "Anyone can view stamps"
  on public.stamps for select
  using (true);

create policy "Klub directors can insert their klub's stamp"
  on public.stamps for insert
  to authenticated
  with check (exists (select 1 from public.clubs c where c.id = stamps.club_id and c.user_id = auth.uid()));

create policy "Klub directors can update their klub's stamp"
  on public.stamps for update
  to authenticated
  using (exists (select 1 from public.clubs c where c.id = stamps.club_id and c.user_id = auth.uid()));

create policy "Klub directors can delete their klub's stamp"
  on public.stamps for delete
  to authenticated
  using (exists (select 1 from public.clubs c where c.id = stamps.club_id and c.user_id = auth.uid()));

-- 3. Home vs. away/travel flag on check-ins
alter table public.club_checkins add column is_home boolean not null default false;

-- Recomputes is_home on every check-in (not just the first) so it reflects
-- the user's current relationship to the klub, not whatever it was at their
-- very first visit.
create or replace function public._checkin_core(p_user_id uuid, p_club_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city_id uuid;
  v_club_city text;
  v_club_first boolean := false;
  v_club_count integer;
  v_city_first boolean := false;
  v_city_count integer;
  v_is_home boolean;
begin
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

  insert into public.checkin_log (user_id, club_id, city_id)
  values (p_user_id, p_club_id, v_city_id);

  return json_build_object(
    'club_first', v_club_first,
    'club_count', v_club_count,
    'city_first', v_city_first,
    'city_count', v_city_count,
    'city_id', v_city_id,
    'is_home', v_is_home
  );
end;
$$;

-- 4. Per-user passport progress + nearest-incomplete-set
create or replace function public.get_user_passport()
returns table(
  city_id uuid,
  city_name text,
  city_state text,
  flag_asset_url text,
  total_clubs integer,
  stamped_clubs integer,
  remaining integer,
  is_complete boolean,
  is_nearest_incomplete boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return;
  end if;

  return query
  with city_totals as (
    select c.id as city_id, c.name as city_name, c.state as city_state, c.flag_asset_url,
           count(cl.id)::int as total_clubs
    from public.cities c
    left join public.clubs cl on cl.city_id = c.id
    group by c.id, c.name, c.state, c.flag_asset_url
  ),
  stamped as (
    select cc.city_id, count(*)::int as stamped_clubs
    from public.club_checkins cc
    where cc.user_id = v_user_id and cc.city_id is not null
    group by cc.city_id
  ),
  progress as (
    select
      t.city_id, t.city_name, t.city_state, t.flag_asset_url, t.total_clubs,
      coalesce(s.stamped_clubs, 0) as stamped_clubs,
      greatest(t.total_clubs - coalesce(s.stamped_clubs, 0), 0) as remaining,
      (t.total_clubs > 0 and coalesce(s.stamped_clubs, 0) >= t.total_clubs) as is_complete
    from city_totals t
    left join stamped s on s.city_id = t.city_id
  ),
  ranked as (
    select
      p.city_id,
      row_number() over (order by p.remaining asc, p.total_clubs desc, p.city_name asc) as rn
    from progress p
    where not p.is_complete and p.total_clubs > 0
  )
  select
    p.city_id, p.city_name, p.city_state, p.flag_asset_url,
    p.total_clubs, p.stamped_clubs, p.remaining, p.is_complete,
    coalesce(r.rn = 1, false) as is_nearest_incomplete
  from progress p
  left join ranked r on r.city_id = p.city_id
  order by p.stamped_clubs desc, p.city_name asc;
end;
$$;

revoke all on function public.get_user_passport() from public, anon;
grant execute on function public.get_user_passport() to authenticated;
