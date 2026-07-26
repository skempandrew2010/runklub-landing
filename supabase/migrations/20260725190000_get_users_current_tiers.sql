-- Batch tier lookup for a list of users — used to show a tier badge next to
-- names on leaderboards without an N+1 call to get_user_tier_progress per row.
create or replace function public.get_users_current_tiers(p_user_ids uuid[])
returns table(user_id uuid, tier_name text, tier_slug text, tier_rank int)
language sql
stable
security definer
set search_path to 'public'
as $$
  select distinct on (ub.user_id)
    ub.user_id, b.name as tier_name, b.slug as tier_slug, b.tier_rank
  from public.user_badges ub
  join public.badges b on b.id = ub.badge_id
  where ub.user_id = any(p_user_ids) and b.is_tier = true
  order by ub.user_id, b.tier_rank desc;
$$;

revoke all on function public.get_users_current_tiers(uuid[]) from public, anon;
grant execute on function public.get_users_current_tiers(uuid[]) to authenticated;
