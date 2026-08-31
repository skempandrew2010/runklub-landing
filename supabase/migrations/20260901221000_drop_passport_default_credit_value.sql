-- No longer used: enrollment doesn't auto-create an offer from this value
-- (it only ever seeded the one-time historical backfill), and every club's
-- Standard Session offer now carries its own credit_cost directly.
alter table public.clubs drop column passport_default_credit_value;
