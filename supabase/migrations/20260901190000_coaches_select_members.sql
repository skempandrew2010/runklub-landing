-- Members need to read their own klub's coach roster for the "Ask my
-- coach" DM entry point on the club page (ClubPageClient.tsx) - only
-- coaches_select_owner (the director) and coaches_select_self (the coach)
-- existed before this, so a regular member's browser client got zero rows.
create policy "coaches_select_members" on public.coaches
  for select
  using (exists(select 1 from public.subscriptions s where s.club_id = coaches.club_id and s.user_id = auth.uid()));
