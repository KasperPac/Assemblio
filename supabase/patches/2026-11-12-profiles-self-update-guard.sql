-- ---------------------------------------------------------------------
-- KAS-35 — Limit profile self-updates to name and avatar; role, store and
-- status change only through server-side paths.
--
-- profiles_update_self keeps a signed-in user to their own row. This patch
-- limits the columns:
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
