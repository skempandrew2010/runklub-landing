-- Explicit home klub designation, so "home" isn't just implicitly derived
-- from membership/subscription status (which can flag more than one club as
-- is_home for the same user). Used by the Away Game badge and the Passport
-- "Home City" goal, both of which prefer this when set and fall back to the
-- existing derived logic otherwise.
alter table public.profiles add column home_club_id uuid references public.clubs(id);

create or replace function public.get_user_passport()
returns table(city_id uuid, city_name text, city_state text, flag_asset_url text, total_clubs integer, stamped_clubs integer, remaining integer, is_complete boolean, is_home_city boolean, is_nearest_incomplete boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_home_city_id uuid;
  v_home_lat double precision;
  v_home_lng double precision;
begin
  if v_user_id is null then
    return;
  end if;

  select ci.id, ci.lat, ci.lng
  into v_home_city_id, v_home_lat, v_home_lng
  from public.profiles p
  join public.clubs cl on cl.id = p.home_club_id
  join public.cities ci on ci.id = cl.city_id
  where p.id = v_user_id and ci.lat is not null and ci.lng is not null;

  if v_home_city_id is null then
    select cc.city_id, ci.lat, ci.lng
    into v_home_city_id, v_home_lat, v_home_lng
    from public.club_checkins cc
    join public.cities ci on ci.id = cc.city_id
    where cc.user_id = v_user_id and cc.is_home and ci.lat is not null and ci.lng is not null
    order by cc.checkin_count desc, cc.first_checkin_at asc
    limit 1;
  end if;

  return query
  with city_totals as (
    select c.id as city_id, c.name as city_name, c.state as city_state, c.flag_asset_url,
           c.lat, c.lng,
           count(cl.id)::int as total_clubs
    from public.cities c
    left join public.clubs cl on cl.city_id = c.id
    group by c.id, c.name, c.state, c.flag_asset_url, c.lat, c.lng
  ),
  stamped as (
    select cc.city_id, count(*)::int as stamped_clubs
    from public.club_checkins cc
    where cc.user_id = v_user_id and cc.city_id is not null
    group by cc.city_id
  ),
  progress as (
    select
      t.city_id, t.city_name, t.city_state, t.flag_asset_url, t.total_clubs, t.lat, t.lng,
      coalesce(s.stamped_clubs, 0) as stamped_clubs,
      greatest(t.total_clubs - coalesce(s.stamped_clubs, 0), 0) as remaining,
      (t.total_clubs > 0 and coalesce(s.stamped_clubs, 0) >= t.total_clubs) as is_complete
    from city_totals t
    left join stamped s on s.city_id = t.city_id
  ),
  ranked as (
    select
      p.city_id,
      row_number() over (
        order by
          case
            when v_home_lat is not null and p.lat is not null and p.lng is not null then
              2 * 3958.8 * asin(sqrt(
                power(sin(radians(p.lat - v_home_lat) / 2), 2) +
                cos(radians(v_home_lat)) * cos(radians(p.lat)) * power(sin(radians(p.lng - v_home_lng) / 2), 2)
              ))
          end asc nulls last,
          p.remaining asc,
          p.total_clubs desc,
          p.city_name asc
      ) as rn
    from progress p
    where not p.is_complete and p.total_clubs > 0
      and (v_home_city_id is null or p.city_id <> v_home_city_id)
  )
  select
    p.city_id, p.city_name, p.city_state, p.flag_asset_url,
    p.total_clubs, p.stamped_clubs, p.remaining, p.is_complete,
    (v_home_city_id is not null and p.city_id = v_home_city_id) as is_home_city,
    coalesce(r.rn = 1, false) as is_nearest_incomplete
  from progress p
  left join ranked r on r.city_id = p.city_id
  order by p.stamped_clubs desc, p.city_name asc;
end;
$$;

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

  -- Away Game — prefer the explicit profiles.home_club_id when set; fall
  -- back to whichever club_checkins row is derived as is_home otherwise.
  select home_club_id into v_home_club_id from public.profiles where id = p_user_id;
  if v_home_club_id is null then
    select club_id into v_home_club_id from public.club_checkins where user_id = p_user_id and is_home = true limit 1;
  end if;

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
