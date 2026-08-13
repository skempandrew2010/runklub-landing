-- Tracks the Stripe Transfer that paid a klub for a Passport check-in, for
-- auditability/support lookups and as an idempotency record.
alter table public.passport_checkins
  add column if not exists stripe_transfer_id text;
