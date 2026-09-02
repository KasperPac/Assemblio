-- Verification for patches/2026-09-02-tenant-isolation-hardening.sql
--
-- Proves the exit gate from the beta ship plan: "a crafted cross-tenant
-- write is denied". Run it against a scratch Postgres (or staging) AFTER
-- applying the patch. It redefines current_tenant_id() to read a GUC so a
-- single session can impersonate two tenants, so DO NOT run it on prod.
--
--   docker run -d --rm --name pgcheck -e POSTGRES_PASSWORD=pw postgres:16
--   psql -f <stubs or supabase/schema.sql>
--   psql -f supabase/patches/2026-09-02-tenant-isolation-hardening.sql
--   psql -f supabase/__tests__/2026-09-02-tenant-isolation-hardening.verify.sql
--
-- Expected: T1/T5/T6 succeed, T2/T3/T4/T7 each print "PASS: denied".
--
\set ON_ERROR_STOP on
-- tenant context driven by a GUC so we can impersonate
create or replace function public.current_tenant_id() returns uuid language sql stable as
$$ select nullif(current_setting('test.tenant', true),'')::uuid $$;

-- fixtures: two tenants, each with a component + location
insert into public.tenant (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222') on conflict do nothing;
insert into public.component (id, tenant_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222') on conflict do nothing;
insert into public.location (id, tenant_id) values
  ('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222') on conflict do nothing;
insert into public.stocktake_session (id, tenant_id, status, location_id) values
  ('bbbbbbbb-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','approved','bbbbbbbb-0000-0000-0000-000000000002') on conflict do nothing;

-- constraint state
select 'unique keys on inventory_balance:' as check,
       string_agg(indexdef, ' | ') as detail
from pg_indexes where tablename='inventory_balance' and indexdef ilike '%UNIQUE%';

-- act as tenant 1
set test.tenant = '11111111-1111-1111-1111-111111111111';

\echo '--- T1: own-tenant movement (expect ok, then accumulate) ---'
select public.apply_inventory_movement('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002', 5,0,'test','test') is not null as ok;
select public.apply_inventory_movement('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002', 3,0,'test','test') is not null as ok;
select tenant_id, on_hand from public.inventory_balance;

\echo '--- T2: cross-tenant movement (expect DENIED) ---'
do $$ begin
  perform public.apply_inventory_movement('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002', 99,0,'attack','test');
  raise exception 'FAIL: cross-tenant inventory movement was allowed';
exception when insufficient_privilege then raise notice 'PASS: denied (%)', sqlerrm;
end $$;

\echo '--- T3: cross-tenant reserved movement, H2 (expect DENIED) ---'
do $$ begin
  perform public.apply_reserved_movement('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002', null, 7);
  raise exception 'FAIL: cross-tenant reserved movement was allowed';
exception when insufficient_privilege then raise notice 'PASS: denied (%)', sqlerrm;
end $$;

\echo '--- T4: cross-tenant stocktake apply, H1 (expect DENIED) ---'
do $$ begin
  perform * from public.apply_stocktake_session('bbbbbbbb-0000-0000-0000-000000000003');
  raise exception 'FAIL: cross-tenant stocktake apply was allowed';
exception when insufficient_privilege then raise notice 'PASS: denied (%)', sqlerrm;
end $$;

\echo '--- T5: own-tenant reserved movement (expect ok) ---'
select public.apply_reserved_movement('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002', null, 4);
select tenant_id, on_hand, reserved from public.inventory_balance;

\echo '--- T6: service-role path (Shopify sync) still allowed for any tenant ---'
set test.tenant = '';
set request.jwt.claims = '{"role":"service_role"}';
select public.apply_reserved_movement('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002', null, 6);
select tenant_id, reserved from public.inventory_balance order by tenant_id;

\echo '--- T7: dev-dashboard RPC gated for ordinary users ---'
set request.jwt.claims = '{"role":"authenticated"}';
do $$ begin
  perform public.count_multi_location_tenants();
  raise exception 'FAIL: dev count RPC allowed for non-operator';
exception when insufficient_privilege then raise notice 'PASS: denied (%)', sqlerrm;
end $$;
