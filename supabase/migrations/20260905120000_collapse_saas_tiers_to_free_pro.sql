-- Collapses the 4 SaaS tiers (free/starter/growth/enterprise) down to 2
-- (free/pro). Data-only migration; clubs.tier has no CHECK constraint.
--
-- Real paying subscribers (Stripe-backed) get grandfathered onto full Pro
-- feature access immediately, at whatever price they already pay -- this
-- migration does not touch live Stripe billing.
--
-- Everything else claiming a paid tier with no real subscription behind it
-- (mostly unclaimed seeded klub listings) resets to free.

update public.clubs set tier = 'pro'
where stripe_subscription_id is not null and tier in ('starter', 'growth', 'enterprise');

update public.clubs set tier = 'free'
where tier in ('starter', 'growth', 'enterprise') and stripe_subscription_id is null;
