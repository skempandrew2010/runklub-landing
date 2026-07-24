-- Backfill: existing club owners whose profile role never got promoted to
-- 'manager' (a bug in the claim flow compared role against the string
-- 'user' instead of the actual default 'member') would otherwise be locked
-- out by the policy below.
update public.profiles p
set role = 'manager'
from public.clubs c
where c.user_id = p.id
  and (p.role is null or p.role <> 'manager');

drop policy if exists "Users can update own clubs" on public.clubs;

create policy "Managers can update own clubs"
  on public.clubs
  for update
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  );
