-- Postgres auto-grants PUBLIC execute on new functions unless revoked;
-- checkin_to_club never had that revoked, so anon/public technically could
-- call it (harmlessly — it immediately raises "Not authenticated" since
-- auth.uid() is null for them). Tightening for clarity/consistency with the
-- other checkin functions, not fixing an active vulnerability.
revoke all on function public.checkin_to_club(uuid) from public, anon;
grant execute on function public.checkin_to_club(uuid) to authenticated;
