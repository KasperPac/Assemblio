-- SECURITY DEFINER helper so super_admin can resolve auth.users.email for a
-- list of profile IDs without depending on the listUsers admin API at runtime.
create or replace function public.get_user_emails(p_ids uuid[])
returns table(id uuid, email text)
language sql
security definer
set search_path = public
as $$
  select u.id, u.email::text
  from auth.users u
  where u.id = any(p_ids)
    and public.is_super_admin()
$$;

revoke all on function public.get_user_emails(uuid[]) from public;
grant execute on function public.get_user_emails(uuid[]) to authenticated;
