-- Club-level leaderboard: ranks members of a single club by check-in count,
-- scoped to "this month" (default) or "all-time". Reads from checkin_log,
-- the per-event log _checkin_core already writes to on every check-in, so
-- the same source of truth backs both scopes and the Passport streak calc.

create index if not exists checkin_log_club_id_checked_in_at_idx
  on public.checkin_log (club_id, checked_in_at);

create or replace function public.get_club_leaderboard(p_club_id uuid, p_scope text default 'month')
returns table(
  user_id uuid,
  display_name text,
  avatar_url text,
  checkin_count integer,
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
begin
  if p_scope not in ('month', 'all') then
    raise exception 'invalid scope: %', p_scope;
  end if;

  v_start := case when p_scope = 'month' then date_trunc('month', now()) else '-infinity'::timestamptz end;

  return query
  with agg as (
    select cl.user_id, count(*)::int as checkin_count, min(cl.checked_in_at) as first_checkin_at
    from public.checkin_log cl
    where cl.club_id = p_club_id and cl.checked_in_at >= v_start
    group by cl.user_id
  )
  select
    a.user_id,
    p.display_name,
    p.avatar_url,
    a.checkin_count,
    a.first_checkin_at,
    row_number() over (order by a.checkin_count desc, a.first_checkin_at asc)::int as rank
  from agg a
  join public.profiles p on p.id = a.user_id
  order by rank;
end;
$$;

grant execute on function public.get_club_leaderboard(uuid, text) to authenticated;
