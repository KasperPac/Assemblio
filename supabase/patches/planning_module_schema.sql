-- ============================================================
-- Planning Module Schema
-- ============================================================

-- 1. Tenant module flag
alter table public.tenant
  add column if not exists has_planning_module boolean not null default false;

-- 2. Customer email on orders (populated by Shopify sync)
alter table public.orders
  add column if not exists customer_email text;

-- 3. Routing dependency array on BOM labor operations
--    blocked_by stores sequence integers that must be 'complete'
--    before this step transitions from 'blocked' → 'queued'
alter table public.product_bom_labor
  add column if not exists blocked_by integer[] not null default '{}';

-- 4. Job routing step — live tracking record per order-line per routing stage
create table if not exists public.job_routing_step (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references public.tenant(id),
  order_line_id     uuid        not null references public.order_line(id) on delete cascade,
  department_id     uuid        not null references public.department(id),
  bom_labor_id      uuid        references public.product_bom_labor(id),
  sequence          integer     not null,
  blocked_by        integer[]   not null default '{}',
  operation_name    text        not null,
  status            text        not null default 'blocked'
                                check (status in ('blocked','queued','active','complete','skipped')),
  scheduled_start   timestamptz,
  scheduled_end     timestamptz,
  actual_start      timestamptz,
  actual_end        timestamptz,
  started_by        uuid        references auth.users(id),
  completed_by      uuid        references auth.users(id),
  priority          integer     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists jrs_tenant_idx       on public.job_routing_step(tenant_id);
create index if not exists jrs_order_line_idx   on public.job_routing_step(order_line_id);
create index if not exists jrs_department_idx   on public.job_routing_step(department_id);
create index if not exists jrs_status_idx       on public.job_routing_step(status);

alter table public.job_routing_step enable row level security;

create policy "Tenant isolation" on public.job_routing_step
  using  (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

-- 5. Product notification trigger — per-BOM per-sequence notification config
create table if not exists public.product_notification_trigger (
  id               uuid     primary key default gen_random_uuid(),
  tenant_id        uuid     not null references public.tenant(id),
  product_bom_id   uuid     not null references public.product_bom(id) on delete cascade,
  routing_sequence integer  not null,
  message_template text     not null,
  channel          text     not null default 'email'
                            check (channel in ('email')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, product_bom_id, routing_sequence)
);

alter table public.product_notification_trigger enable row level security;

create policy "Tenant isolation" on public.product_notification_trigger
  using  (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

-- 6. Notification log — audit trail of every sent notification
create table if not exists public.notification_log (
  id              uuid     primary key default gen_random_uuid(),
  tenant_id       uuid     not null references public.tenant(id),
  order_id        uuid     not null references public.orders(id),
  order_line_id   uuid     not null references public.order_line(id),
  trigger_id      uuid     references public.product_notification_trigger(id),
  channel         text     not null,
  recipient       text     not null,
  sent_at         timestamptz not null default now(),
  delivery_status text     not null default 'sent'
                           check (delivery_status in ('sent','delivered','failed')),
  created_at      timestamptz not null default now()
);

create index if not exists notif_log_order_idx  on public.notification_log(order_id);
create index if not exists notif_log_tenant_idx on public.notification_log(tenant_id);

alter table public.notification_log enable row level security;

create policy "Tenant isolation" on public.notification_log
  using  (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());
