-- Lowers the yearly discount from ~17% (10x monthly) to 10% off
-- (monthly * 12 * 0.9), improving margin headroom on the higher tiers
-- (worst-case Tier 3/4 margin was 24%/19% at the old discount; 29%/25% now).
-- $150/$250/$330/$400 -> $162/$270/$356.40/$432.
update public.passport_tiers
  set yearly_price_cents = round(monthly_price_cents * 12 * 0.9);
