-- supabase/__tests__/2026-10-01-xero-supplier-bills.verify.sql
-- Verification for patches/2026-10-01-xero-supplier-bills.sql (MANUVA-34).
-- SCRATCH POSTGRES ONLY: redefines current_tenant_id()/current_profile_role()
-- to read GUCs so one session can play several callers. Never run on prod.
--
-- Throwaway Postgres 17 (prod is 17.6) and a fresh database
-- (Git Bash: export MSYS_NO_PATHCONV=1 first):
--
--   docker run -d --name manuva-scratch-xero -e POSTGRES_PASSWORD=scratch \
--     -v "C:/dev/assemblio/supabase:/sb:ro" postgres:17
--   until docker exec manuva-scratch-xero pg_isready -U postgres; do sleep 1; done
--   docker exec manuva-scratch-xero createdb -U postgres xero
--   P="docker exec manuva-scratch-xero psql -q -U postgres -d xero -v ON_ERROR_STOP=1"
--   $P -f /sb/__tests__/scratch-prelude.sql        # Supabase roles, auth.users, auth.uid()
--   $P -f /sb/schema.sql
--   $P -f /sb/patches/2026-09-02-tenant-isolation-hardening.sql  # is_service_role()
--   $P -f /sb/patches/suppliers_module.sql         # suppliers.is_active, purchase_order_line.unit_cost
--   $P -f /sb/patches/delivery_receipt_tables.sql
--   $P -f /sb/patches/delivery_receipt_line_cost.sql  # delivery_receipt_line.cost_per_unit
--   # Supabase's default privileges (read from prod pg_default_acl), so the
--   # migration's revokes are tested against the grants they must undo:
--   $P -c "alter default privileges in schema public grant all on tables to anon, authenticated, service_role; alter default privileges in schema public grant all on functions to anon, authenticated, service_role;"
--   $P -f /sb/patches/2026-10-01-xero-supplier-bills.sql
--   $P -f /sb/__tests__/2026-10-01-xero-supplier-bills.verify.sql
--   docker rm -f manuva-scratch-xero
--
-- Not loaded: patches/dashboard_compat_views.sql (public.supplier view). It
-- does not load on schema.sql (relation "public.shopify_product" does not
-- exist), and nothing here touches the view: the migration's FKs and
-- functions use the suppliers table.
--
-- Expected: every check prints PASS; the script stops on the first FAIL.
-- A FAIL is raised with errcode XX000, which no check catches.
\set ON_ERROR_STOP on
-- Results are noise; PASS notices and errors go to stderr and still show.
\o /dev/null

-- Scratch-only setup -------------------------------------------------------
create or replace function public.current_tenant_id() returns uuid language sql stable as
$$ select nullif(current_setting('test.tenant', true), '')::uuid $$;
create or replace function public.current_profile_role() returns text language sql stable as
$$ select nullif(current_setting('test.role', true), '') $$;
-- Prod has purchase_order.po_number; no repo patch creates it.
alter table public.purchase_order add column if not exists po_number text;
-- Supabase lets these roles use auth.uid() (supplier_invoice.created_by default).
grant usage on schema auth to anon, authenticated, service_role;

create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  -- `is not true` also fails a NULL (e.g. a scalar subquery over zero rows).
  if ok is not true then raise exception 'FAIL %', label using errcode = 'XX000'; end if;
  raise notice 'PASS %', label;
end $$;

-- Runs p_sql (as p_role when given) and requires it to fail with SQLSTATE
-- p_state and a message LIKE p_like. Success, another SQLSTATE or another
-- message stops the script. The caught error rolls back p_sql's effects.
create or replace function pg_temp.expect_error(p_label text, p_sql text, p_state text,
                                                p_like text default '%', p_role text default null)
returns void language plpgsql as $$
declare v_state text; v_msg text;
begin
  begin
    if p_role is not null then execute format('set local role %I', p_role); end if;
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  if v_state is null then
    raise exception 'FAIL %: expected % but the statement succeeded', p_label, p_state using errcode = 'XX000';
  end if;
  if v_state <> p_state or v_msg not like p_like then
    raise exception 'FAIL %: expected % "%", got % "%"', p_label, p_state, p_like, v_state, v_msg using errcode = 'XX000';
  end if;
  raise notice 'PASS %', p_label;
end $$;

-- Evaluates a boolean query as p_role (RLS and grants apply).
create or replace function pg_temp.as_role(p_role text, p_sql text) returns boolean language plpgsql as $$
declare v boolean;
begin
  execute format('set local role %I', p_role);
  execute p_sql into v;
  execute 'reset role';
  return v;
end $$;

-- Fixtures -----------------------------------------------------------------
-- Tenant T1: supplier S1, components C1 (Bolt) and C2 (Nut), location F1,
-- PO1 (line POL1: 10 @ 2.00), receipts R1 (supplier_delivery, line L1 qty 10,
-- on PO1) and R2 (sample, line L2), and a set-up Xero connection E1.
-- Tenant T2: supplier, component and PO that T1 must never be able to use.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'admin@t1.test') on conflict do nothing;
insert into public.tenant (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'T1'),
  ('22222222-2222-2222-2222-222222222222', 'T2') on conflict do nothing;
insert into public.suppliers (id, tenant_id, name) values
  ('11111111-0000-0000-0000-000000000051', '11111111-1111-1111-1111-111111111111', 'Acme'),
  ('22222222-0000-0000-0000-000000000051', '22222222-2222-2222-2222-222222222222', 'Other Co') on conflict do nothing;
insert into public.component (id, tenant_id, name, cost_per_unit) values
  ('11111111-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111', 'Bolt', 1),
  ('11111111-0000-0000-0000-0000000000c2', '11111111-1111-1111-1111-111111111111', 'Nut', 1),
  ('22222222-0000-0000-0000-0000000000c1', '22222222-2222-2222-2222-222222222222', 'Secret part', 1) on conflict do nothing;
insert into public.location (id, tenant_id, name) values ('11111111-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-111111111111', 'Main') on conflict do nothing;
insert into public.purchase_order (id, tenant_id, supplier_id, po_number) values
  ('11111111-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', 'PO-1'),
  ('22222222-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', '22222222-0000-0000-0000-000000000051', 'SECRET-PO') on conflict do nothing;
insert into public.purchase_order_line (id, tenant_id, purchase_order_id, component_id, quantity, unit_cost) values ('11111111-0000-0000-0000-00000000b101', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000b1', '11111111-0000-0000-0000-0000000000c1', 10, 2.00) on conflict do nothing;
insert into public.delivery_receipt (id, tenant_id, supplier_id, supplier_reference, location_id, stock_in_reason, purchase_order_id, created_by) values
  ('11111111-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', 'DN-1', '11111111-0000-0000-0000-0000000000f1', 'supplier_delivery', '11111111-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1'),
  ('11111111-0000-0000-0000-0000000000d2', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', 'SAMPLE', '11111111-0000-0000-0000-0000000000f1', 'sample', null, '00000000-0000-0000-0000-0000000000a1') on conflict do nothing;
insert into public.delivery_receipt_line (id, tenant_id, delivery_receipt_id, component_id, quantity_delivered, cost_per_unit, purchase_order_line_id) values
  ('11111111-0000-0000-0000-00000000d101', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000d1', '11111111-0000-0000-0000-0000000000c1', 10, 2.00, '11111111-0000-0000-0000-00000000b101'),
  ('11111111-0000-0000-0000-00000000d102', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000d2', '11111111-0000-0000-0000-0000000000c1', 1, 0, null) on conflict do nothing;
insert into public.accounting_connection (id, tenant_id, provider, status, external_org_id, external_connection_id, org_name, base_currency,
  inventory_account_code, other_charges_account_code, purchase_tax_type, gst_free_tax_type, bills_start_date, sales_source, setup_completed_at)
values ('11111111-0000-0000-0000-0000000000e1', '11111111-1111-1111-1111-111111111111', 'xero', 'connected', 'org-1', 'conn-1', 'Acme Pty', 'AUD',
  '630', '425', 'INPUT', 'EXEMPTEXPENSES', '2026-01-01', 'a2x', now()) on conflict do nothing;
-- Placeholder ciphertext only; no real token or key.
insert into public.accounting_credential (connection_id, access_token_enc, refresh_token_enc, key_version, access_expires_at, refresh_expires_at)
values ('11111111-0000-0000-0000-0000000000e1', 'v1.aaa.bbb.ccc', 'v1.ddd.eee.fff', 1, now() + interval '30 minutes', now() + interval '60 days') on conflict do nothing;

select set_config('test.tenant', '11111111-1111-1111-1111-111111111111', false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);

-- Drafts A and B both contain L1 (allowed while drafts); C contains the sample line L2.
insert into public.supplier_invoice (id, tenant_id, supplier_id, purchase_order_id, invoice_number, invoice_date, due_date, amounts_mode, currency) values
  ('11111111-0000-0000-0000-0000000000aa', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', '11111111-0000-0000-0000-0000000000b1', 'INV-A', '2026-10-01', '2026-10-31', 'exclusive', 'AUD'),
  ('11111111-0000-0000-0000-0000000000ab', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', null, 'INV-B', '2026-10-01', '2026-10-31', 'exclusive', 'AUD'),
  ('11111111-0000-0000-0000-0000000000ac', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', null, 'INV-C', '2026-10-01', '2026-10-31', 'exclusive', 'AUD');
insert into public.supplier_invoice_line (tenant_id, supplier_invoice_id, line_no, kind, delivery_receipt_line_id, component_id, description, quantity, unit_amount, tax_type, tax_rate, account_code, line_amount, tax_amount) values
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000aa', 1, 'stock', '11111111-0000-0000-0000-00000000d101', '11111111-0000-0000-0000-0000000000c1', 'Bolt', 9, 2.5, 'INPUT', 10, '630', 22.50, 2.25),
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000aa', 2, 'other', null, null, 'Freight', 1, 10, 'INPUT', 10, '425', 10.00, 1.00),
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000ab', 1, 'stock', '11111111-0000-0000-0000-00000000d101', '11111111-0000-0000-0000-0000000000c1', 'Bolt', 10, 2, 'INPUT', 10, '630', 20.00, 2.00),
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000ac', 1, 'stock', '11111111-0000-0000-0000-00000000d102', '11111111-0000-0000-0000-0000000000c1', 'Sample', 1, 0, 'INPUT', 10, '630', 0, 0);

-- 1. Posting without a contact link and without create_contact is refused.
select pg_temp.expect_error('1: contact link required',
  $q$select public.post_supplier_invoice('11111111-0000-0000-0000-0000000000aa', true, false)$q$,
  'P0001', 'link this supplier to a Xero contact%');
select pg_temp.check((select status = 'draft' from public.supplier_invoice where id = '11111111-0000-0000-0000-0000000000aa')
  and (select cost_per_unit = 2.00 from public.delivery_receipt_line where id = '11111111-0000-0000-0000-00000000d101')
  and not exists (select 1 from public.accounting_outbox),
  '1b: the refused post changed nothing');

-- 2. Posting with create_contact queues a contact job and a dependent bill job.
do $$ declare v text; v_contact public.accounting_outbox%rowtype; v_bill public.accounting_outbox%rowtype; begin
  v := public.post_supplier_invoice('11111111-0000-0000-0000-0000000000aa', true, true);
  if v is distinct from 'queued' then raise exception 'FAIL 2: expected queued, got %', v using errcode = 'XX000'; end if;
  select * into v_contact from public.accounting_outbox where operation = 'create_contact' and entity_id = '11111111-0000-0000-0000-000000000051';
  select * into v_bill from public.accounting_outbox where operation = 'create_bill' and entity_id = '11111111-0000-0000-0000-0000000000aa';
  if v_contact.id is null or v_bill.depends_on is distinct from v_contact.id then
    raise exception 'FAIL 2: bill does not depend on contact job' using errcode = 'XX000';
  end if;
  if v_contact.idempotency_key is distinct from 'sup-11111111-0000-0000-0000-000000000051-contact'
     or v_bill.idempotency_key is distinct from 'si-11111111-0000-0000-0000-0000000000aa-create' then
    raise exception 'FAIL 2: idempotency keys % / %', v_contact.idempotency_key, v_bill.idempotency_key using errcode = 'XX000';
  end if;
  if v_bill.status <> 'pending' or v_bill.connection_id <> '11111111-0000-0000-0000-0000000000e1' or v_bill.tenant_id <> '11111111-1111-1111-1111-111111111111' then
    raise exception 'FAIL 2: bill job %', v_bill using errcode = 'XX000';
  end if;
  raise notice 'PASS 2: contact + dependent bill queued, idempotency keys sup-{id}-contact / si-{id}-create';
end $$;

-- 3. Totals, variances and cost write-back.
do $$ declare inv record; l record; begin
  select subtotal, tax_total, total, status, sync_status, posted_by, posted_at into inv from public.supplier_invoice where id = '11111111-0000-0000-0000-0000000000aa';
  if inv.subtotal <> 32.50 or inv.tax_total <> 3.25 or inv.total <> 35.75 or inv.status <> 'posted' or inv.sync_status <> 'queued'
     or inv.posted_by is distinct from '00000000-0000-0000-0000-0000000000a1' or inv.posted_at is null then
    raise exception 'FAIL 3: header %', inv using errcode = 'XX000';
  end if;
  select qty_variance, price_variance into l from public.supplier_invoice_line where supplier_invoice_id = '11111111-0000-0000-0000-0000000000aa' and line_no = 1;
  if l.qty_variance is distinct from -1.0 or l.price_variance is distinct from 0.5 then raise exception 'FAIL 3: variance %', l using errcode = 'XX000'; end if;
  if (select cost_per_unit from public.delivery_receipt_line where id = '11111111-0000-0000-0000-00000000d101') is distinct from 2.5 then raise exception 'FAIL 3: receipt cost not written back' using errcode = 'XX000'; end if;
  if (select cost_per_unit from public.component where id = '11111111-0000-0000-0000-0000000000c1') is distinct from 2.5 then raise exception 'FAIL 3: component cost not written back' using errcode = 'XX000'; end if;
  raise notice 'PASS 3: totals, variances, cost write-back';
end $$;

-- 4. Second posting of the same receipt line is refused (Review Focus 4).
-- The contact link is inserted OUTSIDE the checked statement so it persists
-- (case 10 relies on it); the refused post itself is rolled back.
insert into public.accounting_contact_link (tenant_id, provider, supplier_id, external_contact_id, external_name)
values ('11111111-1111-1111-1111-111111111111', 'xero', '11111111-0000-0000-0000-000000000051', 'contact-1', 'Acme') on conflict do nothing;
select pg_temp.expect_error('4: second posting of the same receipt line is refused',
  $q$select public.post_supplier_invoice('11111111-0000-0000-0000-0000000000ab', true, false)$q$,
  '23505', 'a receipt line on this invoice is already on another posted invoice');
select pg_temp.check((select status = 'draft' from public.supplier_invoice where id = '11111111-0000-0000-0000-0000000000ab'),
  '4b: the refused invoice is still a draft');

-- 5. A sample receipt cannot be invoiced.
select pg_temp.expect_error('5: only supplier deliveries are invoiceable',
  $q$select public.post_supplier_invoice('11111111-0000-0000-0000-0000000000ac', true, false)$q$,
  'P0001', 'every stock line must come from a supplier delivery from this supplier');

-- 6. Invoice numbers are unique per supplier among live invoices.
select pg_temp.expect_error('6: duplicate invoice number refused (case-insensitive)',
  $q$insert into public.supplier_invoice (tenant_id, supplier_id, invoice_number, invoice_date, due_date, amounts_mode, currency)
     values ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', 'inv-a', '2026-10-01', '2026-10-31', 'exclusive', 'AUD')$q$,
  '23505', '%supplier_invoice_live_number_uq%');

-- 7. Claiming respects depends_on: only the contact job is claimable.
do $$ declare n int; op text; begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
  select count(*), min(operation) into n, op from public.claim_accounting_jobs('11111111-0000-0000-0000-0000000000e1', 10, 'verify');
  if n <> 1 or op <> 'create_contact' then raise exception 'FAIL 7: claimed % jobs (%)', n, op using errcode = 'XX000'; end if;
  if (select status <> 'working' or locked_by <> 'verify' or locked_at is null or first_attempt_at is null
        from public.accounting_outbox where operation = 'create_contact') then
    raise exception 'FAIL 7: claimed job not marked working' using errcode = 'XX000';
  end if;
  -- While it is working, nothing else is claimable for this connection.
  select count(*) into n from public.claim_accounting_jobs('11111111-0000-0000-0000-0000000000e1', 10, 'verify-2');
  if n <> 0 then raise exception 'FAIL 7: second worker claimed % jobs', n using errcode = 'XX000'; end if;
  update public.accounting_outbox set status = 'sent', locked_at = null where operation = 'create_contact';
  select count(*), min(operation) into n, op from public.claim_accounting_jobs('11111111-0000-0000-0000-0000000000e1', 10, 'verify');
  if n <> 1 or op <> 'create_bill' then raise exception 'FAIL 7: bill not claimable after contact sent (% %)', n, op using errcode = 'XX000'; end if;
  update public.accounting_outbox set status = 'pending', locked_at = null, locked_by = null where operation = 'create_bill';
  perform set_config('request.jwt.claims', '', false);
  raise notice 'PASS 7: dependency and single-worker claiming';
end $$;

-- 7b. Which failed jobs are claimable: transient and daily_limit once due;
-- fixable never; nothing before next_attempt_at; a stale 'working' lock is
-- reclaimed. Jobs J1-J4 are scratch rows, deleted afterwards.
do $$ declare v_ids uuid[]; begin
  insert into public.accounting_outbox (id, tenant_id, connection_id, provider, operation, entity_type, entity_id, status, error_class, next_attempt_at, idempotency_key) values
    ('11111111-0000-0000-0000-00000000f001', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000e1', 'xero', 'create_bill', 'supplier_invoice', gen_random_uuid(), 'failed', 'daily_limit', now() - interval '1 minute', 'j1'),
    ('11111111-0000-0000-0000-00000000f002', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000e1', 'xero', 'create_bill', 'supplier_invoice', gen_random_uuid(), 'failed', 'fixable',     now() - interval '1 minute', 'j2'),
    ('11111111-0000-0000-0000-00000000f003', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000e1', 'xero', 'create_bill', 'supplier_invoice', gen_random_uuid(), 'failed', 'daily_limit', now() + interval '1 hour',   'j3'),
    ('11111111-0000-0000-0000-00000000f004', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000e1', 'xero', 'create_bill', 'supplier_invoice', gen_random_uuid(), 'failed', 'transient',   now() - interval '1 minute', 'j4');
  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
  select array_agg(id order by id) into v_ids from public.claim_accounting_jobs('11111111-0000-0000-0000-0000000000e1', 10, 'verify');
  if v_ids is distinct from array(select id from public.accounting_outbox
                                   where id in ('11111111-0000-0000-0000-00000000f001', '11111111-0000-0000-0000-00000000f004')
                                      or (operation = 'create_bill' and entity_id = '11111111-0000-0000-0000-0000000000aa')
                                   order by id) then
    raise exception 'FAIL 7b: claimed %', v_ids using errcode = 'XX000';
  end if;
  delete from public.accounting_outbox where id in ('11111111-0000-0000-0000-00000000f001', '11111111-0000-0000-0000-00000000f002',
                                                    '11111111-0000-0000-0000-00000000f003', '11111111-0000-0000-0000-00000000f004');
  -- A's bill is now 'working'; age its lock past 5 minutes and it is reclaimable.
  update public.accounting_outbox set locked_at = now() - interval '6 minutes', locked_by = 'dead-worker'
   where operation = 'create_bill' and entity_id = '11111111-0000-0000-0000-0000000000aa';
  select array_agg(id) into v_ids from public.claim_accounting_jobs('11111111-0000-0000-0000-0000000000e1', 10, 'verify-3');
  if cardinality(v_ids) is distinct from 1
     or (select locked_by from public.accounting_outbox where id = v_ids[1]) is distinct from 'verify-3' then
    raise exception 'FAIL 7b: stale lock not reclaimed (%)', v_ids using errcode = 'XX000';
  end if;
  update public.accounting_outbox set status = 'pending', locked_at = null, locked_by = null where id = v_ids[1];
  perform set_config('request.jwt.claims', '', false);
  raise notice 'PASS 7b: transient/daily_limit claimable when due, fixable and not-yet-due skipped, stale lock reclaimed';
end $$;

-- 8. Claim functions refuse non-service callers.
select pg_temp.expect_error('8: claim_accounting_jobs is service-role only',
  $q$select public.claim_accounting_jobs('11111111-0000-0000-0000-0000000000e1', 1, 'x')$q$, '42501', 'forbidden');
select pg_temp.expect_error('8b: claim_accounting_refresh_lease is service-role only',
  $q$select public.claim_accounting_refresh_lease('11111111-0000-0000-0000-0000000000e1', 30)$q$, '42501', 'forbidden');

-- 8c. Refresh lease: one winner until it expires.
do $$ declare n int; begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
  select count(*) into n from public.claim_accounting_refresh_lease('11111111-0000-0000-0000-0000000000e1', 30);
  if n <> 1 then raise exception 'FAIL 8c: first lease claim returned % rows', n using errcode = 'XX000'; end if;
  select count(*) into n from public.claim_accounting_refresh_lease('11111111-0000-0000-0000-0000000000e1', 30);
  if n <> 0 then raise exception 'FAIL 8c: second lease claim returned % rows', n using errcode = 'XX000'; end if;
  update public.accounting_credential set refresh_lease_until = now() - interval '1 second';
  select count(*) into n from public.claim_accounting_refresh_lease('11111111-0000-0000-0000-0000000000e1', 30);
  if n <> 1 then raise exception 'FAIL 8c: expired lease not reclaimable (% rows)', n using errcode = 'XX000'; end if;
  perform set_config('request.jwt.claims', '', false);
  raise notice 'PASS 8c: refresh lease has one holder until it expires';
end $$;

-- 9. Void: members refused; admin cancels the pending bill job.
select set_config('test.role', 'member', false);
select pg_temp.expect_error('9a: members cannot void',
  $q$select public.void_supplier_invoice('11111111-0000-0000-0000-0000000000aa', 'wrong price')$q$, '42501', 'only admins can void supplier invoices');
select set_config('test.role', 'admin', false);
select pg_temp.expect_error('9b: a void needs a reason',
  $q$select public.void_supplier_invoice('11111111-0000-0000-0000-0000000000aa', '   ')$q$, 'P0001', 'enter a reason for voiding');
select pg_temp.expect_error('9c: drafts cannot be voided',
  $q$select public.void_supplier_invoice('11111111-0000-0000-0000-0000000000ab', 'x')$q$, 'P0001', 'only posted invoices can be voided');
do $$ declare v text; inv record; begin
  v := public.void_supplier_invoice('11111111-0000-0000-0000-0000000000aa', 'wrong price');
  if v is distinct from 'not_synced' then raise exception 'FAIL 9: expected not_synced, got %', v using errcode = 'XX000'; end if;
  if (select status from public.accounting_outbox where operation = 'create_bill' and entity_id = '11111111-0000-0000-0000-0000000000aa') is distinct from 'cancelled' then
    raise exception 'FAIL 9: bill job not cancelled' using errcode = 'XX000';
  end if;
  select status, sync_status, void_reason, voided_by into inv from public.supplier_invoice where id = '11111111-0000-0000-0000-0000000000aa';
  if inv.status <> 'voided' or inv.sync_status <> 'not_synced' or inv.void_reason <> 'wrong price'
     or inv.voided_by is distinct from '00000000-0000-0000-0000-0000000000a1' then
    raise exception 'FAIL 9: invoice %', inv using errcode = 'XX000';
  end if;
  raise notice 'PASS 9: void permissions and pending-job cancel';
end $$;

-- 10. After voiding A, B may now post the freed receipt line.
do $$ declare v text; begin
  v := public.post_supplier_invoice('11111111-0000-0000-0000-0000000000ab', true, false);
  if v is distinct from 'queued' then raise exception 'FAIL 10: expected queued, got %', v using errcode = 'XX000'; end if;
  if (select depends_on from public.accounting_outbox where operation = 'create_bill' and entity_id = '11111111-0000-0000-0000-0000000000ab' and status = 'pending') is not null then
    raise exception 'FAIL 10: linked supplier should not wait on a contact job' using errcode = 'XX000';
  end if;
  raise notice 'PASS 10: voiding frees receipt lines';
end $$;

-- 11. anon/authenticated have no access to credentials at all.
select pg_temp.expect_error('11: authenticated cannot read credentials',
  $q$select count(*) from public.accounting_credential$q$, '42501', 'permission denied%', 'authenticated');
select pg_temp.expect_error('11b: anon cannot read credentials',
  $q$select count(*) from public.accounting_credential$q$, '42501', 'permission denied%', 'anon');
select pg_temp.check(
  (select relrowsecurity from pg_class where oid = 'public.accounting_credential'::regclass)
  and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'accounting_credential')
  and not exists (select 1 from unnest(array['anon', 'authenticated']) r(role),
                                unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
                   where has_table_privilege(r.role, 'public.accounting_credential', p.priv)),
  '11c: accounting_credential has RLS on, no policies, no anon/authenticated privilege');

-- 12. Grants: the migration undoes Supabase's default anon/authenticated grants.
select pg_temp.check(
  not exists (select 1
                from unnest(array['accounting_connection', 'accounting_credential', 'accounting_contact_link',
                                  'supplier_invoice', 'supplier_invoice_line', 'accounting_outbox']) t(name),
                     unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
               where has_table_privilege('anon', 'public.' || t.name, p.priv))
  and (select bool_and(c.relrowsecurity) from pg_class c
        where c.oid in ('public.accounting_connection'::regclass, 'public.accounting_credential'::regclass,
                        'public.accounting_contact_link'::regclass, 'public.supplier_invoice'::regclass,
                        'public.supplier_invoice_line'::regclass, 'public.accounting_outbox'::regclass)),
  '12a: anon has no privilege on any new table; RLS is on for all six');
select pg_temp.check(
  not exists (select 1
                from unnest(array['accounting_connection', 'accounting_contact_link', 'accounting_outbox']) t(name),
                     unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
               where has_table_privilege('authenticated', 'public.' || t.name, p.priv))
  and has_table_privilege('authenticated', 'public.accounting_connection', 'SELECT')
  and has_table_privilege('authenticated', 'public.supplier_invoice', 'INSERT')
  and not has_table_privilege('authenticated', 'public.supplier_invoice', 'TRUNCATE'),
  '12b: authenticated reads connection/links/outbox but cannot write them');
select pg_temp.check(
  not has_function_privilege('anon', 'public.post_supplier_invoice(uuid,boolean,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.void_supplier_invoice(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.claim_accounting_jobs(uuid,int,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.claim_accounting_refresh_lease(uuid,int)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.supplier_invoice_line_draft_guard()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.post_supplier_invoice(uuid,boolean,boolean)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.void_supplier_invoice(uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.claim_accounting_jobs(uuid,int,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.claim_accounting_refresh_lease(uuid,int)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.supplier_invoice_line_draft_guard()', 'EXECUTE')
  and has_function_privilege('service_role', 'public.claim_accounting_jobs(uuid,int,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.claim_accounting_refresh_lease(uuid,int)', 'EXECUTE')
  -- The RLS helpers must stay callable by anon (2026-09-25 handoff, gotcha 5).
  and has_function_privilege('anon', 'public.current_tenant_id()', 'EXECUTE')
  and has_function_privilege('anon', 'public.current_profile_role()', 'EXECUTE')
  and has_function_privilege('anon', 'public.is_super_admin()', 'EXECUTE'),
  '12c: function EXECUTE matrix (anon none; authenticated post/void only; service_role claims)');
select pg_temp.check(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=public'])
     from pg_proc p
    where p.oid in ('public.post_supplier_invoice(uuid,boolean,boolean)'::regprocedure,
                    'public.void_supplier_invoice(uuid,text)'::regprocedure,
                    'public.claim_accounting_jobs(uuid,int,text)'::regprocedure,
                    'public.claim_accounting_refresh_lease(uuid,int)'::regprocedure,
                    'public.supplier_invoice_line_draft_guard()'::regprocedure)),
  '12d: every SECURITY DEFINER function pins search_path');

-- 13. Tenant isolation for authenticated reads.
select set_config('test.tenant', '22222222-2222-2222-2222-222222222222', false);
select pg_temp.check(pg_temp.as_role('authenticated', $q$
  select (select count(*) from public.supplier_invoice) = 0
     and (select count(*) from public.supplier_invoice_line) = 0
     and (select count(*) from public.accounting_connection) = 0
     and (select count(*) from public.accounting_contact_link) = 0
     and (select count(*) from public.accounting_outbox) = 0 $q$),
  '13a: another tenant sees none of T1''s invoices, lines, connection, links or jobs');
select set_config('test.tenant', '11111111-1111-1111-1111-111111111111', false);
select pg_temp.check(pg_temp.as_role('authenticated', $q$
  select (select count(*) from public.supplier_invoice) = 3
     and (select count(*) from public.supplier_invoice_line) = 4
     and (select count(*) from public.accounting_connection) = 1
     and (select count(*) from public.accounting_contact_link) = 1
     and (select count(*) from public.accounting_outbox) > 0 $q$),
  '13b: a member reads their own tenant''s rows');

-- 14. authenticated cannot write server-owned tables or forge posted state.
select pg_temp.expect_error('14a: authenticated cannot insert outbox jobs',
  $q$insert into public.accounting_outbox (tenant_id, connection_id, provider, operation, entity_type, entity_id, idempotency_key)
     values ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000e1', 'xero', 'create_bill', 'supplier_invoice', gen_random_uuid(), 'x')$q$,
  '42501', 'permission denied%', 'authenticated');
select pg_temp.expect_error('14b: authenticated cannot update the connection',
  $q$update public.accounting_connection set setup_completed_at = null$q$, '42501', 'permission denied%', 'authenticated');
select pg_temp.expect_error('14c: authenticated cannot write contact links',
  $q$delete from public.accounting_contact_link$q$, '42501', 'permission denied%', 'authenticated');
select pg_temp.expect_error('14d: authenticated cannot insert an already-posted invoice',
  $q$insert into public.supplier_invoice (tenant_id, supplier_id, invoice_number, invoice_date, due_date, amounts_mode, currency, status)
     values ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', 'FORGED', '2026-10-01', '2026-10-31', 'exclusive', 'AUD', 'posted')$q$,
  '42501', 'new row violates row-level security policy%', 'authenticated');
select pg_temp.check(pg_temp.as_role('authenticated', $q$
  with u as (update public.supplier_invoice set total = 0, status = 'draft' where id = '11111111-0000-0000-0000-0000000000ab' returning 1)
  select count(*) = 0 from u $q$)
  and pg_temp.as_role('authenticated', $q$
  with d as (delete from public.supplier_invoice where id = '11111111-0000-0000-0000-0000000000ab' returning 1)
  select count(*) = 0 from d $q$),
  '14e: a posted invoice cannot be updated or deleted by a member');
-- Read back in its own statement: a statement's snapshot predates the
-- writes made by functions it calls.
select pg_temp.check((select status = 'posted' and total = 22.00 from public.supplier_invoice where id = '11111111-0000-0000-0000-0000000000ab'),
  '14e2: the posted invoice is unchanged');
-- The draft guard (a BEFORE trigger) fires before the RLS WITH CHECK does.
select pg_temp.expect_error('14f: authenticated cannot add a line to a posted invoice',
  $q$insert into public.supplier_invoice_line (tenant_id, supplier_invoice_id, line_no, kind, description, quantity, unit_amount)
     values ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000ab', 9, 'other', 'Sneaky', 1, 1)$q$,
  'P0001', 'only draft invoices can have their lines changed', 'authenticated');
-- A T2 member pointing a line at T1's draft C.
select set_config('test.tenant', '22222222-2222-2222-2222-222222222222', false);
select pg_temp.expect_error('14g: a member cannot attach a line to another tenant''s invoice',
  $q$insert into public.supplier_invoice_line (tenant_id, supplier_invoice_id, line_no, kind, description, quantity, unit_amount)
     values ('22222222-2222-2222-2222-222222222222', '11111111-0000-0000-0000-0000000000ac', 9, 'other', 'Sneaky', 1, 1)$q$,
  '42501', 'new row violates row-level security policy%', 'authenticated');
select set_config('test.tenant', '11111111-1111-1111-1111-111111111111', false);

-- 15. The draft-only line guard fires even where RLS does not (superuser here).
select pg_temp.expect_error('15a: no line can be added to a posted invoice, RLS or not',
  $q$insert into public.supplier_invoice_line (tenant_id, supplier_invoice_id, line_no, kind, description, quantity, unit_amount)
     values ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000ab', 9, 'other', 'Sneaky', 1, 1)$q$,
  'P0001', 'only draft invoices can have their lines changed');
select pg_temp.expect_error('15b: no line of a posted invoice can be changed, RLS or not',
  $q$update public.supplier_invoice_line set quantity = 1 where supplier_invoice_id = '11111111-0000-0000-0000-0000000000ab'$q$,
  'P0001', 'only draft invoices can have their lines changed');
select pg_temp.expect_error('15c: no line of a posted invoice can be deleted, RLS or not',
  $q$delete from public.supplier_invoice_line where supplier_invoice_id = '11111111-0000-0000-0000-0000000000ab'$q$,
  'P0001', 'only draft invoices can have their lines changed');
select pg_temp.expect_error('15d: a receipt line appears at most once per invoice',
  $q$insert into public.supplier_invoice_line (tenant_id, supplier_invoice_id, line_no, kind, delivery_receipt_line_id, component_id, description, quantity, unit_amount)
     values ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000ac', 2, 'stock', '11111111-0000-0000-0000-00000000d102', '11111111-0000-0000-0000-0000000000c1', 'Sample again', 1, 0)$q$,
  '23505', '%supplier_invoice_line_receipt_line_uq%');
select pg_temp.check(pg_temp.as_role('authenticated', $q$
  with d as (delete from public.supplier_invoice where id = '11111111-0000-0000-0000-0000000000ac' returning 1)
  select count(*) = 1 from d $q$),
  '15e: a member can still delete a draft (its lines cascade past the guard)');
select pg_temp.check(not exists (select 1 from public.supplier_invoice_line where supplier_invoice_id = '11111111-0000-0000-0000-0000000000ac'),
  '15f: the deleted draft''s lines are gone');

-- 16. Drafts can reference another tenant's rows (FKs check existence only,
-- RLS checks tenant_id only); posting refuses them, because the sync worker
-- reads the PO number and component names through these references.
select pg_temp.check(pg_temp.as_role('authenticated', $q$
  with i as (
    insert into public.supplier_invoice (id, tenant_id, supplier_id, purchase_order_id, invoice_number, invoice_date, due_date, amounts_mode, currency) values
      ('11111111-0000-0000-0000-0000000000ad', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', '22222222-0000-0000-0000-0000000000b1', 'INV-D', '2026-10-01', '2026-10-31', 'exclusive', 'AUD'),
      ('11111111-0000-0000-0000-0000000000ae', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', null, 'INV-E', '2026-10-01', '2026-10-31', 'exclusive', 'AUD'),
      ('11111111-0000-0000-0000-0000000000af', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', null, 'INV-F', '2026-10-01', '2026-10-31', 'exclusive', 'AUD')
    returning 1)
  select count(*) = 3 from i $q$),
  '16a: a member can create drafts (insert policy)');
insert into public.supplier_invoice_line (tenant_id, supplier_invoice_id, line_no, kind, delivery_receipt_line_id, component_id, description, quantity, unit_amount, tax_type, tax_rate, account_code, line_amount, tax_amount) values
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000ad', 1, 'other', null, null, 'Freight', 1, 10, 'INPUT', 10, '425', 10.00, 1.00),
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000ae', 1, 'other', null, '22222222-0000-0000-0000-0000000000c1', 'Freight', 1, 10, 'INPUT', 10, '425', 10.00, 1.00),
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000af', 1, 'stock', '11111111-0000-0000-0000-00000000d101', '11111111-0000-0000-0000-0000000000c2', 'Nut?', 1, 1, 'INPUT', 10, '630', 1.00, 0.10);
select pg_temp.expect_error('16b: another tenant''s purchase order is refused',
  $q$select public.post_supplier_invoice('11111111-0000-0000-0000-0000000000ad', true, false)$q$, 'P0002', 'purchase order not found');
select pg_temp.expect_error('16c: another tenant''s component is refused',
  $q$select public.post_supplier_invoice('11111111-0000-0000-0000-0000000000ae', true, false)$q$, 'P0001', 'a line refers to a component that is not in this workspace');
select pg_temp.expect_error('16d: a stock line''s component must be its receipt line''s component',
  $q$select public.post_supplier_invoice('11111111-0000-0000-0000-0000000000af', true, false)$q$, 'P0001', 'every stock line must come from a supplier delivery from this supplier');
select set_config('test.tenant', '22222222-2222-2222-2222-222222222222', false);
select pg_temp.expect_error('16e: another tenant cannot post T1''s invoice',
  $q$select public.post_supplier_invoice('11111111-0000-0000-0000-0000000000ae', true, false)$q$, 'P0002', 'invoice not found');
select pg_temp.expect_error('16f: another tenant cannot void T1''s invoice',
  $q$select public.void_supplier_invoice('11111111-0000-0000-0000-0000000000ab', 'x')$q$, 'P0002', 'invoice not found');
select set_config('test.tenant', '', false);
select pg_temp.expect_error('16g: no workspace, no posting',
  $q$select public.post_supplier_invoice('11111111-0000-0000-0000-0000000000ae', true, false)$q$, '42501', 'not signed in to a workspace');
select set_config('test.tenant', '11111111-1111-1111-1111-111111111111', false);

-- 17. Voiding a bill that reached Xero queues void_bill; voiding while the
-- bill is being sent is refused.
do $$ declare v text; v_job public.accounting_outbox%rowtype; begin
  -- Simulate the worker: B's bill was sent.
  update public.accounting_outbox set status = 'sent', completed_at = now(), external_id = 'xero-bill-1'
   where operation = 'create_bill' and entity_id = '11111111-0000-0000-0000-0000000000ab' and status = 'pending';
  update public.supplier_invoice set sync_status = 'sent', external_id = 'xero-bill-1' where id = '11111111-0000-0000-0000-0000000000ab';
  v := public.void_supplier_invoice('11111111-0000-0000-0000-0000000000ab', 'duplicate');
  if v is distinct from 'queued' then raise exception 'FAIL 17: expected queued, got %', v using errcode = 'XX000'; end if;
  select * into v_job from public.accounting_outbox where operation = 'void_bill' and entity_id = '11111111-0000-0000-0000-0000000000ab';
  if v_job.status is distinct from 'pending' or v_job.idempotency_key is distinct from 'si-11111111-0000-0000-0000-0000000000ab-void'
     or v_job.connection_id is distinct from '11111111-0000-0000-0000-0000000000e1' then
    raise exception 'FAIL 17: void job %', v_job using errcode = 'XX000';
  end if;
  if (select status <> 'voided' or sync_status <> 'queued' from public.supplier_invoice where id = '11111111-0000-0000-0000-0000000000ab') then
    raise exception 'FAIL 17: invoice not voided/queued' using errcode = 'XX000';
  end if;
  raise notice 'PASS 17: voiding a sent bill queues void_bill with si-{id}-void';
end $$;
-- D: give it a T1 PO so it posts; then its bill job is "being sent".
update public.supplier_invoice set purchase_order_id = '11111111-0000-0000-0000-0000000000b1' where id = '11111111-0000-0000-0000-0000000000ad';
select pg_temp.check(public.post_supplier_invoice('11111111-0000-0000-0000-0000000000ad', false, false) = 'queued', '17b: D posts once its PO is in-tenant');
update public.accounting_outbox set status = 'working', locked_at = now(), locked_by = 'w'
 where operation = 'create_bill' and entity_id = '11111111-0000-0000-0000-0000000000ad';
select pg_temp.expect_error('17c: void refused while the bill is being sent',
  $q$select public.void_supplier_invoice('11111111-0000-0000-0000-0000000000ad', 'oops')$q$, '55P03', 'this invoice is being sent to Xero right now%');
select pg_temp.check((select status = 'posted' from public.supplier_invoice where id = '11111111-0000-0000-0000-0000000000ad'),
  '17d: the refused void left the invoice posted');

-- 18. Before the bills start date (or without a set-up connection) an invoice
-- posts as not_synced and queues nothing.
insert into public.supplier_invoice (id, tenant_id, supplier_id, invoice_number, invoice_date, due_date, amounts_mode, currency) values
  ('11111111-0000-0000-0000-0000000000b0', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', 'INV-OLD', '2025-12-31', '2026-01-30', 'inclusive', 'AUD');
insert into public.supplier_invoice_line (tenant_id, supplier_invoice_id, line_no, kind, description, quantity, unit_amount, tax_rate, line_amount, tax_amount) values
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000b0', 1, 'other', 'Freight', 1, 11, 10, 11.00, 1.00);
select pg_temp.check(public.post_supplier_invoice('11111111-0000-0000-0000-0000000000b0', true, false) = 'not_synced',
  '18: pre-start-date invoice posts not_synced without Xero tax/account fields');
select pg_temp.check(not exists (select 1 from public.accounting_outbox where entity_id = '11111111-0000-0000-0000-0000000000b0')
  and (select subtotal = 10.00 and tax_total = 1.00 and total = 11.00 and status = 'posted' and sync_status = 'not_synced'
         from public.supplier_invoice where id = '11111111-0000-0000-0000-0000000000b0'),
  '18b: no job queued; inclusive totals 10.00 + 1.00 = 11.00');

-- 19. Cascades and service-role purges are not edits; the line guard lets them through.
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
  delete from public.supplier_invoice_line where supplier_invoice_id = '11111111-0000-0000-0000-0000000000ad';
  perform set_config('request.jwt.claims', '', false);
end $$;
select pg_temp.check(not exists (select 1 from public.supplier_invoice_line where supplier_invoice_id = '11111111-0000-0000-0000-0000000000ad'),
  '19: the service role can purge a posted invoice''s lines');
delete from public.supplier_invoice where id = '11111111-0000-0000-0000-0000000000b0';
select pg_temp.check(not exists (select 1 from public.supplier_invoice where id = '11111111-0000-0000-0000-0000000000b0')
  and not exists (select 1 from public.supplier_invoice_line where supplier_invoice_id = '11111111-0000-0000-0000-0000000000b0'),
  '19b: deleting a posted invoice cascades its lines past the guard');
