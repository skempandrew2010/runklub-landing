create table public.email_sends (
  id uuid primary key default gen_random_uuid(),
  resend_id text unique,
  club_id uuid references public.clubs(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_email text not null,
  email_type text not null,
  sent_at timestamptz not null default now()
);

comment on table public.email_sends is 'One row per outbound email (e.g. training-schedule sends), tagged with the Resend message id so webhook events can be matched back to it.';

create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  email_send_id uuid not null references public.email_sends(id) on delete cascade,
  event_type text not null check (event_type in ('delivered','opened','clicked','bounced','complained')),
  occurred_at timestamptz not null default now(),
  raw jsonb
);

comment on table public.email_events is 'Populated by the Resend webhook (/api/webhooks/resend). raw stores the full webhook payload for debugging.';

create index email_sends_club_id_idx on public.email_sends(club_id);
create index email_events_email_send_id_idx on public.email_events(email_send_id);

alter table public.email_sends enable row level security;
alter table public.email_events enable row level security;

create policy "email_sends_select_club_owner" on public.email_sends
  for select using (exists(select 1 from public.clubs c where c.id = email_sends.club_id and c.user_id = auth.uid()));

create policy "email_events_select_club_owner" on public.email_events
  for select using (exists(
    select 1 from public.email_sends es
    join public.clubs c on c.id = es.club_id
    where es.id = email_events.email_send_id and c.user_id = auth.uid()
  ));
