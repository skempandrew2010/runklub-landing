-- membership_requests has RLS enabled (toggled directly in the Supabase
-- dashboard at some point — not in any tracked migration) with no policy
-- granting read access. This silently blocked the director's own
-- authenticated browser session from ever seeing pending join requests for
-- their own klub (a plain anon-key SELECT with no filters returns zero rows
-- against a table confirmed to have data via the service-role key), so the
-- Pending Approval card was empty regardless of the UI. INSERT already works
-- for the requesting user (the row exists — some policy or default already
-- permits it), so this only adds what's missing: read access.

alter table public.membership_requests enable row level security;

-- A user can see their own request status (needed by the club page's
-- "Request to Join" / "Request Pending" / "Request Declined" state).
create policy "membership_requests_select_own" on public.membership_requests
  for select
  using (user_id = auth.uid());

-- A klub owner can see pending (and past) requests for their own klub.
create policy "membership_requests_select_owner" on public.membership_requests
  for select
  using (exists(select 1 from public.clubs c where c.id = membership_requests.club_id and c.user_id = auth.uid()));

-- Explicit, minimal insert policy — a user may only ever create their own
-- request. (Approve/reject already goes through the service-role-backed
-- /api/director/approve-member route, so no client-side UPDATE policy is
-- needed for that flow to work.)
create policy "membership_requests_insert_own" on public.membership_requests
  for insert
  with check (user_id = auth.uid());
