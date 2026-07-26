-- Global tier ranking — every user who has earned at least one tier badge,
-- ranked by how far up the ladder they've gotten (ties broken by whoever
-- got there first, then by raw cities/states totals).
create or replace function public.get_tier_leaderboard()
returns table(
  user_id uuid,
  display_name text,
  avatar_url text,
  tier_name text,
  tier_slug text,
  tier_rank int,
  cities_total int,
  states_total int,
  tier_earned_at timestamptz,
  rank int
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with current_tier as (
    select distinct on (ub.user_id)
      ub.user_id, b.name as tier_name, b.slug as tier_slug, b.tier_rank, ub.earned_at as tier_earned_at
    from public.user_badges ub
    join public.badges b on b.id = ub.badge_id
    where b.is_tier = true
    order by ub.user_id, b.tier_rank desc
  ),
  totals as (
    select
      ct.user_id,
      (select count(*)::int from public.club_checkins cc where cc.user_id = ct.user_id) as clubs_total,
      (select count(*)::int from public.city_checkins cc where cc.user_id = ct.user_id) as cities_total,
      (select count(distinct ci.state)::int from public.city_checkins cc join public.cities ci on ci.id = cc.city_id
         where cc.user_id = ct.user_id and ci.state is not null) as states_total
    from current_tier ct
  )
  select
    ct.user_id, p.display_name, p.avatar_url,
    ct.tier_name, ct.tier_slug, ct.tier_rank,
    t.cities_total, t.states_total, ct.tier_earned_at,
    row_number() over (
      order by ct.tier_rank desc, t.cities_total desc, t.states_total desc, ct.tier_earned_at asc
    )::int as rank
  from current_tier ct
  join totals t on t.user_id = ct.user_id
  join public.profiles p on p.id = ct.user_id
  order by rank;
$$;

revoke all on function public.get_tier_leaderboard() from public, anon;
grant execute on function public.get_tier_leaderboard() to authenticated;
