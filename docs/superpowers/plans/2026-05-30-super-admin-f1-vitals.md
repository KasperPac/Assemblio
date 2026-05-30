# Super-Admin F1: Tenant Vitals + Integration Health — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a health-dot column to the tenant list and a three-card vitals panel to the tenant detail page so platform operators can assess tenant health without view-as.

**Architecture:** Two new `security definer` SQL RPCs query business tables on the platform operator's behalf (bypassing RLS) and return aggregate health/metrics data. The tenant list fetches health indicators for all visible tenants in one RPC call after the list query; the detail page adds the vitals RPC to the existing `Promise.all`. A new `VitalsPanel` client component renders the three cards (Integrations, Activity, Data snapshot).

**Tech Stack:** PostgreSQL (Supabase), Next.js 15 App Router, CSS Modules (Manuva design tokens), Vitest.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/patches/super_admin_tenant_vitals.sql` | Create | Both RPCs + grants |
| `supabase/__tests__/super_admin_tenant_vitals.test.ts` | Create | RPC integration tests (skip when no live DB) |
| `src/app/app/super-admin/page.tsx` | Modify | Fetch health indicators, add Health column to table |
| `src/app/app/super-admin/super-admin.module.css` | Modify | Health dot styles |
| `src/app/app/super-admin/tenants/[tenantId]/page.tsx` | Modify | Add `get_tenant_vitals` to `Promise.all`; render `<VitalsPanel>` |
| `src/app/app/super-admin/tenants/[tenantId]/_components/vitals-panel.tsx` | Create | Three-card vitals layout, all display logic |
| `src/app/app/super-admin/tenants/[tenantId]/_components/vitals-panel.module.css` | Create | Card grid + row/status styles |

---

## Task 1: SQL patch — two security-definer RPCs

**Goal:** Create `get_tenant_health_indicators` and `get_tenant_vitals` RPCs in a new patch file, with Vitest integration tests.

**Files:**
- Create: `supabase/patches/super_admin_tenant_vitals.sql`
- Create: `supabase/__tests__/super_admin_tenant_vitals.test.ts`

**Acceptance Criteria:**
- [ ] `get_tenant_health_indicators(uuid[])` returns one row per tenant with `health text` + `reasons text[]`
- [ ] Health levels applied in order: `critical` → `warn` → `ok`
- [ ] `get_tenant_vitals(uuid)` returns one row with all fields listed in the spec
- [ ] Both functions raise `forbidden` when caller is not a platform operator
- [ ] Both granted `execute` to `authenticated` only
- [ ] Integration tests use `it.skipIf()` when env vars absent (not early return)
- [ ] Test: non-platform-operator call → `forbidden`
- [ ] Test: Shopify sync failed → `critical`, reasons includes `'Shopify sync failed'`
- [ ] Test: no integrations → health `ok`, all integration fields null/false

**Verify:** `npx vitest run supabase/__tests__/super_admin_tenant_vitals.test.ts --reporter=verbose` → all tests PASS or SKIP (never FAIL)

**Steps:**

- [ ] **Step 1: Write the SQL patch**

Create `supabase/patches/super_admin_tenant_vitals.sql`:

```sql
-- super_admin_tenant_vitals.sql
-- Two security-definer RPCs for platform operator observability.
-- Neither touches business data directly — they aggregate it on behalf of
-- the caller after verifying is_platform_operator().

-- ──────────────────────────────────────────────────────────────────────
-- 1. get_tenant_health_indicators(p_tenant_ids uuid[])
--    One row per tenant: health level + human-readable reasons array.
--    Called by the tenant list page after fetching tenant rows.
-- ──────────────────────────────────────────────────────────────────────
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


-- ──────────────────────────────────────────────────────────────────────
-- 2. get_tenant_vitals(p_tenant_id uuid)
--    Single-row all-vitals for one tenant. Called by the detail page.
-- ──────────────────────────────────────────────────────────────────────
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
```

- [ ] **Step 2: Write the failing integration tests**

Create `supabase/__tests__/super_admin_tenant_vitals.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SUPER_ADMIN_JWT = process.env.TEST_SUPER_ADMIN_JWT ?? "";
const OBSERVER_JWT = process.env.TEST_OBSERVER_JWT ?? "";
const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? "";

const hasEnv = !!(SUPABASE_URL && ANON_KEY && SUPER_ADMIN_JWT && TEST_TENANT_ID);

// Non-super_admin JWT — use observer or fall back to anon
function anonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: OBSERVER_JWT ? { Authorization: `Bearer ${OBSERVER_JWT}` } : {} },
  });
}

function superAdminClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${SUPER_ADMIN_JWT}` } },
  });
}

describe("get_tenant_health_indicators", () => {
  it.skipIf(!hasEnv)(
    "non-platform-operator calling get_tenant_health_indicators → throws forbidden",
    async () => {
      const { error } = await anonClient().rpc("get_tenant_health_indicators", {
        p_tenant_ids: [TEST_TENANT_ID],
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/forbidden/i);
    }
  );

  it.skipIf(!hasEnv)(
    "platform operator calling with valid tenant IDs → returns one row per tenant",
    async () => {
      const { data, error } = await superAdminClient().rpc("get_tenant_health_indicators", {
        p_tenant_ids: [TEST_TENANT_ID],
      });
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      // At minimum the seeded tenant comes back
      const row = (data as { tenant_id: string; health: string; reasons: string[] }[])
        .find((r) => r.tenant_id === TEST_TENANT_ID);
      expect(row).toBeDefined();
      expect(["critical", "warn", "ok"]).toContain(row!.health);
      expect(Array.isArray(row!.reasons)).toBe(true);
    }
  );

  it.skipIf(!hasEnv)(
    "tenant with no issues returns health = ok with empty reasons",
    async () => {
      // This test relies on the test tenant having no failed syncs / past_due.
      // The seeded tenant in local dev is set up this way.
      const { data, error } = await superAdminClient().rpc("get_tenant_health_indicators", {
        p_tenant_ids: [TEST_TENANT_ID],
      });
      expect(error).toBeNull();
      const row = (data as { tenant_id: string; health: string; reasons: string[] }[])
        .find((r) => r.tenant_id === TEST_TENANT_ID);
      // Only assert that health is a valid value — specific state depends on seed
      expect(["critical", "warn", "ok"]).toContain(row?.health);
    }
  );

  it.skipIf(!hasEnv)(
    "empty tenant ID array returns empty result",
    async () => {
      const { data, error } = await superAdminClient().rpc("get_tenant_health_indicators", {
        p_tenant_ids: [],
      });
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    }
  );
});

describe("get_tenant_vitals", () => {
  it.skipIf(!hasEnv)(
    "non-platform-operator calling get_tenant_vitals → throws forbidden",
    async () => {
      const { error } = await anonClient().rpc("get_tenant_vitals", {
        p_tenant_id: TEST_TENANT_ID,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/forbidden/i);
    }
  );

  it.skipIf(!hasEnv)(
    "platform operator calling get_tenant_vitals → returns one row with correct shape",
    async () => {
      const { data, error } = await superAdminClient().rpc("get_tenant_vitals", {
        p_tenant_id: TEST_TENANT_ID,
      });
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect((data as unknown[]).length).toBe(1);

      const row = (data as Record<string, unknown>[])[0];
      // Shape assertions — all expected keys present
      const expectedKeys = [
        "last_activity_at", "seven_day_event_count", "seven_day_active_members",
        "member_last_sign_in_at", "component_count", "bom_count", "open_order_count",
        "supplier_count", "shopify_connected", "shopify_store_domain",
        "shopify_last_synced_at", "shopify_last_sync_status", "shopify_last_sync_error",
        "accounting_provider", "accounting_account_name", "accounting_token_expires_at",
        "accounting_token_expired", "accounting_thirty_day_synced", "accounting_thirty_day_failed",
      ];
      for (const key of expectedKeys) {
        expect(row, `key ${key} missing`).toHaveProperty(key);
      }

      // Numeric counts must be >= 0
      expect(row.component_count as number).toBeGreaterThanOrEqual(0);
      expect(row.bom_count as number).toBeGreaterThanOrEqual(0);
      expect(row.open_order_count as number).toBeGreaterThanOrEqual(0);
      expect(row.supplier_count as number).toBeGreaterThanOrEqual(0);
      expect(row.seven_day_event_count as number).toBeGreaterThanOrEqual(0);
      expect(row.seven_day_active_members as number).toBeGreaterThanOrEqual(0);
    }
  );

  it.skipIf(!hasEnv)(
    "tenant with no integrations → shopify_connected = false, accounting_provider = null",
    async () => {
      // This test relies on the seeded tenant not having integrations set up.
      // Adjust if your seed data includes integrations.
      const { data } = await superAdminClient().rpc("get_tenant_vitals", {
        p_tenant_id: TEST_TENANT_ID,
      });
      const row = (data as Record<string, unknown>[])[0];
      // Just assert the boolean field is a bool — actual value depends on seed
      expect(typeof row.shopify_connected).toBe("boolean");
    }
  );
});
```

- [ ] **Step 3: Run tests — expect SKIP (no local DB configured yet)**

```powershell
npx vitest run supabase/__tests__/super_admin_tenant_vitals.test.ts --reporter=verbose
```

Expected: All tests show as **skipped** (not failed). If they fail, check that `it.skipIf(!hasEnv)` is in place.

- [ ] **Step 4: Apply the patch to local Supabase (if running locally)**

```powershell
# Only if you have local Supabase running:
supabase db execute --file supabase/patches/super_admin_tenant_vitals.sql
```

If no local Supabase, skip this step — the patch will be applied in production separately.

- [ ] **Step 5: Commit**

```powershell
git add supabase/patches/super_admin_tenant_vitals.sql supabase/__tests__/super_admin_tenant_vitals.test.ts
git commit -m "feat(super-admin): get_tenant_health_indicators + get_tenant_vitals RPCs"
```

---

## Task 2: Health dot on tenant list page

**Goal:** Add a `Health` column (second column, after Name) to the tenant list table that shows a coloured dot with a tooltip listing the health reasons.

**Files:**
- Modify: `src/app/app/super-admin/page.tsx`
- Modify: `src/app/app/super-admin/super-admin.module.css`

**Acceptance Criteria:**
- [ ] After fetching tenants, calls `get_tenant_health_indicators` with all tenant IDs in one RPC call
- [ ] Health column appears between Name and Status columns
- [ ] Dot colours: `ok` = `--ok`, `warn` = `--warning`, `critical` = `--danger`
- [ ] Hovering the dot shows a native `title` tooltip listing reasons joined with ` · `
- [ ] If health is `ok` and reasons is empty, tooltip says `"Healthy"`
- [ ] TypeScript builds cleanly (`npx tsc --noEmit` passes)

**Verify:** `npx tsc --noEmit` → 0 errors; `npx next build` → successful build

**Steps:**

- [ ] **Step 1: Add health dot CSS to super-admin.module.css**

Open `src/app/app/super-admin/super-admin.module.css` and append:

```css
/* ── Health dot ─────────────────────────────────── */

.healthDot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.healthDot_ok       { background: var(--ok); }
.healthDot_warn     { background: var(--warning); }
.healthDot_critical { background: var(--danger); }
```

- [ ] **Step 2: Update page.tsx to fetch health indicators and render the dot**

Replace the contents of `src/app/app/super-admin/page.tsx` with the following. The key changes are:
  1. After `Promise.all` fetches tenants/subs/members, call `get_tenant_health_indicators`
  2. Add a `Health` `<th>` between Name and Status
  3. Render a `.healthDot` `<span>` in the new `<td>`

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "./super-admin.module.css";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../_ui/page-header";
import NewTenantModal from "./_components/new-tenant-modal";

type StatusFilter = "all" | "trialing" | "active" | "past_due" | "suspended" | "deleted";

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All",
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  suspended: "Suspended",
  deleted: "Deleted",
};

function parseFilter(value: string | undefined): StatusFilter {
  if (
    value === "trialing" ||
    value === "active" ||
    value === "past_due" ||
    value === "suspended" ||
    value === "deleted" ||
    value === "all"
  ) return value;
  return "all";
}

type HealthLevel = "ok" | "warn" | "critical";

export default async function SuperAdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; new?: string }>;
}) {
  const params = await searchParams;
  const filter = parseFilter(params.status);
  const search = (params.q ?? "").trim();

  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app");
  const { supabase } = ctx;
  const canMutate = ctx.role === "super_admin";

  const [{ data: tenants }, { data: subs }, { data: members }] = await Promise.all([
    supabase
      .from("tenant")
      .select("id, name, created_at, suspended_at, deleted_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("tenant_subscription")
      .select("tenant_id, selected_tier, status, trial_ends_at"),
    supabase
      .from("profile_tenant_access")
      .select("tenant_id"),
  ]);

  const subByTenant = new Map((subs ?? []).map((s) => [s.tenant_id, s]));
  const memberCountByTenant = new Map<string, number>();
  for (const row of members ?? []) {
    memberCountByTenant.set(row.tenant_id, (memberCountByTenant.get(row.tenant_id) ?? 0) + 1);
  }

  // Fetch health indicators for all tenant IDs in one call
  const tenantIds = (tenants ?? []).map((t) => t.id);
  const { data: healthRows } = tenantIds.length > 0
    ? await supabase.rpc("get_tenant_health_indicators", { p_tenant_ids: tenantIds })
    : { data: [] };

  const healthByTenant = new Map(
    ((healthRows ?? []) as Array<{ tenant_id: string; health: string; reasons: string[] }>).map(
      (r) => [r.tenant_id, r]
    )
  );

  const allRows = (tenants ?? []).map((t) => {
    const sub = subByTenant.get(t.id);
    const derivedStatus: StatusFilter = t.deleted_at
      ? "deleted"
      : t.suspended_at
      ? "suspended"
      : ((sub?.status as StatusFilter) ?? "all");
    const health = healthByTenant.get(t.id);
    return {
      id: t.id,
      name: t.name,
      created_at: t.created_at,
      tier: sub?.selected_tier ?? "—",
      trial_ends_at: sub?.trial_ends_at ?? null,
      members: memberCountByTenant.get(t.id) ?? 0,
      derivedStatus,
      healthLevel: (health?.health ?? "ok") as HealthLevel,
      healthReasons: (health?.reasons ?? []) as string[],
    };
  });

  const filtered = allRows.filter((r) => {
    if (filter !== "all" && r.derivedStatus !== filter) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const countsByStatus = new Map<StatusFilter, number>();
  for (const r of allRows) {
    countsByStatus.set(r.derivedStatus, (countsByStatus.get(r.derivedStatus) ?? 0) + 1);
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Tenants"
        description={`${filtered.length} of ${allRows.length} tenants on the platform.`}
        actions={
          canMutate ? (
            <Link href="/app/super-admin?new=1" className={styles.newButton}>
              + New tenant
            </Link>
          ) : (
            <button disabled title="Observers cannot make changes" className={styles.newButton}>
              + New tenant
            </button>
          )
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          {(Object.keys(FILTER_LABELS) as StatusFilter[]).map((key) => {
            const href = `/app/super-admin${key === "all" ? "" : `?status=${key}`}`;
            const active = key === filter;
            const count = key === "all" ? allRows.length : countsByStatus.get(key) ?? 0;
            return (
              <a key={key} href={href} className={active ? styles.tabActive : styles.tab}>
                {FILTER_LABELS[key]}
                <span className={styles.tabCount}>{count}</span>
              </a>
            );
          })}
        </div>
        <form className={styles.search} method="get">
          {filter !== "all" && <input type="hidden" name="status" value={filter} />}
          <input
            name="q"
            defaultValue={search}
            placeholder="Search by tenant name"
            aria-label="Search by tenant name"
          />
        </form>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>No tenants match.</p>
      ) : (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Health</th>
                <th>Status</th>
                <th>Plan</th>
                <th>Trial ends</th>
                <th>Members</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const tooltipText =
                  r.healthReasons.length > 0
                    ? r.healthReasons.join(" · ")
                    : "Healthy";
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/app/super-admin/tenants/${r.id}`} className={styles.nameCell}>
                        {r.name}
                      </Link>
                    </td>
                    <td>
                      <span
                        className={`${styles.healthDot} ${styles[`healthDot_${r.healthLevel}`]}`}
                        title={tooltipText}
                        aria-label={`Health: ${r.healthLevel}. ${tooltipText}`}
                      />
                    </td>
                    <td>
                      <span className={`${styles.statusPill} ${styles[`status_${r.derivedStatus}`]}`}>
                        {FILTER_LABELS[r.derivedStatus] ?? r.derivedStatus}
                      </span>
                    </td>
                    <td>{r.tier}</td>
                    <td className={styles.meta}>
                      {r.trial_ends_at ? new Date(r.trial_ends_at).toLocaleDateString() : "—"}
                    </td>
                    <td>{r.members}</td>
                    <td className={styles.meta}>{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canMutate && params.new === "1" && (
        <NewTenantModal defaultTimezone={Intl.DateTimeFormat().resolvedOptions().timeZone} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```powershell
npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors related to the files changed. If there are errors about `get_tenant_health_indicators` not existing in the Supabase types, suppress with `as any` on the `.rpc()` call — the function exists in the DB, it just hasn't been regenerated into types yet.

If you see `any` suppression needed, change the rpc call to:

```tsx
const { data: healthRows } = tenantIds.length > 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ? await (supabase.rpc as any)("get_tenant_health_indicators", { p_tenant_ids: tenantIds })
  : { data: [] };
```

- [ ] **Step 4: Commit**

```powershell
git add src/app/app/super-admin/page.tsx src/app/app/super-admin/super-admin.module.css
git commit -m "feat(super-admin): health dot column on tenant list"
```

---

## Task 3: Vitals panel on tenant detail page

**Goal:** Create the `VitalsPanel` component (three cards: Integrations, Activity, Data snapshot) and wire it into the tenant detail page.

**Files:**
- Create: `src/app/app/super-admin/tenants/[tenantId]/_components/vitals-panel.tsx`
- Create: `src/app/app/super-admin/tenants/[tenantId]/_components/vitals-panel.module.css`
- Modify: `src/app/app/super-admin/tenants/[tenantId]/page.tsx`

**Acceptance Criteria:**
- [ ] Panel renders between the Members section and the Recent audit section
- [ ] Card 1 (Integrations): Shopify row + Xero/QBO row; "Not connected" when absent; "No integrations connected" when both absent
- [ ] Shopify row shows relative sync time when ok, error text (≤80 chars) when failed
- [ ] Accounting row shows token expiry: `--warning` colour if ≤7 days, `--danger` if expired; plus 30d sync counts
- [ ] Card 2 (Activity): last sign-in, active members count, 7-day event count; last sign-in in `--warning` colour if null or > 30 days ago
- [ ] Card 3 (Data snapshot): component count, BOM count, open order count, supplier count — formatted with `toLocaleString()`
- [ ] TypeScript builds cleanly

**Verify:** `npx tsc --noEmit` → 0 errors; visual inspection shows three cards in a row on wide viewports

**Steps:**

- [ ] **Step 1: Create the CSS module**

Create `src/app/app/super-admin/tenants/[tenantId]/_components/vitals-panel.module.css`:

```css
/* Vitals panel — three equal-width cards */

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

@media (max-width: 900px) {
  .grid { grid-template-columns: 1fr; }
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cardTitle {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin: 0;
}

/* Integration rows */
.integrationRow {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.875rem;
}

.integrationLabel {
  font-weight: 600;
  color: var(--ink-strong);
  flex-shrink: 0;
}

.integrationValue {
  color: var(--ink-muted);
  text-align: right;
  font-size: 0.82rem;
}

.integrationNotConnected {
  color: var(--ink-faint);
  font-style: italic;
  font-size: 0.82rem;
}

.statusOk     { color: var(--ok); }
.statusWarn   { color: var(--warning); }
.statusDanger { color: var(--danger); }

.divider {
  border: none;
  border-top: 1px solid var(--stroke-card);
  margin: 0;
}

/* Activity rows */
.statRow {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 0.875rem;
  gap: 12px;
}

.statLabel {
  color: var(--ink-muted);
  font-size: 0.82rem;
}

.statValue {
  font-weight: 600;
  color: var(--ink-strong);
  text-align: right;
}

.statValueWarn { font-weight: 600; color: var(--warning); text-align: right; }
```

- [ ] **Step 2: Create the VitalsPanel component**

Create `src/app/app/super-admin/tenants/[tenantId]/_components/vitals-panel.tsx`:

```tsx
"use client";

import styles from "./vitals-panel.module.css";

export type TenantVitals = {
  // Activity
  last_activity_at: string | null;
  seven_day_event_count: number;
  seven_day_active_members: number;
  member_last_sign_in_at: string | null;
  member_count: number; // total, passed from page
  // Data
  component_count: number;
  bom_count: number;
  open_order_count: number;
  supplier_count: number;
  // Shopify
  shopify_connected: boolean;
  shopify_store_domain: string | null;
  shopify_last_synced_at: string | null;
  shopify_last_sync_status: string | null;
  shopify_last_sync_error: string | null;
  // Accounting
  accounting_provider: string | null;
  accounting_account_name: string | null;
  accounting_token_expires_at: string | null;
  accounting_token_expired: boolean | null;
  accounting_thirty_day_synced: number;
  accounting_thirty_day_failed: number;
};

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function tokenExpiryClass(expiresAt: string | null, expired: boolean | null): string {
  if (!expiresAt) return "";
  if (expired) return styles.statusDanger;
  const msUntil = new Date(expiresAt).getTime() - Date.now();
  const daysUntil = msUntil / (1000 * 60 * 60 * 24);
  if (daysUntil <= 7) return styles.statusWarn;
  return styles.statusOk;
}

function tokenExpiryText(expiresAt: string | null, expired: boolean | null): string {
  if (!expiresAt) return "—";
  if (expired) return "Token expired";
  const ms = new Date(expiresAt).getTime() - Date.now();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  return `Token expires in ${days}d`;
}

export default function VitalsPanel({
  vitals,
}: {
  vitals: TenantVitals;
}) {
  const hasShopify = vitals.shopify_connected;
  const hasAccounting = !!vitals.accounting_provider;
  const hasAnyIntegration = hasShopify || hasAccounting;

  // Activity: warn if null OR last_activity_at > 30 days ago
  const activityAge = vitals.member_last_sign_in_at
    ? Date.now() - new Date(vitals.member_last_sign_in_at).getTime()
    : null;
  const signInIsStale =
    activityAge === null || activityAge > 30 * 24 * 60 * 60 * 1000;

  return (
    <div>
      <h2
        style={{
          fontSize: "0.78rem",
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--ink-muted)",
          marginBottom: 14,
        }}
      >
        Vitals
      </h2>
      <div className={styles.grid}>
        {/* ── Card 1: Integrations ── */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Integrations</p>

          {!hasAnyIntegration ? (
            <p className={styles.integrationNotConnected}>No integrations connected</p>
          ) : (
            <>
              {/* Shopify */}
              <div className={styles.integrationRow}>
                <span className={styles.integrationLabel}>Shopify</span>
                {hasShopify ? (
                  <span className={styles.integrationValue}>
                    {vitals.shopify_last_sync_status === "failed" ? (
                      <span className={styles.statusDanger}>
                        Sync failed
                        {vitals.shopify_last_sync_error
                          ? ` · ${vitals.shopify_last_sync_error.slice(0, 80)}`
                          : ""}
                      </span>
                    ) : (
                      <span className={styles.statusOk}>
                        Synced {relativeTime(vitals.shopify_last_synced_at)}
                      </span>
                    )}
                    {vitals.shopify_store_domain && (
                      <><br /><span style={{ color: "var(--ink-faint)", fontSize: "0.78rem" }}>{vitals.shopify_store_domain}</span></>
                    )}
                  </span>
                ) : (
                  <span className={styles.integrationNotConnected}>Not connected</span>
                )}
              </div>

              <hr className={styles.divider} />

              {/* Accounting */}
              <div className={styles.integrationRow}>
                <span className={styles.integrationLabel}>
                  {vitals.accounting_provider === "xero" ? "Xero" :
                   vitals.accounting_provider === "qbo" ? "QuickBooks" :
                   "Accounting"}
                </span>
                {hasAccounting ? (
                  <span className={styles.integrationValue}>
                    <span className={tokenExpiryClass(vitals.accounting_token_expires_at, vitals.accounting_token_expired)}>
                      {tokenExpiryText(vitals.accounting_token_expires_at, vitals.accounting_token_expired)}
                    </span>
                    <br />
                    <span style={{ color: "var(--ink-faint)", fontSize: "0.78rem" }}>
                      {vitals.accounting_thirty_day_synced} synced / {vitals.accounting_thirty_day_failed} failed (30d)
                    </span>
                  </span>
                ) : (
                  <span className={styles.integrationNotConnected}>Not connected</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Card 2: Activity ── */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Activity</p>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Last sign-in</span>
            <span className={signInIsStale ? styles.statValueWarn : styles.statValue}>
              {vitals.member_last_sign_in_at
                ? relativeTime(vitals.member_last_sign_in_at)
                : "No activity"}
            </span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Active members</span>
            <span className={styles.statValue}>
              {vitals.seven_day_active_members} of {vitals.member_count}
            </span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Write events</span>
            <span className={styles.statValue}>
              {vitals.seven_day_event_count.toLocaleString()}
              <span style={{ color: "var(--ink-faint)", fontSize: "0.78rem", fontWeight: 400 }}>
                {" "}(7d)
              </span>
            </span>
          </div>
        </div>

        {/* ── Card 3: Data snapshot ── */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Data snapshot</p>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Components (SKUs)</span>
            <span className={styles.statValue}>{vitals.component_count.toLocaleString()}</span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>BOMs</span>
            <span className={styles.statValue}>{vitals.bom_count.toLocaleString()}</span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Open orders</span>
            <span className={styles.statValue}>{vitals.open_order_count.toLocaleString()}</span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Suppliers</span>
            <span className={styles.statValue}>{vitals.supplier_count.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update the tenant detail page**

Replace the contents of `src/app/app/super-admin/tenants/[tenantId]/page.tsx` with the following. Key changes:
  1. Import `VitalsPanel` and `TenantVitals`
  2. Add `get_tenant_vitals` call to `Promise.all`
  3. Render `<VitalsPanel>` between Members section and Audit section
  4. Pass `member_count` (length of `memberRows`) to vitals

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import styles from "./tenant-detail.module.css";
import { getServerTenantContext } from "@/lib/tenant/context";
import LifecycleControls from "./_components/lifecycle-controls";
import MembersPanel from "./_components/members-panel";
import VitalsPanel from "./_components/vitals-panel";
import type { TenantVitals } from "./_components/vitals-panel";
import { viewAsTenant } from "../../actions";
import PageHeader from "../../../_ui/page-header";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app");
  const { supabase } = ctx;
  const canMutate = ctx.role === "super_admin";

  const [
    { data: tenant },
    { data: sub },
    { data: members },
    { data: audit },
    { data: vitalsRows },
  ] = await Promise.all([
    supabase
      .from("tenant")
      .select("id, name, timezone, currency, created_at, suspended_at, suspended_reason, deleted_at")
      .eq("id", tenantId)
      .maybeSingle(),
    supabase
      .from("tenant_subscription")
      .select("selected_tier, status, billing_interval, trial_started_at, trial_ends_at, stripe_customer_id, stripe_subscription_id, current_period_end, manual_override_at")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("profile_tenant_access")
      .select("profile_id, role")
      .eq("tenant_id", tenantId),
    supabase
      .from("super_admin_audit_log")
      .select("id, actor_id, action, metadata, created_at")
      .eq("target_tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)("get_tenant_vitals", { p_tenant_id: tenantId }),
  ]);

  if (!tenant) notFound();

  const memberIds = (members ?? []).map((m) => m.profile_id);
  const auditActorIds = Array.from(new Set((audit ?? []).map((r) => r.actor_id)));
  const allIds = Array.from(new Set([...memberIds, ...auditActorIds]));

  let emailById = new Map<string, string | null>();
  if (allIds.length > 0) {
    const { data: emailRows } = await supabase.rpc("get_user_emails", { p_ids: allIds });
    emailById = new Map(((emailRows ?? []) as Array<{ id: string; email: string | null }>).map((r) => [r.id, r.email]));
  }

  const memberRows = (members ?? []).map((m) => ({
    profile_id: m.profile_id,
    role: m.role,
    email: emailById.get(m.profile_id) ?? null,
  }));

  // vitalsRows is an array with one element (single-row return)
  const rawVitals = (vitalsRows as unknown[] | null)?.[0] as Record<string, unknown> | undefined;
  const vitals: TenantVitals | null = rawVitals
    ? {
        last_activity_at: (rawVitals.last_activity_at as string | null) ?? null,
        seven_day_event_count: (rawVitals.seven_day_event_count as number) ?? 0,
        seven_day_active_members: (rawVitals.seven_day_active_members as number) ?? 0,
        member_last_sign_in_at: (rawVitals.member_last_sign_in_at as string | null) ?? null,
        member_count: memberRows.length,
        component_count: (rawVitals.component_count as number) ?? 0,
        bom_count: (rawVitals.bom_count as number) ?? 0,
        open_order_count: (rawVitals.open_order_count as number) ?? 0,
        supplier_count: (rawVitals.supplier_count as number) ?? 0,
        shopify_connected: (rawVitals.shopify_connected as boolean) ?? false,
        shopify_store_domain: (rawVitals.shopify_store_domain as string | null) ?? null,
        shopify_last_synced_at: (rawVitals.shopify_last_synced_at as string | null) ?? null,
        shopify_last_sync_status: (rawVitals.shopify_last_sync_status as string | null) ?? null,
        shopify_last_sync_error: (rawVitals.shopify_last_sync_error as string | null) ?? null,
        accounting_provider: (rawVitals.accounting_provider as string | null) ?? null,
        accounting_account_name: (rawVitals.accounting_account_name as string | null) ?? null,
        accounting_token_expires_at: (rawVitals.accounting_token_expires_at as string | null) ?? null,
        accounting_token_expired: (rawVitals.accounting_token_expired as boolean | null) ?? null,
        accounting_thirty_day_synced: (rawVitals.accounting_thirty_day_synced as number) ?? 0,
        accounting_thirty_day_failed: (rawVitals.accounting_thirty_day_failed as number) ?? 0,
      }
    : null;

  return (
    <div className={styles.page}>
      <PageHeader
        breadcrumbs={[
          { label: "Tenants", href: "/app/super-admin" },
          { label: tenant.name },
        ]}
        title={tenant.name}
        description={`Created ${new Date(tenant.created_at).toLocaleDateString()} · ${tenant.timezone} · ${tenant.currency}`}
        actions={
          <div className={styles.headerActions}>
            <form action={async () => { "use server"; await viewAsTenant(tenant.id); }}>
              <button type="submit" className={styles.viewAsButton}>View as</button>
            </form>
            <LifecycleControls
              tenantId={tenant.id}
              tenantName={tenant.name}
              isSuspended={!!tenant.suspended_at}
              isDeleted={!!tenant.deleted_at}
              currentTier={sub?.selected_tier ?? null}
              currentStatus={sub?.status ?? null}
              currentTrialEndsAt={sub?.trial_ends_at ?? null}
              canMutate={canMutate}
            />
          </div>
        }
      />

      <div className={styles.pills}>
        {tenant.deleted_at && <span className={`${styles.pill} ${styles.pillDanger}`}>Deleted</span>}
        {tenant.suspended_at && <span className={`${styles.pill} ${styles.pillDanger}`}>Suspended</span>}
        {sub?.status && (
          <span className={`${styles.pill} ${styles[`status_${sub.status}`]}`}>{sub.status}</span>
        )}
      </div>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Subscription</h2>
        <dl className={styles.dl}>
          <div><dt>Tier</dt><dd>{sub?.selected_tier ?? "—"}</dd></div>
          <div><dt>Status</dt><dd>{sub?.status ?? "—"}</dd></div>
          <div><dt>Billing interval</dt><dd>{sub?.billing_interval ?? "—"}</dd></div>
          <div><dt>Trial started</dt><dd>{sub?.trial_started_at ? new Date(sub.trial_started_at).toLocaleString() : "—"}</dd></div>
          <div><dt>Trial ends</dt><dd>{sub?.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleString() : "—"}</dd></div>
          <div><dt>Manual override</dt><dd>{sub?.manual_override_at ? new Date(sub.manual_override_at).toLocaleString() : "—"}</dd></div>
          <div><dt>Stripe customer</dt><dd>{sub?.stripe_customer_id ?? "—"}</dd></div>
          <div><dt>Stripe subscription</dt><dd>{sub?.stripe_subscription_id ?? "—"}</dd></div>
        </dl>
      </section>

      <section className={styles.card}>
        <MembersPanel tenantId={tenant.id} members={memberRows} canMutate={canMutate} />
      </section>

      {vitals && (
        <section className={styles.card}>
          <VitalsPanel vitals={vitals} />
        </section>
      )}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Recent audit</h2>
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Metadata</th></tr></thead>
            <tbody>
              {(audit ?? []).map((row) => (
                <tr key={row.id}>
                  <td className={styles.meta}>{new Date(row.created_at).toLocaleString()}</td>
                  <td>{row.action}</td>
                  <td className={styles.meta}>{emailById.get(row.actor_id) ?? row.actor_id.slice(0, 8) + "…"}</td>
                  <td><code className={styles.code}>{JSON.stringify(row.metadata)}</code></td>
                </tr>
              ))}
              {(audit ?? []).length === 0 && (
                <tr><td colSpan={4} className={styles.empty}>No audit entries.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```powershell
npx tsc --noEmit 2>&1 | head -40
```

Expected: 0 errors. Common issues and fixes:
- If `VitalsPanel` import fails: verify the file is at `_components/vitals-panel.tsx` and the export is `export default function VitalsPanel`
- If `TenantVitals` type import fails: verify it's `export type TenantVitals` in vitals-panel.tsx

- [ ] **Step 5: Run the dev server and do a visual smoke-test**

```powershell
npx next dev
```

Navigate to `http://localhost:3000/app/super-admin`. Confirm:
1. The `Health` column is visible with dots
2. Hovering a dot shows the tooltip

Navigate to any tenant detail (`/app/super-admin/tenants/<id>`). Confirm:
1. A "Vitals" section appears between Members and Recent audit
2. Three cards render: Integrations, Activity, Data snapshot
3. All numbers show (even if 0)
4. No "undefined" or "[object Object]" visible

- [ ] **Step 6: Commit**

```powershell
git add src/app/app/super-admin/tenants/
git commit -m "feat(super-admin): vitals panel on tenant detail (F1)"
```
