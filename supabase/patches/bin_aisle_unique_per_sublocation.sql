-- Aisle names should be unique within a sub-location, not warehouse-wide.
-- Bay names are already unique per aisle (correct).

alter table public.bin_aisle
  drop constraint bin_aisle_tenant_id_warehouse_id_name_key,
  add constraint bin_aisle_tenant_id_sub_location_id_name_key
    unique (tenant_id, sub_location_id, name);
