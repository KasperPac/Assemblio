-- Templates page: labor templates + dynamic linking provenance.
-- Idempotent. Apply manually before deploying the templates-page feature.

create table if not exists public.labor_template (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  name text not null,
  description text,
  mode text not null default 'basic' check (mode in ('basic', 'advanced')),
  is_linked boolean not null default false,
  lines_updated_at timestamptz,
  last_published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.labor_template_line (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  template_id uuid not null references public.labor_template(id) on delete cascade,
  department_id uuid not null references public.department(id),
  operation_name text not null,
  sequence integer not null default 1,
  setup_hours numeric not null default 0,
  run_hours_per_unit numeric not null default 0,
  admin_hours_per_unit numeric not null default 0,
  electricity_kwh_per_unit numeric not null default 0,
  gas_units_per_unit numeric not null default 0,
  blocked_by integer[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  unique (template_id, sequence)
);

alter table public.bom_template
  add column if not exists is_linked boolean not null default false,
  add column if not exists lines_updated_at timestamptz,
  add column if not exists last_published_at timestamptz;

alter table public.product_bom
  add column if not exists component_template_id uuid references public.bom_template(id) on delete set null,
  add column if not exists labor_template_id uuid references public.labor_template(id) on delete set null;

alter table public.product_bom_component
  add column if not exists source_template_line_id uuid references public.bom_template_line(id) on delete set null;

alter table public.product_bom_labor
  add column if not exists source_template_line_id uuid references public.labor_template_line(id) on delete set null;

-- RLS (mirrors bom_template_rls.sql)
alter table public.labor_template enable row level security;
alter table public.labor_template_line enable row level security;

drop policy if exists labor_template_tenant_isolation on public.labor_template;
create policy labor_template_tenant_isolation on public.labor_template
  using (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  )
  with check (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  );

drop policy if exists labor_template_line_tenant_isolation on public.labor_template_line;
create policy labor_template_line_tenant_isolation on public.labor_template_line
  using (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  )
  with check (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  );

create index if not exists idx_labor_template_tenant on public.labor_template(tenant_id);
create index if not exists idx_labor_template_line_template on public.labor_template_line(template_id);
create index if not exists idx_product_bom_component_template on public.product_bom(component_template_id) where component_template_id is not null;
create index if not exists idx_product_bom_labor_template on public.product_bom(labor_template_id) where labor_template_id is not null;
create index if not exists idx_product_bom_component_source_line on public.product_bom_component(source_template_line_id) where source_template_line_id is not null;
create index if not exists idx_product_bom_labor_source_line on public.product_bom_labor(source_template_line_id) where source_template_line_id is not null;
