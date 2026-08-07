-- Lets a director see their own klub's member emails in the Members tab.
-- Emails live in auth.users, which isn't exposed to the browser client
-- directly — the existing get_club_subscriber_emails() RPC already reads it
-- the same way (for bulk newsletter sending), but only returns bulk emails,
-- not a user_id-keyed list a UI can merge into member rows. This adds that,
-- with the ownership check happening inside the function itself (not RLS)
-- since it's the function's own security definer privilege that reaches
-- auth.users — anyone could otherwise call it for a klub they don't own.
create or replace function public.get_club_member_emails(p_club_id uuid)
returns table(user_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.clubs c where c.id = p_club_id and c.user_id = auth.uid()) then
    return;
  end if;

  return query
    select s.user_id, u.email::text
    from public.subscriptions s
    join auth.users u on u.id = s.user_id
    where s.club_id = p_club_id;
end;
$$;

revoke all on function public.get_club_member_emails(uuid) from public, anon;
grant execute on function public.get_club_member_emails(uuid) to authenticated;
