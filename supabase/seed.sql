insert into public.tenant (id, name)
values ('11111111-1111-1111-1111-111111111111', 'Pac-Technologies')
on conflict do nothing;

insert into public.tenant_domain (tenant_id, domain)
values ('11111111-1111-1111-1111-111111111111', 'pac-technologies.com.au')
on conflict do nothing;

insert into public.location (id, tenant_id, name, is_default)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Main Warehouse', true)
on conflict do nothing;

insert into public.component_group (id, tenant_id, name)
values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Clamp Assembly')
on conflict do nothing;

insert into public.component (id, tenant_id, group_id, name, sku, unit)
values
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Clamp Body', 'CLAMP-BODY', 'ea', 220, 150),
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Steel Insert', 'STEEL-INS', 'ea', 18, 60),
  ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Remote I/O Module (ET200SP)', 'ET200SP', 'ea', 420, 25)
on conflict do nothing;

insert into public.shopify_product (id, tenant_id, shopify_id, title, image_url)
values
  ('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', 'shp_1001', 'Inline Checkweigher with Reject', null),
  ('88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111', 'shp_1002', 'Print & Apply Labeling Cell', null),
  ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', 'shp_1003', 'Robotic Palletizing Cell', null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'shp_1004', 'Inline Vision Inspection System', null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'shp_1005', 'Pac-Technologies Car Sticker', null),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'shp_1006', 'Conveyor Line Integration Package', null)
on conflict do nothing;

insert into public.shopify_variant (id, tenant_id, product_id, shopify_id, title, sku)
values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', '77777777-7777-7777-7777-777777777777', 'var_2001', 'Base Model', 'CHK-BASE'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', '77777777-7777-7777-7777-777777777777', 'var_2002', 'Premium Model', 'CHK-PREM'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888888', 'var_2003', 'Cell 1', 'LBL-1'),
  ('11111111-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888888', 'var_2004', 'Cell 2', 'LBL-2'),
  ('22222222-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', 'var_2005', 'Palletizer', 'PAL-1'),
  ('33333333-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'var_2006', 'Vision Base', 'VIS-BASE'),
  ('44444444-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'var_2007', 'Sticker', 'STICKER'),
  ('55555555-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'var_2008', 'Integration', 'INTG-1')
on conflict do nothing;

insert into public.product_bom (id, tenant_id, variant_id, version, status, is_active)
values
  ('12121212-1212-1212-1212-121212121212', '11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 4, 'active', true)
on conflict do nothing;

insert into public.product_bom_component (tenant_id, product_bom_id, component_id, quantity)
values
  ('11111111-1111-1111-1111-111111111111', '12121212-1212-1212-1212-121212121212', '44444444-4444-4444-4444-444444444444', 2),
  ('11111111-1111-1111-1111-111111111111', '12121212-1212-1212-1212-121212121212', '55555555-5555-5555-5555-555555555555', 1)
on conflict do nothing;

insert into public.inventory_balance (tenant_id, component_id, location_id, on_hand, in_prod, reserved)
values
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 3200, 240, 880),
  ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 1120, 60, 1000)
on conflict do nothing;

insert into public.inventory_movement (tenant_id, component_id, location_id, delta_on_hand, delta_in_prod, reason, reference_type)
values
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', -48, 48, 'allocation', 'order'),
  ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 600, 0, 'receipt', 'purchase_order'),
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', -12, 0, 'stocktake_adjustment', 'stocktake_session')
on conflict do nothing;

insert into public.suppliers (id, tenant_id, name)
values
  ('77777777-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Pacific Controls'),
  ('77777777-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'LabelTech Systems')
on conflict do nothing;

insert into public.purchase_order (id, tenant_id, supplier_id, status)
values
  ('88888888-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '77777777-1111-1111-1111-111111111111', 'open'),
  ('88888888-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '77777777-2222-2222-2222-222222222222', 'in_transit')
on conflict do nothing;

insert into public.orders (id, tenant_id, shopify_order_id, status)
values
  ('99999999-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '1084', 'fulfilled'),
  ('99999999-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '1083', 'allocated'),
  ('99999999-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '1082', 'fulfilled')
on conflict do nothing;

insert into public.order_line (id, tenant_id, order_id, variant_id, quantity)
values
  ('aaaa1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '99999999-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 1),
  ('aaaa2222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '99999999-1111-1111-1111-111111111111', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 1),
  ('aaaa3333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '99999999-2222-2222-2222-222222222222', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 2),
  ('aaaa4444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '99999999-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 3)
on conflict do nothing;

insert into public.activity_log (tenant_id, actor_id, event, metadata)
values
  (
    '11111111-1111-1111-1111-111111111111',
    null,
    'Component Modified',
    jsonb_build_object(
      'user','Kasper Simonsen',
      'entity','component',
      'entity_id','454',
      'message','Component Remote I/O Module (ET200SP) Modified'
    )
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    null,
    'PURCHASE_ORDER_CREATED',
    jsonb_build_object(
      'user','Kasper Simonsen',
      'entity','purchase_order',
      'entity_id','APS-123',
      'message','Created received purchase order APS-123'
    )
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    null,
    'New Order',
    jsonb_build_object(
      'user','Shopify',
      'entity','order',
      'entity_id','7107808231667',
      'message','New Order 7107808231667 Imported from Shopify'
    )
  )
on conflict do nothing;
