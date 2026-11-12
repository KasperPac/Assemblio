-- ---------------------------------------------------------------------
-- Rollback for 2026-11-12-profiles-self-update-guard.sql (KAS-35).
-- Restores table-level INSERT and UPDATE for anon and authenticated (the
-- Supabase default) and the profiles_insert_self policy. Idempotent.
-- ---------------------------------------------------------------------

revoke update (full_name, avatar_url) on table public.profiles from authenticated;

grant insert, update on table public.profiles to anon, authenticated;

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert
  with check (id = auth.uid());
