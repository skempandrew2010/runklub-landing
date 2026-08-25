-- Klub-level default for the per-run Passport check-in cap, mirroring how
-- passport_default_credit_value works: a run's own runs.passport_checkin_limit
-- overrides this when set; otherwise this default applies. Null = unlimited
-- by default, same as before this migration.
alter table public.clubs
  add column if not exists passport_default_checkin_limit integer;

comment on column public.clubs.passport_default_checkin_limit is 'Default max Passport check-ins per run for this klub, used when a run does not set its own runs.passport_checkin_limit. Null = unlimited.';
