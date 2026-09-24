-- ---------------------------------------------------------------------
-- MANUVA-18 — close the anon-executable SECURITY DEFINER surface.
--
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, and anon inherits
-- PUBLIC. The 2026-09-02 hardening patch revoked that for the functions it
-- touched; everything created before or since still carried the default.
--
-- Probed against prod with the public anon key before writing this:
--
--   * get_slow_queries()  — REAL LEAK. SECURITY DEFINER, no guard, no
--     search_path. Because it is definer-owned, `userid = current_user`
--     matched the OWNER, so POST /rest/v1/rpc/get_slow_queries returned 200
--     with production query text (200 chars each), call counts and timings
--     to an unauthenticated caller. The anon key ships in the client bundle
--     by design, so this was open to anyone who looked.
--
--   * get_user_emails()   — already safe: guarded by is_platform_operator(),
--     returns [] to anon (probed).
--   * receive_delivery_receipt(), create_job_actual_time_entry(),
--     set_active_tenant() — raise on their first statement when
--     current_tenant_id() is null / has_tenant_access() is false.
--   * handle_invited_user() — a trigger function; PostgREST cannot invoke it.
--
-- So: one genuine hole, and a lot of inert surface. This shuts the hole and
-- takes the inert surface away as defence in depth.
--
-- DELIBERATELY NOT REVOKED: current_tenant_id, is_super_admin,
-- has_tenant_access, is_platform_operator, current_profile_role. RLS policies
-- call these and policy expressions are evaluated as the querying role, so
-- revoking EXECUTE turns "no rows" into a hard error and would break
-- unauthenticated paths. They already return null/false without an
-- auth.uid(), which is the correct answer. Same trap the 2026-09-02 work hit
-- when the audit suggested revoking from authenticated.
--
-- Idempotent: create or replace + revoke/grant only.
-- ---------------------------------------------------------------------

-- 1. get_slow_queries: guard it, pin search_path (pg_stat_statements lives in
--    the extensions schema, so it must be qualified once search_path is set),
--    and stop handing the owner's statements to whoever asks.
create or replace function public.get_slow_queries()
returns table(query text, calls bigint, mean_time double precision, total_time double precision)
language sql
security definer
set search_path = public
as $$
  select
    left(s.query, 200) as query,
    s.calls,
    round(s.mean_exec_time::numeric, 2)::double precision as mean_time,
    round(s.total_exec_time::numeric, 2)::double precision as total_time
  from extensions.pg_stat_statements s
  where public.is_platform_operator()
    and s.userid = (select usesysid from pg_user where usename = current_user)
  order by s.mean_exec_time desc
  limit 15;
$$;

revoke execute on function public.get_slow_queries() from public, anon;
grant execute on function public.get_slow_queries() to authenticated;

-- 2. Defence in depth for the rest. Revoked by OID rather than by a
--    hand-written signature: several of these take arguments and a
--    mistyped signature fails silently as "function does not exist".
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname in (
        'receive_delivery_receipt',
        'create_job_actual_time_entry',
        'set_active_tenant',
        'get_user_emails',
        'get_tenant_vitals',
        'get_tenant_health_indicators',
        'generate_financial_plans_for_open_orders',
        'refresh_department_utilization_week',
        'refresh_job_actual_cost_rollup',
        'resolve_location_barcode'
      )
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
    raise notice 'revoked anon execute: %', r.sig;
  end loop;
end $$;
