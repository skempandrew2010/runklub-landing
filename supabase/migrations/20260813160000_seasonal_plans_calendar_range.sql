-- Replaces the rolling "N months from whenever you sign up" seasonal
-- duration with a real calendar range the director picks (e.g. June-August
-- 2026) -- everyone who joins a given season shares the same end date,
-- rather than each getting a personal N-month window starting at signup.
alter table public.club_membership_plans
  drop constraint club_membership_plans_duration_months_check;

alter table public.club_membership_plans
  drop column duration_months;

alter table public.club_membership_plans
  add column season_start_date date,
  add column season_end_date date;

alter table public.club_membership_plans
  add constraint club_membership_plans_season_dates_check
  check (
    (billing_interval = 'seasonal' and season_start_date is not null and season_end_date is not null and season_end_date > season_start_date)
    or (billing_interval <> 'seasonal' and season_start_date is null and season_end_date is null)
  );
