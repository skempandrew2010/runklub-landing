-- Engagement challenges: retention mechanics separate from Passport Tiers
-- and any brand-sponsored challenges. Built on top of run_checkins (the
-- per-run attendance table used by /api/checkin), not the legacy/unused
-- public.check_ins table.

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  type text not null check (type in ('streak', 'social', 'discovery', 'milestone', 'club_vs_club', 'seasonal')),
  criteria_config jsonb not null default '{}'::jsonb,
  start_date date,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_challenge_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, challenge_id)
);

create index user_challenge_progress_user_id_idx on public.user_challenge_progress(user_id);
create index user_challenge_progress_challenge_id_idx on public.user_challenge_progress(challenge_id);

-- Bring a Friend / Klub Crew: tags who you ran with on a specific check-in.
-- check_in_id points at run_checkins (the per-run attendance record), since
-- "same time and location" is exactly what a shared run_id already means —
-- no separate time-window/geo check is needed.
create table public.checkin_referrals (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.run_checkins(id) on delete cascade,
  referred_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (check_in_id, referred_user_id)
);

create index checkin_referrals_check_in_id_idx on public.checkin_referrals(check_in_id);
create index checkin_referrals_referred_user_id_idx on public.checkin_referrals(referred_user_id);

-- Klub Showdown and future club-vs-club challenges. Rows are created lazily
-- per club per period as check-ins happen (see PR2's aggregation function),
-- so the leaderboard is automatically scoped to actually-active klubs
-- without needing an explicit opt-in flag or an is_active column on clubs.
create table public.club_challenge_scores (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  score integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (club_id, challenge_id, period_start)
);

create index club_challenge_scores_challenge_period_idx on public.club_challenge_scores(challenge_id, period_start);

alter table public.challenges enable row level security;
alter table public.user_challenge_progress enable row level security;
alter table public.checkin_referrals enable row level security;
alter table public.club_challenge_scores enable row level security;

-- challenges: public catalog, read-only to clients. Writes are
-- migration/service-role only (no insert/update/delete policy).
create policy "Anyone can view active challenges"
  on public.challenges for select
  to authenticated
  using (true);

-- user_challenge_progress: users can see only their own progress. All
-- writes happen through the SECURITY DEFINER evaluation function added in
-- the follow-up migration — no direct insert/update policy, so users can't
-- fabricate progress.
create policy "Users can view their own challenge progress"
  on public.user_challenge_progress for select
  to authenticated
  using (auth.uid() = user_id);

-- checkin_referrals: visible to the tagger (via their check-in) and the
-- tagged friend. Insert is allowed directly (not just via RPC) but is
-- constrained to enforce Bring a Friend's "same time and location" rule:
-- the inserting user must own the check-in, and the referred friend must
-- have their own run_checkins row for that same run_id.
create policy "Users can view referrals on their check-ins or naming them"
  on public.checkin_referrals for select
  to authenticated
  using (
    auth.uid() = referred_user_id
    or exists (
      select 1 from public.run_checkins rc
      where rc.id = check_in_id and rc.user_id = auth.uid()
    )
  );

create policy "Users can tag friends who checked into the same run"
  on public.checkin_referrals for insert
  to authenticated
  with check (
    exists (
      select 1 from public.run_checkins rc
      where rc.id = check_in_id and rc.user_id = auth.uid()
    )
    and (
      referred_user_id is null
      or exists (
        select 1 from public.run_checkins rc_self
        join public.run_checkins rc_friend
          on rc_friend.run_id = rc_self.run_id
        where rc_self.id = check_in_id
          and rc_friend.user_id = referred_user_id
      )
    )
  );

-- club_challenge_scores: public leaderboard, read-only to clients. Writes
-- happen through the aggregation function added in the follow-up migration.
create policy "Anyone can view club challenge scores"
  on public.club_challenge_scores for select
  to authenticated
  using (true);

-- Seed catalog. Tiered variants (Never Miss a Week) are separate rows,
-- mirroring the existing badges.tier_rank pattern rather than overloading
-- one row's criteria_config with multiple thresholds.
insert into public.challenges (slug, name, description, type, criteria_config) values
  ('never-miss-4', 'Never Miss a Week: 4', 'Check in at least once every calendar week (Mon–Sun) for 4 weeks straight', 'streak', '{"weeks": 4}'),
  ('never-miss-8', 'Never Miss a Week: 8', 'Check in at least once every calendar week (Mon–Sun) for 8 weeks straight', 'streak', '{"weeks": 8}'),
  ('never-miss-12', 'Never Miss a Week: 12', 'Check in at least once every calendar week (Mon–Sun) for 12 weeks straight', 'streak', '{"weeks": 12}'),
  ('weekend-warrior', 'Weekend Warrior', 'Check in on a Saturday or Sunday for 4 weekends straight', 'streak', '{"weekends": 4}'),
  ('bring-a-friend', 'Bring a Friend', 'Tag a friend who ran with you on a check-in', 'social', '{"referrals": 1}'),
  ('klub-crew', 'Klub Crew', 'Tag 3 friends who ran with you on the same check-in', 'social', '{"friends": 3}'),
  ('try-3-klubs', 'Try 3 Different Klubs', 'Check in at 3 different klubs', 'discovery', '{"clubs": 3}'),
  ('morning-person', 'Morning Person', 'Check in before 8am, 5 times', 'discovery', '{"before_hour": 8, "checkins": 5}'),
  ('consistency-club', 'Consistency Club', 'Rack up 10 total check-ins, no time limit', 'milestone', '{"checkins": 10}'),
  ('comeback', 'Comeback', 'Check in again after a 30+ day gap', 'milestone', '{"gap_days": 30}'),
  ('klub-showdown', 'Klub Showdown', 'Monthly klub-vs-klub check-in leaderboard', 'club_vs_club', '{"period": "monthly"}');
