-- supabase/patches/2026-05-27-order-source-sla.sql
create table if not exists public.order_source_sla (
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  source text not null check (source in ('shopify', 'manual')),
  lead_time_days integer not null default 7 check (lead_time_days >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, source)
);

alter table public.order_source_sla enable row level security;

create policy "tenant_isolation_select" on public.order_source_sla
  for select using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_insert" on public.order_source_sla
  for insert with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_update" on public.order_source_sla
  for update using ((tenant_id = public.current_tenant_id()) or public.is_super_admin())
  with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_delete" on public.order_source_sla
  for delete using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());

-- Seed defaults for every existing tenant
insert into public.order_source_sla (tenant_id, source, lead_time_days)
  select id, 'shopify', 7 from public.tenant
  on conflict (tenant_id, source) do nothing;
insert into public.order_source_sla (tenant_id, source, lead_time_days)
  select id, 'manual', 10 from public.tenant
  on conflict (tenant_id, source) do nothing;
