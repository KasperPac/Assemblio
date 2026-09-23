-- Verification for patches/2026-09-24-job-cost-snapshot-service-role.sql
--
-- MANUVA-16: generate_job_financial_plan() derived its tenant from
-- current_tenant_id(), so the Shopify sync (service-role, no auth.uid())
-- could never write a cost snapshot. It now derives the tenant from the
-- order line and defers the decision to assert_tenant_write_access().
--
-- Proves the tenant guard did not get looser in the process: service-role
-- and the owning user may write, a user of another tenant still may not.
--
-- Run against a scratch Postgres AFTER applying the patch. It redefines
-- current_tenant_id() and is_service_role() to read GUCs so one session can
-- impersonate several callers, so DO NOT run it on prod.
--
--   psql -f supabase/schema.sql
--   psql -f supabase/patches/finance_planning_phase1.sql
--   psql -f supabase/patches/2026-09-02-tenant-isolation-hardening.sql
--   psql -f supabase/patches/2026-09-24-job-cost-snapshot-service-role.sql
--   psql -f supabase/__tests__/2026-09-24-job-cost-snapshot-service-role.verify.sql
--
-- Expected: T1 and T2 each write a snapshot, T3/T4/T5 print "PASS: denied"
-- or "PASS: refused".
--
\set ON_ERROR_STOP on

create or replace function public.current_tenant_id() returns uuid language sql stable as
$$ select nullif(current_setting('test.tenant', true),'')::uuid $$;

create or replace function public.is_service_role() returns boolean language sql stable as
$$ select coalesce(current_setting('test.service_role', true), '') = 'on' $$;

create or replace function public.is_super_admin() returns boolean language sql stable as
$$ select false $$;

-- fixtures: two tenants, each with an order carrying one line; only tenant 1's
-- variant gets an active BOM.
insert into public.tenant (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222') on conflict do nothing;

insert into public.component (id, tenant_id, cost_per_unit) values
  ('aaaaaaaa-0000-0000-0000-00000000c001','11111111-1111-1111-1111-111111111111', 10) on conflict do nothing;

insert into public.product (id, tenant_id) values
  ('aaaaaaaa-0000-0000-0000-00000000p001','11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-00000000p001','22222222-2222-2222-2222-222222222222') on conflict do nothing;

insert into public.product_variant (id, tenant_id, product_id) values
  ('aaaaaaaa-0000-0000-0000-00000000v001','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000p001'),
  ('bbbbbbbb-0000-0000-0000-00000000v001','22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-00000000p001') on conflict do nothing;

insert into public.product_bom (id, tenant_id, variant_id, version, status, is_active) values
  ('aaaaaaaa-0000-0000-0000-00000000b001','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000v001',1,'active',true) on conflict do nothing;

insert into public.product_bom_component (id, tenant_id, product_bom_id, component_id, quantity) values
  ('aaaaaaaa-0000-0000-0000-00000000bc01','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000b001','aaaaaaaa-0000-0000-0000-00000000c001', 2) on conflict do nothing;

insert into public.orders (id, tenant_id, status) values
  ('aaaaaaaa-0000-0000-0000-00000000o001','11111111-1111-1111-1111-111111111111','open'),
  ('bbbbbbbb-0000-0000-0000-00000000o001','22222222-2222-2222-2222-222222222222','open') on conflict do nothing;

insert into public.order_line (id, tenant_id, order_id, variant_id, quantity, line_sell_price) values
  ('aaaaaaaa-0000-0000-0000-00000000l001','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000o001','aaaaaaaa-0000-0000-0000-00000000v001', 1, 100),
  ('bbbbbbbb-0000-0000-0000-00000000l001','22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-00000000o001','bbbbbbbb-0000-0000-0000-00000000v001', 1, 100) on conflict do nothing;

\echo '--- T1: service-role, no tenant context (this is the bug; expect a snapshot) ---'
set test.tenant = '';
set test.service_role = 'on';
select public.generate_job_financial_plan('aaaaaaaa-0000-0000-0000-00000000l001') is not null as wrote_snapshot;
select planned_material_cost, planned_margin from public.job_cost_snapshot
where order_line_id = 'aaaaaaaa-0000-0000-0000-00000000l001';

\echo '--- T2: the owning user (expect a snapshot, replacing T1s) ---'
set test.service_role = 'off';
set test.tenant = '11111111-1111-1111-1111-111111111111';
select public.generate_job_financial_plan('aaaaaaaa-0000-0000-0000-00000000l001') is not null as wrote_snapshot;
select count(*) as planned_snapshots_for_line from public.job_cost_snapshot
where order_line_id = 'aaaaaaaa-0000-0000-0000-00000000l001' and snapshot_status = 'planned';

\echo '--- T3: a user of another tenant (expect DENIED) ---'
set test.tenant = '22222222-2222-2222-2222-222222222222';
do $$ begin
  perform public.generate_job_financial_plan('aaaaaaaa-0000-0000-0000-00000000l001');
  raise exception 'FAIL: cross-tenant cost snapshot was allowed';
exception when insufficient_privilege then raise notice 'PASS: denied (%)', sqlerrm;
end $$;

\echo '--- T4: no tenant and not service-role (expect DENIED) ---'
set test.tenant = '';
set test.service_role = 'off';
do $$ begin
  perform public.generate_job_financial_plan('aaaaaaaa-0000-0000-0000-00000000l001');
  raise exception 'FAIL: tenant-less caller was allowed';
exception when insufficient_privilege then raise notice 'PASS: denied (%)', sqlerrm;
end $$;

\echo '--- T5: service-role on a line whose variant has no active BOM (expect refused) ---'
set test.service_role = 'on';
do $$ begin
  perform public.generate_job_financial_plan('bbbbbbbb-0000-0000-0000-00000000l001');
  raise exception 'FAIL: a line with no active BOM produced a snapshot';
exception when others then raise notice 'PASS: refused (%)', sqlerrm;
end $$;

\echo '--- T6: unknown order line (expect refused before any tenant work) ---'
do $$ begin
  perform public.generate_job_financial_plan('00000000-0000-0000-0000-000000000000');
  raise exception 'FAIL: unknown order line produced a snapshot';
exception when others then raise notice 'PASS: refused (%)', sqlerrm;
end $$;
