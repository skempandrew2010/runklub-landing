-- Adds the yearly billing option (~17% discount, "10 months for 12" —
-- $150/$250/$330/$400 vs. 12x the monthly price). An annual subscriber
-- still gets their tier's credits issued *monthly* (not one lump sum at
-- signup), matching the discount math and keeping the existing 45-day
-- rolling expiration meaningful. Stripe only invoices a yearly subscription
-- once a year, so invoice.paid alone can't drive monthly issuance for these
-- subscribers — next_credit_issue_at + a new cron function (below/next
-- migration) does that instead.

alter table public.passport_tiers
  add column if not exists yearly_price_cents integer;

update public.passport_tiers set yearly_price_cents = monthly_price_cents * 10;

alter table public.passport_tiers
  alter column yearly_price_cents set not null;

alter table public.passport_subscriptions
  add column if not exists billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'yearly')),
  add column if not exists next_credit_issue_at timestamptz;

comment on column public.passport_subscriptions.next_credit_issue_at is 'Yearly subscribers only: when their next monthly credit batch is due. Null for monthly subscribers, who get credits from invoice.paid on every billing cycle instead.';
