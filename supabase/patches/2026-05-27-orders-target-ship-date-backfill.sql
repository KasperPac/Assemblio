-- Orders pipeline redesign — apply order: 4 of 5
-- Backfill orders.target_ship_date from order_source_sla. Requires patches 1, 2, 3 to be applied first.
update public.orders o
  set target_ship_date = o.created_at + (sla.lead_time_days || ' days')::interval
  from public.order_source_sla sla
  where sla.tenant_id = o.tenant_id
    and sla.source = o.source
    and o.target_ship_date is null;
