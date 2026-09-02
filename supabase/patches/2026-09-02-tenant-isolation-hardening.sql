-- supabase/patches/2026-09-02-tenant-isolation-hardening.sql
--
-- Beta launch blockers from the 29 Aug 2026 launch-readiness audit.
-- Every business table already has correct tenant-scoped RLS; these are
-- the SECURITY DEFINER functions that bypass it, plus the one storage
-- policy that leaks the UUIDs which make those functions exploitable.
--
--   H1  apply_stocktake_session  — no access check on the loaded session,
--                                  so any authenticated user who knows an
--                                  approved session UUID could bulk-adjust
--                                  another tenant's stock.
--   H2  apply_reserved_movement  — trusted a client-supplied p_tenant_id
--                                  and wrote reserved-stock rows for it.
--   M1  component-images bucket  — unscoped select policy let anon list
--                                  every tenant's objects, whose keys are
--                                  <tenant_id>/<component_id>.
--   REC inventory_balance        — unique key and upsert conflict target
--                                  were not tenant-scoped, and
--                                  apply_inventory_movement never checked
--                                  that the component/location it was
--                                  handed belong to the caller's tenant.
--
-- The guard used throughout mirrors the RLS predicate on every business
-- table exactly — (tenant_id = current_tenant_id()) or is_super_admin() —
-- so a DEFINER function can no longer do what RLS would have refused.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------
-- 0. Shared guards
--
--    is_service_role() reads the role claim PostgREST puts on the
--    request from the verified JWT. Trusted-server callers (the Shopify
--    sync + webhook path in src/lib/shopify/sync.ts) use the service key
--    and therefore have no auth.uid(), so current_tenant_id() is null
--    for them — they must stay allowed or order sync breaks.
-- ---------------------------------------------------------------------

create or replace function public.is_service_role()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role',
    ''
  ) = 'service_role'
$$;

-- Grants for every function in this file are set together in section 7.

create or replace function public.assert_tenant_write_access(p_tenant_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current uuid;
begin
  if p_tenant_id is null then
    raise exception 'tenant is required';
  end if;

  -- Trusted server callers (Shopify sync/webhooks) have no auth.uid().
  if public.is_service_role() then
    return;
  end if;

  if public.is_super_admin() then
    return;
  end if;

  v_current := public.current_tenant_id();

  -- Deliberately NULL-safe, and checked on prod: an earlier version wrote
  --   if not (p_tenant_id = public.current_tenant_id() or public.is_super_admin())
  -- which evaluates to NULL when current_tenant_id() is NULL, so `if not NULL`
  -- never fired and a caller with NO tenant context sailed through the guard.
  -- No tenant context is a refusal, not a pass.
  if v_current is null or v_current <> p_tenant_id then
    raise exception 'forbidden: no write access to tenant %', p_tenant_id
      using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.assert_tenant_write_access(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. inventory_balance — tenant-scoped uniqueness
--
--    unique (component_id, location_id) meant a cross-tenant upsert
--    landed on the victim's existing row via ON CONFLICT DO UPDATE.
--    The new key is a superset of the old one, so no existing row can
--    violate it.
-- ---------------------------------------------------------------------

create unique index if not exists inventory_balance_tenant_component_location_key
  on public.inventory_balance (tenant_id, component_id, location_id);

do $$
declare
  v_conname text;
begin
  select con.conname
  into v_conname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'inventory_balance'
    and con.contype = 'u'
    and (
      select array_agg(att.attname::text order by att.attname::text)
      from unnest(con.conkey) as k(attnum)
      join pg_attribute att
        on att.attrelid = con.conrelid and att.attnum = k.attnum
    ) = array['component_id', 'location_id'];

  if v_conname is not null then
    execute format(
      'alter table public.inventory_balance drop constraint %I',
      v_conname
    );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. apply_inventory_movement — verify the component and location are
--    the caller's, and upsert on the tenant-scoped key.
--    (Body otherwise unchanged from schema.sql.)
-- ---------------------------------------------------------------------

create or replace function public.apply_inventory_movement(
  p_component_id uuid,
  p_location_id uuid,
  p_delta_on_hand numeric,
  p_delta_in_prod numeric,
  p_reason text,
  p_reference_type text,
  p_reference_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_movement_id uuid;
begin
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'No tenant context for user';
  end if;

  if not exists (
    select 1 from public.component c
    where c.id = p_component_id and c.tenant_id = v_tenant_id
  ) then
    raise exception 'forbidden: component does not belong to this tenant'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.location l
    where l.id = p_location_id and l.tenant_id = v_tenant_id
  ) then
    raise exception 'forbidden: location does not belong to this tenant'
      using errcode = '42501';
  end if;

  insert into public.inventory_movement (
    tenant_id,
    component_id,
    location_id,
    delta_on_hand,
    delta_in_prod,
    reason,
    reference_type,
    reference_id
  ) values (
    v_tenant_id,
    p_component_id,
    p_location_id,
    p_delta_on_hand,
    p_delta_in_prod,
    p_reason,
    p_reference_type,
    p_reference_id
  )
  returning id into v_movement_id;

  insert into public.inventory_balance (
    tenant_id,
    component_id,
    location_id,
    on_hand,
    in_prod,
    updated_at
  ) values (
    v_tenant_id,
    p_component_id,
    p_location_id,
    p_delta_on_hand,
    p_delta_in_prod,
    now()
  )
  on conflict (tenant_id, component_id, location_id)
  do update set
    on_hand = public.inventory_balance.on_hand + excluded.on_hand,
    in_prod = public.inventory_balance.in_prod + excluded.in_prod,
    updated_at = now();

  return v_movement_id;
end;
$$;

grant execute on function public.apply_inventory_movement(uuid, uuid, numeric, numeric, text, text, uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- 3. H1 — apply_stocktake_session: check access to the session's tenant
--    before applying anything. (Body otherwise unchanged from
--    apply_stocktake_session_rpc.sql.)
-- ---------------------------------------------------------------------

create or replace function public.apply_stocktake_session(
  p_session_id uuid
)
returns table (
  applied_lines integer,
  adjustment_count integer,
  expected_total numeric,
  counted_total numeric,
  variance_from_expected numeric,
  applied_delta_total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_line record;
  v_balance_on_hand numeric;
  v_delta numeric;
  v_applied integer := 0;
  v_adjustments integer := 0;
  v_expected numeric := 0;
  v_counted numeric := 0;
  v_variance numeric := 0;
  v_applied_delta numeric := 0;
begin
  if p_session_id is null then
    raise exception 'session id is required';
  end if;

  select id, status, location_id, tenant_id
  into v_session
  from public.stocktake_session
  where id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'stocktake session not found';
  end if;

  -- H1 guard: this function is SECURITY DEFINER, so RLS did not filter
  -- the select above. Refuse sessions outside the caller's tenant.
  perform public.assert_tenant_write_access(v_session.tenant_id);

  if v_session.status <> 'approved' then
    raise exception 'session must be approved before applying (current status: %)', v_session.status;
  end if;

  for v_line in
    select id, component_id, expected_on_hand, counted
    from public.stocktake_line
    where session_id = v_session.id
      and tenant_id = v_session.tenant_id
  loop
    select on_hand into v_balance_on_hand
    from public.inventory_balance
    where tenant_id = v_session.tenant_id
      and location_id = v_session.location_id
      and component_id = v_line.component_id
    for update;

    v_balance_on_hand := coalesce(v_balance_on_hand, 0);
    v_delta := coalesce(v_line.counted, 0) - v_balance_on_hand;

    v_applied := v_applied + 1;
    v_expected := v_expected + coalesce(v_line.expected_on_hand, 0);
    v_counted := v_counted + coalesce(v_line.counted, 0);
    v_variance := v_variance + (coalesce(v_line.counted, 0) - coalesce(v_line.expected_on_hand, 0));
    v_applied_delta := v_applied_delta + v_delta;

    if v_delta = 0 then
      continue;
    end if;

    insert into public.inventory_movement (
      tenant_id,
      component_id,
      location_id,
      delta_on_hand,
      delta_in_prod,
      reason,
      reference_type,
      reference_id
    )
    values (
      v_session.tenant_id,
      v_line.component_id,
      v_session.location_id,
      v_delta,
      0,
      'stocktake_adjustment',
      'stocktake_session',
      v_session.id
    );

    if v_balance_on_hand is null or not exists (
      select 1
      from public.inventory_balance
      where tenant_id = v_session.tenant_id
        and location_id = v_session.location_id
        and component_id = v_line.component_id
    ) then
      insert into public.inventory_balance (
        tenant_id,
        component_id,
        location_id,
        on_hand,
        in_prod,
        reserved
      )
      values (
        v_session.tenant_id,
        v_line.component_id,
        v_session.location_id,
        coalesce(v_line.counted, 0),
        0,
        0
      );
    else
      update public.inventory_balance
      set on_hand = coalesce(v_line.counted, 0)
      where tenant_id = v_session.tenant_id
        and location_id = v_session.location_id
        and component_id = v_line.component_id;
    end if;

    v_adjustments := v_adjustments + 1;
  end loop;

  update public.stocktake_session
  set status = 'completed'
  where id = v_session.id
    and tenant_id = v_session.tenant_id;

  return query
    select
      v_applied,
      v_adjustments,
      v_expected,
      v_counted,
      v_variance,
      v_applied_delta;
end;
$$;

grant execute on function public.apply_stocktake_session(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. H2 — apply_reserved_movement: validate the client-supplied tenant,
--    and check the component/location belong to it.
--    (Body otherwise unchanged from apply_reserved_movement_rpc.sql.)
-- ---------------------------------------------------------------------

create or replace function public.apply_reserved_movement(
  p_tenant_id uuid,
  p_component_id uuid,
  p_location_id uuid,
  p_order_id uuid,
  p_delta_reserved numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
  v_existing_id uuid;
  v_current_reserved numeric;
  v_next_reserved numeric;
begin
  if p_delta_reserved = 0 then
    return;
  end if;

  if p_tenant_id is null
     or p_component_id is null
     or p_location_id is null then
    raise exception 'tenant, component and location are required';
  end if;

  -- H2 guard: p_tenant_id arrives from the caller and this function is
  -- SECURITY DEFINER. Refuse anything outside the caller's tenant.
  perform public.assert_tenant_write_access(p_tenant_id);

  if not exists (
    select 1 from public.component c
    where c.id = p_component_id and c.tenant_id = p_tenant_id
  ) then
    raise exception 'forbidden: component does not belong to this tenant'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.location l
    where l.id = p_location_id and l.tenant_id = p_tenant_id
  ) then
    raise exception 'forbidden: location does not belong to this tenant'
      using errcode = '42501';
  end if;

  v_reason := case when p_delta_reserved > 0 then 'order_reserve' else 'order_release' end;

  insert into public.inventory_movement (
    tenant_id,
    component_id,
    location_id,
    delta_on_hand,
    delta_in_prod,
    delta_reserved,
    reason,
    reference_type,
    reference_id
  )
  values (
    p_tenant_id,
    p_component_id,
    p_location_id,
    0,
    0,
    p_delta_reserved,
    v_reason,
    'order',
    p_order_id
  );

  select id, reserved
  into v_existing_id, v_current_reserved
  from public.inventory_balance
  where tenant_id = p_tenant_id
    and component_id = p_component_id
    and location_id = p_location_id
  for update;

  if v_existing_id is null then
    v_next_reserved := greatest(0, p_delta_reserved);
    insert into public.inventory_balance (
      tenant_id,
      component_id,
      location_id,
      on_hand,
      in_prod,
      reserved
    )
    values (
      p_tenant_id,
      p_component_id,
      p_location_id,
      0,
      0,
      v_next_reserved
    );
  else
    v_next_reserved := greatest(0, coalesce(v_current_reserved, 0) + p_delta_reserved);
    update public.inventory_balance
    set reserved = v_next_reserved
    where id = v_existing_id;
  end if;
end;
$$;

grant execute on function public.apply_reserved_movement(uuid, uuid, uuid, uuid, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. M1 — component-images: stop anon/cross-tenant enumeration.
--
--    The old select policy was `using (bucket_id = 'component-images')`,
--    which let anyone holding the public anon key LIST every object in
--    the bucket — and the keys are <tenant_id>/<component_id>, i.e. the
--    exact UUIDs that made H1/H2 practical to exploit.
--
--    The bucket stays public=true so existing <img src> public URLs keep
--    resolving (an individual object fetch by unguessable UUID pair is a
--    separate, lower-severity concern tracked as follow-up work to move
--    to a private bucket + signed URLs). This policy removes listing and
--    any authenticated cross-tenant read through the storage API.
-- ---------------------------------------------------------------------

drop policy if exists component_images_read on storage.objects;
create policy component_images_read on storage.objects
  for select
  using (
    bucket_id = 'component-images'
    and (
      public.is_super_admin()
      or (
        (storage.foldername(name))[1] = public.current_tenant_id()::text
        and public.current_profile_role() is not null
      )
    )
  );

-- ---------------------------------------------------------------------
-- 6. L2 — dev-dashboard count RPCs.
--
--    Both are SECURITY DEFINER and return cross-tenant aggregates, and
--    both were callable by any authenticated user. The dev dashboard
--    calls them with a *user-scoped* client behind requirePlatformOperator
--    (src/app/api/dev-dashboard/_lib/guard.ts), so the grant has to stay —
--    the check moves inside the function instead. Also pins search_path,
--    which neither had.
-- ---------------------------------------------------------------------

create or replace function public.count_distinct_tenants(p_table text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  result bigint;
begin
  if not (public.is_platform_operator() or public.is_service_role()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  execute format('select count(distinct tenant_id) from public.%I', p_table) into result;
  return result;
end;
$$;

create or replace function public.count_multi_location_tenants()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  result bigint;
begin
  if not (public.is_platform_operator() or public.is_service_role()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*) into result from (
    select tenant_id from public.location
    group by tenant_id having count(*) > 1
  ) sub;
  return result;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Grants — keep anon off every function this patch touches.
--
--    CREATE FUNCTION grants EXECUTE to PUBLIC by default, so `anon` could
--    reach these RPCs even though only authenticated/service_role were
--    granted explicitly. The tenant guards already refuse anon (it has no
--    tenant context), but the reachable surface should not include it.
--    Raised by the Supabase security advisor after this patch was applied.
-- ---------------------------------------------------------------------

revoke execute on function public.is_service_role() from public, anon;
grant execute on function public.is_service_role() to authenticated, service_role;

revoke execute on function public.assert_tenant_write_access(uuid) from public, anon;
grant execute on function public.assert_tenant_write_access(uuid) to authenticated, service_role;

revoke execute on function public.apply_inventory_movement(uuid, uuid, numeric, numeric, text, text, uuid) from public, anon;
grant execute on function public.apply_inventory_movement(uuid, uuid, numeric, numeric, text, text, uuid) to authenticated, service_role;

revoke execute on function public.apply_reserved_movement(uuid, uuid, uuid, uuid, numeric) from public, anon;
grant execute on function public.apply_reserved_movement(uuid, uuid, uuid, uuid, numeric) to authenticated, service_role;

revoke execute on function public.apply_stocktake_session(uuid) from public, anon;
grant execute on function public.apply_stocktake_session(uuid) to authenticated, service_role;

revoke execute on function public.count_distinct_tenants(text) from public, anon;
grant execute on function public.count_distinct_tenants(text) to authenticated, service_role;

revoke execute on function public.count_multi_location_tenants() from public, anon;
grant execute on function public.count_multi_location_tenants() to authenticated, service_role;
