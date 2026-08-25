-- Standard tier payout was set at $3.00/check-in; corrected to $3.50.
-- Premium stays $5.00.
update public.passport_checkin_costs set club_payout_cents = 350 where checkin_tier = 'standard';

-- Two independent caps a director can set, both optional (null = unlimited):
-- a per-run ceiling on total Passport check-ins for that specific run, and a
-- per-runner ceiling on how many times any one Passport subscriber can check
-- in at this klub within a calendar month.
alter table public.runs
  add column if not exists passport_checkin_limit integer;

comment on column public.runs.passport_checkin_limit is 'Max Passport check-ins allowed on this run. Null = unlimited.';

alter table public.clubs
  add column if not exists passport_monthly_checkin_limit_per_user integer;

comment on column public.clubs.passport_monthly_checkin_limit_per_user is 'Max times a single Passport subscriber may check in at this klub per calendar month. Null = unlimited.';

alter table public.passport_checkins
  add column if not exists run_id uuid references public.runs(id) on delete set null;

create index if not exists passport_checkins_run_idx on public.passport_checkins(run_id) where run_id is not null;
