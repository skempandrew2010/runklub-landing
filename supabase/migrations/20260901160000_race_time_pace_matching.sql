-- Lets a runner joining a klub enter a race time (mile/5k/10k/half/full) or a
-- direct training pace and get matched to the director's closest pace group,
-- instead of no pace input existing anywhere in the real join flow. Adds the
-- same four columns to both membership_requests (captured at request time)
-- and subscriptions (the resulting member record, copied over on approval or
-- set directly by the Stripe webhook for paid joins).
--
-- race_distance is null for a manual pace-group pick with no race data at
-- all; race_time_seconds is null when race_distance is 'pace' (direct
-- training-pace entry) or manual. self_reported_pace is always populated
-- whenever a pace_group_id was computed via race-time/pace entry -- the
-- derived decimal minutes-per-mile value actually used to match.

alter table public.membership_requests
  add column pace_group_id uuid references public.pace_groups(id) on delete set null,
  add column self_reported_pace numeric,
  add column race_distance text,
  add column race_time_seconds integer,
  add constraint membership_requests_race_distance_check
    check (race_distance is null or race_distance in ('mile', '5k', '10k', 'half', 'full', 'pace'));

alter table public.subscriptions
  add column pace_group_id uuid references public.pace_groups(id) on delete set null,
  add column self_reported_pace numeric,
  add column race_distance text,
  add column race_time_seconds integer,
  add constraint subscriptions_race_distance_check
    check (race_distance is null or race_distance in ('mile', '5k', '10k', 'half', 'full', 'pace'));

-- membership_requests previously had no UPDATE policy at all (only
-- select_own, select_owner, insert_own -- see 20260806180000). That's fine
-- for a pure first-time insert, but handleRequestJoin upserts on
-- (club_id,user_id), and Postgres requires an UPDATE policy to evaluate the
-- ON CONFLICT DO UPDATE branch. This was likely already a latent gap for
-- re-requesting after a rejection; this feature makes that branch a normal,
-- expected part of the flow (trying the pace modal again with different
-- numbers before a director acts), so it needs to actually work now.
create policy "membership_requests_update_own" on public.membership_requests
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
