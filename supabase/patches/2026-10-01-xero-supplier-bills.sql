-- supabase/patches/2026-10-01-xero-supplier-bills.sql
-- ---------------------------------------------------------------------
-- MANUVA-34 — Xero supplier bills: tables, RLS, posting/void/claim functions.
-- Spec: docs/superpowers/specs/2026-10-01-xero-supplier-bills-design.md §4, §6.
-- Replaces the never-applied accounting_integration.sql (deleted, MANUVA-45):
-- tokens now live in accounting_credential, which anon/authenticated cannot
-- touch at all.
-- Verified on scratch Postgres 17 by
-- supabase/__tests__/2026-10-01-xero-supplier-bills.verify.sql.
-- Idempotent. After applying run scripts/probe_anon_rpc_surface.sh.
-- ---------------------------------------------------------------------
begin;

-- 1. Connection (one per tenant per provider) -------------------------
create table if not exists public.accounting_connection (
  id                         uuid primary key default gen_random_uuid(),
  tenant_id                  uuid not null references public.tenant(id) on delete cascade,
  provider                   text not null check (provider in ('xero')),
  status                     text not null default 'connected' check (status in ('connected', 'needs_reconnect', 'disconnected')),
  external_org_id            text not null,
  external_connection_id     text not null,
  org_name                   text not null,
  base_currency              text not null,
  connected_by               uuid references auth.users(id) on delete set null,
  connected_at               timestamptz not null default now(),
  disconnected_at            timestamptz,
  last_refreshed_at          timestamptz,
  last_error                 text,
  last_alert_at              timestamptz,
  inventory_account_code     text,
  other_charges_account_code text,
  purchase_tax_type          text,
  gst_free_tax_type          text,
  default_amounts_mode       text not null default 'exclusive' check (default_amounts_mode in ('inclusive', 'exclusive')),
  bills_start_date           date,
  sales_source               text check (sales_source in ('a2x', 'link_my_books', 'xero_shopify', 'square', 'amaka', 'none', 'other')),
  setup_completed_at         timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (tenant_id, provider)
);

-- 2. Credentials (server only) -----------------------------------------
create table if not exists public.accounting_credential (
  connection_id       uuid primary key references public.accounting_connection(id) on delete cascade,
  access_token_enc    text not null,
  refresh_token_enc   text not null,
  key_version         int  not null,
  access_expires_at   timestamptz not null,
  refresh_expires_at  timestamptz not null,
  refresh_lease_until timestamptz,
  version             int  not null default 1,
  updated_at          timestamptz not null default now()
);

-- 3. Supplier ↔ Xero contact -----------------------------------------
-- FKs point at the suppliers TABLE: public.supplier is an active-only view,
-- and a foreign key cannot reference a view.
create table if not exists public.accounting_contact_link (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenant(id) on delete cascade,
  provider            text not null check (provider in ('xero')),
  supplier_id         uuid not null references public.suppliers(id) on delete cascade,
  external_contact_id text not null,
  external_name       text not null,
  linked_by           uuid references auth.users(id) on delete set null,
  linked_at           timestamptz not null default now(),
  unique (tenant_id, provider, supplier_id)
);

-- 4. Supplier invoices ---------------------------------------------------
create table if not exists public.supplier_invoice (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenant(id) on delete cascade,
  supplier_id       uuid not null references public.suppliers(id),
  purchase_order_id uuid references public.purchase_order(id) on delete set null,
  invoice_number    text not null check (length(btrim(invoice_number)) > 0),
  invoice_date      date not null,
  due_date          date not null,
  amounts_mode      text not null check (amounts_mode in ('inclusive', 'exclusive')),
  currency          text not null,
  subtotal          numeric(14,2) not null default 0,
  tax_total         numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  entered_total     numeric(14,2),
  status            text not null default 'draft' check (status in ('draft', 'posted', 'voided')),
  sync_status       text not null default 'not_synced' check (sync_status in ('not_synced', 'queued', 'sent', 'failed', 'voided_in_xero')),
  external_id       text,
  external_url      text,
  posted_by         uuid references auth.users(id) on delete set null,
  posted_at         timestamptz,
  voided_by         uuid references auth.users(id) on delete set null,
  voided_at         timestamptz,
  void_reason       text,
  created_by        uuid references auth.users(id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists supplier_invoice_live_number_uq
  on public.supplier_invoice (tenant_id, supplier_id, lower(invoice_number)) where status <> 'voided';
create index if not exists supplier_invoice_tenant_created_idx on public.supplier_invoice (tenant_id, created_at desc);
create index if not exists supplier_invoice_purchase_order_idx on public.supplier_invoice (purchase_order_id);

create table if not exists public.supplier_invoice_line (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenant(id) on delete cascade,
  supplier_invoice_id      uuid not null references public.supplier_invoice(id) on delete cascade,
  line_no                  int  not null,
  kind                     text not null check (kind in ('stock', 'other')),
  delivery_receipt_line_id uuid references public.delivery_receipt_line(id),
  component_id             uuid references public.component(id),
  description              text not null,
  quantity                 numeric(14,4) not null check (quantity > 0),
  unit_amount              numeric(18,4) not null check (unit_amount >= 0),
  tax_type                 text,
  tax_rate                 numeric(7,4) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  account_code             text,
  line_amount              numeric(14,2) not null default 0,
  tax_amount               numeric(14,2) not null default 0,
  qty_variance             numeric(14,4),
  price_variance           numeric(18,4),
  check ((kind = 'stock') = (delivery_receipt_line_id is not null)),
  unique (supplier_invoice_id, line_no)
);
create index if not exists supplier_invoice_line_receipt_line_idx on public.supplier_invoice_line (delivery_receipt_line_id);
create index if not exists supplier_invoice_line_component_idx on public.supplier_invoice_line (component_id);
-- A receipt line appears at most once per invoice (the draft parser refuses
-- it too); this also keeps the cost write-back in post_supplier_invoice
-- deterministic. Across invoices the rule depends on the parent's status, so
-- post_supplier_invoice enforces that one under row locks (spec §4.1).
create unique index if not exists supplier_invoice_line_receipt_line_uq
  on public.supplier_invoice_line (supplier_invoice_id, delivery_receipt_line_id)
  where delivery_receipt_line_id is not null;

-- 5. Outbox ----------------------------------------------------------------
create table if not exists public.accounting_outbox (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenant(id) on delete cascade,
  connection_id    uuid not null references public.accounting_connection(id) on delete cascade,
  provider         text not null check (provider in ('xero')),
  operation        text not null check (operation in ('create_contact', 'create_bill', 'void_bill')),
  entity_type      text not null check (entity_type in ('supplier', 'supplier_invoice')),
  entity_id        uuid not null,
  status           text not null default 'pending' check (status in ('pending', 'working', 'sent', 'failed', 'gave_up', 'cancelled')),
  attempts         int  not null default 0,
  next_attempt_at  timestamptz not null default now(),
  first_attempt_at timestamptz,
  locked_at        timestamptz,
  locked_by        text,
  depends_on       uuid references public.accounting_outbox(id) on delete set null,
  idempotency_key  text not null,
  external_id      text,
  error_class      text check (error_class in ('transient', 'fixable', 'auth', 'daily_limit')),
  error_message    text,
  error_detail     jsonb,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz
);
create unique index if not exists accounting_outbox_live_uq
  on public.accounting_outbox (entity_type, entity_id, operation) where status in ('pending', 'working', 'failed');
create index if not exists accounting_outbox_due_idx on public.accounting_outbox (connection_id, status, next_attempt_at);
create index if not exists accounting_outbox_tenant_created_idx on public.accounting_outbox (tenant_id, created_at desc);
create index if not exists accounting_outbox_depends_on_idx on public.accounting_outbox (depends_on);

-- 6. RLS and grants ------------------------------------------------------
alter table public.accounting_connection   enable row level security;
alter table public.accounting_credential   enable row level security;
alter table public.accounting_contact_link enable row level security;
alter table public.supplier_invoice        enable row level security;
alter table public.supplier_invoice_line   enable row level security;
alter table public.accounting_outbox       enable row level security;

-- Supabase's default privileges grant ALL on new public tables to anon and
-- authenticated; take that back first, then grant only what each role needs.
revoke all on public.accounting_connection, public.accounting_credential, public.accounting_contact_link,
              public.supplier_invoice, public.supplier_invoice_line, public.accounting_outbox
  from public, anon, authenticated;
grant all on public.accounting_connection, public.accounting_credential, public.accounting_contact_link,
             public.supplier_invoice, public.supplier_invoice_line, public.accounting_outbox
  to service_role;

-- Read-only for tenant members (writes go through server code with the service role).
grant select on public.accounting_connection, public.accounting_contact_link, public.accounting_outbox to authenticated;
drop policy if exists accounting_connection_select on public.accounting_connection;
create policy accounting_connection_select on public.accounting_connection for select to authenticated
  using (tenant_id = public.current_tenant_id());
drop policy if exists accounting_contact_link_select on public.accounting_contact_link;
create policy accounting_contact_link_select on public.accounting_contact_link for select to authenticated
  using (tenant_id = public.current_tenant_id());
drop policy if exists accounting_outbox_select on public.accounting_outbox;
create policy accounting_outbox_select on public.accounting_outbox for select to authenticated
  using (tenant_id = public.current_tenant_id());
-- accounting_credential: RLS on, no policies and no grants for anon/authenticated, by design.

-- Supplier invoices: members manage drafts; posting/voiding only via functions.
grant select, insert, update, delete on public.supplier_invoice, public.supplier_invoice_line to authenticated;
drop policy if exists supplier_invoice_select on public.supplier_invoice;
create policy supplier_invoice_select on public.supplier_invoice for select to authenticated
  using (tenant_id = public.current_tenant_id());
-- A draft carries none of the server-owned values: sync state, the Xero link
-- (external_url is the admin's "View in Xero" link) and the posted/voided
-- audit columns are written only by the functions below (definer, so RLS
-- does not apply to them) and by the service-role sync worker. A member
-- could otherwise forge them on a draft and have them survive posting.
drop policy if exists supplier_invoice_insert on public.supplier_invoice;
create policy supplier_invoice_insert on public.supplier_invoice for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and status = 'draft' and sync_status = 'not_synced'
              and external_id is null and external_url is null
              and posted_by is null and posted_at is null
              and voided_by is null and voided_at is null and void_reason is null
              and created_by is not distinct from auth.uid());
drop policy if exists supplier_invoice_update on public.supplier_invoice;
create policy supplier_invoice_update on public.supplier_invoice for update to authenticated
  using (tenant_id = public.current_tenant_id() and status = 'draft')
  with check (tenant_id = public.current_tenant_id() and status = 'draft' and sync_status = 'not_synced'
              and external_id is null and external_url is null
              and posted_by is null and posted_at is null
              and voided_by is null and voided_at is null and void_reason is null);
drop policy if exists supplier_invoice_delete on public.supplier_invoice;
create policy supplier_invoice_delete on public.supplier_invoice for delete to authenticated
  using (tenant_id = public.current_tenant_id() and status = 'draft');

drop policy if exists supplier_invoice_line_select on public.supplier_invoice_line;
create policy supplier_invoice_line_select on public.supplier_invoice_line for select to authenticated
  using (tenant_id = public.current_tenant_id());
drop policy if exists supplier_invoice_line_write on public.supplier_invoice_line;
create policy supplier_invoice_line_write on public.supplier_invoice_line for all to authenticated
  using (tenant_id = public.current_tenant_id()
         and exists (select 1 from public.supplier_invoice si where si.id = supplier_invoice_id and si.status = 'draft'))
  with check (tenant_id = public.current_tenant_id()
              and exists (select 1 from public.supplier_invoice si
                           where si.id = supplier_invoice_id and si.tenant_id = public.current_tenant_id() and si.status = 'draft'));

-- 7. Draft-only line guard --------------------------------------------------
-- The RLS check above reads the parent's status from the statement snapshot,
-- so a line written while post_supplier_invoice is running on its invoice
-- would land on a posted invoice, unvalidated (and could repeat a receipt
-- line that is already on another posted invoice). Locking the parent FOR
-- SHARE waits for the poster's FOR UPDATE lock, then reads the committed
-- status. Runs as definer so RLS cannot hide a posted parent.
-- Tenant: the row's tenant_id is caller-controlled and this trigger runs
-- before RLS, so a row outside the caller's tenant (or a caller with no
-- tenant) is passed straight through for RLS to refuse (42501). Otherwise a
-- member could lock another tenant's invoice and read its status from the
-- error code. The service role is trusted and always guarded.
-- Deletes are guarded the same way, except cascades (deleting an invoice or a
-- tenant: trigger depth > 1) and service-role purges, which are not edits.
create or replace function public.supplier_invoice_line_draft_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 or public.is_service_role() then
      return old;
    end if;
    if old.tenant_id is distinct from public.current_tenant_id() then
      return old;
    end if;
    select si.status into v_status
      from public.supplier_invoice si
     where si.id = old.supplier_invoice_id and si.tenant_id = old.tenant_id
       for share;
    if found and v_status <> 'draft' then
      raise exception 'only draft invoices can have their lines changed' using errcode = 'P0001';
    end if;
    return old;
  end if;

  -- (For members, RLS USING hides an UPDATE's old row outside their tenant
  -- before the row is fetched, so only the new row needs checking here.)
  if not public.is_service_role() and new.tenant_id is distinct from public.current_tenant_id() then
    return new;
  end if;

  select si.status into v_status
    from public.supplier_invoice si
   where si.id = new.supplier_invoice_id and si.tenant_id = new.tenant_id
     for share;
  if found and v_status <> 'draft' then
    raise exception 'only draft invoices can have their lines changed' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and old.supplier_invoice_id is distinct from new.supplier_invoice_id then
    select si.status into v_status
      from public.supplier_invoice si
     where si.id = old.supplier_invoice_id and si.tenant_id = old.tenant_id
       for share;
    if found and v_status <> 'draft' then
      raise exception 'only draft invoices can have their lines changed' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists supplier_invoice_line_draft_guard on public.supplier_invoice_line;
create trigger supplier_invoice_line_draft_guard
  before insert or update or delete on public.supplier_invoice_line
  for each row execute function public.supplier_invoice_line_draft_guard();

-- 8. post_supplier_invoice -------------------------------------------------
-- Lock order, shared by post and void so they cannot deadlock each other:
--   supplier_invoice (FOR UPDATE)
--   → delivery_receipt_line (FOR UPDATE, in id order; post only)
--   → accounting_connection (FOR SHARE)
--   → accounting_outbox (insert, or FOR UPDATE of the live create_bill job).
-- FOR SHARE on the connection makes a concurrent disconnect's status UPDATE
-- wait for this transaction, so its follow-up "cancel pending jobs" sees the
-- job queued here; and a disconnect that committed first is seen (the locked
-- row is re-read), so nothing is queued on a disconnected connection.
create or replace function public.post_supplier_invoice(
  p_invoice_id uuid,
  p_update_component_costs boolean default true,
  p_create_contact boolean default false
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant      uuid := public.current_tenant_id();
  v_inv         public.supplier_invoice%rowtype;
  v_conn        public.accounting_connection%rowtype;
  v_contact_job uuid;
  v_sync        text := 'not_synced';
begin
  if v_tenant is null then
    raise exception 'not signed in to a workspace' using errcode = '42501';
  end if;

  -- Tenant-filtered, so another tenant's invoice is never even locked.
  select * into v_inv
    from public.supplier_invoice
   where id = p_invoice_id and tenant_id = v_tenant
     for update;
  if not found then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'draft' then
    raise exception 'only draft invoices can be posted' using errcode = 'P0001';
  end if;
  -- The suppliers table, not the active-only view: an existing draft for a
  -- since-archived supplier stays postable.
  if not exists (select 1 from public.suppliers where id = v_inv.supplier_id and tenant_id = v_tenant) then
    raise exception 'supplier not found' using errcode = 'P0002';
  end if;
  -- Drafts are written under the user's session and FKs check existence
  -- only. The sync worker (service role) reads the PO number and component
  -- names through these references, so they must belong to this tenant.
  if v_inv.purchase_order_id is not null
     and not exists (select 1 from public.purchase_order where id = v_inv.purchase_order_id and tenant_id = v_tenant) then
    raise exception 'purchase order not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.supplier_invoice_line where supplier_invoice_id = p_invoice_id) then
    raise exception 'add at least one line before posting' using errcode = 'P0001';
  end if;
  if exists (
    select 1
      from public.supplier_invoice_line l
      left join public.component c on c.id = l.component_id and c.tenant_id = v_tenant
     where l.supplier_invoice_id = p_invoice_id
       and l.component_id is not null
       and c.id is null
  ) then
    raise exception 'a line refers to a component that is not in this workspace' using errcode = 'P0001';
  end if;

  -- Serialise concurrent posts that share receipt lines (Review Focus 4).
  perform 1
     from public.delivery_receipt_line drl
    where drl.id in (select l.delivery_receipt_line_id
                       from public.supplier_invoice_line l
                      where l.supplier_invoice_id = p_invoice_id and l.delivery_receipt_line_id is not null)
    order by drl.id
      for update;

  -- The connection (if any) that decides whether this post queues for Xero.
  select * into v_conn
    from public.accounting_connection
   where tenant_id = v_tenant and provider = 'xero' and status <> 'disconnected'
     for share;

  if exists (
    select 1
      from public.supplier_invoice_line l
      join public.delivery_receipt_line drl on drl.id = l.delivery_receipt_line_id
      join public.delivery_receipt dr on dr.id = drl.delivery_receipt_id
     where l.supplier_invoice_id = p_invoice_id
       and (dr.tenant_id <> v_tenant
            or drl.tenant_id <> v_tenant
            or dr.stock_in_reason is distinct from 'supplier_delivery'
            or dr.supplier_id is distinct from v_inv.supplier_id
            or (l.component_id is not null and l.component_id <> drl.component_id))
  ) then
    raise exception 'every stock line must come from a supplier delivery from this supplier' using errcode = 'P0001';
  end if;

  -- Checked while holding the receipt-line locks: a concurrent post of the
  -- same line waits above, then sees this one's committed 'posted' status.
  if exists (
    select 1
      from public.supplier_invoice_line l
      join public.supplier_invoice_line other
        on other.delivery_receipt_line_id = l.delivery_receipt_line_id
       and other.supplier_invoice_id <> l.supplier_invoice_id
      join public.supplier_invoice oi on oi.id = other.supplier_invoice_id and oi.status = 'posted'
     where l.supplier_invoice_id = p_invoice_id
  ) then
    raise exception 'a receipt line on this invoice is already on another posted invoice' using errcode = '23505';
  end if;

  -- Variances against what was received and the PO price (ex tax).
  update public.supplier_invoice_line l
     set qty_variance   = l.quantity - drl.quantity_delivered,
         price_variance = case when pol.unit_cost is null then null
                               else round(case when v_inv.amounts_mode = 'inclusive'
                                               then l.unit_amount / (1 + l.tax_rate / 100)
                                               else l.unit_amount end, 4) - pol.unit_cost end
    from public.delivery_receipt_line drl
    left join public.purchase_order_line pol on pol.id = drl.purchase_order_line_id
   where l.supplier_invoice_id = p_invoice_id
     and drl.id = l.delivery_receipt_line_id;
  -- Other-charge lines have nothing to vary against; clear anything a draft
  -- write left there.
  update public.supplier_invoice_line
     set qty_variance = null, price_variance = null
   where supplier_invoice_id = p_invoice_id and kind = 'other'
     and (qty_variance is not null or price_variance is not null);

  -- Totals: must match invoiceTotals() in src/lib/accounting/supplier-invoice/calc.ts.
  update public.supplier_invoice si
     set tax_total = t.tax,
         subtotal  = case when si.amounts_mode = 'inclusive' then t.amt - t.tax else t.amt end,
         total     = case when si.amounts_mode = 'inclusive' then t.amt else t.amt + t.tax end
    from (select coalesce(sum(line_amount), 0) as amt, coalesce(sum(tax_amount), 0) as tax
            from public.supplier_invoice_line where supplier_invoice_id = p_invoice_id) t
   where si.id = p_invoice_id;

  -- The invoiced ex-tax unit cost becomes the receipt line's cost (spec §3.4 step 6).
  update public.delivery_receipt_line drl
     set cost_per_unit = x.ex_unit
    from (select l.delivery_receipt_line_id,
                 round(case when v_inv.amounts_mode = 'inclusive'
                            then l.unit_amount / (1 + l.tax_rate / 100)
                            else l.unit_amount end, 4) as ex_unit
            from public.supplier_invoice_line l
           where l.supplier_invoice_id = p_invoice_id and l.kind = 'stock') x
   where drl.id = x.delivery_receipt_line_id;

  if p_update_component_costs then
    update public.component c
       set cost_per_unit = x.ex_unit
      from (select distinct on (drl.component_id)
                   drl.component_id,
                   round(case when v_inv.amounts_mode = 'inclusive'
                              then l.unit_amount / (1 + l.tax_rate / 100)
                              else l.unit_amount end, 4) as ex_unit
              from public.supplier_invoice_line l
              join public.delivery_receipt_line drl on drl.id = l.delivery_receipt_line_id
             where l.supplier_invoice_id = p_invoice_id and l.kind = 'stock'
             order by drl.component_id, l.line_no desc) x
     where c.id = x.component_id and c.tenant_id = v_tenant;
  end if;

  -- Queue for Xero when connected, set up, and on/after the bills start date
  -- (v_conn was read and share-locked above).
  if v_conn.id is not null and v_conn.setup_completed_at is not null and v_inv.invoice_date >= v_conn.bills_start_date then
    if exists (select 1 from public.supplier_invoice_line
                where supplier_invoice_id = p_invoice_id and (tax_type is null or account_code is null)) then
      raise exception 'every line needs a Xero tax rate and account before posting' using errcode = 'P0001';
    end if;

    if not exists (select 1 from public.accounting_contact_link
                    where tenant_id = v_tenant and provider = 'xero' and supplier_id = v_inv.supplier_id) then
      if not p_create_contact then
        raise exception 'link this supplier to a Xero contact, or choose to create one, before posting' using errcode = 'P0001';
      end if;
      insert into public.accounting_outbox (tenant_id, connection_id, provider, operation, entity_type, entity_id, idempotency_key)
      values (v_tenant, v_conn.id, 'xero', 'create_contact', 'supplier', v_inv.supplier_id, 'sup-' || v_inv.supplier_id || '-contact')
      on conflict (entity_type, entity_id, operation) where status in ('pending', 'working', 'failed') do nothing
      returning id into v_contact_job;
      if v_contact_job is null then
        select id into v_contact_job
          from public.accounting_outbox
         where entity_type = 'supplier' and entity_id = v_inv.supplier_id and operation = 'create_contact'
           and status in ('pending', 'working', 'failed');
      end if;
    end if;

    insert into public.accounting_outbox (tenant_id, connection_id, provider, operation, entity_type, entity_id, depends_on, idempotency_key)
    values (v_tenant, v_conn.id, 'xero', 'create_bill', 'supplier_invoice', p_invoice_id, v_contact_job, 'si-' || p_invoice_id || '-create');
    v_sync := 'queued';
  end if;

  update public.supplier_invoice
     set status = 'posted', sync_status = v_sync, posted_by = auth.uid(), posted_at = now(), updated_at = now()
   where id = p_invoice_id;

  return v_sync;
end;
$$;

-- 9. void_supplier_invoice -------------------------------------------------
create or replace function public.void_supplier_invoice(p_invoice_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_inv     public.supplier_invoice%rowtype;
  v_job     public.accounting_outbox%rowtype;
  v_conn_id uuid;
  v_sync    text;
begin
  if v_tenant is null then
    raise exception 'not signed in to a workspace' using errcode = '42501';
  end if;
  if coalesce(public.current_profile_role(), '') not in ('admin', 'super_admin') then
    raise exception 'only admins can void supplier invoices' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'enter a reason for voiding' using errcode = 'P0001';
  end if;

  select * into v_inv
    from public.supplier_invoice
   where id = p_invoice_id and tenant_id = v_tenant
     for update;
  if not found then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'posted' then
    raise exception 'only posted invoices can be voided' using errcode = 'P0001';
  end if;

  -- Lock order as in post: invoice → connection (FOR SHARE) → outbox job.
  select id into v_conn_id
    from public.accounting_connection
   where tenant_id = v_tenant and provider = 'xero' and status <> 'disconnected'
     for share;

  select * into v_job
    from public.accounting_outbox
   where entity_type = 'supplier_invoice' and entity_id = p_invoice_id and operation = 'create_bill'
     and status in ('pending', 'working', 'failed')
     for update;

  if found and v_job.status = 'working' then
    raise exception 'this invoice is being sent to Xero right now; try again in a minute' using errcode = '55P03';
  elsif found then
    update public.accounting_outbox
       set status = 'cancelled', completed_at = now(), locked_at = null, locked_by = null,
           error_message = 'Invoice voided before it reached Xero'
     where id = v_job.id;
    v_sync := 'not_synced';
  elsif v_inv.external_id is not null then
    if v_conn_id is null then
      raise exception 'Xero is disconnected. Reconnect Xero to void this bill.' using errcode = 'P0001';
    end if;
    insert into public.accounting_outbox (tenant_id, connection_id, provider, operation, entity_type, entity_id, idempotency_key)
    values (v_tenant, v_conn_id, 'xero', 'void_bill', 'supplier_invoice', p_invoice_id, 'si-' || p_invoice_id || '-void');
    v_sync := 'queued';
  else
    v_sync := 'not_synced';
  end if;

  update public.supplier_invoice
     set status = 'voided', sync_status = v_sync, voided_by = auth.uid(), voided_at = now(),
         void_reason = btrim(p_reason), updated_at = now()
   where id = p_invoice_id;

  return v_sync;
end;
$$;

-- 10. Job and lease claiming (service role only) ---------------------------
create or replace function public.claim_accounting_jobs(p_connection_id uuid, p_limit int, p_worker text)
returns setof public.accounting_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_service_role() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- One claimer per connection at a time (spec §6.3). Without this, two
  -- workers starting together both pass the "nothing working" check (neither
  -- sees the other's uncommitted claim) and take disjoint batches. The lock
  -- is held to commit; the next claimer's statement then sees the batch.
  perform pg_advisory_xact_lock(hashtextextended('accounting_outbox:' || p_connection_id::text, 0));
  -- MATERIALIZED: the LIMIT … SKIP LOCKED pick runs exactly once. As an
  -- IN (subquery) the planner may re-scan it, and a re-scan with SKIP LOCKED
  -- can return different rows, claiming more than p_limit.
  return query
  with picked as materialized (
    select j.id
      from public.accounting_outbox j
      join public.accounting_connection c on c.id = j.connection_id and c.status = 'connected'
      left join public.accounting_outbox dep on dep.id = j.depends_on
     where j.connection_id = p_connection_id
       and j.next_attempt_at <= now()
       and (j.status = 'pending'
            or (j.status = 'failed' and j.error_class in ('transient', 'daily_limit'))
            or (j.status = 'working' and j.locked_at < now() - interval '5 minutes'))
       and (j.depends_on is null or dep.status = 'sent')
       and not exists (select 1 from public.accounting_outbox w
                        where w.connection_id = p_connection_id and w.status = 'working'
                          and w.locked_at >= now() - interval '5 minutes' and w.id <> j.id)
     order by j.created_at
     limit p_limit
       for update of j skip locked
  )
  update public.accounting_outbox o
     set status = 'working', locked_at = now(), locked_by = p_worker,
         first_attempt_at = coalesce(o.first_attempt_at, now())
    from picked
   where o.id = picked.id
  returning o.*;
end;
$$;

create or replace function public.claim_accounting_refresh_lease(p_connection_id uuid, p_lease_seconds int)
returns setof public.accounting_credential
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_service_role() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  update public.accounting_credential
     set refresh_lease_until = now() + make_interval(secs => p_lease_seconds)
   where connection_id = p_connection_id
     and (refresh_lease_until is null or refresh_lease_until < now())
  returning *;
end;
$$;

-- 11. Function grants: CREATE FUNCTION grants EXECUTE to PUBLIC by default,
-- and Supabase's default privileges grant it to anon/authenticated as well.
revoke all on function public.post_supplier_invoice(uuid, boolean, boolean) from public, anon;
revoke all on function public.void_supplier_invoice(uuid, text) from public, anon;
revoke all on function public.claim_accounting_jobs(uuid, int, text) from public, anon, authenticated;
revoke all on function public.claim_accounting_refresh_lease(uuid, int) from public, anon, authenticated;
-- Trigger-only: firing a trigger does not check EXECUTE, so nobody needs it.
revoke all on function public.supplier_invoice_line_draft_guard() from public, anon, authenticated;
grant execute on function public.post_supplier_invoice(uuid, boolean, boolean) to authenticated, service_role;
grant execute on function public.void_supplier_invoice(uuid, text) to authenticated, service_role;
grant execute on function public.claim_accounting_jobs(uuid, int, text) to service_role;
grant execute on function public.claim_accounting_refresh_lease(uuid, int) to service_role;

commit;
