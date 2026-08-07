-- Adds Stripe Connect infrastructure so runners can pay a klub directly for
-- membership (Direct charges on an Express connected account), with RunKlub
-- keeping a tier-based application fee (see lib/plans.ts paymentFeeSurchargePct).
-- This is genuinely new — no Connect infrastructure existed before this.

alter table public.clubs
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_charges_enabled boolean not null default false,
  add column if not exists stripe_connect_payouts_enabled boolean not null default false,
  add column if not exists stripe_connect_details_submitted boolean not null default false,
  add column if not exists membership_price_cents integer,
  add column if not exists membership_currency text not null default 'usd';

alter table public.clubs
  add constraint clubs_membership_price_cents_range
  check (membership_price_cents is null or membership_price_cents between 300 and 100000);

-- The Stripe Subscription/Customer ids live on the connected account's own
-- namespace (not profiles.stripe_customer_id, which is the platform-level
-- customer used for club->RunKlub SaaS billing) — one user can be a paying
-- member of several klubs, each a separate connected account.
alter table public.subscriptions
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_customer_id text;

create unique index if not exists subscriptions_stripe_subscription_id_idx
  on public.subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;
