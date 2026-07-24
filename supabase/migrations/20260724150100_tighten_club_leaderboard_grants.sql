-- get_club_leaderboard was created without revoking PostgreSQL's default
-- PUBLIC execute grant, so anon could call it despite the intent to gate
-- this behind auth (same class of gap fixed for checkin_to_club earlier).

revoke all on function public.get_club_leaderboard(uuid, text) from public, anon;
grant execute on function public.get_club_leaderboard(uuid, text) to authenticated;
