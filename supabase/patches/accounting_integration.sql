-- accounting_connection: one active row per tenant per provider
create table if not exists public.accounting_connection (
  id                  uuid        default gen_random_uuid() primary key,
  tenant_id           uuid        not null references public.tenant(id),
  provider            text        not null check (provider in ('xero', 'qbo')),
  access_token        text        not null,
  refresh_token       text        not null,
  token_expires_at    timestamptz not null,
  -- provider-specific organisation identifier
  provider_org_id     text        not null,  -- Xero tenantId
  account_name        text        not null,  -- e.g. "My Company - Xero"
  -- which Xero account code to use on bill lines (user-configurable; 300 is common AU purchases)
  default_account_code text       not null default '300',
  connected_by        uuid        references auth.users(id),
  connected_at        timestamptz not null default now(),
  is_active           boolean     not null default true,
  created_at          timestamptz not null default now()
);

-- Only one active connection per tenant per provider
create unique index accounting_connection_tenant_provider_active_idx
  on public.accounting_connection (tenant_id, provider)
  where is_active = true;

alter table public.accounting_connection enable row level security;

create policy "tenant_isolation_select"
  on public.accounting_connection
  for select using (tenant_id = public.current_tenant_id());

create policy "tenant_isolation_insert"
  on public.accounting_connection
  for insert with check (tenant_id = public.current_tenant_id());

create policy "tenant_isolation_update"
  on public.accounting_connection
  for update
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy "tenant_isolation_delete"
  on public.accounting_connection
  for delete using (tenant_id = public.current_tenant_id());

grant all on public.accounting_connection to authenticated;

-- accounting_sync_event: one row per bill push attempt
create table if not exists public.accounting_sync_event (
  id             uuid        default gen_random_uuid() primary key,
  tenant_id      uuid        not null references public.tenant(id),
  connection_id  uuid        not null references public.accounting_connection(id) on delete cascade,
  entity_type    text        not null check (entity_type in ('bill')),
  entity_id      uuid        not null,  -- delivery_receipt.id
  external_id    text,                  -- Xero InvoiceID (null on failure)
  status         text        not null check (status in ('synced', 'failed')),
  error          text,
  synced_at      timestamptz not null default now()
);

alter table public.accounting_sync_event enable row level security;

create policy "tenant_isolation_select"
  on public.accounting_sync_event
  for select using (tenant_id = public.current_tenant_id());

create policy "tenant_isolation_insert"
  on public.accounting_sync_event
  for insert with check (tenant_id = public.current_tenant_id());

create policy "tenant_isolation_update"
  on public.accounting_sync_event
  for update
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy "tenant_isolation_delete"
  on public.accounting_sync_event
  for delete using (tenant_id = public.current_tenant_id());

grant all on public.accounting_sync_event to authenticated;

-- Index for Settings UI query: sync events by connection
create index if not exists accounting_sync_event_connection_id_idx
  on public.accounting_sync_event (connection_id);

-- Index for entity lookups (receipt detail page future use)
create index if not exists accounting_sync_event_entity_id_idx
  on public.accounting_sync_event (entity_id);
