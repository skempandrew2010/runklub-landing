-- Private redemption codes for race_kickback/gear_discount/other offers -
-- a director-set code (promo code, discount code, race entry code) that's
-- only revealed to a runner once they've actually spent credits on it.
-- Deliberately a separate table rather than a column on passport_offers:
-- passport_offers_select_active lets any signed-in runner read a full row
-- for any active offer, so a code column there would leak before redemption.
-- No select policy for anyone but the owning director - the redeem API
-- route reads it with the service-role client, which bypasses RLS.
create table public.passport_offer_codes (
  offer_id uuid primary key references public.passport_offers(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.passport_offer_codes enable row level security;

create policy passport_offer_codes_owner_all on public.passport_offer_codes
  for all using (
    exists (
      select 1 from public.passport_offers o
      join public.clubs c on c.id = o.club_id
      where o.id = passport_offer_codes.offer_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.passport_offers o
      join public.clubs c on c.id = o.club_id
      where o.id = passport_offer_codes.offer_id and c.user_id = auth.uid()
    )
  );
