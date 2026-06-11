-- Count distinct tenants in a given table
create or replace function public.count_distinct_tenants(p_table text)
returns bigint
language plpgsql
security definer
as $$
declare
  result bigint;
begin
  execute format('select count(distinct tenant_id) from public.%I', p_table) into result;
  return result;
end;
$$;

-- Count tenants with more than 1 warehouse location
create or replace function public.count_multi_location_tenants()
returns bigint
language sql
security definer
as $$
  select count(*) from (
    select tenant_id from public.warehouse_location
    group by tenant_id having count(*) > 1
  ) sub;
$$;
