-- Premium tier payout raised from $5.00 to $6.00/check-in.
update public.passport_checkin_costs set club_payout_cents = 600 where checkin_tier = 'premium';
