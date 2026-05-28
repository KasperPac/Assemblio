create or replace function public.get_profile_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select p.id
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email = p_email
  limit 1
$$;

grant execute on function public.get_profile_by_email(text) to authenticated;

-- Extend get_user_emails to also return last_sign_in_at so the team page
-- can display when each platform operator last signed in.
-- Adding a column to a table-returning function is additive — callers
-- that don't reference last_sign_in_at continue to work unchanged.
create or replace function public.get_user_emails(p_ids uuid[])
returns table(id uuid, email text, last_sign_in_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select u.id, u.email::text, u.last_sign_in_at
  from auth.users u
  where u.id = any(p_ids)
    and public.is_platform_operator()
$$;

revoke all on function public.get_user_emails(uuid[]) from public;
grant execute on function public.get_user_emails(uuid[]) to authenticated;
