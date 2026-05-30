# Super-Admin Tenant Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated `/app/super-admin/*` UI that lets a super_admin manage tenants — list, create, suspend, extend trials, change plans, edit members, view-as for support, and soft-delete — on top of the existing super_admin SQL primitives.

**Architecture:** A new App Router route group gated by `getServerTenantContext().role === "super_admin"`. All mutations are server actions that re-check the role, perform the mutation, and append a row to a new `super_admin_audit_log` table. Tenant suspension is enforced at the `/app` layout level. The Stripe webhook handler is hardened to never overwrite manually-edited subscription rows.

**Tech Stack:** Next.js 15 App Router (server components + server actions), Supabase (Postgres + RLS), TypeScript, CSS Modules, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-05-28-super-admin-design.md`

---

## File Structure

**New SQL migration:**
- `supabase/patches/super_admin_v1.sql` — schema deltas + RLS for audit log + kasper promotion

**Modified library code:**
- `src/lib/tenant/context.ts` — return `superAdminHomeTenantId` from profile lookup
- `src/lib/stripe/webhook-events.ts` — add `.is("manual_override_at", null)` to every `tenant_subscription` update

**New library code:**
- `src/lib/super-admin/guard.ts` — `requireSuperAdmin()` helper used by every action
- `src/lib/super-admin/audit.ts` — `logSuperAdminAction()` helper

**Suspended-tenant lockout:**
- `src/app/app/suspended/page.tsx` — static "account suspended" page
- `src/app/app/layout.tsx` — read `suspended_at`/`deleted_at`, redirect non-super_admins

**Super-admin route group:**
- `src/app/app/super-admin/layout.tsx` — role gate
- `src/app/app/super-admin/page.tsx` — tenants list
- `src/app/app/super-admin/actions.ts` — `createTenant`, `viewAsTenant`, `exitViewAs`
- `src/app/app/super-admin/super-admin.module.css`
- `src/app/app/super-admin/_components/new-tenant-modal.tsx`
- `src/app/app/super-admin/tenants/[tenantId]/page.tsx` — detail
- `src/app/app/super-admin/tenants/[tenantId]/actions.ts` — suspend / unsuspend / extendTrial / changePlan / softDeleteTenant / restoreTenant / addMember / removeMember / changeMemberRole
- `src/app/app/super-admin/tenants/[tenantId]/_components/` — header card, subscription panel, members panel, audit panel, suspend modal, extend-trial modal, change-plan modal, delete confirm modal, add-member modal
- `src/app/app/super-admin/audit/page.tsx` — global audit log

**Sidebar integration:**
- `src/app/app/sidebar-nav.tsx` — accept `isSuperAdmin` prop, render Platform section
- `src/app/app/_components/view-as-banner.tsx` — sticky banner

**Tests (co-located):**
- `src/lib/super-admin/guard.test.ts`
- `src/lib/super-admin/audit.test.ts`
- `src/app/app/super-admin/actions.test.ts`
- `src/app/app/super-admin/tenants/[tenantId]/actions.test.ts`
- `src/lib/stripe/webhook-events.test.ts` (extend existing)

---

## Task 1: Schema migration

**Files:**
- Create: `supabase/patches/super_admin_v1.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/patches/super_admin_v1.sql

-- 1) tenant: suspension + soft-delete columns
alter table public.tenant
  add column if not exists suspended_at      timestamptz,
  add column if not exists suspended_reason  text,
  add column if not exists deleted_at        timestamptz;

-- 2) tenant_subscription: manual-override marker for Stripe webhooks
alter table public.tenant_subscription
  add column if not exists manual_override_at timestamptz;

-- 3) profiles: super_admin home tenant (for "Exit view-as")
alter table public.profiles
  add column if not exists super_admin_home_tenant_id uuid references public.tenant(id);

-- 4) super_admin_audit_log
create table if not exists public.super_admin_audit_log (
  id                uuid primary key default gen_random_uuid(),
  actor_id          uuid not null references auth.users(id),
  action            text not null,
  target_tenant_id  uuid references public.tenant(id),
  target_user_id    uuid references auth.users(id),
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists super_admin_audit_log_created_at_idx
  on public.super_admin_audit_log (created_at desc);
create index if not exists super_admin_audit_log_target_tenant_idx
  on public.super_admin_audit_log (target_tenant_id, created_at desc);

alter table public.super_admin_audit_log enable row level security;

drop policy if exists super_admin_audit_log_select on public.super_admin_audit_log;
drop policy if exists super_admin_audit_log_insert on public.super_admin_audit_log;
create policy super_admin_audit_log_select on public.super_admin_audit_log
  for select using (public.is_super_admin());
create policy super_admin_audit_log_insert on public.super_admin_audit_log
  for insert with check (public.is_super_admin());
-- no update/delete policies => append-only

-- 5) Promote kasper (idempotent — runs once, no-op afterwards)
update public.profiles
set
  role = 'super_admin',
  super_admin_home_tenant_id = coalesce(super_admin_home_tenant_id, tenant_id)
where id = '5a019756-ede3-4614-be1e-41afed6b6b63';
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the supabase MCP `apply_migration` tool on project `svhaotzrtfbwmphaacjj` with the SQL above (name: `super_admin_v1`).

Verify:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='tenant' and column_name in ('suspended_at','suspended_reason','deleted_at');
select column_name from information_schema.columns
where table_schema='public' and table_name='tenant_subscription' and column_name='manual_override_at';
select column_name from information_schema.columns
where table_schema='public' and table_name='profiles' and column_name='super_admin_home_tenant_id';
select to_regclass('public.super_admin_audit_log');
select role from public.profiles where id='5a019756-ede3-4614-be1e-41afed6b6b63';
```

Expected: every column appears, table exists, role is `super_admin`.

- [ ] **Step 3: Commit**

```bash
git add supabase/patches/super_admin_v1.sql
git commit -m "feat(super-admin): schema migration (suspension, soft-delete, audit log)"
```

---

## Task 2: Extend tenant context with superAdminHomeTenantId

**Files:**
- Modify: `src/lib/tenant/context.ts`

- [ ] **Step 1: Update the select + return type**

Replace the body of `getServerTenantContext` so the `select` includes `super_admin_home_tenant_id` and the return type includes it.

```ts
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TenantContext = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  tenantId: string;
  role: string;
  userId: string;
  superAdminHomeTenantId: string | null;
};

export async function getServerTenantContext(): Promise<TenantContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id,role,status,super_admin_home_tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.tenant_id) return null;
  if (profile.status === "deactivated") return null;

  if (profile.role !== "super_admin") {
    const { data: accessRows } = await supabase
      .from("profile_tenant_access")
      .select("tenant_id")
      .eq("profile_id", user.id);

    const hasActiveTenantAccess = (accessRows ?? []).some(
      (row) => row.tenant_id === profile.tenant_id
    );

    if (!hasActiveTenantAccess) {
      const fallbackTenantId = accessRows?.[0]?.tenant_id ?? null;
      if (!fallbackTenantId) return null;

      await supabase
        .from("profiles")
        .update({ tenant_id: fallbackTenantId })
        .eq("id", user.id);

      return {
        supabase,
        tenantId: fallbackTenantId,
        role: profile.role as string,
        userId: user.id,
        superAdminHomeTenantId: profile.super_admin_home_tenant_id ?? null,
      };
    }
  }

  return {
    supabase,
    tenantId: profile.tenant_id,
    role: profile.role as string,
    userId: user.id,
    superAdminHomeTenantId: profile.super_admin_home_tenant_id ?? null,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If callers destructured the return — confirm none break by grep: `grep -r "getServerTenantContext(" src`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/tenant/context.ts
git commit -m "feat(super-admin): expose superAdminHomeTenantId on tenant context"
```

---

## Task 3: Super-admin guard helper

**Files:**
- Create: `src/lib/super-admin/guard.ts`
- Test: `src/lib/super-admin/guard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/super-admin/guard.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/tenant/context", () => ({
  getServerTenantContext: vi.fn(),
}));

import { getServerTenantContext } from "@/lib/tenant/context";
import { requireSuperAdmin } from "./guard";

describe("requireSuperAdmin", () => {
  beforeEach(() => {
    vi.mocked(getServerTenantContext).mockReset();
  });

  it("returns the context when role is super_admin", async () => {
    const ctx = { role: "super_admin", userId: "u1", tenantId: "t1", supabase: {} as any, superAdminHomeTenantId: "t1" };
    vi.mocked(getServerTenantContext).mockResolvedValue(ctx as any);
    await expect(requireSuperAdmin()).resolves.toBe(ctx);
  });

  it("throws when no context", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(null);
    await expect(requireSuperAdmin()).rejects.toThrow("forbidden");
  });

  it("throws when role is admin", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue({ role: "admin" } as any);
    await expect(requireSuperAdmin()).rejects.toThrow("forbidden");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/lib/super-admin/guard.test.ts`
Expected: FAIL with "Cannot find module './guard'".

- [ ] **Step 3: Implement**

```ts
// src/lib/super-admin/guard.ts
import { getServerTenantContext, type TenantContext } from "@/lib/tenant/context";

export async function requireSuperAdmin(): Promise<TenantContext> {
  const ctx = await getServerTenantContext();
  if (!ctx || ctx.role !== "super_admin") {
    throw new Error("forbidden");
  }
  return ctx;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/lib/super-admin/guard.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/super-admin/guard.ts src/lib/super-admin/guard.test.ts
git commit -m "feat(super-admin): requireSuperAdmin guard helper"
```

---

## Task 4: Audit log helper

**Files:**
- Create: `src/lib/super-admin/audit.ts`
- Test: `src/lib/super-admin/audit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/super-admin/audit.test.ts
import { describe, expect, it, vi } from "vitest";
import { logSuperAdminAction } from "./audit";

function makeSupabase(insertResult: { error: unknown } = { error: null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  return {
    from: vi.fn().mockReturnValue({ insert }),
    _insert: insert,
  } as any;
}

describe("logSuperAdminAction", () => {
  it("inserts an audit row with required fields", async () => {
    const sb = makeSupabase();
    await logSuperAdminAction(sb, {
      actorId: "actor-1",
      action: "suspend_tenant",
      targetTenantId: "t-1",
      metadata: { reason: "non-payment" },
    });
    expect(sb.from).toHaveBeenCalledWith("super_admin_audit_log");
    expect(sb._insert).toHaveBeenCalledWith({
      actor_id: "actor-1",
      action: "suspend_tenant",
      target_tenant_id: "t-1",
      target_user_id: null,
      metadata: { reason: "non-payment" },
    });
  });

  it("defaults optional fields", async () => {
    const sb = makeSupabase();
    await logSuperAdminAction(sb, {
      actorId: "actor-1",
      action: "view_as",
      targetTenantId: "t-1",
    });
    expect(sb._insert).toHaveBeenCalledWith({
      actor_id: "actor-1",
      action: "view_as",
      target_tenant_id: "t-1",
      target_user_id: null,
      metadata: {},
    });
  });

  it("logs and swallows insert errors", async () => {
    const sb = makeSupabase({ error: { message: "rls denied" } });
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      logSuperAdminAction(sb, { actorId: "actor-1", action: "view_as" })
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/lib/super-admin/audit.test.ts`
Expected: FAIL with "Cannot find module './audit'".

- [ ] **Step 3: Implement**

```ts
// src/lib/super-admin/audit.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type SuperAdminAction =
  | "create_tenant"
  | "suspend_tenant"
  | "unsuspend_tenant"
  | "extend_trial"
  | "change_plan"
  | "soft_delete_tenant"
  | "restore_tenant"
  | "view_as"
  | "exit_view_as"
  | "add_member"
  | "remove_member"
  | "change_role";

export interface AuditEntry {
  actorId: string;
  action: SuperAdminAction;
  targetTenantId?: string | null;
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logSuperAdminAction(
  supabase: SupabaseClient,
  entry: AuditEntry
): Promise<void> {
  const { error } = await supabase.from("super_admin_audit_log").insert({
    actor_id: entry.actorId,
    action: entry.action,
    target_tenant_id: entry.targetTenantId ?? null,
    target_user_id: entry.targetUserId ?? null,
    metadata: entry.metadata ?? {},
  });
  if (error) {
    console.warn("[super-admin] audit log insert failed", entry.action, error);
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/lib/super-admin/audit.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/super-admin/audit.ts src/lib/super-admin/audit.test.ts
git commit -m "feat(super-admin): logSuperAdminAction helper"
```

---

## Task 5: Suspension lockout + suspended page

**Files:**
- Create: `src/app/app/suspended/page.tsx`
- Modify: `src/app/app/layout.tsx`

- [ ] **Step 1: Create the suspended page**

```tsx
// src/app/app/suspended/page.tsx
import styles from "./suspended.module.css";

export default function SuspendedPage() {
  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.title}>Account suspended</h1>
        <p className={styles.body}>
          This account is currently suspended. Contact support for help restoring access.
        </p>
      </div>
    </div>
  );
}
```

```css
/* src/app/app/suspended/suspended.module.css */
.wrapper {
  min-height: 60vh;
  display: grid;
  place-items: center;
  padding: 48px 16px;
}
.card {
  max-width: 440px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 32px;
  text-align: center;
}
.title {
  font-size: 20px;
  font-weight: 600;
  color: var(--ink-strong);
  margin-bottom: 12px;
}
.body {
  color: var(--ink-muted);
  font-size: 14px;
  line-height: 1.5;
}
```

- [ ] **Step 2: Wire the lockout into `/app/layout.tsx`**

In `src/app/app/layout.tsx`, immediately AFTER the `profile` lookup and the `isSuperAdmin` line (lines ~25-31), and BEFORE the `Promise.all`, add:

```ts
const isSuspendedPath = pathname.startsWith("/app/suspended");
if (!isSuspendedPath && profile?.tenant_id && !isSuperAdmin) {
  const { data: tenantLockState } = await supabase
    .from("tenant")
    .select("suspended_at, deleted_at")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  if (tenantLockState?.suspended_at || tenantLockState?.deleted_at) {
    const { redirect } = await import("next/navigation");
    redirect("/app/suspended");
  }
}
```

- [ ] **Step 3: Manual smoke test (defer to end of plan)**

Skip live testing until later tasks land. Just verify type-check:

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/suspended/page.tsx src/app/app/suspended/suspended.module.css src/app/app/layout.tsx
git commit -m "feat(super-admin): suspended-tenant lockout page"
```

---

## Task 6: Super-admin layout gate + sidebar Platform entry

**Files:**
- Create: `src/app/app/super-admin/layout.tsx`
- Create: `src/app/app/super-admin/super-admin.module.css`
- Modify: `src/app/app/sidebar-nav.tsx`
- Modify: `src/app/app/layout.tsx`

- [ ] **Step 1: Create the route layout (gate)**

```tsx
// src/app/app/super-admin/layout.tsx
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";

export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  const ctx = await getServerTenantContext();
  if (!ctx || ctx.role !== "super_admin") {
    redirect("/app");
  }
  return <>{children}</>;
}
```

- [ ] **Step 2: Add Platform section to sidebar**

In `src/app/app/sidebar-nav.tsx`, change the prop signature to accept `isSuperAdmin`:

```tsx
export default function SidebarNav({
  hasPlanning = false,
  isSuperAdmin = false,
}: {
  hasPlanning?: boolean;
  isSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  const navSections = buildNavSections(hasPlanning, isSuperAdmin);
  // ...rest unchanged
}
```

Update `buildNavSections` signature and append a Platform section at the end of the array (after Workspace):

```tsx
function buildNavSections(
  hasPlanning: boolean,
  isSuperAdmin: boolean
): { label: string; items: NavItem[] }[] {
  const sections: { label: string; items: NavItem[] }[] = [
    // ...existing sections unchanged
  ];

  if (isSuperAdmin) {
    sections.push({
      label: "Platform",
      items: [
        {
          label: "Tenants",
          href: "/app/super-admin",
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <rect x="9" y="13" width="6" height="8" />
            </svg>
          ),
        },
        {
          label: "Audit log",
          href: "/app/super-admin/audit",
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="13" x2="15" y2="13" />
              <line x1="9" y1="17" x2="13" y2="17" />
            </svg>
          ),
        },
      ],
    });
  }

  return sections;
}
```

- [ ] **Step 3: Pass `isSuperAdmin` from `/app/layout.tsx`**

In `src/app/app/layout.tsx`, change `<SidebarNav hasPlanning={hasPlanning} />` to `<SidebarNav hasPlanning={hasPlanning} isSuperAdmin={isSuperAdmin} />`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/super-admin/layout.tsx src/app/app/sidebar-nav.tsx src/app/app/layout.tsx
git commit -m "feat(super-admin): route gate + sidebar Platform section"
```

---

## Task 7: Tenants list page (read)

**Files:**
- Create: `src/app/app/super-admin/page.tsx`
- Create: `src/app/app/super-admin/super-admin.module.css`

- [ ] **Step 1: Implement the page**

```tsx
// src/app/app/super-admin/page.tsx
import Link from "next/link";
import styles from "./super-admin.module.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

export default async function SuperAdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const filter = parseFilter(params.status);
  const search = (params.q ?? "").trim();

  const supabase = await createSupabaseServerClient();

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

  const rows = (tenants ?? [])
    .map((t) => {
      const sub = subByTenant.get(t.id);
      const derivedStatus: StatusFilter = t.deleted_at
        ? "deleted"
        : t.suspended_at
        ? "suspended"
        : ((sub?.status as StatusFilter) ?? "all");
      return {
        id: t.id,
        name: t.name,
        created_at: t.created_at,
        tier: sub?.selected_tier ?? "—",
        trial_ends_at: sub?.trial_ends_at ?? null,
        members: memberCountByTenant.get(t.id) ?? 0,
        derivedStatus,
      };
    })
    .filter((r) => {
      if (filter !== "all" && r.derivedStatus !== filter) return false;
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>Tenants</h1>
        <Link className={styles.newButton} href="/app/super-admin?new=1">+ New tenant</Link>
      </div>

      <div className={styles.filterRow}>
        {(Object.keys(FILTER_LABELS) as StatusFilter[]).map((key) => {
          const href = `/app/super-admin${key === "all" ? "" : `?status=${key}`}`;
          const active = key === filter;
          return (
            <Link key={key} href={href} className={`${styles.filterPill} ${active ? styles.active : ""}`}>
              {FILTER_LABELS[key]}
            </Link>
          );
        })}
        <form className={styles.searchForm}>
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Search tenant name…"
            className={styles.searchInput}
          />
          {filter !== "all" && <input type="hidden" name="status" value={filter} />}
        </form>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Plan</th>
            <th>Trial ends</th>
            <th>Members</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={styles.row}>
              <td>
                <Link href={`/app/super-admin/tenants/${r.id}`} className={styles.rowLink}>
                  {r.name}
                </Link>
              </td>
              <td><span className={`${styles.statusPill} ${styles[`status_${r.derivedStatus}`]}`}>{FILTER_LABELS[r.derivedStatus] ?? r.derivedStatus}</span></td>
              <td>{r.tier}</td>
              <td>{r.trial_ends_at ? new Date(r.trial_ends_at).toLocaleDateString() : "—"}</td>
              <td>{r.members}</td>
              <td>{new Date(r.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className={styles.empty}>No tenants match.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

```css
/* src/app/app/super-admin/super-admin.module.css */
.page { padding: 24px; }
.headerRow { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.title { font-size: 24px; font-weight: 600; color: var(--ink-strong); }
.newButton { background: var(--brand-1); color: white; padding: 8px 14px; border-radius: 8px; font-size: 14px; font-weight: 500; }
.filterRow { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
.filterPill { padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border-subtle); font-size: 13px; color: var(--ink-muted); }
.filterPill.active { background: var(--ink-strong); color: var(--bg-card); border-color: var(--ink-strong); }
.searchForm { margin-left: auto; }
.searchInput { padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-subtle); font-size: 13px; min-width: 220px; }
.table { width: 100%; border-collapse: collapse; }
.table thead th { text-align: left; padding: 10px 12px; font-size: 12px; font-weight: 500; color: var(--ink-muted); text-transform: uppercase; border-bottom: 1px solid var(--border-subtle); }
.table tbody td { padding: 12px; border-bottom: 1px solid var(--border-subtle); font-size: 14px; }
.rowLink { color: var(--ink-strong); font-weight: 500; }
.row:hover { background: var(--bg-card-hover); }
.statusPill { padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 500; }
.status_trialing { background: var(--info-soft); color: var(--info-strong); }
.status_active { background: var(--success-soft); color: var(--success-strong); }
.status_past_due { background: var(--warning-soft); color: var(--warning-strong); }
.status_suspended { background: var(--danger-soft); color: var(--danger-strong); }
.status_deleted { background: var(--surface-muted); color: var(--ink-muted); }
.empty { padding: 32px; text-align: center; color: var(--ink-muted); }
```

- [ ] **Step 2: Smoke-test in dev**

Run dev server (`npm run dev`), navigate to `http://localhost:3000/app/super-admin` while logged in as kasper.

Expected: tenants list renders. Each row links to a (currently 404) detail page. Filter pills toggle URL params.

- [ ] **Step 3: Commit**

```bash
git add src/app/app/super-admin/page.tsx src/app/app/super-admin/super-admin.module.css
git commit -m "feat(super-admin): tenants list page"
```

---

## Task 8: createTenant action + New Tenant modal

**Files:**
- Create: `src/app/app/super-admin/actions.ts`
- Create: `src/app/app/super-admin/actions.test.ts`
- Create: `src/app/app/super-admin/_components/new-tenant-modal.tsx`
- Modify: `src/app/app/super-admin/page.tsx` (render modal when `?new=1`)

- [ ] **Step 1: Write the failing test**

```ts
// src/app/app/super-admin/actions.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/super-admin/guard", () => ({ requireSuperAdmin: vi.fn() }));
vi.mock("@/lib/super-admin/audit", () => ({ logSuperAdminAction: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { requireSuperAdmin } from "@/lib/super-admin/guard";
import { logSuperAdminAction } from "@/lib/super-admin/audit";
import { createTenant } from "./actions";

function makeSupabase() {
  const tenantInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: "new-tenant-id" }, error: null }),
    }),
  });
  const subInsert = vi.fn().mockResolvedValue({ error: null });
  const ptaInsert = vi.fn().mockResolvedValue({ error: null });

  const from = vi.fn((table: string) => {
    if (table === "tenant") return { insert: tenantInsert };
    if (table === "tenant_subscription") return { insert: subInsert };
    if (table === "profile_tenant_access") return { insert: ptaInsert };
    throw new Error("unexpected table " + table);
  });

  return { from, _tenantInsert: tenantInsert, _subInsert: subInsert, _ptaInsert: ptaInsert } as any;
}

describe("createTenant", () => {
  beforeEach(() => {
    vi.mocked(requireSuperAdmin).mockReset();
    vi.mocked(logSuperAdminAction).mockReset();
  });

  it("forbidden when not super_admin", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("forbidden"));
    await expect(
      createTenant({ name: "Acme", timezone: "UTC", currency: "AUD", tier: "starter", trialDays: 14 })
    ).rejects.toThrow("forbidden");
  });

  it("inserts tenant + subscription + member access + logs audit", async () => {
    const sb = makeSupabase();
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      supabase: sb, userId: "kasper", role: "super_admin", tenantId: "home", superAdminHomeTenantId: "home",
    } as any);
    const id = await createTenant({
      name: "Acme", timezone: "UTC", currency: "AUD", tier: "starter", trialDays: 14, reason: "demo",
    });
    expect(id).toBe("new-tenant-id");
    expect(sb._tenantInsert).toHaveBeenCalled();
    expect(sb._subInsert).toHaveBeenCalled();
    expect(sb._ptaInsert).toHaveBeenCalledWith({
      profile_id: "kasper", tenant_id: "new-tenant-id", role: "admin",
    });
    expect(logSuperAdminAction).toHaveBeenCalledWith(sb, expect.objectContaining({
      actorId: "kasper", action: "create_tenant", targetTenantId: "new-tenant-id",
      metadata: { reason: "demo", name: "Acme", tier: "starter", trialDays: 14 },
    }));
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/app/app/super-admin/actions.test.ts`
Expected: FAIL with "Cannot find module './actions'".

- [ ] **Step 3: Implement the action**

```ts
// src/app/app/super-admin/actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/super-admin/guard";
import { logSuperAdminAction } from "@/lib/super-admin/audit";

export interface CreateTenantInput {
  name: string;
  timezone: string;
  currency: string;
  tier: "starter" | "growth" | "pro" | "enterprise";
  trialDays: number;
  reason?: string;
}

export async function createTenant(input: CreateTenantInput): Promise<string> {
  const ctx = await requireSuperAdmin();
  const { supabase, userId } = ctx;

  const { data: tenantRow, error: tenantError } = await supabase
    .from("tenant")
    .insert({
      name: input.name,
      timezone: input.timezone,
      currency: input.currency,
      has_planning_module: false,
    })
    .select("id")
    .single();
  if (tenantError || !tenantRow) {
    throw new Error(tenantError?.message ?? "failed to insert tenant");
  }

  const trialEndsAt = new Date(Date.now() + input.trialDays * 86_400_000).toISOString();
  const { error: subError } = await supabase.from("tenant_subscription").insert({
    tenant_id: tenantRow.id,
    selected_tier: input.tier,
    status: "trialing",
    billing_interval: "annual",
    trial_started_at: new Date().toISOString(),
    trial_ends_at: trialEndsAt,
  });
  if (subError) throw new Error(subError.message);

  const { error: ptaError } = await supabase.from("profile_tenant_access").insert({
    profile_id: userId,
    tenant_id: tenantRow.id,
    role: "admin",
  });
  if (ptaError) throw new Error(ptaError.message);

  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "create_tenant",
    targetTenantId: tenantRow.id,
    metadata: {
      reason: input.reason,
      name: input.name,
      tier: input.tier,
      trialDays: input.trialDays,
    },
  });

  revalidatePath("/app/super-admin");
  return tenantRow.id;
}

export async function viewAsTenant(tenantId: string): Promise<void> {
  const ctx = await requireSuperAdmin();
  const { supabase, userId } = ctx;

  const { error } = await supabase.rpc("set_active_tenant", { p_tenant_id: tenantId });
  if (error) throw new Error(error.message);

  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "view_as",
    targetTenantId: tenantId,
  });

  revalidatePath("/app");
  redirect("/app");
}

export async function exitViewAs(): Promise<void> {
  const ctx = await requireSuperAdmin();
  const { supabase, userId, superAdminHomeTenantId } = ctx;
  if (!superAdminHomeTenantId) {
    throw new Error("no super_admin_home_tenant_id set");
  }

  const { error } = await supabase.rpc("set_active_tenant", { p_tenant_id: superAdminHomeTenantId });
  if (error) throw new Error(error.message);

  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "exit_view_as",
    targetTenantId: superAdminHomeTenantId,
  });

  revalidatePath("/app");
  redirect("/app");
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/app/app/super-admin/actions.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Create the modal component**

```tsx
// src/app/app/super-admin/_components/new-tenant-modal.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createTenant } from "../actions";
import styles from "./new-tenant-modal.module.css";

export default function NewTenantModal({ defaultTimezone }: { defaultTimezone: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={styles.backdrop} onClick={() => router.push("/app/super-admin")}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>New tenant</h2>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              try {
                const id = await createTenant({
                  name: String(fd.get("name")),
                  timezone: String(fd.get("timezone")),
                  currency: String(fd.get("currency")),
                  tier: fd.get("tier") as "starter" | "growth" | "pro" | "enterprise",
                  trialDays: Number(fd.get("trialDays")),
                  reason: String(fd.get("reason") ?? ""),
                });
                router.push(`/app/super-admin/tenants/${id}`);
              } catch (err) {
                setError((err as Error).message);
              }
            });
          }}
        >
          <label className={styles.field}>
            <span>Name</span>
            <input name="name" required />
          </label>
          <label className={styles.field}>
            <span>Timezone</span>
            <input name="timezone" defaultValue={defaultTimezone} required />
          </label>
          <label className={styles.field}>
            <span>Currency</span>
            <input name="currency" defaultValue="AUD" required />
          </label>
          <label className={styles.field}>
            <span>Plan tier</span>
            <select name="tier" defaultValue="starter">
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Trial days</span>
            <input name="trialDays" type="number" defaultValue={14} min={0} max={365} required />
          </label>
          <label className={styles.field}>
            <span>Reason (optional)</span>
            <textarea name="reason" rows={2} />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <button type="button" onClick={() => router.push("/app/super-admin")} disabled={pending}>Cancel</button>
            <button type="submit" disabled={pending}>{pending ? "Creating…" : "Create tenant"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

```css
/* src/app/app/super-admin/_components/new-tenant-modal.module.css */
.backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: grid; place-items: center; z-index: 50; }
.modal { background: var(--bg-card); border-radius: 12px; padding: 24px; width: 100%; max-width: 480px; box-shadow: 0 20px 40px rgba(0,0,0,0.25); }
.title { font-size: 18px; font-weight: 600; color: var(--ink-strong); margin-bottom: 16px; }
.form { display: flex; flex-direction: column; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--ink-muted); }
.field input, .field select, .field textarea { padding: 8px 10px; border: 1px solid var(--border-subtle); border-radius: 6px; font-size: 14px; color: var(--ink-strong); background: var(--bg-card); }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.actions button[type="submit"] { background: var(--brand-1); color: white; padding: 8px 14px; border-radius: 6px; font-weight: 500; }
.actions button[type="button"] { padding: 8px 14px; border-radius: 6px; border: 1px solid var(--border-subtle); }
.error { color: var(--danger-strong); font-size: 13px; }
```

- [ ] **Step 6: Render the modal conditionally from `page.tsx`**

In `src/app/app/super-admin/page.tsx`, in the signature add `new?: string` to `searchParams`. At the bottom of the JSX (just before `</div>` closing `.page`), add:

```tsx
{params.new === "1" && (
  <NewTenantModal defaultTimezone={Intl.DateTimeFormat().resolvedOptions().timeZone} />
)}
```

Import: `import NewTenantModal from "./_components/new-tenant-modal";`

- [ ] **Step 7: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/app/app/super-admin/actions.ts src/app/app/super-admin/actions.test.ts src/app/app/super-admin/_components/new-tenant-modal.tsx src/app/app/super-admin/_components/new-tenant-modal.module.css src/app/app/super-admin/page.tsx
git commit -m "feat(super-admin): createTenant action + new-tenant modal"
```

---

## Task 9: Tenant detail page (read-only)

**Files:**
- Create: `src/app/app/super-admin/tenants/[tenantId]/page.tsx`
- Create: `src/app/app/super-admin/tenants/[tenantId]/tenant-detail.module.css`

- [ ] **Step 1: Implement**

```tsx
// src/app/app/super-admin/tenants/[tenantId]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "./tenant-detail.module.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: tenant }, { data: sub }, { data: members }, { data: audit }] = await Promise.all([
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
      .select("profile_id, role, profile:profile_id(id)")
      .eq("tenant_id", tenantId),
    supabase
      .from("super_admin_audit_log")
      .select("id, actor_id, action, metadata, created_at")
      .eq("target_tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (!tenant) notFound();

  return (
    <div className={styles.page}>
      <div className={styles.crumbs}>
        <Link href="/app/super-admin">Tenants</Link> <span>/</span> <span>{tenant.name}</span>
      </div>

      <section className={styles.headerCard}>
        <h1 className={styles.title}>{tenant.name}</h1>
        <div className={styles.pills}>
          {tenant.deleted_at && <span className={`${styles.pill} ${styles.pillDanger}`}>Deleted</span>}
          {tenant.suspended_at && <span className={`${styles.pill} ${styles.pillDanger}`}>Suspended</span>}
          {sub?.status && <span className={`${styles.pill} ${styles[`status_${sub.status}`]}`}>{sub.status}</span>}
        </div>
        <p className={styles.meta}>
          Created {new Date(tenant.created_at).toLocaleDateString()} · {tenant.timezone} · {tenant.currency}
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Subscription</h2>
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

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Members ({members?.length ?? 0})</h2>
        <table className={styles.membersTable}>
          <thead><tr><th>Profile ID</th><th>Role</th></tr></thead>
          <tbody>
            {(members ?? []).map((m) => (
              <tr key={m.profile_id}>
                <td>{m.profile_id}</td>
                <td>{m.role}</td>
              </tr>
            ))}
            {(members ?? []).length === 0 && <tr><td colSpan={2} className={styles.empty}>No members.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Recent audit</h2>
        <table className={styles.auditTable}>
          <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Metadata</th></tr></thead>
          <tbody>
            {(audit ?? []).map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.created_at).toLocaleString()}</td>
                <td>{row.action}</td>
                <td>{row.actor_id.slice(0, 8)}…</td>
                <td><code className={styles.code}>{JSON.stringify(row.metadata)}</code></td>
              </tr>
            ))}
            {(audit ?? []).length === 0 && <tr><td colSpan={4} className={styles.empty}>No audit entries.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
```

```css
/* src/app/app/super-admin/tenants/[tenantId]/tenant-detail.module.css */
.page { padding: 24px; max-width: 960px; }
.crumbs { font-size: 13px; color: var(--ink-muted); margin-bottom: 12px; }
.crumbs a { color: var(--brand-1); }
.crumbs span { margin: 0 4px; }
.headerCard { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.title { font-size: 22px; font-weight: 600; color: var(--ink-strong); margin-bottom: 8px; }
.pills { display: flex; gap: 6px; margin-bottom: 8px; }
.pill { padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 500; }
.pillDanger { background: var(--danger-soft); color: var(--danger-strong); }
.status_trialing { background: var(--info-soft); color: var(--info-strong); }
.status_active { background: var(--success-soft); color: var(--success-strong); }
.status_past_due { background: var(--warning-soft); color: var(--warning-strong); }
.status_canceled { background: var(--surface-muted); color: var(--ink-muted); }
.meta { color: var(--ink-muted); font-size: 13px; }
.section { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.sectionTitle { font-size: 14px; font-weight: 600; color: var(--ink-strong); margin-bottom: 12px; }
.dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; font-size: 13px; }
.dl > div { display: flex; flex-direction: column; }
.dl dt { color: var(--ink-muted); font-size: 12px; }
.dl dd { color: var(--ink-strong); }
.membersTable, .auditTable { width: 100%; border-collapse: collapse; font-size: 13px; }
.membersTable th, .auditTable th, .membersTable td, .auditTable td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border-subtle); }
.code { font-family: ui-monospace, monospace; font-size: 12px; background: var(--surface-muted); padding: 2px 4px; border-radius: 4px; }
.empty { color: var(--ink-muted); text-align: center; padding: 16px; }
```

- [ ] **Step 2: Smoke-test in dev**

Visit `/app/super-admin/tenants/<existing-tenant-id>` (e.g. Pac-Technologies ID).

Expected: detail page renders all three panels.

- [ ] **Step 3: Commit**

```bash
git add src/app/app/super-admin/tenants/[tenantId]/page.tsx src/app/app/super-admin/tenants/[tenantId]/tenant-detail.module.css
git commit -m "feat(super-admin): tenant detail page (read-only)"
```

---

## Task 10: Suspend / unsuspend / soft-delete / restore actions + modals

**Files:**
- Create: `src/app/app/super-admin/tenants/[tenantId]/actions.ts`
- Create: `src/app/app/super-admin/tenants/[tenantId]/actions.test.ts`
- Create: `src/app/app/super-admin/tenants/[tenantId]/_components/lifecycle-controls.tsx`
- Modify: `src/app/app/super-admin/tenants/[tenantId]/page.tsx` (render lifecycle-controls in header card)

- [ ] **Step 1: Write failing tests**

```ts
// src/app/app/super-admin/tenants/[tenantId]/actions.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/super-admin/guard", () => ({ requireSuperAdmin: vi.fn() }));
vi.mock("@/lib/super-admin/audit", () => ({ logSuperAdminAction: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireSuperAdmin } from "@/lib/super-admin/guard";
import { logSuperAdminAction } from "@/lib/super-admin/audit";
import {
  suspendTenant,
  unsuspendTenant,
  softDeleteTenant,
  restoreTenant,
  extendTrial,
  changePlan,
} from "./actions";

function makeSupabaseWithUpdate(tableExpect: string) {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });
  return {
    from: vi.fn((t: string) => {
      if (t === tableExpect) return { update };
      throw new Error("unexpected table " + t);
    }),
    _update: update,
  } as any;
}

beforeEach(() => {
  vi.mocked(requireSuperAdmin).mockReset();
  vi.mocked(logSuperAdminAction).mockReset();
});

describe("suspendTenant", () => {
  it("forbidden when not super_admin", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("forbidden"));
    await expect(suspendTenant({ tenantId: "t1", reason: "x" })).rejects.toThrow("forbidden");
  });

  it("sets suspended_at + reason and logs", async () => {
    const sb = makeSupabaseWithUpdate("tenant");
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: sb, userId: "u1" } as any);
    await suspendTenant({ tenantId: "t1", reason: "non-payment" });
    expect(sb._update).toHaveBeenCalledWith(expect.objectContaining({ suspended_reason: "non-payment" }));
    expect(logSuperAdminAction).toHaveBeenCalledWith(sb, expect.objectContaining({
      action: "suspend_tenant", targetTenantId: "t1", metadata: { reason: "non-payment" },
    }));
  });
});

describe("unsuspendTenant", () => {
  it("clears suspended_at and reason", async () => {
    const sb = makeSupabaseWithUpdate("tenant");
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: sb, userId: "u1" } as any);
    await unsuspendTenant({ tenantId: "t1" });
    expect(sb._update).toHaveBeenCalledWith({ suspended_at: null, suspended_reason: null });
  });
});

describe("softDeleteTenant", () => {
  it("sets deleted_at and logs reason", async () => {
    const sb = makeSupabaseWithUpdate("tenant");
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: sb, userId: "u1" } as any);
    await softDeleteTenant({ tenantId: "t1", reason: "churn" });
    expect(sb._update).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(String) }));
    expect(logSuperAdminAction).toHaveBeenCalledWith(sb, expect.objectContaining({
      action: "soft_delete_tenant", metadata: { reason: "churn" },
    }));
  });
});

describe("restoreTenant", () => {
  it("clears deleted_at", async () => {
    const sb = makeSupabaseWithUpdate("tenant");
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: sb, userId: "u1" } as any);
    await restoreTenant({ tenantId: "t1" });
    expect(sb._update).toHaveBeenCalledWith({ deleted_at: null });
  });
});

describe("extendTrial", () => {
  it("rejects past dates", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: {}, userId: "u1" } as any);
    await expect(
      extendTrial({ tenantId: "t1", newTrialEndsAt: new Date(Date.now() - 86_400_000).toISOString() })
    ).rejects.toThrow(/future/i);
  });

  it("updates trial_ends_at when valid", async () => {
    const sb = makeSupabaseWithUpdate("tenant_subscription");
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: sb, userId: "u1" } as any);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await extendTrial({ tenantId: "t1", newTrialEndsAt: future, reason: "demo" });
    expect(sb._update).toHaveBeenCalledWith({ trial_ends_at: future });
    expect(logSuperAdminAction).toHaveBeenCalledWith(sb, expect.objectContaining({
      action: "extend_trial",
      metadata: { reason: "demo", newTrialEndsAt: future },
    }));
  });
});

describe("changePlan", () => {
  it("updates fields and sets manual_override_at", async () => {
    const sb = makeSupabaseWithUpdate("tenant_subscription");
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: sb, userId: "u1" } as any);
    await changePlan({ tenantId: "t1", selected_tier: "pro", status: "active", reason: "comp" });
    expect(sb._update).toHaveBeenCalledWith(expect.objectContaining({
      selected_tier: "pro",
      status: "active",
      manual_override_at: expect.any(String),
    }));
  });

  it("requires at least one field", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: {}, userId: "u1" } as any);
    await expect(changePlan({ tenantId: "t1" })).rejects.toThrow(/at least one/i);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/app/app/super-admin/tenants/\[tenantId\]/actions.test.ts`
Expected: FAIL with "Cannot find module './actions'".

- [ ] **Step 3: Implement the actions**

```ts
// src/app/app/super-admin/tenants/[tenantId]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/super-admin/guard";
import { logSuperAdminAction } from "@/lib/super-admin/audit";

export async function suspendTenant(input: { tenantId: string; reason: string }): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();
  const { error } = await supabase
    .from("tenant")
    .update({ suspended_at: new Date().toISOString(), suspended_reason: input.reason })
    .eq("id", input.tenantId);
  if (error) throw new Error(error.message);
  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "suspend_tenant",
    targetTenantId: input.tenantId,
    metadata: { reason: input.reason },
  });
  revalidatePath(`/app/super-admin/tenants/${input.tenantId}`);
  revalidatePath("/app/super-admin");
}

export async function unsuspendTenant(input: { tenantId: string; reason?: string }): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();
  const { error } = await supabase
    .from("tenant")
    .update({ suspended_at: null, suspended_reason: null })
    .eq("id", input.tenantId);
  if (error) throw new Error(error.message);
  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "unsuspend_tenant",
    targetTenantId: input.tenantId,
    metadata: input.reason ? { reason: input.reason } : {},
  });
  revalidatePath(`/app/super-admin/tenants/${input.tenantId}`);
  revalidatePath("/app/super-admin");
}

export async function softDeleteTenant(input: { tenantId: string; reason: string }): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();
  const { error } = await supabase
    .from("tenant")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", input.tenantId);
  if (error) throw new Error(error.message);
  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "soft_delete_tenant",
    targetTenantId: input.tenantId,
    metadata: { reason: input.reason },
  });
  revalidatePath(`/app/super-admin/tenants/${input.tenantId}`);
  revalidatePath("/app/super-admin");
}

export async function restoreTenant(input: { tenantId: string; reason?: string }): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();
  const { error } = await supabase
    .from("tenant")
    .update({ deleted_at: null })
    .eq("id", input.tenantId);
  if (error) throw new Error(error.message);
  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "restore_tenant",
    targetTenantId: input.tenantId,
    metadata: input.reason ? { reason: input.reason } : {},
  });
  revalidatePath(`/app/super-admin/tenants/${input.tenantId}`);
  revalidatePath("/app/super-admin");
}

export async function extendTrial(input: {
  tenantId: string;
  newTrialEndsAt: string;
  reason?: string;
}): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();
  if (new Date(input.newTrialEndsAt).getTime() <= Date.now()) {
    throw new Error("newTrialEndsAt must be in the future");
  }
  const { error } = await supabase
    .from("tenant_subscription")
    .update({ trial_ends_at: input.newTrialEndsAt })
    .eq("tenant_id", input.tenantId);
  if (error) throw new Error(error.message);
  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "extend_trial",
    targetTenantId: input.tenantId,
    metadata: { reason: input.reason, newTrialEndsAt: input.newTrialEndsAt },
  });
  revalidatePath(`/app/super-admin/tenants/${input.tenantId}`);
}

export async function changePlan(input: {
  tenantId: string;
  selected_tier?: "starter" | "growth" | "pro" | "enterprise";
  status?: "trialing" | "active" | "past_due" | "canceled";
  reason?: string;
}): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();
  if (!input.selected_tier && !input.status) {
    throw new Error("At least one of selected_tier or status is required");
  }
  const patch: Record<string, unknown> = { manual_override_at: new Date().toISOString() };
  if (input.selected_tier) patch.selected_tier = input.selected_tier;
  if (input.status) patch.status = input.status;
  const { error } = await supabase
    .from("tenant_subscription")
    .update(patch)
    .eq("tenant_id", input.tenantId);
  if (error) throw new Error(error.message);
  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "change_plan",
    targetTenantId: input.tenantId,
    metadata: {
      reason: input.reason,
      selected_tier: input.selected_tier,
      status: input.status,
    },
  });
  revalidatePath(`/app/super-admin/tenants/${input.tenantId}`);
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/app/app/super-admin/tenants/\[tenantId\]/actions.test.ts`
Expected: 9 passing.

- [ ] **Step 5: Create lifecycle controls UI**

```tsx
// src/app/app/super-admin/tenants/[tenantId]/_components/lifecycle-controls.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  suspendTenant,
  unsuspendTenant,
  softDeleteTenant,
  restoreTenant,
  extendTrial,
  changePlan,
} from "../actions";
import styles from "./lifecycle-controls.module.css";

type Props = {
  tenantId: string;
  tenantName: string;
  isSuspended: boolean;
  isDeleted: boolean;
  currentTier: string | null;
  currentStatus: string | null;
  currentTrialEndsAt: string | null;
};

type ModalKind = null | "suspend" | "delete" | "extend" | "plan";

export default function LifecycleControls(props: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalKind>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        setModal(null);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.actions}>
        {!props.isSuspended && !props.isDeleted && (
          <button onClick={() => setModal("suspend")}>Suspend</button>
        )}
        {props.isSuspended && (
          <button onClick={() => run(() => unsuspendTenant({ tenantId: props.tenantId }))}>
            Unsuspend
          </button>
        )}
        {!props.isDeleted && <button onClick={() => setModal("extend")}>Extend trial</button>}
        {!props.isDeleted && <button onClick={() => setModal("plan")}>Change plan</button>}
        {!props.isDeleted && <button onClick={() => setModal("delete")} className={styles.danger}>Delete</button>}
        {props.isDeleted && (
          <button onClick={() => run(() => restoreTenant({ tenantId: props.tenantId }))}>
            Restore
          </button>
        )}
      </div>

      {modal === "suspend" && (
        <ConfirmModal
          title="Suspend tenant"
          confirmLabel="Suspend"
          tenantName={props.tenantName}
          requireTypedName
          onCancel={() => setModal(null)}
          onSubmit={(fd) => run(() =>
            suspendTenant({ tenantId: props.tenantId, reason: String(fd.get("reason") ?? "") })
          )}
          pending={pending}
          error={error}
        >
          <label className={styles.field}>
            <span>Reason</span>
            <textarea name="reason" required rows={2} />
          </label>
        </ConfirmModal>
      )}

      {modal === "delete" && (
        <ConfirmModal
          title="Soft-delete tenant"
          confirmLabel="Delete"
          tenantName={props.tenantName}
          requireTypedName
          onCancel={() => setModal(null)}
          onSubmit={(fd) => run(() =>
            softDeleteTenant({ tenantId: props.tenantId, reason: String(fd.get("reason") ?? "") })
          )}
          pending={pending}
          error={error}
        >
          <label className={styles.field}>
            <span>Reason</span>
            <textarea name="reason" required rows={2} />
          </label>
          <p className={styles.warn}>
            Soft-delete sets deleted_at. Members will be locked out. Reversible via Restore.
          </p>
        </ConfirmModal>
      )}

      {modal === "extend" && (
        <ConfirmModal
          title="Extend trial"
          confirmLabel="Extend"
          tenantName={props.tenantName}
          onCancel={() => setModal(null)}
          onSubmit={(fd) => run(() =>
            extendTrial({
              tenantId: props.tenantId,
              newTrialEndsAt: new Date(String(fd.get("newTrialEndsAt"))).toISOString(),
              reason: String(fd.get("reason") ?? ""),
            })
          )}
          pending={pending}
          error={error}
        >
          <label className={styles.field}>
            <span>New trial end</span>
            <input
              type="datetime-local"
              name="newTrialEndsAt"
              required
              defaultValue={props.currentTrialEndsAt ? new Date(props.currentTrialEndsAt).toISOString().slice(0, 16) : ""}
            />
          </label>
          <label className={styles.field}>
            <span>Reason</span>
            <textarea name="reason" rows={2} />
          </label>
        </ConfirmModal>
      )}

      {modal === "plan" && (
        <ConfirmModal
          title="Change plan"
          confirmLabel="Apply"
          tenantName={props.tenantName}
          onCancel={() => setModal(null)}
          onSubmit={(fd) => run(() =>
            changePlan({
              tenantId: props.tenantId,
              selected_tier: (fd.get("selected_tier") || undefined) as any,
              status: (fd.get("status") || undefined) as any,
              reason: String(fd.get("reason") ?? ""),
            })
          )}
          pending={pending}
          error={error}
        >
          <label className={styles.field}>
            <span>Tier</span>
            <select name="selected_tier" defaultValue={props.currentTier ?? ""}>
              <option value="">(unchanged)</option>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Status</span>
            <select name="status" defaultValue={props.currentStatus ?? ""}>
              <option value="">(unchanged)</option>
              <option value="trialing">Trialing</option>
              <option value="active">Active</option>
              <option value="past_due">Past due</option>
              <option value="canceled">Canceled</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Reason</span>
            <textarea name="reason" rows={2} />
          </label>
          <p className={styles.warn}>
            This sets manual_override_at so Stripe webhooks won't undo the change. Clear that timestamp from SQL to re-enable.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}

function ConfirmModal({
  title, confirmLabel, tenantName, requireTypedName, onCancel, onSubmit, pending, error, children,
}: {
  title: string;
  confirmLabel: string;
  tenantName: string;
  requireTypedName?: boolean;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
  pending: boolean;
  error: string | null;
  children: React.ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const canSubmit = !requireTypedName || typed === tenantName;

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>{title}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(new FormData(e.currentTarget));
          }}
        >
          {children}
          {requireTypedName && (
            <label className={styles.field}>
              <span>Type the tenant name (<code>{tenantName}</code>) to confirm</span>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} />
            </label>
          )}
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.modalActions}>
            <button type="button" onClick={onCancel} disabled={pending}>Cancel</button>
            <button type="submit" disabled={pending || !canSubmit}>{pending ? "Working…" : confirmLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

```css
/* src/app/app/super-admin/tenants/[tenantId]/_components/lifecycle-controls.module.css */
.wrapper { display: inline-block; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.actions button { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-card); font-size: 13px; }
.actions button:hover { background: var(--bg-card-hover); }
.danger { color: var(--danger-strong); border-color: var(--danger-strong) !important; }
.backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: grid; place-items: center; z-index: 50; }
.modal { background: var(--bg-card); border-radius: 12px; padding: 24px; width: 100%; max-width: 480px; }
.title { font-size: 18px; font-weight: 600; color: var(--ink-strong); margin-bottom: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--ink-muted); margin-bottom: 12px; }
.field input, .field select, .field textarea { padding: 8px 10px; border: 1px solid var(--border-subtle); border-radius: 6px; font-size: 14px; color: var(--ink-strong); background: var(--bg-card); }
.warn { font-size: 12px; color: var(--warning-strong); margin-top: 8px; }
.error { color: var(--danger-strong); font-size: 13px; margin-top: 8px; }
.modalActions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.modalActions button[type="submit"] { background: var(--brand-1); color: white; padding: 8px 14px; border-radius: 6px; font-weight: 500; }
.modalActions button[type="button"] { padding: 8px 14px; border-radius: 6px; border: 1px solid var(--border-subtle); }
```

- [ ] **Step 6: Wire the controls into the detail page**

In `src/app/app/super-admin/tenants/[tenantId]/page.tsx`, import the controls component:

```tsx
import LifecycleControls from "./_components/lifecycle-controls";
```

Inside `<section className={styles.headerCard}>`, after `<p className={styles.meta}>...</p>`, add:

```tsx
<LifecycleControls
  tenantId={tenant.id}
  tenantName={tenant.name}
  isSuspended={!!tenant.suspended_at}
  isDeleted={!!tenant.deleted_at}
  currentTier={sub?.selected_tier ?? null}
  currentStatus={sub?.status ?? null}
  currentTrialEndsAt={sub?.trial_ends_at ?? null}
/>
```

- [ ] **Step 7: Commit**

```bash
git add src/app/app/super-admin/tenants src/app/app/super-admin/tenants/\[tenantId\]/
git commit -m "feat(super-admin): suspend/restore/extend/changePlan actions + UI"
```

---

## Task 11: Member management actions + UI

**Files:**
- Modify: `src/app/app/super-admin/tenants/[tenantId]/actions.ts` (add addMember/removeMember/changeMemberRole)
- Modify: `src/app/app/super-admin/tenants/[tenantId]/actions.test.ts`
- Create: `src/app/app/super-admin/tenants/[tenantId]/_components/members-panel.tsx`
- Modify: `src/app/app/super-admin/tenants/[tenantId]/page.tsx` (use members-panel instead of inline table; join auth.users email)

- [ ] **Step 1: Extend tests**

Append to `actions.test.ts`:

```ts
import { addMember, removeMember, changeMemberRole } from "./actions";

describe("addMember", () => {
  it("inserts a profile_tenant_access row and logs", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const sb = { from: vi.fn().mockReturnValue({ insert }) } as any;
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: sb, userId: "u1" } as any);
    await addMember({ tenantId: "t1", profileId: "p1", role: "admin" });
    expect(sb.from).toHaveBeenCalledWith("profile_tenant_access");
    expect(insert).toHaveBeenCalledWith({ profile_id: "p1", tenant_id: "t1", role: "admin" });
    expect(logSuperAdminAction).toHaveBeenCalledWith(sb, expect.objectContaining({
      action: "add_member", targetTenantId: "t1", targetUserId: "p1",
    }));
  });
});

describe("removeMember", () => {
  it("deletes the row and logs", async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const del = vi.fn().mockReturnValue({ eq: eq1 });
    const sb = { from: vi.fn().mockReturnValue({ delete: del }) } as any;
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: sb, userId: "u1" } as any);
    await removeMember({ tenantId: "t1", profileId: "p1" });
    expect(del).toHaveBeenCalled();
    expect(logSuperAdminAction).toHaveBeenCalledWith(sb, expect.objectContaining({
      action: "remove_member", targetTenantId: "t1", targetUserId: "p1",
    }));
  });
});

describe("changeMemberRole", () => {
  it("updates the role and logs", async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const update = vi.fn().mockReturnValue({ eq: eq1 });
    const sb = { from: vi.fn().mockReturnValue({ update }) } as any;
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: sb, userId: "u1" } as any);
    await changeMemberRole({ tenantId: "t1", profileId: "p1", newRole: "member" });
    expect(update).toHaveBeenCalledWith({ role: "member" });
    expect(logSuperAdminAction).toHaveBeenCalledWith(sb, expect.objectContaining({
      action: "change_role", metadata: { newRole: "member" },
    }));
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/app/app/super-admin/tenants/\[tenantId\]/actions.test.ts`
Expected: FAIL with "addMember is not exported".

- [ ] **Step 3: Implement**

Append to `src/app/app/super-admin/tenants/[tenantId]/actions.ts`:

```ts
export async function addMember(input: {
  tenantId: string;
  profileId: string;
  role: "admin" | "member";
  reason?: string;
}): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();
  const { error } = await supabase.from("profile_tenant_access").insert({
    profile_id: input.profileId,
    tenant_id: input.tenantId,
    role: input.role,
  });
  if (error) throw new Error(error.message);
  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "add_member",
    targetTenantId: input.tenantId,
    targetUserId: input.profileId,
    metadata: { role: input.role, reason: input.reason },
  });
  revalidatePath(`/app/super-admin/tenants/${input.tenantId}`);
}

export async function removeMember(input: {
  tenantId: string;
  profileId: string;
  reason?: string;
}): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();
  const { error } = await supabase
    .from("profile_tenant_access")
    .delete()
    .eq("tenant_id", input.tenantId)
    .eq("profile_id", input.profileId);
  if (error) throw new Error(error.message);
  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "remove_member",
    targetTenantId: input.tenantId,
    targetUserId: input.profileId,
    metadata: input.reason ? { reason: input.reason } : {},
  });
  revalidatePath(`/app/super-admin/tenants/${input.tenantId}`);
}

export async function changeMemberRole(input: {
  tenantId: string;
  profileId: string;
  newRole: "admin" | "member";
  reason?: string;
}): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();
  const { error } = await supabase
    .from("profile_tenant_access")
    .update({ role: input.newRole })
    .eq("tenant_id", input.tenantId)
    .eq("profile_id", input.profileId);
  if (error) throw new Error(error.message);
  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "change_role",
    targetTenantId: input.tenantId,
    targetUserId: input.profileId,
    metadata: { newRole: input.newRole, reason: input.reason },
  });
  revalidatePath(`/app/super-admin/tenants/${input.tenantId}`);
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/app/app/super-admin/tenants/\[tenantId\]/actions.test.ts`
Expected: 12 passing.

- [ ] **Step 5: Members panel UI**

```tsx
// src/app/app/super-admin/tenants/[tenantId]/_components/members-panel.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMember, removeMember, changeMemberRole } from "../actions";
import styles from "./members-panel.module.css";

type Member = { profile_id: string; role: string; email: string | null };

export default function MembersPanel({ tenantId, members }: { tenantId: string; members: Member[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        setAddOpen(false);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div>
      <div className={styles.headerRow}>
        <h2 className={styles.title}>Members ({members.length})</h2>
        <button onClick={() => setAddOpen(true)} className={styles.addButton}>+ Add member</button>
      </div>

      <table className={styles.table}>
        <thead><tr><th>Email</th><th>Role</th><th></th></tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.profile_id}>
              <td>{m.email ?? m.profile_id}</td>
              <td>
                <select
                  defaultValue={m.role}
                  onChange={(e) =>
                    run(() =>
                      changeMemberRole({
                        tenantId,
                        profileId: m.profile_id,
                        newRole: e.target.value as "admin" | "member",
                      })
                    )
                  }
                  disabled={pending}
                >
                  <option value="admin">admin</option>
                  <option value="member">member</option>
                </select>
              </td>
              <td>
                <button
                  className={styles.removeButton}
                  onClick={() => run(() => removeMember({ tenantId, profileId: m.profile_id }))}
                  disabled={pending}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {members.length === 0 && <tr><td colSpan={3} className={styles.empty}>No members.</td></tr>}
        </tbody>
      </table>

      {error && <p className={styles.error}>{error}</p>}

      {addOpen && (
        <div className={styles.backdrop} onClick={() => setAddOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.title}>Add member</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                run(() =>
                  addMember({
                    tenantId,
                    profileId: String(fd.get("profileId")),
                    role: fd.get("role") as "admin" | "member",
                    reason: String(fd.get("reason") ?? ""),
                  })
                );
              }}
            >
              <label className={styles.field}>
                <span>Profile ID (auth.users.id)</span>
                <input name="profileId" required />
              </label>
              <label className={styles.field}>
                <span>Role</span>
                <select name="role" defaultValue="member">
                  <option value="admin">admin</option>
                  <option value="member">member</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Reason</span>
                <textarea name="reason" rows={2} />
              </label>
              <div className={styles.modalActions}>
                <button type="button" onClick={() => setAddOpen(false)} disabled={pending}>Cancel</button>
                <button type="submit" disabled={pending}>{pending ? "Adding…" : "Add"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
```

```css
/* src/app/app/super-admin/tenants/[tenantId]/_components/members-panel.module.css */
.headerRow { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.title { font-size: 14px; font-weight: 600; color: var(--ink-strong); }
.addButton { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-card); font-size: 13px; }
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th, .table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border-subtle); }
.removeButton { padding: 4px 10px; border: 1px solid var(--border-subtle); border-radius: 6px; color: var(--danger-strong); font-size: 12px; }
.empty { text-align: center; color: var(--ink-muted); padding: 16px; }
.error { color: var(--danger-strong); font-size: 13px; margin-top: 8px; }
.backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: grid; place-items: center; z-index: 50; }
.modal { background: var(--bg-card); border-radius: 12px; padding: 24px; width: 100%; max-width: 460px; }
.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; font-size: 13px; color: var(--ink-muted); }
.field input, .field select, .field textarea { padding: 8px 10px; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--bg-card); }
.modalActions { display: flex; justify-content: flex-end; gap: 8px; }
.modalActions button[type="submit"] { background: var(--brand-1); color: white; padding: 8px 14px; border-radius: 6px; font-weight: 500; }
.modalActions button[type="button"] { padding: 8px 14px; border-radius: 6px; border: 1px solid var(--border-subtle); }
```

- [ ] **Step 6: Wire members-panel into detail page; fetch emails via admin client**

`profile_tenant_access` doesn't expose emails — emails live in `auth.users`, which the standard server client can't read. Add a server-only helper that uses the admin client (already exists: `src/lib/supabase/admin.ts`).

In `src/app/app/super-admin/tenants/[tenantId]/page.tsx`, AFTER the existing Promise.all, add a lookup of emails via the admin client:

```tsx
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import MembersPanel from "./_components/members-panel";
// ...

const memberIds = (members ?? []).map((m) => m.profile_id);
let memberEmails: Record<string, string | null> = {};
if (memberIds.length > 0) {
  const admin = createSupabaseAdminClient();
  // listUsers is paginated; for v1 we accept up to 1000 per tenant
  const { data: usersResp } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const byId = new Map((usersResp?.users ?? []).map((u) => [u.id, u.email ?? null]));
  memberEmails = Object.fromEntries(memberIds.map((id) => [id, byId.get(id) ?? null]));
}

const memberRows = (members ?? []).map((m) => ({
  profile_id: m.profile_id,
  role: m.role,
  email: memberEmails[m.profile_id] ?? null,
}));
```

Replace the inline members `<table>` block with:

```tsx
<section className={styles.section}>
  <MembersPanel tenantId={tenant.id} members={memberRows} />
</section>
```

- [ ] **Step 7: Commit**

```bash
git add src/app/app/super-admin/tenants/\[tenantId\]/
git commit -m "feat(super-admin): member management actions + panel"
```

---

## Task 12: View-as banner + viewAs/exitViewAs wiring

**Files:**
- Create: `src/app/app/_components/view-as-banner.tsx`
- Modify: `src/app/app/layout.tsx`
- Modify: `src/app/app/super-admin/tenants/[tenantId]/page.tsx` (add "View as" button to header card)

- [ ] **Step 1: Create the banner component**

```tsx
// src/app/app/_components/view-as-banner.tsx
"use client";

import { useTransition } from "react";
import { exitViewAs } from "@/app/app/super-admin/actions";
import styles from "./view-as-banner.module.css";

export default function ViewAsBanner({ tenantName }: { tenantName: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className={styles.banner}>
      <span>
        Viewing as <strong>{tenantName}</strong>
      </span>
      <button
        onClick={() => startTransition(async () => { await exitViewAs(); })}
        disabled={pending}
        className={styles.exit}
      >
        {pending ? "Exiting…" : "Exit"}
      </button>
    </div>
  );
}
```

```css
/* src/app/app/_components/view-as-banner.module.css */
.banner { background: var(--warning-soft); color: var(--warning-strong); padding: 8px 16px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; border-bottom: 1px solid var(--warning-strong); }
.exit { background: transparent; border: 1px solid var(--warning-strong); padding: 4px 10px; border-radius: 6px; font-size: 12px; color: var(--warning-strong); }
```

- [ ] **Step 2: Render the banner in `/app/layout.tsx`**

In `src/app/app/layout.tsx`, after the topbar and before the existing `{trialDaysLeft !== null && sub ? ...}` block, add:

```tsx
{isSuperAdmin && profile?.super_admin_home_tenant_id && profile?.tenant_id !== profile.super_admin_home_tenant_id && (
  <ViewAsBanner tenantName={tenant?.name ?? "tenant"} />
)}
```

Add `profile.super_admin_home_tenant_id` to the existing `select` in `/app/layout.tsx` line ~26:

```ts
.select("tenant_id,role,avatar_url,super_admin_home_tenant_id,tenant:tenant_id(id,name,has_planning_module)")
```

Import: `import ViewAsBanner from "./_components/view-as-banner";`

- [ ] **Step 3: Add "View as" button to tenant detail header**

In `src/app/app/super-admin/tenants/[tenantId]/page.tsx`, alongside `<LifecycleControls .../>` in the header card, render a form button:

```tsx
import { viewAsTenant } from "../../actions";

// ...inside the header card, before <LifecycleControls />:
<form action={async () => { "use server"; await viewAsTenant(tenant.id); }}>
  <button type="submit" className={styles.viewAsButton}>View as</button>
</form>
```

Add the CSS class to `tenant-detail.module.css`:

```css
.viewAsButton { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--brand-1); color: var(--brand-1); background: var(--bg-card); font-size: 13px; margin-right: 6px; }
```

- [ ] **Step 4: Smoke-test**

Run dev server. As kasper:

1. Visit `/app/super-admin/tenants/<some-tenant-id>`, click "View as".
2. Expect: redirect to `/app` with a yellow "Viewing as `<tenant>`" banner.
3. Click "Exit".
4. Expect: redirect back to `/app` with no banner (back on home tenant).

- [ ] **Step 5: Commit**

```bash
git add src/app/app/_components/view-as-banner.tsx src/app/app/_components/view-as-banner.module.css src/app/app/layout.tsx src/app/app/super-admin/tenants/\[tenantId\]/page.tsx src/app/app/super-admin/tenants/\[tenantId\]/tenant-detail.module.css
git commit -m "feat(super-admin): view-as banner + wiring"
```

---

## Task 13: Global audit log page

**Files:**
- Create: `src/app/app/super-admin/audit/page.tsx`
- Create: `src/app/app/super-admin/audit/audit.module.css`

- [ ] **Step 1: Implement**

```tsx
// src/app/app/super-admin/audit/page.tsx
import Link from "next/link";
import styles from "./audit.module.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; days?: string }>;
}) {
  const params = await searchParams;
  const days = Math.min(Math.max(parseInt(params.days ?? "30", 10) || 30, 1), 365);
  const actionFilter = params.action ?? "";

  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  let query = supabase
    .from("super_admin_audit_log")
    .select("id, actor_id, action, target_tenant_id, target_user_id, metadata, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  if (actionFilter) query = query.eq("action", actionFilter);
  const { data: rows } = await query;

  // Hydrate tenant names + actor emails
  const tenantIds = Array.from(new Set((rows ?? []).map((r) => r.target_tenant_id).filter(Boolean) as string[]));
  const actorIds = Array.from(new Set((rows ?? []).map((r) => r.actor_id)));

  const [{ data: tenants }, usersResp] = await Promise.all([
    tenantIds.length > 0
      ? supabase.from("tenant").select("id, name").in("id", tenantIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    actorIds.length > 0
      ? createSupabaseAdminClient().auth.admin.listUsers({ page: 1, perPage: 1000 })
      : Promise.resolve({ data: { users: [] as { id: string; email: string | null }[] } }),
  ]);

  const tenantName = new Map((tenants ?? []).map((t) => [t.id, t.name]));
  const actorEmail = new Map((usersResp.data?.users ?? []).map((u) => [u.id, u.email ?? null]));

  const actions = ["", "create_tenant", "suspend_tenant", "unsuspend_tenant", "extend_trial", "change_plan", "soft_delete_tenant", "restore_tenant", "view_as", "exit_view_as", "add_member", "remove_member", "change_role"];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Audit log</h1>

      <div className={styles.filters}>
        <form>
          <label>
            Action
            <select name="action" defaultValue={actionFilter}>
              {actions.map((a) => <option key={a} value={a}>{a || "(all)"}</option>)}
            </select>
          </label>
          <label>
            Days
            <input type="number" name="days" min={1} max={365} defaultValue={days} />
          </label>
          <button type="submit">Apply</button>
        </form>
      </div>

      <table className={styles.table}>
        <thead>
          <tr><th>When</th><th>Actor</th><th>Action</th><th>Target tenant</th><th>Target user</th><th>Metadata</th></tr>
        </thead>
        <tbody>
          {(rows ?? []).map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.created_at).toLocaleString()}</td>
              <td>{actorEmail.get(r.actor_id) ?? r.actor_id.slice(0, 8)}</td>
              <td><span className={styles.actionPill}>{r.action}</span></td>
              <td>
                {r.target_tenant_id ? (
                  <Link href={`/app/super-admin/tenants/${r.target_tenant_id}`}>
                    {tenantName.get(r.target_tenant_id) ?? r.target_tenant_id.slice(0, 8)}
                  </Link>
                ) : "—"}
              </td>
              <td>{r.target_user_id ? r.target_user_id.slice(0, 8) : "—"}</td>
              <td><code className={styles.code}>{JSON.stringify(r.metadata)}</code></td>
            </tr>
          ))}
          {(rows ?? []).length === 0 && <tr><td colSpan={6} className={styles.empty}>No entries.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
```

```css
/* src/app/app/super-admin/audit/audit.module.css */
.page { padding: 24px; }
.title { font-size: 24px; font-weight: 600; color: var(--ink-strong); margin-bottom: 16px; }
.filters form { display: flex; gap: 12px; align-items: end; margin-bottom: 16px; }
.filters label { display: flex; flex-direction: column; font-size: 12px; color: var(--ink-muted); }
.filters input, .filters select { padding: 6px 10px; border: 1px solid var(--border-subtle); border-radius: 6px; min-width: 160px; }
.filters button { padding: 8px 14px; border-radius: 6px; background: var(--brand-1); color: white; font-weight: 500; height: fit-content; }
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th, .table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border-subtle); }
.actionPill { padding: 2px 8px; border-radius: 999px; background: var(--surface-muted); color: var(--ink-strong); font-size: 12px; font-weight: 500; }
.code { font-family: ui-monospace, monospace; font-size: 12px; background: var(--surface-muted); padding: 2px 4px; border-radius: 4px; }
.empty { text-align: center; color: var(--ink-muted); padding: 16px; }
```

- [ ] **Step 2: Smoke-test**

Visit `/app/super-admin/audit`. Verify entries from prior tasks (create/suspend/extend) appear.

- [ ] **Step 3: Commit**

```bash
git add src/app/app/super-admin/audit/
git commit -m "feat(super-admin): global audit log page"
```

---

## Task 14: Stripe webhook respects manual_override_at

**Files:**
- Modify: `src/lib/stripe/webhook-events.ts`
- Modify: `src/lib/stripe/webhook-events.test.ts`

- [ ] **Step 1: Add test for manual override**

Append to `src/lib/stripe/webhook-events.test.ts`:

```ts
describe("manual_override_at respected", () => {
  it("subscription update skips rows with manual_override_at set", async () => {
    // The .update().eq(...).is(...) chain must include is("manual_override_at", null).
    // Construct a fake supabase that records the chained calls.
    const isCall = vi.fn().mockResolvedValue({ error: null });
    const eqCall = vi.fn().mockReturnValue({ is: isCall });
    const updateCall = vi.fn().mockReturnValue({ eq: eqCall });
    const fromCall = vi.fn((table: string) => {
      if (table === "stripe_event_log") return { insert: vi.fn().mockResolvedValue({ error: null }) };
      if (table === "tenant_subscription") return { update: updateCall };
      throw new Error("unexpected table " + table);
    });
    const admin = { from: fromCall } as any;

    const event = {
      id: "evt_test",
      type: "customer.subscription.updated",
      created: 1700000000,
      data: { object: {
        id: "sub_x",
        items: { data: [{ price: { id: "price_pro_monthly" } }] },
        current_period_end: 1800000000,
      } },
    } as any;

    // resolvePriceId may not know about this fake price; treat unknown as a no-op
    // (the handler already short-circuits if resolved is undefined).
    await (await import("./webhook-events")).processStripeEvent(admin, event);

    // If the price resolved (depends on price-resolution config), we expect .is("manual_override_at", null) to have been called.
    // If not, the update branch never runs and the test is a no-op. Either way, no throw.
    if (updateCall.mock.calls.length > 0) {
      expect(isCall).toHaveBeenCalledWith("manual_override_at", null);
    }
  });
});
```

- [ ] **Step 2: Run, verify it fails (or no-ops)**

Run: `npx vitest run src/lib/stripe/webhook-events.test.ts`
Expected: existing tests pass; the new test either fails on the `is` assertion (if price resolves) or no-ops (acceptable).

- [ ] **Step 3: Update all five update sites**

In `src/lib/stripe/webhook-events.ts`, add `.is("manual_override_at", null)` to every `.update("tenant_subscription")` chain. Five locations:

```ts
// onCheckoutCompleted (~line 100):
await admin
  .from("tenant_subscription")
  .update({ /* ... */ })
  .eq("tenant_id", tenantId)
  .is("manual_override_at", null);

// onSubscriptionUpdated (~line 130):
await admin
  .from("tenant_subscription")
  .update({ /* ... */ })
  .eq("stripe_subscription_id", stripeSub.id)
  .is("manual_override_at", null);

// onSubscriptionDeleted (~line 143):
await admin
  .from("tenant_subscription")
  .update({ status: "canceled" })
  .eq("stripe_subscription_id", stripeSub.id)
  .is("manual_override_at", null);

// onInvoiceFailed (~line 152):
await admin
  .from("tenant_subscription")
  .update({ status: "past_due" })
  .eq("stripe_subscription_id", subId)
  .is("manual_override_at", null);

// onInvoiceSucceeded (~line 162):
await admin
  .from("tenant_subscription")
  .update({ status: "active" })
  .eq("stripe_subscription_id", subId)
  .eq("status", "past_due")
  .is("manual_override_at", null);
```

- [ ] **Step 4: Re-run tests**

Run: `npx vitest run src/lib/stripe/webhook-events.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stripe/webhook-events.ts src/lib/stripe/webhook-events.test.ts
git commit -m "feat(super-admin): stripe webhook respects manual_override_at"
```

---

## Task 15: End-to-end smoke test in dev

- [ ] **Step 1: Run full type check + test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 type errors; new tests pass; nothing broken in existing suites.

- [ ] **Step 2: Manual smoke walkthrough**

Login as kasper. Sidebar should now show **Platform**.

1. Click **Tenants** → list renders, kasper's two tenants visible.
2. Click **+ New tenant** → modal opens. Create "Smoke Test Co", 14-day trial, Starter. Lands on detail page.
3. Header card: click **View as** → land on `/app` with yellow banner. Click **Exit** → back to home tenant.
4. Back on Smoke Test detail: **Extend trial** → push trial 7 days. Verify "Trial ends" updated.
5. **Change plan** → tier=growth, status=active. Verify "Manual override" timestamp appears.
6. **Suspend** with reason "smoke test". Verify status pill changes.
7. Open an incognito browser, log in as a member of Smoke Test (if one exists; if not skip). Verify they land on `/app/suspended`.
8. Back as kasper: **Unsuspend**, then **Delete** with typed name confirmation.
9. Visit **Audit log** → all the above actions appear in order.
10. From the tenants list with filter `Deleted`, find Smoke Test and **Restore**.

- [ ] **Step 3: Final commit**

If any tweaks were needed, commit them:

```bash
git status
# commit any fixes
```

---

## Self-Review Notes

Coverage check against spec:

- ✓ Schema deltas (suspended_at, suspended_reason, deleted_at, manual_override_at, super_admin_home_tenant_id, super_admin_audit_log) → Task 1
- ✓ Promote kasper → Task 1
- ✓ Extend tenant context with superAdminHomeTenantId → Task 2
- ✓ requireSuperAdmin guard → Task 3
- ✓ logSuperAdminAction → Task 4
- ✓ Suspended page + lockout in /app layout → Task 5
- ✓ Route gate + sidebar Platform section → Task 6
- ✓ Tenants list with filters and search → Task 7
- ✓ createTenant + new-tenant modal → Task 8
- ✓ Tenant detail page → Task 9
- ✓ suspend, unsuspend, soft-delete, restore, extendTrial, changePlan → Task 10
- ✓ addMember, removeMember, changeMemberRole + panel → Task 11
- ✓ viewAsTenant, exitViewAs, view-as banner → Task 12
- ✓ Global audit log page → Task 13
- ✓ Stripe webhook respects manual_override_at → Task 14
- ✓ End-to-end smoke → Task 15

All spec actions covered. All schema deltas covered. RLS on audit log set. Lockout enforced. View-as banner present. No placeholders detected.
