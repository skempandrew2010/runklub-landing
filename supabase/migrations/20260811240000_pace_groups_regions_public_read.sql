-- pace_groups/regions were owner-only readable, which silently blocks any
-- non-owner client-side read — notably the Coach dashboard's Training
-- Schedule tab (reuses WeeklyScheduleTab, which queries pace_groups
-- directly). Neither table holds sensitive data (names/pace ranges already
-- surface publicly via run titles and tags), so open them up the same way
-- club_weekly_schedule already is.

create policy "pace_groups_select_public" on public.pace_groups
  for select using (true);

create policy "regions_select_public" on public.regions
  for select using (true);
