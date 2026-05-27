-- supabase/patches/2026-05-27-orders-target-ship-date-backfill.sql
update public.orders o
  set target_ship_date = o.created_at + (sla.lead_time_days || ' days')::interval
  from public.order_source_sla sla
  where sla.tenant_id = o.tenant_id
    and sla.source = o.source
    and o.target_ship_date is null;
