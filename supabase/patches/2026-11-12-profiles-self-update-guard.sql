-- ---------------------------------------------------------------------
-- KAS-35 — restrict profile self-updates to name and avatar.
--
-- profiles_update_self limits a signed-in user to their own row, but until now
-- no column limit applied, so a user could change any column on that row,
-- including role, tenant_id and status, which other policies and helper
-- functions trust. This patch limits the columns instead:
--
--   * table-level INSERT and UPDATE are revoked from anon and authenticated;
--   * authenticated gets UPDATE on full_name and avatar_url only
--     (src/app/app/settings/profile/actions.ts lines 25 and 81);
--   * SELECT is not touched;
--   * profiles_insert_self is DROPPED. Every profile insert goes through the
--     service-role admin client (signup, accept-invite, shopify-connect), and
--     service_role is not affected by these revokes.
--   * profiles_update_self is kept as is: it still limits a user to their own row.
--
-- Unaffected writers:
--   * set_active_tenant() is security definer and runs as the function owner.
--   * service_role keeps all privileges.
--
-- Idempotent: revoke / grant / drop policy if exists can be run repeatedly.
-- Rollback: 2026-11-12-profiles-self-update-guard_rollback.sql
-- ---------------------------------------------------------------------

revoke insert, update on table public.profiles from anon, authenticated;

grant update (full_name, avatar_url) on table public.profiles to authenticated;

drop policy if exists profiles_insert_self on public.profiles;
