-- Round yearly prices per tier, replacing the computed 10%-off amounts
-- (which weren't clean numbers, e.g. Tier 3 at $356.40): $160/$270/$350/$430.
update public.passport_tiers set yearly_price_cents = case tier
  when 1 then 16000
  when 2 then 27000
  when 3 then 35000
  when 4 then 43000
end;
