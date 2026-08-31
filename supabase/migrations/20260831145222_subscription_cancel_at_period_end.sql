-- Stripe's subscription.status stays "active" right up until the period
-- actually ends, whether or not the subscriber has scheduled a cancellation
-- (cancel_at_period_end). Without capturing that flag separately, the app
-- has no way to tell "renews on X" from "ends on X" - it only ever sees a
-- future date and an "active" status either way.
alter table public.clubs add column cancel_at_period_end boolean not null default false;
alter table public.passport_subscriptions add column cancel_at_period_end boolean not null default false;
alter table public.subscriptions add column cancel_at_period_end boolean not null default false;
