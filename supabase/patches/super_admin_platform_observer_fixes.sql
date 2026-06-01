-- super_admin_platform_observer_fixes.sql
--
-- Fixes identified in code review of feat/super-admin-foundation (2026-05-28).
-- All five findings were: functions/policies that still call is_super_admin() after
-- the foundation patch introduced is_platform_operator(). This means platform_observer
-- users were completely blocked from view-as mode and business data.
--
-- APPLICATION ORDER: Must be applied AFTER super_admin_foundation.sql
-- (this patch depends on is_platform_operator() existing in the DB).
--
-- Findings addressed:
--   P0 Finding 1 — has_tenant_access() blocked platform_observer from set_active_tenant()
--   P0 Finding 2 — current_tenant_id() returned NULL for platform_observer after set_active_tenant()
--   P2 Finding 4 — get_user_emails() returned empty for platform_observer
--   P2 Finding 5 — super_admin_audit_log INSERT policy blocked platform_observer audit writes
--   (bonus)      — get_tenant_health_indicators / get_tenant_vitals also used is_super_admin()

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. has_tenant_access(uuid)  [Finding 1 — P0]
--
-- set_active_tenant() calls has_tenant_access() as a gate. The old is_super_admin()
-- check returned false for platform_observer → "No access to tenant" exception →
-- observer could never enter view-as mode → zero business data accessible.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.has_tenant_access(p_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    public.is_platform_operator()
    or exists (
      select 1
      from public.profile_tenant_access pta
      where pta.profile_id = auth.uid()
        and pta.tenant_id = p_tenant_id
    )
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. current_tenant_id()  [Finding 2 — P0]
--
-- Even with has_tenant_access() fixed, current_tenant_id() had its own is_super_admin()
-- bypass. After set_active_tenant() writes profiles.tenant_id = uuid, this function
-- checked is_super_admin() (false for observer) AND profile_tenant_access rows (none
-- for observer) → returned NULL → all business-table policies denied.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.current_tenant_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select p.tenant_id
  from public.profiles p
  where p.id = auth.uid()
    and p.tenant_id is not null
    and (
      public.is_platform_operator()
      or exists (
        select 1
        from public.profile_tenant_access pta
        where pta.profile_id = p.id
          and pta.tenant_id = p.tenant_id
      )
    )
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_user_emails(uuid[])  [Finding 4 — P2]
--
-- platform_observer calling get_user_emails() got zero rows — no error, just blank
-- emails — because the WHERE clause checked is_super_admin() which was false.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_user_emails(p_ids uuid[])
returns table(id uuid, email text)
language sql
security definer
set search_path = public
as $$
  select u.id, u.email::text
  from auth.users u
  where u.id = any(p_ids)
    and public.is_platform_operator()
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. super_admin_audit_log INSERT policy  [Finding 5 — P2]
--
-- The SELECT policy was updated to is_platform_operator() in super_admin_foundation.sql
-- but the INSERT policy was not. Application code logging a platform_observer action
-- was silently blocked under RLS — observer actions were untrackable at the DB layer.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists super_admin_audit_log_insert on public.super_admin_audit_log;
create policy super_admin_audit_log_insert on public.super_admin_audit_log
  for insert with check (public.is_platform_operator());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. get_tenant_health_indicators / get_tenant_vitals  (bonus — same class of bug)
--
-- Both RPCs in super_admin_tenant_vitals.sql used is_super_admin() guards. They were
-- temporarily reverted from is_platform_operator() (commit 7b973c3a) because the
-- foundation patch had not yet been applied. Now that is_platform_operator() exists,
-- restore the correct guard so platform_observer can call these RPCs.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_tenant_health_indicators(p_tenant_ids uuid[])
returns table(tenant_id uuid, health text, reasons text[])
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_operator() then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;

  return query
  with base as (
    select
      t.id                                    as tenant_id,
      ts.status                               as sub_status,
      ts.trial_ends_at,
      ss.last_sync_status                     as shopify_sync_status,
      -- most recent active accounting connection
      (
        select ac.token_expires_at
        from   public.accounting_connection ac
        where  ac.tenant_id = t.id
          and  ac.is_active = true
        order  by ac.connected_at desc
        limit  1
      )                                       as acct_token_expires_at,
      -- last activity_log event
      (
        select max(al.created_at)
        from   public.activity_log al
        where  al.tenant_id = t.id
      )                                       as last_activity_at
    from   public.tenant t
    left   join public.tenant_subscription ts  on ts.tenant_id = t.id
    left   join public.shopify_store       ss  on ss.tenant_id = t.id
    where  t.id = any(p_tenant_ids)
  ),
  evaluated as (
    select
      b.tenant_id,
      -- Collect all triggered conditions as (level, reason) pairs
      array_remove(array[
        -- critical conditions
        case when b.shopify_sync_status = 'failed'
             then 'critical|Shopify sync failed'     end,
        -- NULL < now() = NULL in Postgres, so no connection → this branch doesn't fire
        case when b.acct_token_expires_at < now()
             then 'critical|Accounting token expired' end,
        case when b.sub_status = 'past_due'
             then 'critical|Subscription past due'   end,
        -- warn conditions
        case when b.trial_ends_at between now() and now() + interval '7 days'
             then 'warn|Trial ending soon'           end,
        case when b.last_activity_at < now() - interval '30 days'
               or b.last_activity_at is null
             then 'warn|No activity in 30 days'     end,
        -- NULL BETWEEN x AND y = NULL in Postgres, so no connection → this branch doesn't fire
        case when b.acct_token_expires_at between now() and now() + interval '7 days'
             then 'warn|Accounting token expiring'  end
      ], null) as raw_conditions
    from base b
  )
  select
    e.tenant_id,
    case
      when exists (
        select 1 from unnest(e.raw_conditions) c where c like 'critical|%'
      ) then 'critical'
      when exists (
        select 1 from unnest(e.raw_conditions) c where c like 'warn|%'
      ) then 'warn'
      else 'ok'
    end                                                    as health,
    array(
      select split_part(c, '|', 2)
      from   unnest(e.raw_conditions) c
    )                                                      as reasons
  from evaluated e;
end;
$$;

revoke all on function public.get_tenant_health_indicators(uuid[]) from public;
grant execute on function public.get_tenant_health_indicators(uuid[]) to authenticated;


create or replace function public.get_tenant_vitals(p_tenant_id uuid)
returns table(
  -- Activity
  last_activity_at          timestamptz,
  seven_day_event_count     int,
  seven_day_active_members  int,
  member_last_sign_in_at    timestamptz,
  -- Data counts
  component_count           int,
  bom_count                 int,
  open_order_count          int,
  supplier_count            int,
  -- Shopify
  shopify_connected         bool,
  shopify_store_domain      text,
  shopify_last_synced_at    timestamptz,
  shopify_last_sync_status  text,
  shopify_last_sync_error   text,
  -- Accounting (most recent active connection)
  accounting_provider           text,
  accounting_account_name       text,
  accounting_token_expires_at   timestamptz,
  accounting_token_expired      bool,
  accounting_thirty_day_synced  int,
  accounting_thirty_day_failed  int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acct_conn_id uuid;
begin
  if not public.is_platform_operator() then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;

  -- Capture most recent active accounting connection id once
  select ac.id into v_acct_conn_id
  from   public.accounting_connection ac
  where  ac.tenant_id = p_tenant_id
    and  ac.is_active = true
  order  by ac.connected_at desc
  limit  1;

  return query
  select
    -- Activity
    (select max(al.created_at)
     from   public.activity_log al
     where  al.tenant_id = p_tenant_id)                                   as last_activity_at,

    (select count(*)::int
     from   public.activity_log al
     where  al.tenant_id = p_tenant_id
       and  al.created_at >= now() - interval '7 days')                   as seven_day_event_count,

    (select count(distinct al.actor_id)::int
     from   public.activity_log al
     where  al.tenant_id = p_tenant_id
       and  al.created_at >= now() - interval '7 days')                   as seven_day_active_members,

    (select max(u.last_sign_in_at)
     from   auth.users u
     inner  join public.profile_tenant_access pta on pta.profile_id = u.id
     where  pta.tenant_id = p_tenant_id)                                  as member_last_sign_in_at,

    -- Data counts
    (select count(*)::int from public.component  where tenant_id = p_tenant_id) as component_count,
    (select count(*)::int from public.product_bom where tenant_id = p_tenant_id) as bom_count,
    (select count(*)::int from public.orders
     where  tenant_id = p_tenant_id
       and  status not in ('fulfilled', 'cancelled'))                     as open_order_count,
    (select count(*)::int from public.supplier   where tenant_id = p_tenant_id) as supplier_count,

    -- Shopify
    (ss.store_domain is not null)                                         as shopify_connected,
    ss.store_domain                                                        as shopify_store_domain,
    ss.last_synced_at                                                      as shopify_last_synced_at,
    ss.last_sync_status                                                    as shopify_last_sync_status,
    (ss.last_sync_meta ->> 'error')::text                                 as shopify_last_sync_error,

    -- Accounting
    ac.provider                                                            as accounting_provider,
    ac.account_name                                                        as accounting_account_name,
    ac.token_expires_at                                                    as accounting_token_expires_at,
    (ac.token_expires_at < now())                                         as accounting_token_expired,

    (select count(*)::int
     from   public.accounting_sync_event ase
     where  ase.connection_id = v_acct_conn_id
       and  ase.status = 'synced'
       and  ase.synced_at >= now() - interval '30 days')                  as accounting_thirty_day_synced,

    (select count(*)::int
     from   public.accounting_sync_event ase
     where  ase.connection_id = v_acct_conn_id
       and  ase.status = 'failed'
       and  ase.synced_at >= now() - interval '30 days')                  as accounting_thirty_day_failed

  from       (select 1) dummy
  left join  public.shopify_store        ss  on ss.tenant_id = p_tenant_id
  left join  public.accounting_connection ac  on ac.id = v_acct_conn_id;
end;
$$;

revoke all on function public.get_tenant_vitals(uuid) from public;
grant execute on function public.get_tenant_vitals(uuid) to authenticated;
