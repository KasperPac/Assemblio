# Super-Admin Tenant Management — Design

**Date:** 2026-05-28
**Status:** Approved design, pending implementation plan

---

## Goal

Give a small set of trusted users (initially just kasper@pac-technologies) the ability to manage tenants across the platform: create, suspend, extend trials, change plans, edit members, view-as for support, and soft-delete. Build on the existing super_admin primitives already in the schema (RLS, helpers, provisioning script) rather than reinventing them.

---

## What already exists (do not rebuild)

- `profiles.role = 'super_admin'` is the canonical flag.
- SQL helpers: `is_super_admin()`, `has_tenant_access(uuid)`, `set_active_tenant(uuid)`, `current_tenant_id()`.
- RLS on ~22 tenant-scoped tables already lets `is_super_admin()` bypass tenant isolation.
- `getServerTenantContext()` (`src/lib/tenant/context.ts`) already returns `role` and special-cases super_admin.
- `scripts/provision_super_admin.mjs` can promote a user.
- `tenant_subscription` already holds `selected_tier`, `status`, `trial_ends_at`, Stripe IDs.

---

## Decisions captured

| Decision | Choice |
|---|---|
| v1 scope | List + detail + members + impersonate, create + suspend, extend trial + change plan/status, edit members + soft-delete |
| UI location | Dedicated `/app/super-admin/*` route group |
| Impersonation | Reuse existing `set_active_tenant()` + persistent "Viewing as" banner |
| Suspension | `tenant.suspended_at` + reason, lockout enforced at `/app` layout |
| Audit logging | Dedicated append-only `super_admin_audit_log` table |
| Delete | Soft (`tenant.deleted_at`); restorable; hard purge deferred |
| Stripe writes from super-admin | Out of scope — plan/status changes are DB-only with `manual_override_at` flag |

---

## Schema changes

One migration file: `supabase/patches/super_admin_v1.sql`.

### `tenant` — add columns

```sql
alter table public.tenant
  add column suspended_at      timestamptz,
  add column suspended_reason  text,
  add column deleted_at        timestamptz;
```

### `tenant_subscription` — add column

```sql
alter table public.tenant_subscription
  add column manual_override_at timestamptz;
```

Used by `/api/webhooks/stripe` to skip overwriting a row that was manually edited by a super_admin more recently than the webhook event timestamp.

### `profiles` — add column

```sql
alter table public.profiles
  add column super_admin_home_tenant_id uuid references public.tenant(id);
```

Set at promotion time. Gives "Exit view-as" a deterministic place to return to.

### `super_admin_audit_log` — new table

```sql
create table public.super_admin_audit_log (
  id                uuid primary key default gen_random_uuid(),
  actor_id          uuid not null references auth.users(id),
  action            text not null,
  target_tenant_id  uuid references public.tenant(id),
  target_user_id    uuid references auth.users(id),
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

alter table public.super_admin_audit_log enable row level security;

create policy super_admin_audit_log_select on public.super_admin_audit_log
  for select using (public.is_super_admin());

create policy super_admin_audit_log_insert on public.super_admin_audit_log
  for insert with check (public.is_super_admin());

-- No update or delete policies → effectively append-only.
```

`action` is a free-text string. The known set in v1: `create_tenant`, `suspend_tenant`, `unsuspend_tenant`, `extend_trial`, `change_plan`, `soft_delete_tenant`, `restore_tenant`, `view_as`, `add_member`, `remove_member`, `change_role`.

### One-time data fix

```sql
update public.profiles
set role = 'super_admin',
    super_admin_home_tenant_id = tenant_id
where id = '5a019756-ede3-4614-be1e-41afed6b6b63'; -- kasper.simonsen@pac-technologies.com.au
```

---

## Routing & gating

### New route group

```
src/app/app/super-admin/
  layout.tsx                          # gate: redirect non-super_admin → /app
  page.tsx                            # tenants list (default landing)
  tenants/
    [tenantId]/
      page.tsx                        # tenant detail
      actions.ts                      # suspend, extend, change plan, delete, members
  audit/
    page.tsx                          # global audit log table
  actions.ts                          # createTenant, viewAsTenant, exitViewAs
```

### Layout-level gate

```ts
// src/app/app/super-admin/layout.tsx
const ctx = await getServerTenantContext();
if (!ctx || ctx.role !== "super_admin") redirect("/app");
```

Defence-in-depth: every server action ALSO re-checks `ctx.role === "super_admin"`. RLS is the ultimate enforcement — RLS policies on `super_admin_audit_log` and member-management writes already require `is_super_admin()`.

### Sidebar

In the existing app sidebar, render a "Platform" entry pointing to `/app/super-admin` **only** when `ctx.role === "super_admin"`. Distinct icon (shield or grid).

### Suspension lockout

In `/app/layout.tsx` (the tenant-scoped app shell, not super-admin), after fetching tenant context:

```ts
const { data: tenantRow } = await supabase
  .from("tenant")
  .select("suspended_at, deleted_at")
  .eq("id", ctx.tenantId)
  .single();

if ((tenantRow?.suspended_at || tenantRow?.deleted_at) && ctx.role !== "super_admin") {
  redirect("/app/suspended");
}
```

`/app/suspended/page.tsx` is a static page: "This account is currently suspended. Contact support."

### View-as banner

`getServerTenantContext()` is extended to additionally select `super_admin_home_tenant_id` from `profiles` (one extra column, no extra query). In `/app/layout.tsx`, when `ctx.role === "super_admin"` AND `ctx.tenantId !== ctx.superAdminHomeTenantId`, render a sticky top banner: **"Viewing as `<tenant name>`. [Exit]"**. The Exit link posts to `exitViewAs()` server action.

---

## UI surface

All pages use the canonical `<table>` primitive established by the orders redesign and the standard settings-style detail layout.

### `/app/super-admin` — Tenants list

| Column | Source |
|---|---|
| Name | `tenant.name` |
| Status | derived: `Suspended` > `Deleted` > subscription status pill (Trialing / Active / Past due / Canceled) |
| Plan | `tenant_subscription.selected_tier` |
| Trial ends | `tenant_subscription.trial_ends_at` (relative) |
| Members | `count(profile_tenant_access where tenant_id = …)` |
| Created | `tenant.created_at` |

Header: filter pills (All / Trialing / Active / Past due / Suspended / Deleted) + search box. Row click → detail. Top-right action: **+ New tenant**.

### `/app/super-admin/tenants/[tenantId]` — Tenant detail

Stacked sections:

1. **Header card** — name, status pills, created date. Action menu (kebab):
   - View as
   - Suspend / Unsuspend
   - Extend trial
   - Change plan
   - Soft-delete / Restore
2. **Subscription panel** — `tier` (editable), `status` (editable), `trial_ends_at` (date picker), Stripe IDs read-only with link out to Stripe dashboard.
3. **Members panel** — list of `profile_tenant_access` rows with email + role. Per-row actions: change role, remove. **+ Add member** opens a picker (existing profile by email) or invite-by-email (reuses existing `tenant_invitation` flow).
4. **Recent audit** — last 20 `super_admin_audit_log` entries scoped to this tenant, expandable.

Each action opens a modal with a change preview + a **Reason** textarea (saved to `metadata.reason`). Destructive ones (suspend, soft-delete) require typing the tenant's name to enable the confirm button.

### `/app/super-admin/audit` — Global audit log

Flat table of `super_admin_audit_log`: timestamp, actor, action pill, target tenant (linked), target user, expandable metadata JSON. Filterable by action type and date range.

### `+ New tenant` modal

Fields: name, timezone (default: actor's timezone), currency (default: AUD), initial plan tier, trial length in days (default: 14).

On submit, in a single server action:

1. Insert `tenant` row.
2. Insert `tenant_subscription` (status: `trialing`, trial_ends_at: `now() + N days`).
3. Insert `profile_tenant_access` for the super_admin actor (role: `admin`) so the new tenant is immediately reachable via view-as.
4. Write `create_tenant` audit entry.

Return new tenant ID and redirect to detail page.

---

## Server actions

All actions live under `src/app/app/super-admin/**/actions.ts`, marked `"use server"`. Every action:

1. Calls `getServerTenantContext()`; throws `forbidden` if `role !== "super_admin"`.
2. Performs the mutation.
3. Writes a `super_admin_audit_log` row with `actor_id = ctx.userId`, `metadata.reason = input.reason`.
4. Steps 2 and 3 run sequentially with the audit insert last; if the mutation succeeds but the audit insert fails, we still return success — the action succeeded, the missing audit row is a logged warning. (Wrapping in a Postgres function for a true single transaction is a v2 nice-to-have.)

### Action contracts

| Action | Input | Effect |
|---|---|---|
| `createTenant` | `{ name, timezone, currency, tier, trialDays, reason? }` | Insert tenant + tenant_subscription + profile_tenant_access(actor). Returns `tenantId`. |
| `suspendTenant` | `{ tenantId, reason }` | `tenant.suspended_at = now()`, `suspended_reason = reason`. |
| `unsuspendTenant` | `{ tenantId, reason? }` | Clear `suspended_at`, `suspended_reason`. |
| `extendTrial` | `{ tenantId, newTrialEndsAt, reason? }` | Overwrite `trial_ends_at`. Validates `newTrialEndsAt > now()`. |
| `changePlan` | `{ tenantId, selected_tier?, status?, reason? }` | Overwrite either or both. Sets `manual_override_at = now()`. |
| `softDeleteTenant` | `{ tenantId, reason }` | `tenant.deleted_at = now()`. |
| `restoreTenant` | `{ tenantId, reason? }` | Clear `deleted_at`. |
| `viewAsTenant` | `{ tenantId }` | Calls `set_active_tenant(tenantId)`, logs `view_as`, redirects to `/app`. |
| `exitViewAs` | `{}` | Calls `set_active_tenant(profiles.super_admin_home_tenant_id)`, redirects to `/app`. |
| `addMember` | `{ tenantId, profileId, role, reason? }` | Insert `profile_tenant_access`. |
| `removeMember` | `{ tenantId, profileId, reason? }` | Delete the row. |
| `changeMemberRole` | `{ tenantId, profileId, newRole, reason? }` | Update the row. |

### Stripe-webhook interplay

`src/lib/stripe/webhook-events.ts` is updated: every `.update("tenant_subscription")` call gains a `.is("manual_override_at", null)` filter. If a super_admin has touched the row, the webhook simply doesn't match it and the comp is preserved. Re-enabling Stripe-driven updates is an explicit super_admin action: clear `manual_override_at` from the tenant detail page.

---

## Testing

Vitest, co-located.

- One `actions.test.ts` per actions file. For each action:
  - non-super_admin → throws `forbidden`
  - happy path → expected rows mutated + matching audit log entry
  - one realistic edge case (e.g. `extendTrial` with past date rejects; `suspend` an already-suspended tenant is idempotent and re-logs)
- `getServerTenantContext` mocked at module level; DB writes hit the test Supabase schema via the standard harness.
- One integration test for the layout gate: non-super_admin GET `/app/super-admin` → redirect to `/app`.
- One integration test for the suspension lockout: a member of a suspended tenant → redirect to `/app/suspended`.

---

## Rollout sequence

1. Apply `supabase/patches/super_admin_v1.sql` (all schema deltas above).
2. Run the data fix: promote kasper and set `super_admin_home_tenant_id`.
3. Ship UI + actions. No feature flag — the page only renders for super_admins.
4. Smoke-test in prod by creating a throwaway tenant, suspending, extending trial, changing plan, soft-deleting, restoring. Verify each appears in the audit log.

---

## Non-goals for v1

- Bulk operations (suspend many at once).
- Stripe-side writes from super-admin (no creating subscriptions, no refunds).
- Tenant rename history / merge / split.
- Notification to tenant on suspend or delete (they'll see the lockout screen).
- Self-serve "promote second super_admin" flow — promotion stays manual via `scripts/provision_super_admin.mjs` or direct SQL.
- Hard delete with cascade purge — kept soft-only; a separate purge job for tenants `deleted_at > 30 days` can land later.
