-- Widen the check constraint added back in 20260813120000_klub_membership_yearly_option.sql
-- (`billing_interval in ('monthly','yearly')`) to also allow 'seasonal' --
-- missed when seasonal plans were added since that column's constraint
-- lives on subscriptions, separate from club_membership_plans' own check.
alter table public.subscriptions
  drop constraint subscriptions_billing_interval_check;

alter table public.subscriptions
  add constraint subscriptions_billing_interval_check
  check (billing_interval in ('monthly', 'yearly', 'seasonal'));
