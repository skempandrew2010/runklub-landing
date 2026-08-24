-- Passport payout eligibility used to be implicit: any klub with Stripe
-- Connect enabled (originally set up for charging their own members) was
-- automatically visible to Passport subscribers and got paid on check-ins.
-- That silently coupled two independent decisions -- running club management
-- tools and earning Passport payout revenue -- together. This makes
-- enrollment an explicit, separate choice a director makes.

alter table public.clubs
  add column if not exists passport_program_enrolled boolean not null default false;

comment on column public.clubs.passport_program_enrolled is 'Explicit opt-in to the Passport check-in payout program, independent of clubs.membership_type/tier and of whether Stripe Connect is used for the klub''s own member payments.';
