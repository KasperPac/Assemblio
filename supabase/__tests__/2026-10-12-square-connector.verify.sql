-- SCRATCH ONLY. Fixture names use Pac-Technologies; all writes rolled back.
\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.check(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAIL: %',label; end if; end $$;
create or replace function pg_temp.reject(statement text,expected_state text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'FAIL: statement unexpectedly succeeded';
exception when others then
  if sqlstate<>expected_state then raise exception 'FAIL: expected %, got %: %',expected_state,sqlstate,sqlerrm; end if;
end $$;
create or replace function public.current_tenant_id() returns uuid language sql stable as
$$ select nullif(current_setting('test.tenant',true),'')::uuid $$;
set request.jwt.claims='{"role":"service_role"}';
insert into public.tenant(id,name) values
 ('11111111-1111-1111-1111-111111111111','Pac-Technologies'),
 ('22222222-2222-2222-2222-222222222222','Pac-Technologies');
insert into public.location(id,tenant_id,name,is_default) values
 ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Main',true),
 ('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','Main',true);
create temporary table test_ids(key text primary key,id uuid);
insert into test_ids values ('connection',public.save_square_connection('11111111-1111-1111-1111-111111111111',null,
 'scratch-merchant','sandbox','encrypted-fixture-access','encrypted-fixture-refresh',1,now()+interval '1 hour'));
insert into test_ids select 'channel',sales_channel_id from public.square_connection where id=(select id from test_ids where key='connection');
insert into test_ids values('variant',public.create_retail_item('11111111-1111-1111-1111-111111111111',null,'Stocked test item','PAC-1',null,0,null,null,0));
insert into public.channel_item_link(tenant_id,sales_channel_id,external_variation_id,name,status,variant_id,stock_conversion_ratio,tracked_location_ids)
 select '11111111-1111-1111-1111-111111111111',id,'item-1','Stocked test item','linked',
 (select id from test_ids where key='variant'),null,array['square-main'] from test_ids where key='channel';
insert into public.channel_item_link(tenant_id,sales_channel_id,external_variation_id,name,status,ignored_reason)
 select '11111111-1111-1111-1111-111111111111',id,'service','Service','ignored','No physical stock' from test_ids where key='channel';
insert into public.square_location_link(tenant_id,sales_channel_id,square_location_id,location_id)
 select '11111111-1111-1111-1111-111111111111',id,'square-main','aaaaaaaa-0000-0000-0000-000000000001' from test_ids where key='channel';
select public.square_set_stock_writes('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),true,true);
update public.sales_channel set baseline_confirmed_at='2026-10-01T00:00:00Z' where id=(select id from test_ids where key='channel');
select pg_temp.check(public.square_apply_inventory_count('11111111-1111-1111-1111-111111111111',
 (select id from test_ids where key='channel'),'item-1','square-main',20,'2026-10-01T01:00:00Z'),'opening count applied');
insert into test_ids values('pending-order',public.ingest_square_order('11111111-1111-1111-1111-111111111111',
 (select id from test_ids where key='channel'),'order-1','square-main',
 '[{"uid":"1","catalog_object_id":"item-1","quantity":2},{"uid":"2","catalog_object_id":"unknown","quantity":3},{"uid":"3","catalog_object_id":"service","quantity":1}]',
 '{"state":"COMPLETED","closed_at":"2026-10-02T00:00:00Z","customer_email":"DO-NOT-PERSIST"}'));
select pg_temp.check((select on_hand=20 from public.inventory_balance limit 1),'unmapped line delays whole order');
select pg_temp.check((select count(*)=3 from public.square_order_line),'unknown and ignored lines persisted');
select pg_temp.check((select not(square_payload ? 'customer_email') from public.orders limit 1),'only sanitized order metadata persisted');
select pg_temp.check(not public.square_apply_inventory_count('11111111-1111-1111-1111-111111111111',
 (select id from test_ids where key='channel'),'item-1','square-main',15,'2026-10-02T01:00:00Z'),'count deferred while live order unresolved');
select pg_temp.check((select origin='order' and status='unmatched' and stock_conversion_ratio=1
 from public.channel_item_link where external_variation_id='unknown'),'unknown catalog variation has operator-resolvable sale-only queue entry');
update public.channel_item_link set name='Second sale of same item',status='linked',
 variant_id=(select id from test_ids where key='variant'),stock_conversion_ratio=1,tracked_location_ids=array['square-main']
 where external_variation_id='unknown';
select public.ingest_square_order('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),
 'order-1','replacement-location','[]','{"state":"COMPLETED","closed_at":"2026-10-03T00:00:00Z"}');
select pg_temp.check((select on_hand=15 from public.inventory_balance limit 1),'resolved repeated variant consumes aggregate 5 once');
select pg_temp.check((select count(*)=1 from public.order_line),'variant uniqueness unchanged');
select public.ingest_square_order('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),
 'order-1','square-main','[]','{"state":"COMPLETED","closed_at":"2026-10-02T00:00:00Z"}');
select pg_temp.check((select on_hand=15 from public.inventory_balance limit 1),'duplicate webhook leaves stock unchanged');
select pg_temp.check((select sum(delta_on_hand)=15 from public.inventory_movement),'movement/balance invariant');
-- Remove ambiguous external mapping before absolute counts.
update public.channel_item_link set status='ignored',ignored_reason='Scratch alias' where external_variation_id='unknown';
select pg_temp.check(public.square_apply_inventory_count('11111111-1111-1111-1111-111111111111',
 (select id from test_ids where key='channel'),'item-1','square-main',14,'2026-10-04T00:00:00Z'),'newer absolute count applied');
select pg_temp.check(not public.square_apply_inventory_count('11111111-1111-1111-1111-111111111111',
 (select id from test_ids where key='channel'),'item-1','square-main',99,'2026-10-03T00:00:00Z'),'stale count refused');
select public.ingest_square_order('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),
 'late-order','square-main','[{"uid":"1","catalog_object_id":"item-1","quantity":1}]',
 '{"state":"COMPLETED","closed_at":"2026-10-03T12:00:00Z"}');
select pg_temp.check((select on_hand=14 from public.inventory_balance limit 1),'late sale already reflected in count is baselined');
select pg_temp.check((select count(*)=1 from public.order_line_consumption where baseline),'late sale baseline recorded');
select public.ingest_square_order('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),
 'historic-order','square-main','[{"uid":"1","catalog_object_id":"item-1","quantity":5}]',
 '{"state":"COMPLETED","closed_at":"2026-09-30T12:00:00Z"}');
select pg_temp.check((select on_hand=14 from public.inventory_balance limit 1),'pre-opening sale never consumes');
select pg_temp.check(not public.square_apply_inventory_count('11111111-1111-1111-1111-111111111111',
 (select id from test_ids where key='channel'),'item-1','square-main',999,'2026-09-30T00:00:00Z'),'pre-baseline count refused');
select pg_temp.check(public.square_apply_inventory_count('11111111-1111-1111-1111-111111111111',
 (select id from test_ids where key='channel'),'item-1','square-main',12,'2026-10-05T00:00:00Z',true),'own-write echo timestamp recorded');
select pg_temp.check((select on_hand=14 from public.inventory_balance limit 1),'own-write echo never replaces physical stock');
select public.ingest_square_order('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),
 'after-real-count-before-echo','square-main','[{"uid":"1","catalog_object_id":"item-1","quantity":1}]',
 '{"state":"COMPLETED","closed_at":"2026-10-04T12:00:00Z"}');
select pg_temp.check((select on_hand=13 from public.inventory_balance limit 1),'own-write echo does not baseline an unabsorbed late sale');
select pg_temp.reject(format('insert into public.channel_item_link(tenant_id,sales_channel_id,external_variation_id,name,status,variant_id) values(%L,%L,%L,%L,%L,%L)',
 '11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),'duplicate-full-stock','Duplicate','linked',
 (select id from test_ids where key='variant')),'23505');
select pg_temp.reject(format('select public.ingest_square_order(%L,%L,%L,%L,%L::jsonb,%L::jsonb)',
 '11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),'invalid-order','square-main',
 '[{"uid":"1","catalog_object_id":"item-1","quantity":-1}]','{"state":"COMPLETED","closed_at":"2026-10-04T00:00:00Z"}'),'23514');
select pg_temp.check(not exists(select 1 from public.orders where external_order_id='invalid-order'),'invalid order rollback is atomic');
update public.channel_item_link set status='linked',ignored_reason=null,stock_conversion_ratio=2 where external_variation_id='unknown';
select public.ingest_square_order('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),
 'late-alias-order','square-main','[{"uid":"1","catalog_object_id":"unknown","quantity":1}]',
 '{"state":"COMPLETED","closed_at":"2026-10-03T13:00:00Z"}');
select pg_temp.check((select on_hand=13 from public.inventory_balance limit 1),'converted alias uses shared real-count absorption watermark');
select public.ingest_square_order('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),
 'fresh-alias-order','square-main','[{"uid":"1","catalog_object_id":"unknown","quantity":1.5}]',
 '{"state":"COMPLETED","closed_at":"2026-10-06T13:00:00Z"}');
select pg_temp.check((select on_hand=10 from public.inventory_balance limit 1),'converted alias consumes exact ratio quantity');
select pg_temp.check(not public.square_apply_inventory_count('11111111-1111-1111-1111-111111111111',
 (select id from test_ids where key='channel'),'unknown','square-main',999,'2026-10-07T00:00:00Z'),'converted alias cannot replace shared physical stock');
-- Square receives available stock. A physical count cannot subtract Manuva
-- reservations again; exact proven echoes are safe because they never write it.
set test.tenant='11111111-1111-1111-1111-111111111111';
insert into test_ids select 'component',bc.component_id from public.product_bom_component bc
 join public.product_bom b on b.id=bc.product_bom_id where b.variant_id=(select id from test_ids where key='variant') and b.is_active;
select public.apply_inventory_movement((select id from test_ids where key='component'),
 'aaaaaaaa-0000-0000-0000-000000000001',90,0,'adjustment','scratch',null);
select public.apply_reserved_movement('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='component'),
 'aaaaaaaa-0000-0000-0000-000000000001',null,10);
select pg_temp.check(public.square_apply_inventory_count('11111111-1111-1111-1111-111111111111',
 (select id from test_ids where key='channel'),'item-1','square-main',90,'2026-10-08T00:00:00Z',true),'available 90 export echo accepted without physical write');
select public.ingest_square_order('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),
 'sale-with-reservations','square-main','[{"uid":"1","catalog_object_id":"item-1","quantity":1}]',
 '{"state":"COMPLETED","closed_at":"2026-10-09T00:00:00Z"}');
select pg_temp.check((select on_hand=99 and reserved=10 from public.inventory_balance where component_id=(select id from test_ids where key='component')),
 'sale consumes physical 100 to 99 while unrelated reservations stay 10');
select pg_temp.reject(format('select public.square_apply_inventory_count(%L,%L,%L,%L,89,%L)',
 '11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),'item-1','square-main','2026-10-09T01:00:00Z'),'P0001');
select pg_temp.check((select on_hand=99 and reserved=10 from public.inventory_balance where component_id=(select id from test_ids where key='component')),
 'Square available 89 cannot replace physical 99 and subtract reservations twice');
select pg_temp.check(not public.square_apply_inventory_count('11111111-1111-1111-1111-111111111111',
 (select id from test_ids where key='channel'),'item-1','square-main',100,'2026-10-08T12:00:00Z'),
 'count predating a consumed sale cannot restore its stock');
select public.apply_reserved_movement('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='component'),
 'aaaaaaaa-0000-0000-0000-000000000001',null,-10);
insert into public.channel_stock_write(tenant_id,sales_channel_id,variant_id,external_variation_id,external_location_id,quantity,status)
 select '11111111-1111-1111-1111-111111111111',id,(select id from test_ids where key='variant'),'item-1','square-main',89,'failed'
 from test_ids where key='channel';
select pg_temp.check(not public.square_apply_inventory_count('11111111-1111-1111-1111-111111111111',
 (select id from test_ids where key='channel'),'item-1','square-main',89,'2026-10-09T02:00:00Z'),
 'uncertain timed-out stock write defers possible echo');
select pg_temp.check((select on_hand=99 from public.inventory_balance where component_id=(select id from test_ids where key='component')),
 'uncertain echo preserves physical stock');
select pg_temp.check((select absorbed_through='2026-10-04T00:00:00Z' from public.square_inventory_count),
 'uncertain echo cannot advance real absorption watermark');
update public.channel_stock_write set status='sent',square_calculated_at='2026-10-09T02:00:00Z';
select pg_temp.check(public.square_apply_inventory_count('11111111-1111-1111-1111-111111111111',
 (select id from test_ids where key='channel'),'item-1','square-main',89,'2026-10-09T02:00:00Z',true),
 'idempotent retry exact echo proof advances observed timestamp');
select pg_temp.check(public.square_apply_inventory_count('11111111-1111-1111-1111-111111111111',
 (select id from test_ids where key='channel'),'item-1','square-main',98,'2026-10-10T00:00:00Z'),
 'fresh physical count covering latest sale applies without reservations');
-- Two variants sharing one component cannot expose that whole shelf twice.
insert into test_ids values('shared-variant',public.create_retail_item('11111111-1111-1111-1111-111111111111',null,
 'Shared shelf variant','PAC-2',null,0,null,null,0));
update public.product_bom_component set component_id=(select id from test_ids where key='component')
 where product_bom_id in(select id from public.product_bom where variant_id=(select id from test_ids where key='shared-variant') and is_active);
insert into public.channel_item_link(tenant_id,sales_channel_id,external_variation_id,name,status,variant_id,tracked_location_ids)
 select '11111111-1111-1111-1111-111111111111',id,'shared-shelf','Shared shelf variant','linked',
 (select id from test_ids where key='shared-variant'),array['square-main'] from test_ids where key='channel';
select pg_temp.reject(format('select public.square_set_stock_writes(%L,%L,true,true)',
 '11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel')),'P0001');
select pg_temp.reject(format('select public.square_apply_inventory_count(%L,%L,%L,%L,97,%L)',
 '11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),'item-1','square-main','2026-10-11T00:00:00Z'),'P0001');
select pg_temp.check((select on_hand=98 from public.inventory_balance where component_id=(select id from test_ids where key='component')),
 'ambiguous shared-component count leaves shelf untouched');
select pg_temp.check((select sum(delta_on_hand)=98 from public.inventory_movement where component_id=(select id from test_ids where key='component')),
 'reservation, echo and stale-count guards preserve movement/balance invariant');
update public.channel_item_link set status='ignored',ignored_reason='Ambiguous shared shelf' where external_variation_id='shared-shelf';
select public.ingest_square_order('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),
 'custom-sale','square-main','[{"uid":"line-custom","name":"Custom counter sale","quantity":2}]',
 '{"state":"COMPLETED","closed_at":"2026-10-11T13:00:00Z"}');
select pg_temp.check((select origin='order' and status='unmatched' and stock_conversion_ratio=1 and tracked_location_ids=array['square-main']
 from public.channel_item_link where external_variation_id='custom:custom-sale:line-custom'),'custom line gains scoped sale-only mapping queue entry');
select pg_temp.check((select external_variation_id='custom:custom-sale:line-custom' and status='pending_mapping'
 from public.square_order_line where external_line_id='line-custom'),'custom line persisted pending operator choice');
-- Same operation as the existing mapping UI: explicitly choose a stocked variant.
-- An order-origin alias does not silently become ignored if catalog tracking differs.
update public.channel_item_link set status='linked',variant_id=(select id from test_ids where key='variant'),
 match_method='manual',tracked_location_ids=array['different-catalog-location']
 where external_variation_id='custom:custom-sale:line-custom';
select public.ingest_square_order('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),
 'custom-sale','square-main','[]','{"state":"COMPLETED","closed_at":"2026-10-11T13:00:00Z"}');
select pg_temp.check((select on_hand=96 from public.inventory_balance where component_id=(select id from test_ids where key='component')),
 'explicit custom-line mapping consumes stock rather than silently dropping sale');
select public.ingest_square_order('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),
 'custom-sale','square-main','[]','{"state":"COMPLETED","closed_at":"2026-10-11T13:00:00Z"}');
select pg_temp.check((select on_hand=96 from public.inventory_balance where component_id=(select id from test_ids where key='component')),
 'resolved custom sale replay remains idempotent');
-- Resolved orders older than the API lookback replay from immutable local data.
insert into test_ids values('retry-variant',public.create_retail_item('11111111-1111-1111-1111-111111111111',null,
 'Retry stock','PAC-RETRY',null,0,null,null,0));
insert into test_ids select 'retry-component',bc.component_id from public.product_bom_component bc
 join public.product_bom b on b.id=bc.product_bom_id where b.variant_id=(select id from test_ids where key='retry-variant') and b.is_active;
select public.apply_inventory_movement((select id from test_ids where key='retry-component'),
 'aaaaaaaa-0000-0000-0000-000000000001',10,0,'adjustment','scratch',null);
insert into public.product(id,tenant_id,title) values('aaaaaaaa-0000-0000-0000-000000000003',
 '11111111-1111-1111-1111-111111111111','Unstocked manufactured variant');
insert into public.product_variant(id,tenant_id,product_id,title) values('aaaaaaaa-0000-0000-0000-000000000004',
 '11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000003','Unstocked');
select public.ingest_square_order('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),
 'retry-invalid','square-main','[{"uid":"1","catalog_object_id":"retry-broken","quantity":1}]',
 '{"state":"COMPLETED","closed_at":"2026-10-02T00:00:00Z"}');
select public.ingest_square_order('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),
 'retry-old','square-main','[{"uid":"1","catalog_object_id":"retry-valid","quantity":2}]',
 '{"state":"COMPLETED","closed_at":"2026-10-02T00:00:00Z"}');
insert into test_ids values('retry-token',public.claim_square_sync('11111111-1111-1111-1111-111111111111',
 (select id from test_ids where key='channel'),180));
select pg_temp.check(public.retry_square_pending_orders('11111111-1111-1111-1111-111111111111',
 (select id from test_ids where key='channel'),(select id from test_ids where key='retry-token'),1)=0,'unresolved old orders skipped');
update public.channel_item_link set status='linked',variant_id='aaaaaaaa-0000-0000-0000-000000000004' where external_variation_id='retry-broken';
update public.channel_item_link set status='linked',variant_id=(select id from test_ids where key='retry-variant') where external_variation_id='retry-valid';
select pg_temp.check(public.retry_square_pending_orders('11111111-1111-1111-1111-111111111111',
 (select id from test_ids where key='channel'),(select id from test_ids where key='retry-token'),1)=1,
 'resolved old order consumes even with API lookback expired; invalid earlier mapping cannot starve batch');
select pg_temp.check((select on_hand=8 from public.inventory_balance where component_id=(select id from test_ids where key='retry-component')),
 'resolved old order writes exact sale movement');
select pg_temp.check(public.retry_square_pending_orders('11111111-1111-1111-1111-111111111111',
 (select id from test_ids where key='channel'),(select id from test_ids where key='retry-token'),1)=0,'resolved old order retries idempotently');
select pg_temp.reject(format('select public.retry_square_pending_orders(%L,%L,%L,100)',
 '22222222-2222-2222-2222-222222222222',(select id from test_ids where key='channel'),(select id from test_ids where key='retry-token')),'P0001');
select pg_temp.reject(format('select public.retry_square_pending_orders(%L,%L,null,100)',
 '11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel')),'P0001');
select pg_temp.check(not has_function_privilege('authenticated','public.retry_square_pending_orders(uuid,uuid,uuid,integer)','EXECUTE'),
 'member cannot invoke pending order replay');
select pg_temp.check(public.release_square_sync('11111111-1111-1111-1111-111111111111',
 (select id from test_ids where key='channel'),(select id from test_ids where key='retry-token')),'retry worker releases channel');
update public.channel_item_link set status='ignored',ignored_reason='Non-stock manufactured item' where external_variation_id='retry-broken';
select pg_temp.reject(format('insert into public.square_location_link values(%L,%L,%L,%L)',
 '11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),'cross-tenant','bbbbbbbb-0000-0000-0000-000000000001'),'23503');
select pg_temp.reject(format('select public.save_square_connection(%L,null,%L,%L,%L,%L,1,now())',
 '22222222-2222-2222-2222-222222222222','scratch-merchant','sandbox','test','test'),'23505');
select pg_temp.check((select count(*)=0 from public.sales_channel where tenant_id='22222222-2222-2222-2222-222222222222'),'failed merchant reuse rolls back channel');
select pg_temp.check(not has_table_privilege('authenticated','public.square_credential','SELECT'),'member cannot read credentials');
select pg_temp.check(not has_table_privilege('anon','public.sales_channel','SELECT'),'anonymous cannot read channels');
select pg_temp.check(not has_function_privilege('authenticated','public.ingest_square_order(uuid,uuid,text,text,jsonb,jsonb,uuid)','EXECUTE'),'member cannot invoke trusted ingest');
select pg_temp.check(not has_table_privilege('authenticated','public.channel_item_link','UPDATE'),'member cannot write mapping directly');
grant usage on schema public to authenticated;
set test.tenant='22222222-2222-2222-2222-222222222222';
set local role authenticated;
select pg_temp.check((select count(*)=0 from public.sales_channel),'RLS isolates other tenant');
reset role;
insert into public.square_webhook_event(tenant_id,sales_channel_id,event_id,event_type,payload)
 select '11111111-1111-1111-1111-111111111111',id,'event-1','order.updated','{}' from test_ids where key='channel';
select pg_temp.check((select count(*)=1 from public.claim_square_webhook_events(20)),'durable event claimed');
select pg_temp.check((select count(*)=0 from public.claim_square_webhook_events(20)),'active lease prevents duplicate claim');
update public.square_webhook_event set lease_until=now()-interval '1 minute';
select pg_temp.check((select count(*)=1 from public.claim_square_webhook_events(20)),'expired crash lease reclaimable');
select pg_temp.check((select count(*)=1 from public.claim_square_refresh_lease((select id from test_ids where key='connection'),60)),'refresh lease claimed');
select pg_temp.check((select count(*)=0 from public.claim_square_refresh_lease((select id from test_ids where key='connection'),60)),'refresh concurrency guard');
insert into test_ids values('sync-token',public.claim_square_sync('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),180));
select pg_temp.check((select id is not null from test_ids where key='sync-token'),'sync lease claimed');
select pg_temp.check(public.claim_square_sync('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),180) is null,'concurrent sync lease denied');
select pg_temp.check(not public.release_square_sync('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),gen_random_uuid()),'foreign token cannot release lease');
select pg_temp.reject(format('select public.ingest_square_order(%L,%L,%L,%L,%L::jsonb,%L::jsonb)',
 '11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),'missing-lease-order','square-main','[]',
 '{"state":"COMPLETED","closed_at":"2026-10-11T00:00:00Z"}'),'P0001');
update public.sales_channel set sync_lease_until=clock_timestamp()-interval '1 second' where id=(select id from test_ids where key='channel');
select pg_temp.reject(format('select public.ingest_square_order(%L,%L,%L,%L,%L::jsonb,%L::jsonb,%L)',
 '11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),'expired-lease-order','square-main','[]',
 '{"state":"COMPLETED","closed_at":"2026-10-11T00:00:00Z"}',(select id from test_ids where key='sync-token')),'P0001');
select pg_temp.reject(format('select public.square_apply_inventory_count(%L,%L,%L,%L,98,%L,false,%L)',
 '11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),'item-1','square-main','2026-10-11T00:00:00Z',
 (select id from test_ids where key='sync-token')),'P0001');
insert into test_ids values('new-sync-token',public.claim_square_sync('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),180));
select pg_temp.reject(format('select public.square_apply_inventory_count(%L,%L,%L,%L,98,%L,false,%L)',
 '11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),'item-1','square-main','2026-10-11T00:00:00Z',
 (select id from test_ids where key='sync-token')),'P0001');
select pg_temp.check(not public.release_square_sync('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),
 (select id from test_ids where key='sync-token')),'old lease holder cannot release successor lease');
select pg_temp.check(not exists(select 1 from public.orders where external_order_id in ('missing-lease-order','expired-lease-order')),
 'fenced workers cannot persist any order');
update test_ids set id=(select id from test_ids where key='new-sync-token') where key='sync-token';
select pg_temp.reject(format('select public.square_set_stock_writes(%L,%L,false,false)',
 '11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel')),'P0001');
select public.square_set_stock_writes('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),false,false,(select id from test_ids where key='sync-token'));
select pg_temp.check(public.release_square_sync('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='channel'),(select id from test_ids where key='sync-token')),'owner releases lease');
select public.square_disconnect('11111111-1111-1111-1111-111111111111',(select id from test_ids where key='connection'));
select pg_temp.check((select not stock_write_enabled and baseline_confirmed_at='2026-10-01T00:00:00Z' from public.sales_channel),'disconnect preserves baseline and disables writes');
select pg_temp.check((select count(*)=0 from public.square_credential),'disconnect deletes encrypted tokens');
rollback;
