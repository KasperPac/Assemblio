# Super-Admin Foundation — Design Spec

**Date:** 2026-05-28
**Status:** Approved, pending implementation plan
**Follows:** `2026-05-28-super-admin-design.md` (v1 tenant management module)

---

## Goal

Convert the super-admin role from "a tenant member with global bypass" into a tenant-less platform operator role with least-privilege access to tenant business data, and split it into two tiers so a non-mutating teammate can be added safely.

---

## In scope (this spec)

1. **Tenant-less architecture** — `profiles.tenant_id` becomes nullable for platform operators. `/app` redirects tenant-less super-admins to `/app/super-admin`. View-as exit always lands on `/app/super-admin`. `createTenant` no longer auto-adds the actor as a member. Optional sandbox home tenant supported.
2. **Privacy / RLS rework** — The 22 business-data tables lose their `is_super_admin()` bypass entirely. Super-admin sees tenant business rows only while view-as'd into that specific tenant. Platform tables (`tenant`, `tenant_subscription`, `profiles`, `profile_tenant_access`, `super_admin_audit_log`) retain their existing super-admin grants.
3. **Two-tier team management** — Add `platform_observer` role alongside `super_admin`. Observer can read the full platform module and can view-as (audited) but cannot mutate anything. Self-service promote/demote inside the platform module.

## Out of scope (deferred to v2 — see appendix)

Integration health, tenant vitals, hybrid plans + `plan_overrides`, `tenant_feature_flag` table, hard purge + on-demand export, editable email templates, targeted system announcements.

---

## Privacy model

**Super-admin sees platform metadata always; sees tenant business data only when actively view-as'd into that tenant.** The act of entering view-as is audit-logged.

Aggregate tenant metadata (count of members, subscription status, trial dates, plan) is always visible in the platform module — these are platform tables, not business-data tables. Row-level business data (orders, inventory, BOMs, customers, suppliers, etc.) requires an explicit view-as.

View-as is the single mechanism for cross-tenant data access. There is no "read-only support mode" or implicit bypass.

---

## Section 1 — Schema migration

Single migration file: `supabase/patches/super_admin_foundation.sql`. Applied idempotently in this order:

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
--    with no active tenant, current_tenant_id() returns NULL and no rows
--    match — implicit deny.
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
--    Writes stay gated to is_super_admin() (unchanged from v1 patches).
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

-- 5. Audit marker — timestamp when privacy model changed.
insert into public.super_admin_audit_log (actor_id, action, metadata)
select id, 'privacy_model_tightened', jsonb_build_object(
  'note', 'business-table RLS no longer bypassed by is_super_admin()',
  'migration', 'super_admin_foundation.sql'
)
from public.profiles
where role = 'super_admin'
limit 1;
```

### Unchanged from v1

- `has_tenant_access(uuid)` retains its `is_super_admin()` short-circuit — super-admin must still be able to call `set_active_tenant()` for any tenant to enter view-as.
- `current_tenant_id()`, `is_super_admin()`, `current_profile_role()` — unchanged.
- INSERT/UPDATE/DELETE on platform tables — still gated to `is_super_admin()`.

### What is NOT in this migration

- `profile_tenant_access` row cleanup for kasper. Existing auto-added memberships from v1's `createTenant` are kept. A manual SQL sweep after deploy decides which to retain (sandbox tenant) and which to drop. One `delete from profile_tenant_access where profile_id = '<kasper-id>' and tenant_id <> '<sandbox-id>'`.
- `super_admin_home_tenant_id` column — already exists from v1. Stays nullable; no backfill needed.

---

## Section 2 — Tenant-less architecture

### `getServerTenantContext()` (`src/lib/tenant/context.ts`)

Return type change: `tenantId` becomes `string | null`.

```ts
export type TenantContext = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  tenantId: string | null;   // null = platform operator with no active tenant
  role: string;
  userId: string;
  superAdminHomeTenantId: string | null;
};
```

Updated control flow (changes in bold):

1. No `auth.user` → return `null`. *(unchanged)*
2. `profile.status === "deactivated"` → return `null`. *(unchanged)*
3. **`profile.tenant_id` is null:**
   - If `role in ('super_admin', 'platform_observer')` → return context with `tenantId: null`.
   - Otherwise → return `null` (invariant violation; treat as logged-out).
4. `profile.tenant_id` is set → existing flow (validate against `profile_tenant_access`, fall back to first available tenant, etc.). *(unchanged)*

### `/app/layout.tsx` routing fork

```ts
const ctx = await getServerTenantContext();
if (!ctx) redirect("/login");

// Platform operator with no active tenant → platform module.
if (ctx.tenantId === null) {
  redirect("/app/super-admin");
}

// Suspension lockout (extended to cover platform_observer).
const { data: tenantRow } = await supabase
  .from("tenant")
  .select("suspended_at, deleted_at")
  .eq("id", ctx.tenantId)
  .single();

if (
  (tenantRow?.suspended_at || tenantRow?.deleted_at) &&
  ctx.role !== "super_admin" &&
  ctx.role !== "platform_observer"
) {
  redirect("/app/suspended");
}
```

Observer is exempt from the suspension lockout so they can investigate suspended tenants reached via view-as.

### `/app/super-admin/layout.tsx` — standalone shell

Must not depend on `/app/layout.tsx` or on `ctx.tenantId` being non-null. Uses `requirePlatformOperator()` directly. Renders its own header/nav (Tenants, Audit, Team) and user menu.

Gate:
```ts
if (!ctx || (ctx.role !== "super_admin" && ctx.role !== "platform_observer")) {
  redirect("/app");
}
```

View-as banner: render when `ctx.tenantId !== null && ctx.tenantId !== ctx.superAdminHomeTenantId`. (Guarded against null; previously assumed non-null.)

### `exitViewAs` action (`src/app/app/super-admin/actions.ts`)

Rewritten to handle the null home-tenant case:

```ts
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
    // No sandbox — clear active tenant entirely.
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
  redirect("/app/super-admin");  // Always land on platform module.
}
```

The direct `profiles.update({ tenant_id: null })` is the only place in the system that clears active tenant. `set_active_tenant()` does not accept null — that contract is intentionally kept narrow.

### `createTenant` action (delta)

Remove the `profile_tenant_access` insert that previously added the actor as `admin`. New tenants are created with zero members. The actor enters the tenant via view-as to set it up.

### Sandbox tenant

A super-admin may designate one tenant as their sandbox by setting `super_admin_home_tenant_id`. No self-service UI for this in v2 — set via SQL or by adding a "Mark as my sandbox" action in a future iteration. When a sandbox is set, `/app` opens in that tenant normally. Exit-view-as returns to `/app/super-admin` (not the sandbox), per design.

---

## Section 3 — Two-tier role model

### Role taxonomy

| Role | Tenant membership | Platform module | Mutations | View-as |
|---|---|---|---|---|
| `member`, `admin` | Required | None | Within their tenant | No |
| `platform_observer` | None (or optional sandbox) | Full read | None | Yes (audited) |
| `super_admin` | None (or optional sandbox) | Full read/write | Everything | Yes (audited) |

### Guard helpers (`src/lib/super-admin/guard.ts`)

Add alongside existing `requireSuperAdmin`:

```ts
export async function requirePlatformOperator(): Promise<TenantContext> {
  const ctx = await getServerTenantContext();
  if (!ctx) throw new Error("forbidden: not authenticated");
  if (ctx.role !== "super_admin" && ctx.role !== "platform_observer") {
    throw new Error("forbidden: not a platform operator");
  }
  return ctx;
}
```

`requireSuperAdmin()` unchanged — every mutating action uses it.

### Action guard assignments

| Action file | Action | Guard |
|---|---|---|
| `super-admin/actions.ts` | `createTenant` | `requireSuperAdmin` |
| `super-admin/actions.ts` | `viewAsTenant` | `requirePlatformOperator` |
| `super-admin/actions.ts` | `exitViewAs` | `requirePlatformOperator` |
| `super-admin/tenants/[tenantId]/actions.ts` | all tenant mutations | `requireSuperAdmin` |
| `super-admin/team/actions.ts` | all team actions | `requireSuperAdmin` |

### Team management page (`/app/super-admin/team/`)

New route: `src/app/app/super-admin/team/page.tsx`.

Table: all `profiles` where `role in ('super_admin', 'platform_observer')`. Columns: Email, Role, Last sign-in, Actions.

Actions (super-admin only):
- **+ Add platform user** — email input + role select. If no matching `auth.users` row: "No account found for `<email>`. Ask them to sign up first, then add them here."
- **Promote** (observer → super_admin) — confirmation modal, optional reason.
- **Demote** (super_admin → observer) — confirmation modal, blocks if last super_admin.
- **Remove** (platform role → member) — confirmation modal. Requires target `profiles.tenant_id` to be non-null. Blocks if last super_admin.

Mutation buttons hidden/disabled for observer (tooltip: "Requires super-admin").

### "Last super-admin" lockout

Enforced at the action layer (not DB constraint):

```ts
const { count } = await supabase
  .from("profiles")
  .select("id", { count: "exact", head: true })
  .eq("role", "super_admin");

if (count !== null && count <= 1) {
  throw new Error("cannot remove last super_admin");
}
```

Applied before any action that could demote or remove a `super_admin`.

### New team server actions (`src/app/app/super-admin/team/actions.ts`)

```ts
export async function addPlatformUser(input: {
  email: string;
  role: "super_admin" | "platform_observer";
  reason?: string;
}): Promise<void>;

export async function changePlatformUserRole(input: {
  profileId: string;
  newRole: "super_admin" | "platform_observer";
  reason?: string;
}): Promise<void>;

export async function removePlatformUser(input: {
  profileId: string;
  reason?: string;
  // Requires profiles.tenant_id to be non-null on target;
  // sets profiles.role = 'member', clears super_admin_home_tenant_id.
}): Promise<void>;
```

All three: `requireSuperAdmin()`, write `super_admin_audit_log`.

### New audit action keys

Added to the known set (free-text column — no schema change needed):

- `add_platform_user`
- `change_platform_user_role`
- `remove_platform_user`
- `exit_view_as_no_home`
- `privacy_model_tightened`

### Demotion semantics

When removing platform role from a user: if `profiles.tenant_id` is null, throw "set a tenant first." The action does not auto-assign a tenant. The check constraint from section 1 also prevents the `role = 'member'` + `tenant_id = null` combination at the DB level (defense in depth).

### Bootstrapping

First super-admin is still created via `scripts/provision_super_admin.mjs`. All subsequent additions are self-service from the Team page.

---

## Section 4 — UI surface changes (delta from v1)

**Sidebar.** Extend "Platform" link to render for `platform_observer`:
```tsx
{(ctx.role === "super_admin" || ctx.role === "platform_observer") && (
  <SidebarLink href="/app/super-admin" icon={ShieldIcon}>Platform</SidebarLink>
)}
```

**Mutation controls across platform module.** Every action button (suspend, change plan, extend trial, soft-delete, restore, add/remove member, + new tenant, team management) is disabled for observer with tooltip "Requires super-admin." View-as button is NOT disabled for observer. Pattern: derive `canMutate = ctx.role === "super_admin"` at page level and pass as prop to panels.

**`/app/super-admin/team/page.tsx`** — new page (table + modals, as described in section 3).

**`/app/suspended/page.tsx`** — suspension lockout check extended: `ctx.role !== "super_admin" && ctx.role !== "platform_observer"`.

**View-as banner** — guard against `ctx.tenantId === null` before comparing to `superAdminHomeTenantId`.

---

## Section 5 — Testing strategy

### Bucket 1 — RLS privacy boundary (highest priority)

DB-level integration tests. Three actor setups:
- Regular member of tenant A.
- Super-admin with no active tenant (`profiles.tenant_id = NULL`).
- Super-admin view-as'd into tenant A (`profiles.tenant_id = A`).

For each of the 22 business tables, assert:
- Member reads A's rows → succeeds.
- View-as'd super-admin reads A's rows → succeeds.
- Super-admin without active tenant reads A's rows → zero rows.
- All three cannot read tenant B's rows.
- View-as'd super-admin can insert into A → succeeds.
- Super-admin without active tenant cannot insert into any tenant → fails RLS.

Bonus assertion: scan `pg_policies` to verify no business-table policy references `is_super_admin` (catches future regressions).

File: `supabase/__tests__/rls_business_tables.test.ts`.

### Bucket 2 — Platform-table policies

- `platform_observer` can SELECT from `tenant`, `tenant_subscription`, `profile_tenant_access`, `super_admin_audit_log`.
- `platform_observer` cannot INSERT/UPDATE/DELETE on those tables.
- `member` cannot SELECT from `super_admin_audit_log`.

File: `supabase/__tests__/rls_platform_tables.test.ts`.

### Bucket 3 — Guard helpers

`src/lib/super-admin/guard.test.ts`:

| Helper | member | observer | super_admin | no auth |
|---|---|---|---|---|
| `requireSuperAdmin` | throws | throws | passes | throws |
| `requirePlatformOperator` | throws | passes | passes | throws |

### Bucket 4 — Existing action deltas

`createTenant` — assert no `profile_tenant_access` row inserted for actor.

`viewAsTenant` — add case: `platform_observer` succeeds (was previously `requireSuperAdmin`, now `requirePlatformOperator`).

`exitViewAs` — two cases:
- `superAdminHomeTenantId` set → `set_active_tenant` called with that ID, redirect to `/app/super-admin`.
- `superAdminHomeTenantId` null → `profiles.tenant_id` cleared to null, redirect to `/app/super-admin`.

### Bucket 5 — Team actions

`src/app/app/super-admin/team/actions.test.ts`:

| Action | Cases |
|---|---|
| `addPlatformUser` | non-super_admin → forbidden; happy path → role updated + audit row; email not found → explicit error message |
| `changePlatformUserRole` | non-super_admin → forbidden; last super_admin demoted → throws; two super_admins → succeeds + audit row |
| `removePlatformUser` | non-super_admin → forbidden; target has null tenant_id → throws "set a tenant first"; happy path → role = member + home tenant cleared; last super_admin → throws |

### Bucket 6 — Layout/redirect integration

- GET `/app` as tenant-less super-admin → redirect to `/app/super-admin`.
- GET `/app/super-admin` as `platform_observer` → 200, no redirect.
- GET `/app/super-admin` as `member` → redirect to `/app`.

### Bucket 7 — `getServerTenantContext`

`src/lib/tenant/context.test.ts`:

- No auth → null.
- Deactivated → null.
- `tenant_id` null + `role = 'super_admin'` → context with `tenantId: null`.
- `tenant_id` null + `role = 'platform_observer'` → context with `tenantId: null`.
- `tenant_id` null + `role = 'member'` → null.
- `tenant_id` set → context with that tenant.
- `tenant_id` set but no `profile_tenant_access` row, role `member` → falls back to first available tenant (existing behavior regression).

---

## Section 6 — Rollout

### Order of operations

1. Apply `super_admin_foundation.sql` against local Supabase stack. Smoke the RLS changes (business tables deny super-admin without active tenant; platform module loads; view-as works).
2. Write all code changes in one PR (see implementation plan for step-by-step breakdown).
3. `tsc --noEmit` — every `ctx.tenantId` read in `/app` routes now has type `string | null`; compiler surfaces affected sites.
4. `rg "is_super_admin" src/` — confirm no TS code branches on this to take a cross-tenant business-table query.
5. Vitest suite passes.
6. Deploy to Vercel preview branch.
7. Smoke as kasper (checklist below).
8. Promote to prod.
9. Manual DB sweep: remove kasper's auto-added `profile_tenant_access` rows for non-sandbox tenants.

### Post-deploy smoke checklist

- [ ] Log in as kasper. Land on `/app/super-admin`. Tenants list renders.
- [ ] Enter view-as on a tenant. `/app` renders. Orders / inventory / BOMs visible.
- [ ] Exit view-as. Land on `/app/super-admin`. Navigate to `/app/inventory` directly → redirect (no active tenant).
- [ ] Audit log shows `view_as`, `exit_view_as` (or `exit_view_as_no_home`), `privacy_model_tightened`.
- [ ] Team page renders. kasper listed as `super_admin`.
- [ ] Add a throwaway `platform_observer`. Log in as observer: reads all platform pages, mutation buttons disabled, view-as works, audit entry written.
- [ ] Demote / re-promote observer.

### Rollback

If RLS tightening breaks prod, rollback requires both:
1. Redeploy previous app code.
2. Apply `super_admin_foundation_rollback.sql` — a canned SQL file (committed alongside the forward migration) that re-runs the original v1 policy loop restoring `(tenant_id = current_tenant_id()) or is_super_admin()` on the 22 business tables.

The `profiles.tenant_id NOT NULL` constraint drop is left in place during rollback — a nullable column tolerates non-null values.

---

## Appendix — v2 features backlog

Decisions captured during brainstorm on 2026-05-28. Each item is implementation-ready only after a dedicated sub-spec.

### F1 — Integration health + tenant vitals

**Chosen approach:** Build a focused per-tenant view inside the platform module: Shopify/Xero/Stripe connection state (last sync, last error, token expiry), plus aggregate vitals (last sign-in across any member, 7-day active member count, 7-day write activity, per-domain row counts: SKUs, BOMs, orders, suppliers). No PII. Visible without view-as (consistent with privacy model B — aggregate metadata is always permitted).

**Rationale:** Vercel/Supabase cover infra observability. Application-level integration health (Shopify token expired, Xero webhook down) is uniquely in-app. Aggregate signal is needed to triage before deciding whether to view-as.

### F2 — Hybrid plans + `plan_overrides`

**Chosen approach:** Keep tier enum (`starter | growth | pro | enterprise`) for Stripe alignment. Add a `plan_overrides (tenant_id, key, value, set_by, set_at)` table for per-tenant deviations — custom price, extra module unlocked, raised limit. Super-admin platform UI lists and edits overrides per tenant.

**Rationale:** Full data-driven `plan` table is premature. Per-tenant comps are genuinely needed (friendly deals, beta testers, support resolutions). Skinny override table bought without ripping out the tier enum. Reconsider full plan table when pricing complexity outgrows enum + overrides.

### F3 — Generic `tenant_feature_flag` table

**Chosen approach:** `tenant_feature_flag (tenant_id, flag_key, enabled, set_by, set_at)`. TS registry of known flag keys (a `KNOWN_FLAGS` const object with display names and descriptions) to drive the platform UI — avoids free-text typos in flag keys. Super-admin can toggle any registered flag per tenant.

**Rationale:** Boolean column per feature doesn't scale past 3–5 flags (each one is a schema migration). Generic table + typed registry is the standard pattern at this scale. External flag service (LaunchDarkly etc.) is overkill — reconsider at multi-region scale or marketing-led A/B testing.

### F4 — Manual hard purge + on-demand data export

**Chosen approach:** Two actions, both `super_admin` only:
- **"Purge tenant"** — available on soft-deleted tenants only. Name-confirmation + reason textarea. Schedules a purge with a 24h cooling-off period. After 24h, a server action (or scheduled function) cascades deletes across all tenant-scoped tables. Audit-logged.
- **"Export tenant data"** — generates a ZIP of CSVs covering all tenant-scoped tables. Stored in Vercel Blob with a signed URL valid 24h, emailed to the actor's address.

**Rationale:** AU Privacy Act + GDPR require both. 24h cooling-off on purge makes irreversibility deliberate. Automatic cron-based purge creates incident surface area not yet justified. Reconsider auto-cron when soft-deleted tenant volume accumulates.

### F5 — Editable email templates + targeted system announcements

**Chosen approach:**
- **Email templates:** `email_template (key, subject, body_mjml, updated_at, updated_by)`. App's email-send module looks up the row by key, falls back to the code-default if no row exists (so a missing template never breaks transactional email). Super-admin can edit and preview templates; a "Send test" action emails the actor.
- **System announcements:** `system_announcement (id, message, cta_label?, cta_href?, starts_at, ends_at, tenant_filter jsonb?, created_by)`. Renders as a dismissible banner in `/app` for all matching tenants. `tenant_filter` is a JSON predicate (e.g. `{"tier": "starter"}`, `{"has_shopify": false}`) evaluated at render time.

**Rationale:** Email copy iteration is faster than code PRs. DB-stored + code fallback is safe. Targeted announcements avoid blasting unrelated tenants for feature-specific notices. Recommended implementation order: F1, F3, F2, F4, F5.

### What is ruled out (do not revisit without new evidence)

- Full data-driven `plan` table (F2 alternative). Reconsider if pricing complexity outgrows enum + overrides.
- External flag service (F3 alternative). Reconsider at multi-region scale.
- Automatic purge cron (F4 alternative). Reconsider once first 50+ deleted tenants accumulate.
- Read-only email template viewer (F5 alternative). Reconsider if a typo causes a transactional email incident.
- Bulk tenant operations (suspend many at once).
- Stripe-side writes from super-admin.
- Self-serve "mark as sandbox" UI (set `super_admin_home_tenant_id` from the platform module).
- Revenue / MRR / churn analytics dashboard (deliberately excluded — not needed to run the product).
- Customer PII access without view-as (deliberately excluded — privacy model B).
