-- supabase/patches/company_save_and_user_avatars.sql
--
-- Two fixes + one feature:
--   1. tenant table had RLS enabled but no UPDATE policy — admins
--      couldn't actually persist Company settings or logo_url changes
--      (Supabase silently returned 0 rows affected).
--   2. storage.objects had no policies at all — logo uploads were
--      blocked regardless of bucket visibility.
--   3. Adds an avatar_url column on profiles plus a public
--      user-avatars bucket so users can upload personal avatars.

-- 1. Allow tenant admins to update their own tenant row.
drop policy if exists tenant_update on public.tenant;
create policy tenant_update on public.tenant
  for update
  using (
    public.is_super_admin()
    or (id = public.current_tenant_id()
        and public.current_profile_role() in ('admin', 'super_admin'))
  )
  with check (
    public.is_super_admin()
    or (id = public.current_tenant_id()
        and public.current_profile_role() in ('admin', 'super_admin'))
  );

-- 2a. Storage policies for the tenant-logos bucket.
--     Objects are stored at "<tenant_id>/logo.<ext>" so the first
--     path segment is checked against the caller's tenant.
drop policy if exists tenant_logos_read on storage.objects;
create policy tenant_logos_read on storage.objects
  for select
  using (bucket_id = 'tenant-logos');

drop policy if exists tenant_logos_admin_write on storage.objects;
create policy tenant_logos_admin_write on storage.objects
  for insert
  with check (
    bucket_id = 'tenant-logos'
    and (
      public.is_super_admin()
      or (
        (storage.foldername(name))[1] = public.current_tenant_id()::text
        and public.current_profile_role() in ('admin', 'super_admin')
      )
    )
  );

drop policy if exists tenant_logos_admin_update on storage.objects;
create policy tenant_logos_admin_update on storage.objects
  for update
  using (
    bucket_id = 'tenant-logos'
    and (
      public.is_super_admin()
      or (
        (storage.foldername(name))[1] = public.current_tenant_id()::text
        and public.current_profile_role() in ('admin', 'super_admin')
      )
    )
  );

drop policy if exists tenant_logos_admin_delete on storage.objects;
create policy tenant_logos_admin_delete on storage.objects
  for delete
  using (
    bucket_id = 'tenant-logos'
    and (
      public.is_super_admin()
      or (
        (storage.foldername(name))[1] = public.current_tenant_id()::text
        and public.current_profile_role() in ('admin', 'super_admin')
      )
    )
  );

-- 3a. user-avatars bucket (public read, owner-scoped writes).
insert into storage.buckets (id, name, public)
values ('user-avatars', 'user-avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists user_avatars_read on storage.objects;
create policy user_avatars_read on storage.objects
  for select
  using (bucket_id = 'user-avatars');

drop policy if exists user_avatars_owner_write on storage.objects;
create policy user_avatars_owner_write on storage.objects
  for insert
  with check (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists user_avatars_owner_update on storage.objects;
create policy user_avatars_owner_update on storage.objects
  for update
  using (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists user_avatars_owner_delete on storage.objects;
create policy user_avatars_owner_delete on storage.objects
  for delete
  using (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3b. avatar_url column on profiles.
alter table public.profiles
  add column if not exists avatar_url text;
