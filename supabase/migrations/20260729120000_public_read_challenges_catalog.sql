-- challenges (catalog) and club_challenge_scores (klub-vs-klub leaderboard)
-- were originally scoped "to authenticated" on the assumption only signed-in
-- users would ever see them. Missions/Passport now show a blurred public
-- teaser of this data to signed-out visitors (matching clubs/cities' own
-- "Anyone can view" policies), so anon needs read access too. Neither table
-- carries anything user-specific — user_challenge_progress (the actual
-- personal data) stays locked to auth.uid() = user_id, unchanged.
drop policy "Anyone can view active challenges" on public.challenges;
create policy "Anyone can view active challenges"
  on public.challenges for select
  to public
  using (true);

drop policy "Anyone can view club challenge scores" on public.club_challenge_scores;
create policy "Anyone can view club challenge scores"
  on public.club_challenge_scores for select
  to public
  using (true);
