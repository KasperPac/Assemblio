delete from public.order_component_allocation a
using public.order_component_allocation b
where a.tenant_id = b.tenant_id
  and a.order_line_id = b.order_line_id
  and a.component_id = b.component_id
  and a.created_at < b.created_at;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_component_allocation_tenant_line_component_unique'
  ) then
    alter table public.order_component_allocation
      add constraint order_component_allocation_tenant_line_component_unique
      unique (tenant_id, order_line_id, component_id);
  end if;
end $$;
