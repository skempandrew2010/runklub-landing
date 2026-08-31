-- Lets admins hand out comp/test credits without fabricating revenue.
-- rate_per_credit_cents has a > 0 check constraint, so this uses the
-- smallest representable value (rounds to $0.00 per redemption) rather
-- than a real rate - a manually-granted credit was never actually paid
-- for, so it should never trigger a meaningful director payout.
insert into public.passport_credit_sources (source, label, rate_per_credit_cents)
values ('manual_grant', 'Manual Grant', 0.0001)
on conflict (source) do nothing;
