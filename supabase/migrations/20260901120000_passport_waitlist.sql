-- Simple self-hosted waitlist for the Passport credit program, used while
-- there are no Passport-enrolled klubs yet to actually redeem check-ins at.
-- Insert-only from the client; nobody reads their own or anyone else's rows
-- back (this is a lead capture list, not user-facing data).
create table public.passport_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index passport_waitlist_email_idx on public.passport_waitlist (lower(email));

alter table public.passport_waitlist enable row level security;

create policy "anyone can join the waitlist" on public.passport_waitlist
  for insert
  with check (true);
