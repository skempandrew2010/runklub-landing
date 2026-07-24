create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  city text,
  checked_in_at timestamptz not null default now(),
  method text not null default 'manual',
  created_at timestamptz not null default now()
);

create index if not exists check_ins_user_id_idx on public.check_ins(user_id);
create index if not exists check_ins_club_id_idx on public.check_ins(club_id);

alter table public.check_ins enable row level security;

create policy "Users can insert their own check-ins"
  on public.check_ins for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can view their own check-ins"
  on public.check_ins for select
  to authenticated
  using (auth.uid() = user_id);
