-- supabase/patches/component_images.sql
--
-- Component images feature:
--   1. Adds image_url column to the component table
--        Stores the public URL to the image in the component-images bucket.
--        Path convention: {tenant_id}/{component_id} (no extension, always upserted)
--   2. Creates component-images public storage bucket
--   3. Adds public read policy (anyone can view component images)
--   4. Adds tenant-scoped insert policy (all roles, with super_admin bypass)
--   5. Adds tenant-scoped update policy (all roles, with super_admin bypass)
--   6. Adds tenant-scoped delete policy (all roles, with super_admin bypass)

-- 1. Column on component table
-- Stores the versioned public URL (e.g. https://....supabase.co/storage/v1/.../component-images/{tenant_id}/{component_id}?v=...)
alter table public.component
  add column if not exists image_url text;

-- 2. Public storage bucket for component images
insert into storage.buckets (id, name, public)
values ('component-images', 'component-images', true)
on conflict (id) do update set public = excluded.public;

-- 3. Public read (anyone can load <img src>)
drop policy if exists component_images_read on storage.objects;
create policy component_images_read on storage.objects
  for select
  using (bucket_id = 'component-images');

-- 4. Tenant member insert (all roles, not just admin)
drop policy if exists component_images_insert on storage.objects;
create policy component_images_insert on storage.objects
  for insert
  with check (
    bucket_id = 'component-images'
    and (
      public.is_super_admin()
      or (
        (storage.foldername(name))[1] = public.current_tenant_id()::text
        and public.current_profile_role() is not null
      )
    )
  );

-- 5. Tenant member update
drop policy if exists component_images_update on storage.objects;
create policy component_images_update on storage.objects
  for update
  using (
    bucket_id = 'component-images'
    and (
      public.is_super_admin()
      or (
        (storage.foldername(name))[1] = public.current_tenant_id()::text
        and public.current_profile_role() is not null
      )
    )
  );

-- 6. Tenant member delete
drop policy if exists component_images_delete on storage.objects;
create policy component_images_delete on storage.objects
  for delete
  using (
    bucket_id = 'component-images'
    and (
      public.is_super_admin()
      or (
        (storage.foldername(name))[1] = public.current_tenant_id()::text
        and public.current_profile_role() is not null
      )
    )
  );
