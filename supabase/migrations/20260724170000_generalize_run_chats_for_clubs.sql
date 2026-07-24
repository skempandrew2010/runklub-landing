-- Generalizes run_chats to also carry club-level messages (independent of any
-- specific run), so the club page can offer a group chat + DMs the same way
-- runs already do, reusing the same table/RLS/DM (recipient_id) mechanism
-- instead of a parallel club_chats table.

alter table public.run_chats alter column run_id drop not null;
alter table public.run_chats add column club_id uuid references public.clubs(id);

alter table public.run_chats add constraint run_chats_target_check
  check (
    (run_id is not null and club_id is null) or
    (run_id is null and club_id is not null)
  );

create index run_chats_club_id_idx on public.run_chats (club_id);

-- Club-level equivalent of can_chat_on_run: club director, or any
-- subscriber/active member — no pace-group/branch granularity at this level.
create or replace function public.can_chat_on_club(p_club_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_is_director boolean;
begin
  select exists(
    select 1 from public.clubs c where c.id = p_club_id and c.user_id = p_user_id
  ) into v_is_director;
  if v_is_director then
    return true;
  end if;

  return exists(
    select 1 from public.subscriptions s where s.club_id = p_club_id and s.user_id = p_user_id
  ) or exists(
    select 1 from public.members m where m.club_id = p_club_id and m.user_id = p_user_id and m.status = 'active'
  );
end;
$$;

revoke all on function public.can_chat_on_club(uuid, uuid) from public, anon;
grant execute on function public.can_chat_on_club(uuid, uuid) to authenticated;

drop policy if exists "eligible users can insert run chats" on public.run_chats;
drop policy if exists "eligible users can read run chats" on public.run_chats;

create policy "eligible users can insert chats" on public.run_chats
for insert
with check (
  auth.uid() = user_id
  and (
    case
      when run_id is not null then
        case
          when recipient_id is null then public.can_chat_on_run(run_id, auth.uid())
          else recipient_id <> auth.uid()
            and public.can_chat_on_run(run_id, auth.uid())
            and public.can_chat_on_run(run_id, recipient_id)
        end
      when club_id is not null then
        case
          when recipient_id is null then public.can_chat_on_club(club_id, auth.uid())
          else recipient_id <> auth.uid()
            and public.can_chat_on_club(club_id, auth.uid())
            and public.can_chat_on_club(club_id, recipient_id)
        end
      else false
    end
  )
);

create policy "eligible users can read chats" on public.run_chats
for select
using (
  case
    when run_id is not null then
      case
        when recipient_id is null then public.can_chat_on_run(run_id, auth.uid())
        else auth.uid() = user_id or auth.uid() = recipient_id
      end
    when club_id is not null then
      case
        when recipient_id is null then public.can_chat_on_club(club_id, auth.uid())
        else auth.uid() = user_id or auth.uid() = recipient_id
      end
    else false
  end
);
