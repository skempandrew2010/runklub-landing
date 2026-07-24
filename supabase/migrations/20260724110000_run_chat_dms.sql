-- Private 1:1 DMs within a run's chat, alongside the existing group thread.
-- recipient_id null = public group message (existing behavior).
-- recipient_id set  = private message visible only to sender + recipient.
-- A DM is only valid between two people who are both already eligible for
-- that run's group chat (see can_chat_on_run from the previous migration).

alter table public.run_chats add column recipient_id uuid references auth.users(id) on delete cascade;

create index run_chats_recipient_id_idx on public.run_chats(recipient_id);

drop policy if exists "eligible users can read run chats" on public.run_chats;
drop policy if exists "eligible users can insert run chats" on public.run_chats;

create policy "eligible users can read run chats"
  on public.run_chats for select
  to authenticated
  using (
    case
      when recipient_id is null then public.can_chat_on_run(run_id, auth.uid())
      else auth.uid() = user_id or auth.uid() = recipient_id
    end
  );

create policy "eligible users can insert run chats"
  on public.run_chats for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and case
      when recipient_id is null then public.can_chat_on_run(run_id, auth.uid())
      else
        recipient_id <> auth.uid()
        and public.can_chat_on_run(run_id, auth.uid())
        and public.can_chat_on_run(run_id, recipient_id)
    end
  );
