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
