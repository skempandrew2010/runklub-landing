-- Drops Tier 3 ($33/mo) -- down to 3 offered tiers. Tier 4 ($40/mo) keeps its
-- underlying tier=4 identity (Stripe price IDs, any historical subscription
-- rows) but is relabeled "Tier 3" for display since it's now the third
-- tier shown, marketed as the pick for heavy travelers.
delete from public.passport_tiers where tier = 3;
update public.passport_tiers set name = 'Tier 3' where tier = 4;
