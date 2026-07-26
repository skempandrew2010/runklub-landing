-- Passport travel/exploration badge & tier system.
--
-- Tiers (is_tier = true, ordered by tier_rank, monotonic — each requires more
-- than the last so a user's "current tier" is just their highest earned one):
--   1. Local          — first check-in, any club
--   2. Regular        — 3+ distinct clubs checked into, anywhere
--   3. Explorer       — checked into clubs in a 2nd distinct city
--   4. Road Warrior   — checked into clubs in 5 distinct cities
--   5. Cross-Country  — checked into clubs in 3+ distinct states
--   6. Passport Holder— 10+ distinct cities OR 5+ distinct states (either path)
--
-- One-off "moment" badges (is_tier = false, tier_rank null):
--   Away Game    — checked into a club 100+ miles from your home club
--   Race Weekend — stubbed only; no race-date data exists yet, never awarded

create type badge_criteria_type as enum (
  'first_stamp',
  'clubs_visited_total',
  'cities_visited',
  'states_visited',
  'cities_or_states_visited',
  'away_game',
  'race_weekend'
);

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  tier_rank int,
  is_tier boolean not null default true,
  criteria_type badge_criteria_type not null,
  criteria_value int,
  criteria_value_2 int,
  created_at timestamptz not null default now()
);

create table public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  earned_at timestamptz not null default now(),
  city text,
  unique (user_id, badge_id)
);

create index user_badges_user_id_idx on public.user_badges(user_id);

alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

-- Reference data — readable by anyone, written only by the award function below.
create policy badges_read on public.badges for select using (true);
create policy user_badges_read on public.user_badges for select using (true);

insert into public.badges (slug, name, description, tier_rank, is_tier, criteria_type, criteria_value, criteria_value_2) values
  ('local',           'Local',           'Checked in with a klub for the first time.',                     1, true,  'first_stamp',              null, null),
  ('regular',         'Regular',         'Checked in with 3 or more different klubs.',                     2, true,  'clubs_visited_total',       3,    null),
  ('explorer',        'Explorer',        'Checked in with a klub in a second city.',                       3, true,  'cities_visited',            2,    null),
  ('road_warrior',    'Road Warrior',    'Checked in with klubs in 5 different cities.',                   4, true,  'cities_visited',            5,    null),
  ('cross_country',   'Cross-Country',   'Checked in with klubs in 3 or more different states.',           5, true,  'states_visited',            3,    null),
  ('passport_holder', 'Passport Holder', 'Checked in across 10+ cities or 5+ states.',                     6, true,  'cities_or_states_visited', 10,    5),
  ('away_game',        'Away Game',      'Checked in with a klub 100+ miles from your home klub.',      null, false, 'away_game',                100,    null),
  ('race_weekend',     'Race Weekend',   'Checked in with a new klub the weekend of a tracked race.',    null, false, 'race_weekend',              null,  null)
on conflict (slug) do nothing;

-- ─── Award logic ─────────────────────────────────────────────────────────────
-- Called from _checkin_core after a check-in is logged. Evaluates the user's
-- updated totals against every not-yet-earned badge and inserts any newly
-- qualifying ones. Returns the list of newly-earned badges so the caller can
-- surface a celebration without a second round-trip.
create or replace function public.evaluate_and_award_badges(p_user_id uuid, p_club_id uuid, p_city_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_clubs_total int;
  v_cities_total int;
  v_states_total int;
  v_home_club_id uuid;
  v_home_lat double precision;
  v_home_lng double precision;
  v_new_lat double precision;
  v_new_lng double precision;
  v_distance_miles double precision;
  v_badge record;
  v_away_badge record;
  v_newly_earned jsonb := '[]'::jsonb;
begin
  select count(*) into v_clubs_total from public.club_checkins where user_id = p_user_id;
  select count(*) into v_cities_total from public.city_checkins where user_id = p_user_id;
  select count(distinct ci.state) into v_states_total
    from public.city_checkins cc join public.cities ci on ci.id = cc.city_id
    where cc.user_id = p_user_id and ci.state is not null;

  for v_badge in
    select * from public.badges where is_tier = true order by tier_rank asc
  loop
    if exists (select 1 from public.user_badges where user_id = p_user_id and badge_id = v_badge.id) then
      continue;
    end if;

    if (
      (v_badge.criteria_type = 'first_stamp' and v_clubs_total >= 1) or
      (v_badge.criteria_type = 'clubs_visited_total' and v_clubs_total >= v_badge.criteria_value) or
      (v_badge.criteria_type = 'cities_visited' and v_cities_total >= v_badge.criteria_value) or
      (v_badge.criteria_type = 'states_visited' and v_states_total >= v_badge.criteria_value) or
      (v_badge.criteria_type = 'cities_or_states_visited' and (v_cities_total >= v_badge.criteria_value or v_states_total >= v_badge.criteria_value_2))
    ) then
      insert into public.user_badges (user_id, badge_id) values (p_user_id, v_badge.id);
      v_newly_earned := v_newly_earned || jsonb_build_object('slug', v_badge.slug, 'name', v_badge.name, 'is_tier', true);
    end if;
  end loop;

  -- Away Game — one-off, evaluated against the club just checked into vs. the
  -- user's home club (whichever club_checkins row is currently flagged
  -- is_home). No home club yet, or checking into the home club itself, means
  -- nothing to evaluate.
  select club_id into v_home_club_id from public.club_checkins where user_id = p_user_id and is_home = true limit 1;
  if v_home_club_id is not null and v_home_club_id != p_club_id then
    select latitude, longitude into v_home_lat, v_home_lng from public.clubs where id = v_home_club_id;
    select latitude, longitude into v_new_lat, v_new_lng from public.clubs where id = p_club_id;
    if v_home_lat is not null and v_home_lng is not null and v_new_lat is not null and v_new_lng is not null then
      v_distance_miles := 3958.8 * acos(
        least(1.0, greatest(-1.0,
          cos(radians(v_home_lat)) * cos(radians(v_new_lat)) * cos(radians(v_new_lng) - radians(v_home_lng)) +
          sin(radians(v_home_lat)) * sin(radians(v_new_lat))
        ))
      );
      if v_distance_miles >= 100 then
        select * into v_away_badge from public.badges where slug = 'away_game';
        if not exists (select 1 from public.user_badges where user_id = p_user_id and badge_id = v_away_badge.id) then
          insert into public.user_badges (user_id, badge_id, city)
            values (p_user_id, v_away_badge.id, (select name from public.cities where id = p_city_id));
          v_newly_earned := v_newly_earned || jsonb_build_object('slug', v_away_badge.slug, 'name', v_away_badge.name, 'is_tier', false);
        end if;
      end if;
    end if;
  end if;

  return v_newly_earned::json;
end;
$$;

revoke all on function public.evaluate_and_award_badges(uuid, uuid, uuid) from public, anon, authenticated;

-- ─── Progress read function ──────────────────────────────────────────────────
-- Current tier + progress toward the next one, e.g. "3 of 5 cities to Road Warrior".
create or replace function public.get_user_tier_progress(p_user_id uuid)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_clubs_total int;
  v_cities_total int;
  v_states_total int;
  v_current record;
  v_next record;
  v_current_value int;
  v_target_value int;
  v_metric text;
begin
  select count(*) into v_clubs_total from public.club_checkins where user_id = p_user_id;
  select count(*) into v_cities_total from public.city_checkins where user_id = p_user_id;
  select count(distinct ci.state) into v_states_total
    from public.city_checkins cc join public.cities ci on ci.id = cc.city_id
    where cc.user_id = p_user_id and ci.state is not null;

  select b.* into v_current
    from public.user_badges ub join public.badges b on b.id = ub.badge_id
    where ub.user_id = p_user_id and b.is_tier = true
    order by b.tier_rank desc limit 1;

  select * into v_next from public.badges
    where is_tier = true and tier_rank = coalesce(v_current.tier_rank, 0) + 1;

  if v_next.id is null then
    return json_build_object(
      'current_tier', v_current.name,
      'current_tier_slug', v_current.slug,
      'next_tier', null,
      'next_tier_slug', null,
      'progress_current', null,
      'progress_target', null,
      'progress_metric', null,
      'clubs_total', v_clubs_total,
      'cities_total', v_cities_total,
      'states_total', v_states_total
    );
  end if;

  if v_next.criteria_type = 'first_stamp' then
    v_current_value := least(v_clubs_total, 1); v_target_value := 1; v_metric := 'check-ins';
  elsif v_next.criteria_type = 'clubs_visited_total' then
    v_current_value := v_clubs_total; v_target_value := v_next.criteria_value; v_metric := 'clubs';
  elsif v_next.criteria_type = 'cities_visited' then
    v_current_value := v_cities_total; v_target_value := v_next.criteria_value; v_metric := 'cities';
  elsif v_next.criteria_type = 'states_visited' then
    v_current_value := v_states_total; v_target_value := v_next.criteria_value; v_metric := 'states';
  elsif v_next.criteria_type = 'cities_or_states_visited' then
    if (v_cities_total::float / v_next.criteria_value) >= (v_states_total::float / v_next.criteria_value_2) then
      v_current_value := v_cities_total; v_target_value := v_next.criteria_value; v_metric := 'cities';
    else
      v_current_value := v_states_total; v_target_value := v_next.criteria_value_2; v_metric := 'states';
    end if;
  else
    v_current_value := 0; v_target_value := 1; v_metric := null;
  end if;

  return json_build_object(
    'current_tier', v_current.name,
    'current_tier_slug', v_current.slug,
    'next_tier', v_next.name,
    'next_tier_slug', v_next.slug,
    'progress_current', v_current_value,
    'progress_target', v_target_value,
    'progress_metric', v_metric,
    'clubs_total', v_clubs_total,
    'cities_total', v_cities_total,
    'states_total', v_states_total
  );
end;
$$;

revoke all on function public.get_user_tier_progress(uuid) from public, anon;
grant execute on function public.get_user_tier_progress(uuid) to authenticated;

-- ─── Wire into the existing check-in path ───────────────────────────────────
-- _checkin_core is the single function all check-ins already flow through
-- (via checkin_to_club_admin, called from /api/checkin). Extending it here
-- keeps badge evaluation on the same transaction as the check-in itself,
-- rather than introducing a separate trigger or Edge Function.
create or replace function public._checkin_core(p_user_id uuid, p_club_id uuid)
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
