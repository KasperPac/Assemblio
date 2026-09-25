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

-- Ruling 8: a NULL ok (e.g. a scalar subquery over zero rows) must FAIL, not
-- silently pass. `if not ok` treats NULL as neither true nor false and skips
-- the raise; `is not true` is false for both NULL and false.
create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as
$$ begin if ok is not true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;

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

-- S7 (Ruling 7b): a retail product can carry an untracked sibling variant
-- with no active BOM (e.g. a freshly Shopify-imported variant nobody has
-- run through create_retail_item yet). Selling it must be a no-op, not an
-- error, and must leave no order_line_consumption row.
insert into public.product_variant (id, tenant_id, product_id, title, sku) values
  ('aaaaaaaa-0000-0000-0000-0000000000f5','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000e1','500ml',null);
insert into public.orders (id, tenant_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a5','11111111-1111-1111-1111-111111111111','fulfilled');
insert into public.order_line (id, tenant_id, order_id, variant_id, quantity) values
  ('aaaaaaaa-0000-0000-0000-00000000ad06','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000a5','aaaaaaaa-0000-0000-0000-0000000000f5',1);
select pg_temp.check(public.apply_sale_consumption('11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-0000-0000-0000-00000000ad06','aaaaaaaa-0000-0000-0000-0000000000d1') = 0,
  'S7 retail variant with no active BOM returns 0');
select pg_temp.check((select count(*) = 0 from public.order_line_consumption
  where order_line_id = 'aaaaaaaa-0000-0000-0000-00000000ad06'), 'S7 no consumption row written');

-- R1: create from scratch. Call once and capture the id with \gset — a
-- volatile function inside a WHERE runs once per scanned row.
set test.service_role = 'on';
select public.create_retail_item('11111111-1111-1111-1111-111111111111', null,
  'Argan Oil', ' OIL-50 ', '9300000000031', 12.5, null, null, 4) as r1_variant \gset
select pg_temp.check((select count(*) = 1 from public.product_variant v
  join public.product p on p.id = v.product_id
  where v.id = :'r1_variant'
    and p.kind = 'retail' and v.sku = 'OIL-50' and v.barcode = '9300000000031'),
  'R1 product+variant created, retail, sku trimmed');
select pg_temp.check((select count(*) = 1 from public.product_bom_component bc
  join public.product_bom b on b.id = bc.product_bom_id
  join public.product_variant v on v.id = b.variant_id
  join public.component c on c.id = bc.component_id
  where v.sku = 'OIL-50' and b.is_active and bc.quantity = 1
    and c.cost_per_unit = 12.5 and c.reorder_point = 4),
  'R1 one active BOM line qty 1 over a component carrying cost + reorder point');
select pg_temp.check((select count(*) = 1 from public.inventory_balance ib
  join public.component c on c.id = ib.component_id
  where c.sku = 'OIL-50' and ib.location_id = 'aaaaaaaa-0000-0000-0000-0000000000d1' and ib.on_hand = 0),
  'R1 balance row at the default location');

-- R2: attaching to a variant that already has an active BOM is refused.
do $$ begin
  perform public.create_retail_item('11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-0000-0000-0000-0000000000f2', 'Rack', null, null, 0, null, null, 0);
  raise exception 'FAIL: R2 attached over an active BOM';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if sqlerrm not like '%active BOM%' then raise exception 'FAIL: R2 wrong error: %', sqlerrm; end if;
  raise notice 'PASS: R2 refused (%)', sqlerrm;
end $$;

-- R7 (Ruling 7a): attaching a variant with no BOM of its own is still
-- refused when a MANUFACTURED sibling variant on the same product has an
-- active BOM — the flip to kind='retail' would apply to the whole product
-- and start consuming the sibling's components on its own sale.
insert into public.product_variant (id, tenant_id, product_id, title, sku) values
  ('aaaaaaaa-0000-0000-0000-0000000000f4','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000e2','Wall mount',null);
do $$ begin
  perform public.create_retail_item('11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-0000-0000-0000-0000000000f4', 'Rack wall mount', null, null, 0, null, null, 0);
  raise exception 'FAIL: R7 attached despite manufactured sibling with active BOM';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if sqlerrm not like '%manufactured variants with active BOMs%' then raise exception 'FAIL: R7 wrong error: %', sqlerrm; end if;
  raise notice 'PASS: R7 %', sqlerrm;
end $$;

-- R3: blank name refused.
do $$ begin
  perform public.create_retail_item('11111111-1111-1111-1111-111111111111', null,
    '   ', null, null, 0, null, null, 0);
  raise exception 'FAIL: R3 blank name accepted';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if sqlerrm not like '%name is required%' then raise exception 'FAIL: R3 wrong error: %', sqlerrm; end if;
  raise notice 'PASS: R3 refused (%)', sqlerrm;
end $$;

-- R4: attaching to a Shopify variant with an already-fulfilled order writes a
-- baseline, so the next sync does not consume stock the opening count excludes.
insert into public.product (id, tenant_id, title) values
  ('aaaaaaaa-0000-0000-0000-0000000000e3','11111111-1111-1111-1111-111111111111','Conditioner');
insert into public.product_variant (id, tenant_id, product_id, title, sku) values
  ('aaaaaaaa-0000-0000-0000-0000000000f3','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000e3','300ml','CO-300');
insert into public.orders (id, tenant_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a3','11111111-1111-1111-1111-111111111111','fulfilled'),
  ('aaaaaaaa-0000-0000-0000-0000000000a4','11111111-1111-1111-1111-111111111111','open');
insert into public.order_line (id, tenant_id, order_id, variant_id, quantity) values
  ('aaaaaaaa-0000-0000-0000-00000000ad04','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000a3','aaaaaaaa-0000-0000-0000-0000000000f3',5),
  ('aaaaaaaa-0000-0000-0000-00000000ad05','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000a4','aaaaaaaa-0000-0000-0000-0000000000f3',1);
select public.create_retail_item('11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-0000-0000-0000-0000000000f3', 'Conditioner 300ml', null, null, 9, null, null, 2);
select pg_temp.check((select kind = 'retail' from public.product
  where id = 'aaaaaaaa-0000-0000-0000-0000000000e3'), 'R4 existing product flipped to retail');
select pg_temp.check((select baseline from public.order_line_consumption
  where order_line_id = 'aaaaaaaa-0000-0000-0000-00000000ad04'), 'R4 fulfilled line baselined');
select pg_temp.check((select count(*) = 0 from public.order_line_consumption
  where order_line_id = 'aaaaaaaa-0000-0000-0000-00000000ad05'), 'R4 open line not baselined');
select pg_temp.check(public.apply_sale_consumption('11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-0000-0000-0000-00000000ad04','aaaaaaaa-0000-0000-0000-0000000000d1') = 0,
  'R4 baselined line never consumes');

-- R5: a tenant with no default location gets a clear error.
set test.tenant = '22222222-2222-2222-2222-222222222222';
set test.service_role = 'off';
do $$ begin
  perform public.create_retail_item('22222222-2222-2222-2222-222222222222', null,
    'Thing', null, null, 0, null, null, 0);
  raise exception 'FAIL: R5 created without a location';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if sqlerrm not like '%default location%' then raise exception 'FAIL: R5 wrong error: %', sqlerrm; end if;
  raise notice 'PASS: R5 %', sqlerrm;
end $$;
reset test.tenant;

select pg_temp.check(not has_function_privilege('anon',
  'public.create_retail_item(uuid,uuid,text,text,text,numeric,uuid,uuid,numeric)', 'execute'),
  'R6 anon has no EXECUTE');

-- Cross-tenant fixtures (Ruling 9.5): a second tenant's own location,
-- product/variant and supplier, so T1 can be refused for reaching across
-- into them. Distinct 'bbbbbbbb-…' prefix — no mnemonic-letter collision
-- with T1's 'aaaaaaaa-…' fixtures since these were never in the plan.
insert into public.location (id, tenant_id, name, is_default) values
  ('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','T2 Main',true);
insert into public.product (id, tenant_id, title, kind) values
  ('bbbbbbbb-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','T2 Widget','manufactured');
insert into public.product_variant (id, tenant_id, product_id, title) values
  ('bbbbbbbb-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000002','Std');
insert into public.suppliers (id, tenant_id, name) values
  ('bbbbbbbb-0000-0000-0000-000000000004','22222222-2222-2222-2222-222222222222','T2 Supplier');

set test.service_role = 'on';

-- R8: T1 calling with another tenant's p_variant_id is refused.
do $$ begin
  perform public.create_retail_item('11111111-1111-1111-1111-111111111111',
    'bbbbbbbb-0000-0000-0000-000000000003', 'Steal', null, null, 0, null, null, 0);
  raise exception 'FAIL: R8 attached to another tenant''s variant';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if sqlerrm not like 'forbidden%' then raise exception 'FAIL: R8 wrong error: %', sqlerrm; end if;
  raise notice 'PASS: R8 %', sqlerrm;
end $$;

-- R9: T1 calling with another tenant's p_location_id is refused.
do $$ begin
  perform public.create_retail_item('11111111-1111-1111-1111-111111111111', null,
    'Steal loc', null, null, 0, null, 'bbbbbbbb-0000-0000-0000-000000000001', 0);
  raise exception 'FAIL: R9 used another tenant''s location';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if sqlerrm not like 'forbidden%' then raise exception 'FAIL: R9 wrong error: %', sqlerrm; end if;
  raise notice 'PASS: R9 %', sqlerrm;
end $$;

-- R10: T1 calling with another tenant's p_supplier_id is refused.
do $$ begin
  perform public.create_retail_item('11111111-1111-1111-1111-111111111111', null,
    'Steal supplier', null, null, 0, 'bbbbbbbb-0000-0000-0000-000000000004', null, 0);
  raise exception 'FAIL: R10 used another tenant''s supplier';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if sqlerrm not like 'forbidden%' then raise exception 'FAIL: R10 wrong error: %', sqlerrm; end if;
  raise notice 'PASS: R10 %', sqlerrm;
end $$;

-- S8 (pins Ruling 6): an order line that is T1's own, but whose variant_id
-- (no FK ties variant tenancy to the order's) points at T2's variant, is
-- refused rather than silently misread through the tenant-scoped kind join.
insert into public.orders (id, tenant_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a6','11111111-1111-1111-1111-111111111111','fulfilled');
insert into public.order_line (id, tenant_id, order_id, variant_id, quantity) values
  ('aaaaaaaa-0000-0000-0000-00000000ad07','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000a6','bbbbbbbb-0000-0000-0000-000000000003',1);
do $$ begin
  perform public.apply_sale_consumption('11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-0000-0000-0000-00000000ad07','aaaaaaaa-0000-0000-0000-0000000000d1');
  raise exception 'FAIL: S8 consumed a cross-tenant variant';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if sqlerrm not like 'forbidden%' then raise exception 'FAIL: S8 wrong error: %', sqlerrm; end if;
  raise notice 'PASS: S8 %', sqlerrm;
end $$;
select pg_temp.check((select count(*) = 0 from public.order_line_consumption
  where order_line_id = 'aaaaaaaa-0000-0000-0000-00000000ad07'), 'S8 no consumption row for cross-tenant variant');
