-- City-level leaderboard: ranks members by total check-in count across every
-- club mapped to a city, using clubs.city_id (the same FK-based grouping
-- get_user_passport()/getPassportBook() already use) rather than
-- checkin_log.city_id, which is only a legacy text-matched denormalization
-- from _checkin_core and would be a second, potentially drifting definition
-- of "which clubs belong to this city."
--
-- Existing indexes cover this: clubs_city_id_idx (club lookup by city) and
-- checkin_log_club_id_checked_in_at_idx (added for the club leaderboard,
-- also serves the join here) — no new indexes needed.

create or replace function public.get_city_leaderboard(p_city_id uuid, p_scope text default 'month')
returns table(
  user_id uuid,
  display_name text,
  avatar_url text,
  checkin_count integer,
  clubs_visited integer,
  total_clubs integer,
  first_checkin_at timestamptz,
  rank integer
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_start timestamptz;
  v_total_clubs integer;
begin
  if p_scope not in ('month', 'all') then
    raise exception 'invalid scope: %', p_scope;
  end if;

  v_start := case when p_scope = 'month' then date_trunc('month', now()) else '-infinity'::timestamptz end;

  select count(*)::int into v_total_clubs from public.clubs where city_id = p_city_id;

  return query
  with agg as (
    select cl.user_id,
           count(*)::int as checkin_count,
           count(distinct cl.club_id)::int as clubs_visited,
           min(cl.checked_in_at) as first_checkin_at
    from public.checkin_log cl
    join public.clubs c on c.id = cl.club_id
    where c.city_id = p_city_id and cl.checked_in_at >= v_start
    group by cl.user_id
  )
  select
    a.user_id,
    p.display_name,
    p.avatar_url,
    a.checkin_count,
    a.clubs_visited,
    v_total_clubs,
    a.first_checkin_at,
    row_number() over (order by a.checkin_count desc, a.first_checkin_at asc)::int as rank
  from agg a
  join public.profiles p on p.id = a.user_id
  order by rank;
end;
$$;

-- Revoke the default PUBLIC execute grant up front this time (missed on
-- get_club_leaderboard initially, caught and fixed in a follow-up migration).
revoke all on function public.get_city_leaderboard(uuid, text) from public, anon;
grant execute on function public.get_city_leaderboard(uuid, text) to authenticated;
