# Super-Admin Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert super-admin from a tenant-member with global RLS bypass into a tenant-less platform operator role with two tiers (`super_admin` / `platform_observer`) and strict least-privilege access to tenant business data.

**Architecture:** One migration file tightens RLS on 22 business tables and adds `is_platform_operator()`. TypeScript changes flow in dependency order: context → guard → app shell → platform module shell → actions → UI components → team page. Every mutating action already uses `requireSuperAdmin`; read paths and view-as are promoted to the weaker `requirePlatformOperator`.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS + Auth), TypeScript, Vitest, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-05-28-super-admin-foundation-design.md`

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `supabase/patches/super_admin_foundation.sql` | Create | Forward migration: nullable tenant_id, is_platform_operator, RLS tightening, observer grants |
| `supabase/patches/super_admin_foundation_rollback.sql` | Create | Rollback migration: restore original business-table RLS |
| `src/lib/tenant/context.ts` | Modify | Make tenantId nullable; add tenant-less branch for platform operators |
| `src/lib/tenant/context.test.ts` | Create | Unit tests for all 7 context flows |
| `src/lib/super-admin/guard.ts` | Modify | Add requirePlatformOperator |
| `src/lib/super-admin/guard.test.ts` | Create | Unit tests for both guard helpers |
| `src/lib/super-admin/audit.ts` | Modify | Add new action keys to SuperAdminAction union |
| `src/app/app/layout.tsx` | Modify | Redirect tenant-less operator to platform module; extend suspension lockout |
| `src/app/app/sidebar-nav.tsx` | Modify | Accept isPlatformOperator prop; add Team link; show Platform section for both roles |
| `src/app/app/super-admin/layout.tsx` | Modify | Standalone shell; accept both roles; null-safe view-as banner |
| `src/app/app/super-admin/actions.ts` | Modify | exitViewAs: null home-tenant branch; createTenant: remove auto-member insert; viewAsTenant: requirePlatformOperator |
| `src/app/app/super-admin/actions.test.ts` | Modify | Add delta tests for createTenant, viewAsTenant, exitViewAs |
| `src/app/app/super-admin/page.tsx` | Modify | Disable "+ New tenant" for observer |
| `src/app/app/super-admin/tenants/[tenantId]/page.tsx` | Modify | Fetch role; pass canMutate to components |
| `src/app/app/super-admin/tenants/[tenantId]/_components/lifecycle-controls.tsx` | Modify | Accept canMutate prop; disable buttons with title tooltip |
| `src/app/app/super-admin/tenants/[tenantId]/_components/members-panel.tsx` | Modify | Accept canMutate prop; disable add/remove/change-role with title tooltip |
| `src/app/app/super-admin/team/page.tsx` | Create | Platform team table |
| `src/app/app/super-admin/team/actions.ts` | Create | addPlatformUser, changePlatformUserRole, removePlatformUser |
| `src/app/app/super-admin/team/actions.test.ts` | Create | Bucket 5 tests |
| `src/app/app/super-admin/team/team.module.css` | Create | Team page styles (co-located with super-admin.module.css patterns) |
| `src/app/app/super-admin/team/_components/add-platform-user-modal.tsx` | Create | Modal for adding platform users |
| `supabase/__tests__/rls_business_tables.test.ts` | Create | Bucket 1 RLS privacy boundary |
| `supabase/__tests__/rls_platform_tables.test.ts` | Create | Bucket 2 platform-table observer grants |

---

## Task 1: Schema migration (forward + rollback)

**Goal:** Apply all DB-level changes: nullable `tenant_id`, `is_platform_operator()` SQL helper, tightened business-table RLS, extended observer grants on platform tables, and a rollback file.

**Files:**
- Create: `supabase/patches/super_admin_foundation.sql`
- Create: `supabase/patches/super_admin_foundation_rollback.sql`

**Acceptance Criteria:**
- [ ] `profiles.tenant_id` can be NULL when `role` is `super_admin` or `platform_observer`
- [ ] `is_platform_operator()` returns true for both roles, false otherwise
- [ ] A SELECT on any of the 22 business tables with `current_tenant_id() = NULL` returns zero rows for any actor, including super_admin
- [ ] `platform_observer` can SELECT from `tenant`, `tenant_subscription`, `profile_tenant_access`, `super_admin_audit_log`
- [ ] Rollback SQL restores the original `(tenant_id = current_tenant_id()) or is_super_admin()` policy on all 22 tables

**Verify:** Apply forward migration to local Supabase stack; confirm `is_platform_operator()` returns true/false correctly; confirm `has_tenant_access` still short-circuits for super_admin (required for set_active_tenant to work).

**Steps:**

- [ ] **Step 1: Create forward migration**

Create `supabase/patches/super_admin_foundation.sql`:

```sql
-- 1. Allow tenant_id to be null for platform operators.
alter table public.profiles alter column tenant_id drop not null;

alter table public.profiles
  add constraint profiles_tenant_id_required_for_members
  check (
    tenant_id is not null
    or role in ('super_admin', 'platform_observer')
  );

-- 2. New SQL helper: covers both platform operator roles.
create or replace function public.is_platform_operator()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() in ('super_admin', 'platform_observer'), false)
$$;

grant execute on function public.is_platform_operator() to anon, authenticated;

-- 3. Tighten business-table RLS: drop super-admin bypass entirely.
--    Every user (including super-admin) sees only rows whose tenant_id
--    matches their current active tenant. For a tenant-less super-admin
--    with no active tenant, current_tenant_id() returns NULL and no rows match.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'tenant_domain',
    'component_group',
    'component',
    'location',
    'shopify_store',
    'shopify_install_tokens',
    'shopify_product',
    'shopify_variant',
    'product_bom',
    'product_bom_component',
    'inventory_balance',
    'inventory_movement',
    'orders',
    'order_line',
    'order_component_allocation',
    'stocktake_session',
    'stocktake_line',
    'suppliers',
    'purchase_order',
    'purchase_order_line',
    'activity_log',
    'event_log'
  ]
  loop
    execute format('drop policy if exists %I_tenant_isolation on public.%I', tbl, tbl);
    execute format(
      'create policy %I_tenant_isolation on public.%I using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id())',
      tbl, tbl
    );
  end loop;
end $$;

-- 4. Extend platform-table READ policies to platform_observer.
--    Writes stay gated to is_super_admin() — those policies are unchanged.
drop policy if exists profiles_is_self on public.profiles;
create policy profiles_is_self on public.profiles
  for select
  using (id = auth.uid() or public.is_platform_operator());

drop policy if exists profile_tenant_access_select on public.profile_tenant_access;
create policy profile_tenant_access_select on public.profile_tenant_access
  for select
  using (profile_id = auth.uid() or public.is_platform_operator());

drop policy if exists tenant_read on public.tenant;
create policy tenant_read on public.tenant
  for select
  using (public.has_tenant_access(id) or public.is_platform_operator());

drop policy if exists tenant_subscription_select on public.tenant_subscription;
create policy tenant_subscription_select on public.tenant_subscription
  for select
  using (tenant_id = public.current_tenant_id() or public.is_platform_operator());

drop policy if exists super_admin_audit_log_select on public.super_admin_audit_log;
create policy super_admin_audit_log_select on public.super_admin_audit_log
  for select
  using (public.is_platform_operator());

-- 5. Audit marker.
insert into public.super_admin_audit_log (actor_id, action, metadata)
select id, 'privacy_model_tightened', jsonb_build_object(
  'note', 'business-table RLS no longer bypassed by is_super_admin()',
  'migration', 'super_admin_foundation.sql'
)
from public.profiles
where role = 'super_admin'
limit 1;
```

- [ ] **Step 2: Create rollback migration**

Create `supabase/patches/super_admin_foundation_rollback.sql`:

```sql
-- Rollback: restore original business-table policies with super-admin bypass.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'tenant_domain',
    'component_group',
    'component',
    'location',
    'shopify_store',
    'shopify_install_tokens',
    'shopify_product',
    'shopify_variant',
    'product_bom',
    'product_bom_component',
    'inventory_balance',
    'inventory_movement',
    'orders',
    'order_line',
    'order_component_allocation',
    'stocktake_session',
    'stocktake_line',
    'suppliers',
    'purchase_order',
    'purchase_order_line',
    'activity_log',
    'event_log'
  ]
  loop
    execute format('drop policy if exists %I_tenant_isolation on public.%I', tbl, tbl);
    execute format(
      'create policy %I_tenant_isolation on public.%I using ((tenant_id = public.current_tenant_id()) or public.is_super_admin()) with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin())',
      tbl, tbl
    );
  end loop;
end $$;

-- Note: does NOT restore the NOT NULL constraint on profiles.tenant_id —
-- a nullable column tolerates non-null values and reverting the constraint
-- requires first ensuring no null rows exist.
```

- [ ] **Step 3: Apply to local stack and verify**

```bash
# Apply forward migration
supabase db push  # or paste into Supabase Studio SQL editor

# Verify is_platform_operator returns true for super_admin
# (run as your super_admin user)
select public.is_platform_operator();  -- should return: t

# Verify super_admin without active tenant sees no business rows
# (set profiles.tenant_id = null for your user temporarily)
update profiles set tenant_id = null where id = '5a019756-ede3-4614-be1e-41afed6b6b63';
select count(*) from orders;  -- should return: 0
-- Restore:
update profiles set tenant_id = '<your-tenant-id>' where id = '5a019756-ede3-4614-be1e-41afed6b6b63';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/patches/super_admin_foundation.sql supabase/patches/super_admin_foundation_rollback.sql
git commit -m "feat(db): super-admin foundation migration — nullable tenant_id, is_platform_operator, tightened RLS"
```

---

## Task 2: Extend `getServerTenantContext()` for tenant-less operators

**Goal:** Make `tenantId` nullable in `TenantContext` and add a branch that returns a valid context for platform operators with no active tenant.

**Files:**
- Modify: `src/lib/tenant/context.ts`
- Create: `src/lib/tenant/context.test.ts`

**Acceptance Criteria:**
- [ ] `TenantContext.tenantId` is typed `string | null`
- [ ] A `super_admin` or `platform_observer` with `profiles.tenant_id = null` receives a context with `tenantId: null` (not a `null` return)
- [ ] A `member` with `profiles.tenant_id = null` receives `null` (logged-out equivalent)
- [ ] All previous behaviour for users with a non-null `tenant_id` is unchanged
- [ ] All 7 test cases in bucket 7 pass

**Verify:** `npx vitest run src/lib/tenant/context.test.ts` → all tests pass

**Steps:**

- [ ] **Step 1: Write the failing tests first**

Create `src/lib/tenant/context.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getServerTenantContext } from "./context";

// We mock the Supabase client creation so no real DB is hit.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";

function makeSupabase({
  userId,
  profile,
  accessRows = [],
}: {
  userId: string | null;
  profile: {
    tenant_id: string | null;
    role: string;
    status?: string;
    super_admin_home_tenant_id?: string | null;
  } | null;
  accessRows?: Array<{ tenant_id: string }>;
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(
        table === "profiles"
          ? { data: profile }
          : { data: null }
      ),
      maybeSingle: vi.fn().mockResolvedValue(
        table === "profiles"
          ? { data: profile }
          : { data: null }
      ),
      // profile_tenant_access mock
      then: undefined,
    })),
  };
}

describe("getServerTenantContext", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when no auth user", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({ userId: null, profile: null }) as any
    );
    const result = await getServerTenantContext();
    expect(result).toBeNull();
  });

  it("returns null when profile status is deactivated", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({
        userId: "user-1",
        profile: { tenant_id: "t-1", role: "member", status: "deactivated" },
      }) as any
    );
    const result = await getServerTenantContext();
    expect(result).toBeNull();
  });

  it("returns context with tenantId null for super_admin with null tenant_id", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({
        userId: "user-sa",
        profile: { tenant_id: null, role: "super_admin", super_admin_home_tenant_id: null },
      }) as any
    );
    const result = await getServerTenantContext();
    expect(result).not.toBeNull();
    expect(result!.tenantId).toBeNull();
    expect(result!.role).toBe("super_admin");
    expect(result!.userId).toBe("user-sa");
  });

  it("returns context with tenantId null for platform_observer with null tenant_id", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({
        userId: "user-obs",
        profile: { tenant_id: null, role: "platform_observer" },
      }) as any
    );
    const result = await getServerTenantContext();
    expect(result).not.toBeNull();
    expect(result!.tenantId).toBeNull();
    expect(result!.role).toBe("platform_observer");
  });

  it("returns null for member with null tenant_id (invariant violation)", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({
        userId: "user-m",
        profile: { tenant_id: null, role: "member" },
      }) as any
    );
    const result = await getServerTenantContext();
    expect(result).toBeNull();
  });

  it("returns context with tenantId set for a user with tenant_id", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({
        userId: "user-m",
        profile: { tenant_id: "t-1", role: "member" },
        accessRows: [{ tenant_id: "t-1" }],
      }) as any
    );
    // Need to mock profile_tenant_access select
    const fakeSupabase = makeSupabase({
      userId: "user-m",
      profile: { tenant_id: "t-1", role: "member" },
    }) as any;
    // Override the from mock for profile_tenant_access
    fakeSupabase.from = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { tenant_id: "t-1", role: "member", status: "active", super_admin_home_tenant_id: null },
          }),
        };
      }
      if (table === "profile_tenant_access") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [{ tenant_id: "t-1" }] }),
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: null }) };
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fakeSupabase);
    const result = await getServerTenantContext();
    expect(result).not.toBeNull();
    expect(result!.tenantId).toBe("t-1");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/tenant/context.test.ts
```
Expected: several tests fail because `context.ts` doesn't yet have the nullable branch.

- [ ] **Step 3: Update `src/lib/tenant/context.ts`**

Replace the entire file:

```ts
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TenantContext = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  tenantId: string | null;   // null = platform operator with no active tenant
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

  if (profile?.status === "deactivated") return null;

  // Platform operators (super_admin / platform_observer) may have null tenant_id.
  if (!profile?.tenant_id) {
    if (profile?.role === "super_admin" || profile?.role === "platform_observer") {
      return {
        supabase,
        tenantId: null,
        role: profile.role,
        userId: user.id,
        superAdminHomeTenantId: profile.super_admin_home_tenant_id ?? null,
      };
    }
    // Member with null tenant_id: invariant violation — treat as logged-out.
    return null;
  }

  // Regular user with a tenant set — validate and fall back to first available.
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

- [ ] **Step 4: Run tests again**

```bash
npx vitest run src/lib/tenant/context.test.ts
```
Expected: all tests pass.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -60
```
Expected: compilation errors appear because callers of `ctx.tenantId` now see `string | null`. These are intentional — they surface the sites that need null guards in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tenant/context.ts src/lib/tenant/context.test.ts
git commit -m "feat(context): make tenantId nullable for tenant-less platform operators"
```

---

## Task 3: Add `requirePlatformOperator` guard + extend audit action type

**Goal:** Add the weaker guard helper for read/view-as paths, and extend `SuperAdminAction` with the new action keys introduced by this spec.

**Files:**
- Modify: `src/lib/super-admin/guard.ts`
- Create: `src/lib/super-admin/guard.test.ts`
- Modify: `src/lib/super-admin/audit.ts`

**Acceptance Criteria:**
- [ ] `requirePlatformOperator()` passes for `super_admin` and `platform_observer`, throws for `member` and unauthenticated
- [ ] `requireSuperAdmin()` still throws for `platform_observer`
- [ ] `SuperAdminAction` includes all new action keys

**Verify:** `npx vitest run src/lib/super-admin/guard.test.ts` → all tests pass

**Steps:**

- [ ] **Step 1: Write the failing guard tests**

Create `src/lib/super-admin/guard.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireSuperAdmin, requirePlatformOperator } from "./guard";

vi.mock("@/lib/tenant/context", () => ({
  getServerTenantContext: vi.fn(),
}));

import { getServerTenantContext } from "@/lib/tenant/context";

function makeCtx(role: string) {
  return {
    supabase: {} as any,
    tenantId: role === "super_admin" || role === "platform_observer" ? null : "t-1",
    role,
    userId: "user-1",
    superAdminHomeTenantId: null,
  };
}

describe("requireSuperAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes for super_admin", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx("super_admin"));
    await expect(requireSuperAdmin()).resolves.not.toThrow();
  });

  it("throws for platform_observer", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx("platform_observer"));
    await expect(requireSuperAdmin()).rejects.toThrow("forbidden");
  });

  it("throws for member", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx("member"));
    await expect(requireSuperAdmin()).rejects.toThrow("forbidden");
  });

  it("throws when unauthenticated", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(null);
    await expect(requireSuperAdmin()).rejects.toThrow("forbidden");
  });
});

describe("requirePlatformOperator", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes for super_admin", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx("super_admin"));
    await expect(requirePlatformOperator()).resolves.not.toThrow();
  });

  it("passes for platform_observer", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx("platform_observer"));
    await expect(requirePlatformOperator()).resolves.not.toThrow();
  });

  it("throws for member", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx("member"));
    await expect(requirePlatformOperator()).rejects.toThrow("forbidden");
  });

  it("throws when unauthenticated", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(null);
    await expect(requirePlatformOperator()).rejects.toThrow("forbidden");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/super-admin/guard.test.ts
```
Expected: `requirePlatformOperator` tests fail because the export doesn't exist yet.

- [ ] **Step 3: Update `src/lib/super-admin/guard.ts`**

```ts
import { getServerTenantContext, type TenantContext } from "@/lib/tenant/context";

export async function requireSuperAdmin(): Promise<TenantContext> {
  const ctx = await getServerTenantContext();
  if (!ctx || ctx.role !== "super_admin") {
    throw new Error("forbidden");
  }
  return ctx;
}

export async function requirePlatformOperator(): Promise<TenantContext> {
  const ctx = await getServerTenantContext();
  if (!ctx || (ctx.role !== "super_admin" && ctx.role !== "platform_observer")) {
    throw new Error("forbidden");
  }
  return ctx;
}
```

- [ ] **Step 4: Update `src/lib/super-admin/audit.ts` — add new action keys**

```ts
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
  | "exit_view_as_no_home"
  | "add_member"
  | "remove_member"
  | "change_role"
  | "add_platform_user"
  | "change_platform_user_role"
  | "remove_platform_user"
  | "privacy_model_tightened";

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

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/lib/super-admin/guard.test.ts
```
Expected: all 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/super-admin/guard.ts src/lib/super-admin/guard.test.ts src/lib/super-admin/audit.ts
git commit -m "feat(super-admin): add requirePlatformOperator guard; extend SuperAdminAction type"
```

---

## Task 4: Fix `/app/layout.tsx` for tenant-less operators

**Goal:** When a platform operator has no active tenant (`ctx.tenantId === null`), redirect to `/app/super-admin` instead of proceeding to render the tenant shell. Extend the suspension lockout to also exclude `platform_observer`.

**Files:**
- Modify: `src/app/app/layout.tsx`

**Acceptance Criteria:**
- [ ] A platform operator with `tenantId === null` is redirected to `/app/super-admin` without loading any tenant data
- [ ] `platform_observer` is exempt from the suspension lockout (alongside existing `super_admin` exemption)
- [ ] All existing tenant-scoped rendering is unchanged for regular users

**Verify:** `npx tsc --noEmit` shows no new errors in layout.tsx.

**Steps:**

- [ ] **Step 1: Update `/app/layout.tsx`**

The current file fetches the profile, then does suspension checks. Add a redirect for tenant-less operators right after the profile fetch, before any tenant data is loaded:

In `src/app/app/layout.tsx`, find the existing `isSuperAdmin` declaration and the suspension block:

```ts
  const isSuperAdmin = profile?.role === "super_admin";

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

Replace with:

```ts
  const isSuperAdmin = profile?.role === "super_admin";
  const isPlatformOperator =
    profile?.role === "super_admin" || profile?.role === "platform_observer";

  // Platform operator with no active tenant → send them to the platform module.
  if (isPlatformOperator && !profile?.tenant_id) {
    const { redirect } = await import("next/navigation");
    redirect("/app/super-admin");
  }

  const isSuspendedPath = pathname.startsWith("/app/suspended");
  if (!isSuspendedPath && profile?.tenant_id && !isPlatformOperator) {
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

- [ ] **Step 2: Update the view-as banner condition**

Find the view-as banner line:

```tsx
{isSuperAdmin && profile?.super_admin_home_tenant_id && profile?.tenant_id !== profile.super_admin_home_tenant_id && (
  <ViewAsBanner tenantName={tenant?.name ?? "tenant"} />
)}
```

Replace with (null-safe, also shows banner for observer):

```tsx
{isPlatformOperator && profile?.tenant_id && profile?.tenant_id !== profile?.super_admin_home_tenant_id && (
  <ViewAsBanner tenantName={tenant?.name ?? "tenant"} />
)}
```

- [ ] **Step 3: Update SidebarNav to pass isPlatformOperator**

Find the `<SidebarNav>` call:

```tsx
<SidebarNav hasPlanning={hasPlanning} isSuperAdmin={isSuperAdmin} />
```

Change to:

```tsx
<SidebarNav hasPlanning={hasPlanning} isSuperAdmin={isSuperAdmin} isPlatformOperator={isPlatformOperator} />
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "layout"
```
Expected: SidebarNav type error because it doesn't accept `isPlatformOperator` yet — that's fixed in Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/layout.tsx
git commit -m "feat(app): redirect tenant-less platform operators to /app/super-admin; extend suspension lockout exemption"
```

---

## Task 5: Update `SidebarNav` for `platform_observer`

**Goal:** Extend the Platform sidebar section to render for both `super_admin` and `platform_observer`, add a Team link, and accept the new `isPlatformOperator` prop.

**Files:**
- Modify: `src/app/app/sidebar-nav.tsx`

**Acceptance Criteria:**
- [ ] Platform section renders for `platform_observer` (not just `super_admin`)
- [ ] Team link appears in the Platform section
- [ ] `isPlatformOperator` prop accepted; existing `isSuperAdmin` prop kept for backward compat (still passed from layout but controls mutation-specific rendering in the Platform section)

**Verify:** `npx tsc --noEmit` → no errors in sidebar-nav.tsx.

**Steps:**

- [ ] **Step 1: Update function signature and Platform section**

In `src/app/app/sidebar-nav.tsx`, find the function signature:

```ts
function buildNavSections(hasPlanning: boolean, isSuperAdmin: boolean): { label: string; items: NavItem[] }[]
```

Change to:

```ts
function buildNavSections(hasPlanning: boolean, isSuperAdmin: boolean, isPlatformOperator: boolean): { label: string; items: NavItem[] }[]
```

Find the Platform section at the bottom of `buildNavSections`:

```ts
  if (isSuperAdmin) {
    sections.push({
      label: "Platform",
      items: [
        {
          label: "Tenants",
          href: "/app/super-admin",
          // ... icon
        },
        {
          label: "Audit log",
          href: "/app/super-admin/audit",
          // ... icon
        },
      ],
    });
  }
```

Replace with:

```ts
  if (isPlatformOperator) {
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
        {
          label: "Team",
          href: "/app/super-admin/team",
          icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          ),
        },
      ],
    });
  }
```

- [ ] **Step 2: Update the exported component signature**

Find:

```ts
export default function SidebarNav({
  hasPlanning = false,
  isSuperAdmin = false,
}: {
  hasPlanning?: boolean;
  isSuperAdmin?: boolean;
})
```

Change to:

```ts
export default function SidebarNav({
  hasPlanning = false,
  isSuperAdmin = false,
  isPlatformOperator = false,
}: {
  hasPlanning?: boolean;
  isSuperAdmin?: boolean;
  isPlatformOperator?: boolean;
})
```

And update the `buildNavSections` call:

```ts
const navSections = buildNavSections(hasPlanning, isSuperAdmin, isPlatformOperator);
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors for sidebar-nav.tsx.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/sidebar-nav.tsx
git commit -m "feat(sidebar): extend Platform section to platform_observer; add Team link"
```

---

## Task 6: Make `/app/super-admin/layout.tsx` standalone + extend to observer

**Goal:** The platform module layout must accept both roles, work without a tenantId, and not depend on `/app/layout.tsx`.

**Files:**
- Modify: `src/app/app/super-admin/layout.tsx`

**Acceptance Criteria:**
- [ ] `platform_observer` can access the platform module (not redirected to `/app`)
- [ ] The layout does not crash when `ctx.tenantId` is `null`
- [ ] The view-as banner is null-safe

**Verify:** `npx tsc --noEmit` → no type errors in super-admin/layout.tsx.

**Steps:**

- [ ] **Step 1: Update `src/app/app/super-admin/layout.tsx`**

Replace the entire file:

```tsx
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";

export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  const ctx = await getServerTenantContext();

  if (
    !ctx ||
    (ctx.role !== "super_admin" && ctx.role !== "platform_observer")
  ) {
    redirect("/app");
  }

  return <>{children}</>;
}
```

Note: This layout intentionally stays thin — no custom chrome. The platform module pages each import `PageHeader` from `../_ui/page-header`. The view-as banner is rendered by `/app/layout.tsx` (which runs for `/app/super-admin/*` routes too) and is already null-safe after Task 4.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "super-admin/layout"
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/app/super-admin/layout.tsx
git commit -m "feat(super-admin): extend layout gate to platform_observer"
```

---

## Task 7: Update super-admin actions (`exitViewAs`, `createTenant`, `viewAsTenant`)

**Goal:** Rewrite `exitViewAs` to handle null home tenant; remove auto-member insert from `createTenant`; promote `viewAsTenant` to `requirePlatformOperator`.

**Files:**
- Modify: `src/app/app/super-admin/actions.ts`
- Modify: `src/app/app/super-admin/actions.test.ts`

**Acceptance Criteria:**
- [ ] `exitViewAs` with `superAdminHomeTenantId = null` clears `profiles.tenant_id` to null and redirects to `/app/super-admin`
- [ ] `exitViewAs` with `superAdminHomeTenantId` set calls `set_active_tenant` then redirects to `/app/super-admin`
- [ ] `createTenant` does NOT insert a `profile_tenant_access` row for the actor
- [ ] `viewAsTenant` succeeds for `platform_observer`
- [ ] All new tests pass

**Verify:** `npx vitest run src/app/app/super-admin/actions.test.ts` → all tests pass

**Steps:**

- [ ] **Step 1: Add new tests to `actions.test.ts`**

Open `src/app/app/super-admin/actions.test.ts` and add at the end of the file (or alongside existing tests):

```ts
// --- createTenant: no auto-member insert ---
describe("createTenant — no auto-member insert", () => {
  it("does not insert a profile_tenant_access row for the actor", async () => {
    // Arrange: mock requireSuperAdmin and supabase
    const insertSpy = vi.fn().mockResolvedValue({ error: null, data: [{ id: "new-tenant" }] });
    const ptaInsertSpy = vi.fn();
    const mockSupabase = {
      from: (table: string) => {
        if (table === "tenant") return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: "new-tenant" }, error: null }) };
        if (table === "tenant_subscription") return { insert: vi.fn().mockResolvedValue({ error: null }) };
        if (table === "profile_tenant_access") return { insert: ptaInsertSpy };
        if (table === "super_admin_audit_log") return { insert: vi.fn().mockResolvedValue({ error: null }) };
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      },
    };
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: mockSupabase as any, userId: "actor-id", role: "super_admin", tenantId: null, superAdminHomeTenantId: null });

    await createTenant({ name: "Acme", timezone: "UTC", currency: "AUD", tier: "starter", trialDays: 14 });

    expect(ptaInsertSpy).not.toHaveBeenCalled();
  });
});

// --- viewAsTenant: platform_observer allowed ---
describe("viewAsTenant — platform_observer", () => {
  it("succeeds for platform_observer", async () => {
    const rpcSpy = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase = {
      rpc: rpcSpy,
      from: () => ({ insert: vi.fn().mockResolvedValue({ error: null }) }),
    };
    vi.mocked(requirePlatformOperator).mockResolvedValue({ supabase: mockSupabase as any, userId: "obs-id", role: "platform_observer", tenantId: null, superAdminHomeTenantId: null });

    await viewAsTenant("t-1");

    expect(rpcSpy).toHaveBeenCalledWith("set_active_tenant", { p_tenant_id: "t-1" });
  });
});

// --- exitViewAs ---
describe("exitViewAs", () => {
  it("calls set_active_tenant when superAdminHomeTenantId is set", async () => {
    const rpcSpy = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase = {
      rpc: rpcSpy,
      from: () => ({ insert: vi.fn().mockResolvedValue({ error: null }) }),
    };
    vi.mocked(requirePlatformOperator).mockResolvedValue({ supabase: mockSupabase as any, userId: "sa-id", role: "super_admin", tenantId: "t-1", superAdminHomeTenantId: "home-t" });

    await expect(exitViewAs()).rejects.toThrow(); // redirect throws in test env — that's fine
    expect(rpcSpy).toHaveBeenCalledWith("set_active_tenant", { p_tenant_id: "home-t" });
  });

  it("clears profiles.tenant_id when superAdminHomeTenantId is null", async () => {
    const updateSpy = vi.fn().mockReturnThis();
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase = {
      rpc: vi.fn(),
      from: (table: string) => {
        if (table === "profiles") return { update: updateSpy, eq: eqSpy };
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      },
    };
    vi.mocked(requirePlatformOperator).mockResolvedValue({ supabase: mockSupabase as any, userId: "sa-id", role: "super_admin", tenantId: "t-1", superAdminHomeTenantId: null });

    await expect(exitViewAs()).rejects.toThrow(); // redirect throws in test env
    expect(updateSpy).toHaveBeenCalledWith({ tenant_id: null });
  });
});
```

Also add the required imports at the top if not already present:
```ts
import { requirePlatformOperator } from "@/lib/super-admin/guard";
import { createTenant, viewAsTenant, exitViewAs } from "./actions";
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
npx vitest run src/app/app/super-admin/actions.test.ts 2>&1 | tail -20
```

- [ ] **Step 3: Update `src/app/app/super-admin/actions.ts`**

Replace the entire file:

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/super-admin/guard";
import { requirePlatformOperator } from "@/lib/super-admin/guard";
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

  // NOTE: deliberately NOT inserting profile_tenant_access for the actor.
  // The actor enters the new tenant via view-as if they need to set it up.

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
  const ctx = await requirePlatformOperator();  // observer allowed to view-as
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
  const ctx = await requirePlatformOperator();
  const { supabase, userId, superAdminHomeTenantId } = ctx;

  if (superAdminHomeTenantId) {
    // Has a sandbox — return there.
    const { error } = await supabase.rpc("set_active_tenant", {
      p_tenant_id: superAdminHomeTenantId,
    });
    if (error) throw new Error(error.message);
  } else {
    // No sandbox — clear active tenant entirely so next /app visit redirects to platform module.
    const { error } = await supabase
      .from("profiles")
      .update({ tenant_id: null })
      .eq("id", userId);
    if (error) throw new Error(error.message);
  }

  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: superAdminHomeTenantId ? "exit_view_as" : "exit_view_as_no_home",
    targetTenantId: superAdminHomeTenantId,
  });

  revalidatePath("/app");
  redirect("/app/super-admin");
}
```

- [ ] **Step 4: Run all tests**

```bash
npx vitest run src/app/app/super-admin/actions.test.ts
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/super-admin/actions.ts src/app/app/super-admin/actions.test.ts
git commit -m "feat(super-admin): exitViewAs handles null home tenant; createTenant drops auto-member; viewAsTenant allows observer"
```

---

## Task 8: Observer mutation gating on tenant list + detail pages

**Goal:** Disable mutating UI controls for `platform_observer` across the tenants list and tenant detail pages. Buttons remain visible with a tooltip ("Requires super-admin").

**Files:**
- Modify: `src/app/app/super-admin/page.tsx`
- Modify: `src/app/app/super-admin/tenants/[tenantId]/page.tsx`
- Modify: `src/app/app/super-admin/tenants/[tenantId]/_components/lifecycle-controls.tsx`
- Modify: `src/app/app/super-admin/tenants/[tenantId]/_components/members-panel.tsx`

**Acceptance Criteria:**
- [ ] "+ New tenant" button on tenants list is disabled with `title="Requires super-admin"` for observer
- [ ] "View as" button is NOT disabled for observer
- [ ] Lifecycle control buttons (Suspend, Extend trial, Change plan, Delete, Restore) are disabled for observer
- [ ] Members panel "+ Add member", role select, and "Remove" are disabled for observer
- [ ] `canMutate` is derived from `role === "super_admin"` at page/server level

**Verify:** `npx tsc --noEmit` → no type errors in modified files.

**Steps:**

- [ ] **Step 1: Fetch role in super-admin page and disable "+ New tenant"**

In `src/app/app/super-admin/page.tsx`, the page currently renders as a super-admin-only page. Add role fetch and pass `canMutate`:

After the existing `const params = await searchParams;` line, add:

```ts
  const { getServerTenantContext } = await import("@/lib/tenant/context");
  const ctx = await getServerTenantContext();
  const canMutate = ctx?.role === "super_admin";
```

Then find the "+ New tenant" button:

```tsx
<Link href="/app/super-admin?new=1" className={styles.newButton}>
  + New tenant
</Link>
```

Replace with:

```tsx
{canMutate ? (
  <Link href="/app/super-admin?new=1" className={styles.newButton}>
    + New tenant
  </Link>
) : (
  <button
    disabled
    className={styles.newButton}
    title="Requires super-admin"
    style={{ opacity: 0.5, cursor: "not-allowed" }}
  >
    + New tenant
  </button>
)}
```

- [ ] **Step 2: Pass `canMutate` from tenant detail page**

In `src/app/app/super-admin/tenants/[tenantId]/page.tsx`, add after the existing `const supabase = await createSupabaseServerClient();`:

```ts
  const { getServerTenantContext } = await import("@/lib/tenant/context");
  const ctx = await getServerTenantContext();
  const canMutate = ctx?.role === "super_admin";
```

Pass `canMutate` to the components:

```tsx
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
```

```tsx
<MembersPanel tenantId={tenant.id} members={memberRows} canMutate={canMutate} />
```

- [ ] **Step 3: Update `LifecycleControls` props**

In `src/app/app/super-admin/tenants/[tenantId]/_components/lifecycle-controls.tsx`, add `canMutate` to the Props type:

```ts
type Props = {
  tenantId: string;
  tenantName: string;
  isSuspended: boolean;
  isDeleted: boolean;
  currentTier: string | null;
  currentStatus: string | null;
  currentTrialEndsAt: string | null;
  canMutate: boolean;
};
```

Then wrap all existing action buttons with `disabled={!props.canMutate}` and `title={!props.canMutate ? "Requires super-admin" : undefined}`. For example:

```tsx
{!props.isSuspended && !props.isDeleted && (
  <button
    onClick={() => props.canMutate ? setModal("suspend") : undefined}
    disabled={!props.canMutate}
    title={!props.canMutate ? "Requires super-admin" : undefined}
  >
    Suspend
  </button>
)}
```

Apply the same pattern to Unsuspend, Extend trial, Change plan, Delete, and Restore buttons.

- [ ] **Step 4: Update `MembersPanel` props**

In `src/app/app/super-admin/tenants/[tenantId]/_components/members-panel.tsx`, add `canMutate` to the component props:

```ts
export default function MembersPanel({ tenantId, members, canMutate }: { tenantId: string; members: Member[]; canMutate: boolean }) {
```

Then disable the "+ Add member" button:

```tsx
<button
  onClick={() => canMutate ? setAddOpen(true) : undefined}
  className={styles.addButton}
  disabled={!canMutate}
  title={!canMutate ? "Requires super-admin" : undefined}
>
  + Add member
</button>
```

Disable the role select:

```tsx
<select
  defaultValue={m.role}
  onChange={(e) =>
    canMutate ? run(() => changeMemberRole({ ... })) : undefined
  }
  disabled={pending || !canMutate}
  title={!canMutate ? "Requires super-admin" : undefined}
>
```

Disable the Remove button:

```tsx
<button
  className={styles.removeButton}
  onClick={() => canMutate ? run(() => removeMember({ tenantId, profileId: m.profile_id })) : undefined}
  disabled={pending || !canMutate}
  title={!canMutate ? "Requires super-admin" : undefined}
>
  Remove
</button>
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -E "lifecycle|members-panel|super-admin/page"
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/app/super-admin/page.tsx \
  src/app/app/super-admin/tenants/\[tenantId\]/page.tsx \
  src/app/app/super-admin/tenants/\[tenantId\]/_components/lifecycle-controls.tsx \
  src/app/app/super-admin/tenants/\[tenantId\]/_components/members-panel.tsx
git commit -m "feat(super-admin): gate mutation UI for platform_observer (disabled + tooltip)"
```

---

## Task 9: Team management page + actions

**Goal:** New `/app/super-admin/team` page: table of platform users (super_admin + platform_observer) with add/promote/demote/remove, backed by server actions with audit logging and last-super-admin guard.

**Files:**
- Create: `src/app/app/super-admin/team/page.tsx`
- Create: `src/app/app/super-admin/team/actions.ts`
- Create: `src/app/app/super-admin/team/actions.test.ts`
- Create: `src/app/app/super-admin/team/team.module.css`
- Create: `src/app/app/super-admin/team/_components/add-platform-user-modal.tsx`

**Acceptance Criteria:**
- [ ] Page lists all `super_admin` and `platform_observer` profiles with email and last sign-in
- [ ] `+ Add platform user` button is disabled for observer
- [ ] `addPlatformUser` throws "forbidden" for non-super_admin, updates `profiles.role`, writes audit log
- [ ] `changePlatformUserRole` throws when attempting to demote the last super_admin
- [ ] `removePlatformUser` throws when target `profiles.tenant_id` is null
- [ ] All 12 action test cases pass

**Verify:** `npx vitest run src/app/app/super-admin/team/actions.test.ts` → all tests pass

**Steps:**

- [ ] **Step 1: Write failing tests**

Create `src/app/app/super-admin/team/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/super-admin/guard", () => ({
  requireSuperAdmin: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireSuperAdmin } from "@/lib/super-admin/guard";
import { addPlatformUser, changePlatformUserRole, removePlatformUser } from "./actions";

function makeCtx(overrides: Partial<{ role: string; userId: string; tenantId: string | null }> = {}) {
  const userId = overrides.userId ?? "actor-id";
  // Fake supabase that records calls
  const profileRows = new Map<string, { role: string; tenant_id: string | null }>();
  profileRows.set("target-id", { role: "platform_observer", tenant_id: "t-1" });
  profileRows.set("only-super", { role: "super_admin", tenant_id: null });

  const auditInsert = vi.fn().mockResolvedValue({ error: null });

  const supabase = {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn((col: string, val: string) => ({
            single: vi.fn().mockResolvedValue({ data: profileRows.get(val) ?? null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: profileRows.get(val) ?? null }),
            // For count queries
            head: true,
            then: undefined,
          })),
          update: vi.fn().mockReturnThis(),
          count: vi.fn().mockResolvedValue({ count: 2 }),
        };
      }
      if (table === "super_admin_audit_log") {
        return { insert: auditInsert };
      }
      return {};
    },
    rpc: vi.fn().mockResolvedValue({ data: [{ id: "target-id", email: "target@example.com" }], error: null }),
    _auditInsert: auditInsert,
  };

  return {
    supabase: supabase as any,
    userId,
    role: overrides.role ?? "super_admin",
    tenantId: overrides.tenantId ?? null,
    superAdminHomeTenantId: null,
  };
}

describe("addPlatformUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws forbidden for non-super_admin (guard enforces this)", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("forbidden"));
    await expect(addPlatformUser({ email: "x@x.com", role: "platform_observer" }))
      .rejects.toThrow("forbidden");
  });

  it("throws when email not found", async () => {
    const ctx = makeCtx();
    ctx.supabase.rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(requireSuperAdmin).mockResolvedValue(ctx);
    await expect(addPlatformUser({ email: "notfound@x.com", role: "platform_observer" }))
      .rejects.toThrow("No account found");
  });

  it("updates profile role and writes audit log on happy path", async () => {
    const ctx = makeCtx();
    const updateSpy = vi.fn().mockReturnThis();
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    ctx.supabase.from = vi.fn((table: string) => {
      if (table === "profiles") return { update: updateSpy, eq: eqSpy };
      if (table === "super_admin_audit_log") return { insert: ctx._auditInsert };
      return {};
    });
    ctx.supabase.rpc = vi.fn().mockResolvedValue({ data: [{ id: "found-id", email: "target@example.com" }], error: null });
    vi.mocked(requireSuperAdmin).mockResolvedValue(ctx);
    await addPlatformUser({ email: "target@example.com", role: "platform_observer" });
    expect(updateSpy).toHaveBeenCalledWith({ role: "platform_observer", super_admin_home_tenant_id: null });
    expect(ctx._auditInsert).toHaveBeenCalled();
  });
});

describe("changePlatformUserRole", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws forbidden for non-super_admin", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("forbidden"));
    await expect(changePlatformUserRole({ profileId: "x", newRole: "platform_observer" }))
      .rejects.toThrow("forbidden");
  });

  it("throws when demoting the last super_admin", async () => {
    const ctx = makeCtx();
    // Override count to return 1
    ctx.supabase.from = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          // count returns 1
          then: undefined,
          count: vi.fn().mockResolvedValue({ count: 1, error: null }),
        };
      }
      return {};
    });
    // Make profileId belong to a super_admin
    ctx.supabase.rpc = vi.fn();
    vi.mocked(requireSuperAdmin).mockResolvedValue(ctx);
    // Patch the action to hit the count path
    // The implementation selects count from profiles where role = super_admin
    // We need to mock that specific select with count
    await expect(
      changePlatformUserRole({ profileId: "only-super", newRole: "platform_observer" })
    ).rejects.toThrow("cannot remove last super_admin");
  });

  it("succeeds and writes audit log when two super_admins exist", async () => {
    const ctx = makeCtx();
    let countReturn = 2;
    const updateSpy = vi.fn().mockReturnThis();
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    ctx.supabase.from = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn((col: string) => {
            // When called with count pattern, return 2
            return { eq: vi.fn().mockResolvedValue({ count: countReturn, error: null }), update: updateSpy, eq: eqSpy };
          }),
          update: updateSpy,
          eq: eqSpy,
        };
      }
      if (table === "super_admin_audit_log") return { insert: ctx._auditInsert };
      return {};
    });
    vi.mocked(requireSuperAdmin).mockResolvedValue(ctx);
    await changePlatformUserRole({ profileId: "target-id", newRole: "platform_observer" });
    expect(ctx._auditInsert).toHaveBeenCalled();
  });
});

describe("removePlatformUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws forbidden for non-super_admin", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("forbidden"));
    await expect(removePlatformUser({ profileId: "x" })).rejects.toThrow("forbidden");
  });

  it("throws when target has null tenant_id", async () => {
    const ctx = makeCtx();
    ctx.supabase.from = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "platform_observer", tenant_id: null } }),
        };
      }
      return {};
    });
    vi.mocked(requireSuperAdmin).mockResolvedValue(ctx);
    await expect(removePlatformUser({ profileId: "target-id" }))
      .rejects.toThrow("set a tenant first");
  });

  it("throws when removing the last super_admin", async () => {
    const ctx = makeCtx();
    ctx.supabase.from = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "super_admin", tenant_id: "t-1" } }),
          count: vi.fn().mockResolvedValue({ count: 1 }),
        };
      }
      return {};
    });
    vi.mocked(requireSuperAdmin).mockResolvedValue(ctx);
    await expect(removePlatformUser({ profileId: "only-super" }))
      .rejects.toThrow("cannot remove last super_admin");
  });

  it("sets role to member and clears super_admin_home_tenant_id on happy path", async () => {
    const ctx = makeCtx();
    const updateSpy = vi.fn().mockReturnThis();
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    let callCount = 0;
    ctx.supabase.from = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn((col: string) => {
            callCount++;
            if (callCount === 1) {
              // first call: fetch the profile
              return { eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { role: "platform_observer", tenant_id: "t-1" } }) };
            }
            // second call: count check
            return { eq: vi.fn().mockResolvedValue({ count: 2, error: null }) };
          }),
          update: updateSpy,
          eq: eqSpy,
        };
      }
      if (table === "super_admin_audit_log") return { insert: ctx._auditInsert };
      return {};
    });
    vi.mocked(requireSuperAdmin).mockResolvedValue(ctx);
    await removePlatformUser({ profileId: "target-id" });
    expect(updateSpy).toHaveBeenCalledWith({ role: "member", super_admin_home_tenant_id: null });
    expect(ctx._auditInsert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/app/app/super-admin/team/actions.test.ts 2>&1 | tail -10
```
Expected: all tests fail (file doesn't exist yet).

- [ ] **Step 3: Create `src/app/app/super-admin/team/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/super-admin/guard";
import { logSuperAdminAction } from "@/lib/super-admin/audit";

async function assertNotLastSuperAdmin(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createSupabaseServerClient>>,
  profileId: string
) {
  // Fetch target profile's current role
  const { data: target } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", profileId)
    .single();

  if (target?.role !== "super_admin") return; // not a super_admin, no risk

  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin");

  if (count !== null && count <= 1) {
    throw new Error("cannot remove last super_admin");
  }
}

export async function addPlatformUser(input: {
  email: string;
  role: "super_admin" | "platform_observer";
  reason?: string;
}): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();

  // Look up the user by email via existing RPC
  const { data: emailRows } = await supabase.rpc("get_user_emails", {
    p_ids: [],
  });
  // get_user_emails takes IDs, not emails — use a direct profiles query instead
  const { data: profileRow } = await (supabase as any)
    .from("profiles")
    .select("id")
    .eq("email_cache", input.email)
    .maybeSingle();

  // Fallback: use the auth admin API via RPC if available
  // In practice: use the existing get_user_emails RPC with a lookup by email
  // The RPC signature is get_user_emails(p_ids uuid[]) — we need a different approach.
  // Use Supabase's admin listUsers or a dedicated email-lookup RPC.
  // For now: look up via a supabase admin client (service role).
  const { data: users, error: rpcError } = await supabase.rpc("get_user_emails", {
    p_ids: (emailRows ?? []).map((r: any) => r.id),
  });

  // Simpler: use profiles table join to auth.users via the RPC that accepts email search
  // The project uses get_user_emails(p_ids uuid[]) — we'll need to find the profile by scanning.
  // Since we can't easily look up by email with the current RPC, we accept profileId directly
  // in a future iteration. For v2 bootstrap, look up by doing a broader fetch and filtering.
  throw new Error("not implemented"); // placeholder — see note below
}
```

**Important implementation note:** The existing `get_user_emails` RPC accepts `uuid[]` IDs, not emails. To look up by email, the implementation should:

1. First try to find `profiles.id` by joining against `auth.users` via a new RPC `get_profile_by_email(p_email text) returns uuid`, OR
2. Accept the profile ID directly in the modal (less ergonomic but simpler).

The recommended approach for this plan: **add a tiny RPC** and accept email in the UI. Here is the complete implementation:

Create `supabase/patches/super_admin_get_profile_by_email.sql`:

```sql
create or replace function public.get_profile_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select p.id
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email = p_email
  limit 1
$$;

grant execute on function public.get_profile_by_email(text) to authenticated;

-- RLS: only platform operators can call this
revoke execute on function public.get_profile_by_email(text) from authenticated;
grant execute on function public.get_profile_by_email(text) to authenticated;
-- (The function body itself is security definer so RLS doesn't apply — callers must be super_admin at app layer)
```

Then the complete `actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/super-admin/guard";
import { logSuperAdminAction } from "@/lib/super-admin/audit";

async function assertNotLastSuperAdmin(supabase: any, profileId: string): Promise<void> {
  const { data: target } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", profileId)
    .single();

  if (target?.role !== "super_admin") return;

  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin");

  if (count !== null && count <= 1) {
    throw new Error("cannot remove last super_admin");
  }
}

export async function addPlatformUser(input: {
  email: string;
  role: "super_admin" | "platform_observer";
  reason?: string;
}): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();

  const { data: foundId, error } = await supabase.rpc("get_profile_by_email", {
    p_email: input.email,
  });

  if (error || !foundId) {
    throw new Error(`No account found for "${input.email}". Ask them to sign up first, then add them here.`);
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ role: input.role, super_admin_home_tenant_id: null })
    .eq("id", foundId);

  if (updateError) throw new Error(updateError.message);

  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "add_platform_user",
    targetUserId: foundId,
    metadata: { email: input.email, role: input.role, reason: input.reason },
  });

  revalidatePath("/app/super-admin/team");
}

export async function changePlatformUserRole(input: {
  profileId: string;
  newRole: "super_admin" | "platform_observer";
  reason?: string;
}): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();

  await assertNotLastSuperAdmin(supabase, input.profileId);

  const { error } = await supabase
    .from("profiles")
    .update({ role: input.newRole })
    .eq("id", input.profileId);

  if (error) throw new Error(error.message);

  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "change_platform_user_role",
    targetUserId: input.profileId,
    metadata: { newRole: input.newRole, reason: input.reason },
  });

  revalidatePath("/app/super-admin/team");
}

export async function removePlatformUser(input: {
  profileId: string;
  reason?: string;
}): Promise<void> {
  const { supabase, userId } = await requireSuperAdmin();

  // Fetch target to check tenant_id
  const { data: target } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", input.profileId)
    .single();

  if (!target?.tenant_id) {
    throw new Error(
      "set a tenant first — this user has no home tenant. Assign one via SQL before removing their platform role."
    );
  }

  await assertNotLastSuperAdmin(supabase, input.profileId);

  const { error } = await supabase
    .from("profiles")
    .update({ role: "member", super_admin_home_tenant_id: null })
    .eq("id", input.profileId);

  if (error) throw new Error(error.message);

  await logSuperAdminAction(supabase, {
    actorId: userId,
    action: "remove_platform_user",
    targetUserId: input.profileId,
    metadata: { reason: input.reason },
  });

  revalidatePath("/app/super-admin/team");
}
```

- [ ] **Step 4: Create `src/app/app/super-admin/team/team.module.css`**

```css
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.tableCard {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.table th {
  text-align: left;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-default);
  color: var(--ink-muted);
  font-weight: 500;
  background: var(--bg-subtle);
}

.table td {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
  color: var(--ink-strong);
}

.table tbody tr:last-child td {
  border-bottom: none;
}

.rolePill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: 500;
}

.role_super_admin {
  background: var(--brand-1-subtle, #eff6ff);
  color: var(--brand-1, #2563eb);
}

.role_platform_observer {
  background: var(--bg-subtle);
  color: var(--ink-muted);
}

.actions {
  display: flex;
  gap: var(--space-2);
}

.empty {
  color: var(--ink-muted);
  text-align: center;
  padding: var(--space-6);
}

/* Modal */
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal {
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  width: 440px;
  max-width: 95vw;
}

.modalTitle {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--ink-strong);
  margin: 0 0 var(--space-4);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-4);
}

.field span {
  font-size: var(--text-sm);
  color: var(--ink-muted);
}

.field input,
.field select,
.field textarea {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  background: var(--bg-input, var(--bg-card));
  color: var(--ink-strong);
}

.modalActions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.error {
  color: var(--red-600, #dc2626);
  font-size: var(--text-sm);
  margin: var(--space-2) 0 0;
}
```

- [ ] **Step 5: Create `src/app/app/super-admin/team/_components/add-platform-user-modal.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPlatformUser } from "../actions";
import styles from "../team.module.css";

export default function AddPlatformUserModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await addPlatformUser({
          email: String(fd.get("email")),
          role: fd.get("role") as "super_admin" | "platform_observer",
          reason: String(fd.get("reason") ?? ""),
        });
        onClose();
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Add platform user</h2>
        <form onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Email address</span>
            <input name="email" type="email" required placeholder="user@example.com" />
          </label>
          <label className={styles.field}>
            <span>Role</span>
            <select name="role" defaultValue="platform_observer">
              <option value="platform_observer">Observer (read-only)</option>
              <option value="super_admin">Super admin (full access)</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Reason (optional)</span>
            <textarea name="reason" rows={2} />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} disabled={pending}>Cancel</button>
            <button type="submit" disabled={pending}>{pending ? "Adding…" : "Add user"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `src/app/app/super-admin/team/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../../_ui/page-header";
import TeamClient from "./_components/team-client";
import styles from "./team.module.css";

export default async function TeamPage() {
  const [supabase, ctx] = await Promise.all([
    createSupabaseServerClient(),
    getServerTenantContext(),
  ]);

  if (!ctx) notFound();
  const canMutate = ctx.role === "super_admin";

  // Fetch all platform operator profiles
  const { data: platformProfiles } = await supabase
    .from("profiles")
    .select("id, role, super_admin_home_tenant_id")
    .in("role", ["super_admin", "platform_observer"]);

  const profileIds = (platformProfiles ?? []).map((p) => p.id);

  // Fetch emails + last sign-in via the existing RPC
  let emailById = new Map<string, string | null>();
  let lastSignInById = new Map<string, string | null>();

  if (profileIds.length > 0) {
    const { data: emailRows } = await supabase.rpc("get_user_emails", { p_ids: profileIds });
    for (const row of (emailRows ?? []) as Array<{ id: string; email: string | null; last_sign_in_at?: string | null }>) {
      emailById.set(row.id, row.email);
      if (row.last_sign_in_at !== undefined) {
        lastSignInById.set(row.id, row.last_sign_in_at ?? null);
      }
    }
  }

  const rows = (platformProfiles ?? []).map((p) => ({
    profileId: p.id,
    email: emailById.get(p.id) ?? null,
    role: p.role as "super_admin" | "platform_observer",
    lastSignIn: lastSignInById.get(p.id) ?? null,
    isSelf: p.id === ctx.userId,
  }));

  const superAdminCount = rows.filter((r) => r.role === "super_admin").length;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Platform team"
        description={`${rows.length} platform operator${rows.length !== 1 ? "s" : ""}`}
      />
      <TeamClient rows={rows} canMutate={canMutate} superAdminCount={superAdminCount} />
    </div>
  );
}
```

- [ ] **Step 7: Create `src/app/app/super-admin/team/_components/team-client.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changePlatformUserRole, removePlatformUser } from "../actions";
import AddPlatformUserModal from "./add-platform-user-modal";
import styles from "../team.module.css";

type Row = {
  profileId: string;
  email: string | null;
  role: "super_admin" | "platform_observer";
  lastSignIn: string | null;
  isSelf: boolean;
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  platform_observer: "Observer",
};

export default function TeamClient({
  rows,
  canMutate,
  superAdminCount,
}: {
  rows: Row[];
  canMutate: boolean;
  superAdminCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => canMutate ? setAddOpen(true) : undefined}
          disabled={!canMutate}
          title={!canMutate ? "Requires super-admin" : undefined}
        >
          + Add platform user
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Last sign-in</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isLastSuperAdmin = row.role === "super_admin" && superAdminCount <= 1;
              return (
                <tr key={row.profileId}>
                  <td>{row.email ?? row.profileId}</td>
                  <td>
                    <span className={`${styles.rolePill} ${styles[`role_${row.role}`]}`}>
                      {ROLE_LABEL[row.role] ?? row.role}
                    </span>
                  </td>
                  <td>
                    {row.lastSignIn
                      ? new Date(row.lastSignIn).toLocaleString()
                      : "—"}
                  </td>
                  <td>
                    {canMutate && !row.isSelf && (
                      <div className={styles.actions}>
                        {row.role === "platform_observer" && (
                          <button
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                changePlatformUserRole({
                                  profileId: row.profileId,
                                  newRole: "super_admin",
                                })
                              )
                            }
                          >
                            Promote
                          </button>
                        )}
                        {row.role === "super_admin" && !isLastSuperAdmin && (
                          <button
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                changePlatformUserRole({
                                  profileId: row.profileId,
                                  newRole: "platform_observer",
                                })
                              )
                            }
                          >
                            Demote
                          </button>
                        )}
                        <button
                          disabled={pending || isLastSuperAdmin}
                          title={isLastSuperAdmin ? "Cannot remove last super-admin" : undefined}
                          onClick={() =>
                            run(() => removePlatformUser({ profileId: row.profileId }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    {(!canMutate || row.isSelf) && (
                      <span style={{ color: "var(--ink-muted)", fontSize: "var(--text-sm)" }}>
                        {row.isSelf ? "—" : ""}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  No platform operators.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {addOpen && <AddPlatformUserModal onClose={() => setAddOpen(false)} />}
    </>
  );
}
```

Also add the `get_profile_by_email` SQL patch created in step 3:

```bash
# Apply the new RPC patch
supabase db push  # or via Supabase Studio
```

- [ ] **Step 8: Run tests**

```bash
npx vitest run src/app/app/super-admin/team/actions.test.ts
```
Expected: all tests pass.

- [ ] **Step 9: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "team"
```
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add \
  supabase/patches/super_admin_get_profile_by_email.sql \
  src/app/app/super-admin/team/ \
  -A
git commit -m "feat(super-admin): team management page (add/promote/demote/remove platform users)"
```

---

## Task 10: RLS integration tests

**Goal:** Prove the RLS privacy boundary holds at the DB level with automated tests. These are the highest-value tests in this plan.

**Files:**
- Create: `supabase/__tests__/rls_business_tables.test.ts`
- Create: `supabase/__tests__/rls_platform_tables.test.ts`

**Acceptance Criteria:**
- [ ] Super-admin with `tenant_id = NULL` reads zero rows from all 22 business tables
- [ ] Super-admin view-as'd into tenant A reads tenant A's rows, not tenant B's
- [ ] `platform_observer` can SELECT from all 4 platform tables
- [ ] `platform_observer` CANNOT INSERT/UPDATE/DELETE on platform tables
- [ ] `member` cannot SELECT from `super_admin_audit_log`
- [ ] Scan of `pg_policies` confirms no business-table policy references `is_super_admin`

**Verify:** `npx vitest run supabase/__tests__/` → all tests pass

**Steps:**

- [ ] **Step 1: Check if a DB test harness exists**

```bash
ls supabase/__tests__/ 2>/dev/null || echo "no tests dir yet"
ls supabase/vitest* 2>/dev/null || cat vitest.config.ts 2>/dev/null | grep -i supabase
```

If no test harness exists for DB-level tests, these tests should be written as Playwright tests that run against the local Supabase stack, or as a separate `supabase-test` vitest config. Check how the project currently runs any DB-touching tests and follow that pattern.

> **If no DB test harness exists:** Create a `supabase/__tests__/` directory and a `vitest.supabase.config.ts` that points to it with a test timeout of 30s. Use the Supabase client with a test service-role key for actor setup.

- [ ] **Step 2: Create business-table RLS test**

Create `supabase/__tests__/rls_business_tables.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_TEST_URL ?? "http://localhost:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY ?? "";

// Roles needed: a regular member user, a super_admin user with null tenant_id,
// a super_admin user view-as'd into tenant A.
// These should be pre-seeded test users. Adjust IDs/JWTs to match your test seed.
const TENANT_A_ID = process.env.TEST_TENANT_A_ID ?? "";
const MEMBER_JWT = process.env.TEST_MEMBER_JWT ?? "";
const SUPER_ADMIN_JWT = process.env.TEST_SUPER_ADMIN_JWT ?? "";

const BUSINESS_TABLES = [
  "tenant_domain", "component_group", "component", "location",
  "shopify_store", "shopify_install_tokens", "shopify_product", "shopify_variant",
  "product_bom", "product_bom_component", "inventory_balance", "inventory_movement",
  "orders", "order_line", "order_component_allocation",
  "stocktake_session", "stocktake_line",
  "suppliers", "purchase_order", "purchase_order_line",
  "activity_log", "event_log",
] as const;

describe("RLS — business tables", () => {
  it("super_admin with no active tenant reads zero rows from all business tables", async () => {
    if (!SUPER_ADMIN_JWT) {
      console.warn("TEST_SUPER_ADMIN_JWT not set — skipping");
      return;
    }
    // Create client with super_admin JWT but ensure profiles.tenant_id = null
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${SUPER_ADMIN_JWT}` } },
    });

    for (const table of BUSINESS_TABLES) {
      const { data, error } = await client.from(table).select("*").limit(10);
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("no business-table policy references is_super_admin", async () => {
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data } = await adminClient
      .from("pg_policies")
      .select("tablename, policyname, qual, with_check")
      .in("tablename", [...BUSINESS_TABLES]);

    for (const policy of data ?? []) {
      expect(policy.qual ?? "").not.toContain("is_super_admin");
      expect(policy.with_check ?? "").not.toContain("is_super_admin");
    }
  });
});
```

- [ ] **Step 3: Create platform-table RLS test**

Create `supabase/__tests__/rls_platform_tables.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_TEST_URL ?? "http://localhost:54321";
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY ?? "";
const OBSERVER_JWT = process.env.TEST_OBSERVER_JWT ?? "";
const MEMBER_JWT = process.env.TEST_MEMBER_JWT ?? "";

const PLATFORM_TABLES = [
  "tenant",
  "tenant_subscription",
  "profile_tenant_access",
  "super_admin_audit_log",
] as const;

describe("RLS — platform tables (observer)", () => {
  it("platform_observer can SELECT from all platform tables", async () => {
    if (!OBSERVER_JWT) {
      console.warn("TEST_OBSERVER_JWT not set — skipping");
      return;
    }
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${OBSERVER_JWT}` } },
    });
    for (const table of PLATFORM_TABLES) {
      const { error } = await client.from(table).select("*").limit(1);
      expect(error).toBeNull();
    }
  });

  it("platform_observer cannot INSERT into platform tables", async () => {
    if (!OBSERVER_JWT) {
      console.warn("TEST_OBSERVER_JWT not set — skipping");
      return;
    }
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${OBSERVER_JWT}` } },
    });
    const { error } = await client.from("tenant").insert({ name: "attacker" });
    expect(error).not.toBeNull(); // RLS should block this
  });

  it("member cannot SELECT from super_admin_audit_log", async () => {
    if (!MEMBER_JWT) {
      console.warn("TEST_MEMBER_JWT not set — skipping");
      return;
    }
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${MEMBER_JWT}` } },
    });
    const { data, error } = await client.from("super_admin_audit_log").select("*").limit(1);
    expect(data ?? []).toHaveLength(0); // RLS returns empty, not an error
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add supabase/__tests__/
git commit -m "test(rls): business-table privacy boundary + platform-table observer grants"
```

---

## Task 11: Full type-check and smoke-test pass

**Goal:** Resolve all TypeScript errors surfaced by making `tenantId` nullable; confirm the app compiles and smoke-tests pass locally.

**Files:**
- Various (fix any remaining `ctx.tenantId` call sites that assume `string`)

**Acceptance Criteria:**
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx vitest run` passes all tests
- [ ] Smoke checklist from spec section 6 passes against local stack

**Steps:**

- [ ] **Step 1: Run type-check and list remaining errors**

```bash
npx tsc --noEmit 2>&1
```

For each error mentioning `tenantId` used as `string` where `string | null` is expected:
- In `/app` routes that already redirect when `tenantId` is null (after Task 4), add a non-null assertion `ctx.tenantId!` or a guard. The redirect in the layout makes the page unreachable for null tenantId, so `!` is safe in those pages.
- In actions or utilities that genuinely need a tenantId, add an explicit guard and throw if null.

Example fix pattern for app route pages:
```ts
// Before (used to be safe — now needs explicit acknowledgment):
const tenantId = ctx.tenantId;

// After — safe because layout redirects tenant-less operators before this page renders:
const tenantId = ctx.tenantId!;
```

- [ ] **Step 2: Run all Vitest tests**

```bash
npx vitest run
```
Expected: all tests pass. If any fail, fix the cause before proceeding.

- [ ] **Step 3: Apply migration to local Supabase and run smoke tests**

Follow the smoke checklist from the spec:

```
1. Log in as kasper. Landing: /app/super-admin. Tenants list renders. ✓
2. Enter view-as on a tenant. /app renders. Orders page shows orders. ✓
3. Exit view-as. Back to /app/super-admin. Navigate to /app/inventory directly → redirect. ✓
4. Audit log shows: view_as, exit_view_as (or exit_view_as_no_home), privacy_model_tightened. ✓
5. Team page renders. kasper listed as super_admin. ✓
6. Add a throwaway platform_observer account. Log in: platform module readable, mutation buttons disabled with tooltip, view-as works, audit entry written. ✓
7. Demote / re-promote observer. ✓
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix(types): resolve tenantId nullability errors across app routes after foundation migration"
```

---

## Post-deploy checklist (manual, not automated)

Run after promoting to prod:

- [ ] Log in as kasper → land on `/app/super-admin`
- [ ] View-as a tenant → orders/inventory visible → exit view-as → `/app/super-admin`
- [ ] Direct navigation to `/app/inventory` without view-as → redirected to `/app/super-admin`
- [ ] Audit log has `privacy_model_tightened` entry (from migration)
- [ ] Team page shows kasper as `super_admin`
- [ ] Manually run: `delete from profile_tenant_access where profile_id = '5a019756-ede3-4614-be1e-41afed6b6b63' and tenant_id <> '<sandbox-tenant-id>'`
