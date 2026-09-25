-- supabase/__tests__/2026-09-25-retail-stock-foundation.verify.sql
-- SCRATCH ONLY: redefines current_tenant_id()/is_service_role() to read GUCs.
--   bash scripts/scratch-db.sh up
--   bash scripts/scratch-db.sh sql supabase/__tests__/2026-09-25-retail-stock-foundation.verify.sql
-- Expected: every line prints PASS; the script stops on the first failure.
\set ON_ERROR_STOP on

create or replace function public.current_tenant_id() returns uuid language sql stable as
$$ select nullif(current_setting('test.tenant', true),'')::uuid $$;
create or replace function public.is_service_role() returns boolean language sql stable as
$$ select coalesce(current_setting('test.service_role', true), '') = 'on' $$;
create or replace function public.is_super_admin() returns boolean language sql stable as
$$ select false $$;

create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as
$$ begin if not ok then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;

-- Fixtures: tenant T1 with default location L1, a retail variant VR with a
-- 1-line BOM over component CR, a manufactured variant VM over component CM,
-- and a fulfilled order O1 carrying 3×VR (2 reserved) and 1×VM.
-- Tenant T2 exists only to be refused.
-- NOTE: tenant.name is NOT NULL with no default (schema.sql); the brief's
-- fixture omitted it, so minimal names are added here per controller Ruling 2.
insert into public.tenant (id, name) values
  ('11111111-1111-1111-1111-111111111111','T1'), ('22222222-2222-2222-2222-222222222222','T2');
insert into public.location (id, tenant_id, name, is_default) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1','11111111-1111-1111-1111-111111111111','Main',true);
insert into public.component (id, tenant_id, name) values
  ('aaaaaaaa-0000-0000-0000-0000000000c1','11111111-1111-1111-1111-111111111111','Shampoo 300ml'),
  ('aaaaaaaa-0000-0000-0000-0000000000c2','11111111-1111-1111-1111-111111111111','Steel tube');
insert into public.product (id, tenant_id, title, kind) values
  ('aaaaaaaa-0000-0000-0000-0000000000e1','11111111-1111-1111-1111-111111111111','Shampoo','retail'),
  ('aaaaaaaa-0000-0000-0000-0000000000e2','11111111-1111-1111-1111-111111111111','Rack','manufactured');
insert into public.product_variant (id, tenant_id, product_id, title) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000e1','300ml'),
  ('aaaaaaaa-0000-0000-0000-0000000000f2','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000e2','Std');
insert into public.product_bom (id, tenant_id, variant_id, version, status, is_active) values
  ('aaaaaaaa-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000f1',1,'active',true),
  ('aaaaaaaa-0000-0000-0000-0000000000b2','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000f2',1,'active',true);
insert into public.product_bom_component (tenant_id, product_bom_id, component_id, quantity) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000b1','aaaaaaaa-0000-0000-0000-0000000000c1',1),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000b2','aaaaaaaa-0000-0000-0000-0000000000c2',4);
insert into public.inventory_balance (tenant_id, component_id, location_id, on_hand, reserved) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000c1','aaaaaaaa-0000-0000-0000-0000000000d1',10,2);
insert into public.orders (id, tenant_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','fulfilled');
insert into public.order_line (id, tenant_id, order_id, variant_id, quantity) values
  ('aaaaaaaa-0000-0000-0000-00000000ad01','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-0000000000f1',3),
  ('aaaaaaaa-0000-0000-0000-00000000ad02','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-0000000000f2',1);
insert into public.order_component_allocation (tenant_id, order_line_id, component_id, quantity) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000ad01','aaaaaaaa-0000-0000-0000-0000000000c1',2);

set test.service_role = 'on';

-- S1: first call consumes 3, releases the 2 reserved.
select pg_temp.check(public.apply_sale_consumption(
  '11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000ad01','aaaaaaaa-0000-0000-0000-0000000000d1') = 1,
  'S1 returns 1 component consumed');
select pg_temp.check((select on_hand = 7 and reserved = 0 from public.inventory_balance
  where component_id = 'aaaaaaaa-0000-0000-0000-0000000000c1'), 'S1 on_hand 10→7, reserved 2→0');
select pg_temp.check((select count(*) = 0 from public.order_component_allocation
  where order_line_id = 'aaaaaaaa-0000-0000-0000-00000000ad01'), 'S1 allocation rows removed');
select pg_temp.check((select count(*) = 1 from public.inventory_movement
  where reason = 'sale' and delta_on_hand = -3 and delta_reserved = -2), 'S1 one sale movement');

-- S2: idempotent.
select pg_temp.check(public.apply_sale_consumption(
  '11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000ad01','aaaaaaaa-0000-0000-0000-0000000000d1') = 0,
  'S2 second call returns 0');
select pg_temp.check((select on_hand = 7 from public.inventory_balance
  where component_id = 'aaaaaaaa-0000-0000-0000-0000000000c1'), 'S2 on_hand unchanged');

-- S3: manufactured line refused, nothing written.
do $$ begin
  perform public.apply_sale_consumption('11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-0000-0000-0000-00000000ad02','aaaaaaaa-0000-0000-0000-0000000000d1');
  raise exception 'FAIL: S3 manufactured line was consumed';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise notice 'PASS: S3 manufactured line refused (%)', sqlerrm;
end $$;
select pg_temp.check((select count(*) = 0 from public.order_line_consumption
  where order_line_id = 'aaaaaaaa-0000-0000-0000-00000000ad02'), 'S3 no consumption row left behind');

-- S4: another tenant's user is refused.
set test.service_role = 'off';
set test.tenant = '22222222-2222-2222-2222-222222222222';
do $$ begin
  perform public.apply_sale_consumption('11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-0000-0000-0000-00000000ad01','aaaaaaaa-0000-0000-0000-0000000000d1');
  raise exception 'FAIL: S4 cross-tenant call succeeded';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise notice 'PASS: S4 cross-tenant refused (%)', sqlerrm;
end $$;
reset test.tenant;

-- S5: anon cannot execute.
select pg_temp.check(not has_function_privilege('anon',
  'public.apply_sale_consumption(uuid,uuid,uuid)', 'execute'), 'S5 anon has no EXECUTE');

-- S6: selling past zero is recorded, on_hand goes negative.
set test.service_role = 'on';
insert into public.orders (id, tenant_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a2','11111111-1111-1111-1111-111111111111','fulfilled');
insert into public.order_line (id, tenant_id, order_id, variant_id, quantity) values
  ('aaaaaaaa-0000-0000-0000-00000000ad03','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000a2','aaaaaaaa-0000-0000-0000-0000000000f1',9);
select public.apply_sale_consumption('11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-0000-0000-0000-00000000ad03','aaaaaaaa-0000-0000-0000-0000000000d1');
select pg_temp.check((select on_hand = -2 and reserved = 0 from public.inventory_balance
  where component_id = 'aaaaaaaa-0000-0000-0000-0000000000c1'), 'S6 on_hand 7→-2, reserved stays 0');
