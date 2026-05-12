-- Add ON DELETE CASCADE to the three tenant-scoped tables whose FKs were
-- created without it. Lets the signup-failure rollback in
-- src/app/signup/actions.ts cleanly compensate by deleting the tenant row.
--
-- Find the existing constraint names dynamically — they were created
-- implicitly by the original CREATE TABLE in supabase/schema.sql, so the
-- generated name follows the Postgres default: <table>_<col>_fkey.

alter table public.profiles
  drop constraint if exists profiles_tenant_id_fkey,
  add constraint profiles_tenant_id_fkey
    foreign key (tenant_id) references public.tenant(id) on delete cascade;

alter table public.profile_tenant_access
  drop constraint if exists profile_tenant_access_tenant_id_fkey,
  add constraint profile_tenant_access_tenant_id_fkey
    foreign key (tenant_id) references public.tenant(id) on delete cascade;

alter table public.activity_log
  drop constraint if exists activity_log_tenant_id_fkey,
  add constraint activity_log_tenant_id_fkey
    foreign key (tenant_id) references public.tenant(id) on delete cascade;
