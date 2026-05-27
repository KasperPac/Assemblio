-- Orders pipeline redesign — follow-up fix (I2)
-- RPC: return distinct order_ids that have at least one job_actual_time_entry.
-- Replaces a 1000-row LIMIT scan in pipeline-rollup that could miss orders when one
-- noisy order had >1000 entries. Bound is now O(distinct orders), not O(entries).
create or replace function public.orders_with_actual_time(
  p_tenant_id uuid,
  p_order_ids uuid[]
) returns table(order_id uuid)
language sql
stable
security invoker
as $$
  select distinct e.order_id
  from public.job_actual_time_entry e
  where e.tenant_id = p_tenant_id
    and e.order_id = any(p_order_ids);
$$;
