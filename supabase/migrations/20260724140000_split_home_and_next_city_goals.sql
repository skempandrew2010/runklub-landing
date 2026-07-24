-- Splits the single "nearest incomplete" goal into two: your home city's
-- own completion progress, and the nearest OTHER incomplete city (home
-- city excluded from that ranking so the two goals are always distinct).

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
  is_home_city boolean,
  is_nearest_incomplete boolean
)
language plpgsql
security definer
set search_path = public
stable
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

  select cc.city_id, ci.lat, ci.lng
  into v_home_city_id, v_home_lat, v_home_lng
  from public.club_checkins cc
  join public.cities ci on ci.id = cc.city_id
  where cc.user_id = v_user_id and cc.is_home and ci.lat is not null and ci.lng is not null
  order by cc.checkin_count desc, cc.first_checkin_at asc
  limit 1;

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
  -- Nearest incomplete city OTHER than home, so the two goal boxes never collide.
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
