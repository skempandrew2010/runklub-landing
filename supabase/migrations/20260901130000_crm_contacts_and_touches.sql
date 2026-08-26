-- Internal outreach CRM: tracks contact with run clubs/sponsors and follow-up
-- reminders. Service-role only (accessed via /admin/crm API routes with the
-- service role key) — no client-facing policies needed.

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  club_name text not null,
  contact_name text,
  email text,
  phone text,
  status text not null default 'cold'
    check (status in ('cold', 'contacted', 'replied', 'booked', 'closed')),
  source text,
  last_touch_date date,
  next_followup_date date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.touches (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  type text not null check (type in ('email', 'call', 'meeting')),
  summary text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists contacts_followup_status_idx
  on public.contacts (status, next_followup_date);

create index if not exists touches_contact_id_idx
  on public.touches (contact_id);

alter table public.contacts enable row level security;
alter table public.touches enable row level security;
