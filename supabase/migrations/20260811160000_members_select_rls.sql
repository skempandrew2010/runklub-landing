-- members had RLS enabled but zero policies, silently blocking every client-side
-- read (e.g. HubContent.tsx's own-membership lookup, and the new pace-group-
-- personalized workout lookup on the run page) while only the service-role key
-- (director API routes) could see anything.
create policy "members_select_own" on public.members
  for select
  using (user_id = auth.uid());

create policy "members_select_club_owner" on public.members
  for select
  using (exists(select 1 from public.clubs c where c.id = members.club_id and c.user_id = auth.uid()));
