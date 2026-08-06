-- Same root cause as membership_requests (20260806180000): subscriptions,
-- member_invites, coaches, and club_claims all have RLS enabled (via the
-- Supabase dashboard, not any tracked migration) with zero policies —
-- confirmed by querying each directly: the anon key returns empty rows on
-- every one of them even with no filters, against tables proven to have
-- real data via the service-role key. Since these are read (and in a couple
-- cases, written) directly from the browser client throughout the app, this
-- silently broke: the Members list (approved members never show up),
-- "Sent invites", coach assignment, and a club's claim-status check.
--
-- Server routes (approve-member, add-member, invite-member, admin/claims)
-- use the service-role key and were never affected — this only restores
-- what the browser client itself needs.

-- ── subscriptions (the follow/member relationship) ──────────────────────
alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own_or_owner" on public.subscriptions
  for select
  using (
    user_id = auth.uid()
    or exists(select 1 from public.clubs c where c.id = subscriptions.club_id and c.user_id = auth.uid())
  );

create policy "subscriptions_insert_own" on public.subscriptions
  for insert
  with check (user_id = auth.uid());

create policy "subscriptions_update_own" on public.subscriptions
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "subscriptions_delete_own" on public.subscriptions
  for delete
  using (user_id = auth.uid());

-- ── member_invites (browser only ever reads; writes go through
--    /api/director/invite-member with the service role key) ────────────
alter table public.member_invites enable row level security;

create policy "member_invites_select_owner" on public.member_invites
  for select
  using (exists(select 1 from public.clubs c where c.id = member_invites.club_id and c.user_id = auth.uid()));

-- ── coaches (browser reads + writes directly: makeCoach/removeCoach in
--    app/director/page.tsx, plus the coach dropdown in create-run) ──────
alter table public.coaches enable row level security;

create policy "coaches_select_owner" on public.coaches
  for select
  using (exists(select 1 from public.clubs c where c.id = coaches.club_id and c.user_id = auth.uid()));

create policy "coaches_insert_owner" on public.coaches
  for insert
  with check (exists(select 1 from public.clubs c where c.id = coaches.club_id and c.user_id = auth.uid()));

create policy "coaches_delete_owner" on public.coaches
  for delete
  using (exists(select 1 from public.clubs c where c.id = coaches.club_id and c.user_id = auth.uid()));

-- ── club_claims (a user checking/submitting their own claim on an
--    unclaimed klub; admin review goes through the service role key) ───
alter table public.club_claims enable row level security;

create policy "club_claims_select_own" on public.club_claims
  for select
  using (user_id = auth.uid());

create policy "club_claims_insert_own" on public.club_claims
  for insert
  with check (user_id = auth.uid());
