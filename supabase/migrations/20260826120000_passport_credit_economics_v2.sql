-- Replaces the standard/premium klub-level classification with per-session
-- (per-run) credit values the director sets directly, a klub-level default
-- for runs that don't override it, a flat-rate extra-credit purchase option,
-- and a klub-wide monthly check-in cap alongside the existing per-runner one.

-- ── Tier credit amounts corrected (prices were already right) ──────────────
update public.passport_tiers set credits_per_month = 3 where tier = 1;
update public.passport_tiers set credits_per_month = 5 where tier = 2;
update public.passport_tiers set credits_per_month = 7 where tier = 3;
update public.passport_tiers set credits_per_month = 9 where tier = 4;

-- ── Drop the klub-level classification, superseded by per-run values ───────
alter table public.clubs drop column if exists passport_checkin_tier;
alter table public.clubs drop column if exists passport_annual_price_cents;
drop table if exists public.passport_checkin_costs;

-- ── Klub-level default + per-run override, both 1-6 ─────────────────────────
alter table public.clubs
  add column if not exists passport_default_credit_value smallint not null default 3
    check (passport_default_credit_value between 1 and 6);

comment on column public.clubs.passport_default_credit_value is 'Default Passport credit cost (1-6) for this klub''s runs when the run itself doesn''t override it. Payout = $3.00 + $0.50 * value.';

alter table public.runs
  add column if not exists passport_credit_value smallint
    check (passport_credit_value is null or passport_credit_value between 1 and 6);

comment on column public.runs.passport_credit_value is 'Per-run override of the klub''s passport_default_credit_value. Null = use the klub default. Set manually per run instance; not auto-copied across repeats.';

-- ── Klub-wide monthly total cap, alongside the existing per-runner one ─────
alter table public.clubs
  add column if not exists passport_monthly_checkin_limit_total integer;

comment on column public.clubs.passport_monthly_checkin_limit_total is 'Max total Passport check-ins this klub accepts across all runners in a calendar month. Null = unlimited. Independent of passport_monthly_checkin_limit_per_user.';

-- ── Purchased credits flow through the same batch/FIFO ledger as monthly
--    grants (identical 45-day expiry, identical spend logic) ───────────────
alter table public.passport_credit_batches
  add column if not exists source text not null default 'subscription' check (source in ('subscription', 'purchase')),
  add column if not exists stripe_payment_intent_id text;

-- ── Check-ins no longer classify by klub tier -- credits_spent already IS
--    the run's credit value (1:1, no separate cost lookup anymore) ─────────
alter table public.passport_checkins
  drop column if exists checkin_tier;
