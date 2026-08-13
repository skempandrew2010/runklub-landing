-- Adds a third plan type: "seasonal" -- a one-time payment (not a
-- recurring Stripe subscription) that grants paid membership for a
-- director-chosen number of months, then expires on its own with no
-- auto-renewal. Distinct from monthly/yearly, which keep billing forever
-- until canceled.

alter table public.club_membership_plans
  drop constraint club_membership_plans_billing_interval_check;

alter table public.club_membership_plans
  add constraint club_membership_plans_billing_interval_check
  check (billing_interval in ('monthly', 'yearly', 'seasonal'));

alter table public.club_membership_plans
  add column if not exists duration_months integer;

alter table public.club_membership_plans
  add constraint club_membership_plans_duration_months_check
  check (
    (billing_interval = 'seasonal' and duration_months between 1 and 24)
    or (billing_interval <> 'seasonal' and duration_months is null)
  );

alter table public.club_membership_plans
  drop constraint club_membership_plans_price_range;

alter table public.club_membership_plans
  add constraint club_membership_plans_price_range
  check (
    (billing_interval = 'monthly' and price_cents between 300 and 100000)
    or (billing_interval in ('yearly', 'seasonal') and price_cents between 300 and 1000000)
  );

-- When a seasonal (one-time, non-recurring) membership's window ends. Null
-- for monthly/yearly members -- those live/die by their real Stripe
-- subscription status via the webhook, not a stored expiration date.
alter table public.subscriptions
  add column if not exists expires_at timestamptz;

create index if not exists subscriptions_seasonal_expiry_idx
  on public.subscriptions(expires_at)
  where member_type = 'paid' and expires_at is not null;

create or replace function public.expire_seasonal_memberships()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.subscriptions
    set member_type = 'community'
    where member_type = 'paid' and expires_at is not null and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_seasonal_memberships() from public;
grant execute on function public.expire_seasonal_memberships() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'expire-seasonal-memberships') then
    perform cron.unschedule('expire-seasonal-memberships');
  end if;
end $$;

select cron.schedule(
  'expire-seasonal-memberships',
  '0 5 * * *',
  $$select public.expire_seasonal_memberships();$$
);
