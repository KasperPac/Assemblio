# Activity Logging — Audit Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the activity log into a reliable, customer-facing audit trail that records all meaningful mutations across every domain with real actor names, typed system actors, and full server-side paged/filterable history.

**Architecture:** A single typed event catalog (`src/lib/activity/events.ts`) plus a pure row-builder (`buildActivityRow`) feed two thin writers — `logActivity` (user-session actions, resolves actor from `getServerTenantContext()`) and `logSystemActivity` (Shopify/Stripe/system, admin client + explicit tenant/actor). Both swallow errors so logging never breaks a business flow. The DB gets new first-class columns (`actor_type`, `actor_label`, `entity_type`, `entity_id`, `summary`) via an additive patch. The read page is rebuilt as a server component that filters/pages against the DB using `searchParams`.

**Tech Stack:** Next.js 15 App Router (server components + server actions), Supabase Postgres (PostgREST), TypeScript, Vitest. CSS Modules + `_ui/` primitives + Manuva design tokens.

**Reference spec:** `docs/superpowers/specs/2026-06-17-activity-logging-audit-trail-design.md`

---

## Conventions used in this plan

- **Test runner:** `npm test` (`vitest run --pool threads --maxWorkers 1`). Run a single file with `npx vitest run <path>`.
- **Type check:** `npx tsc --noEmit` (there is no `typecheck` npm script).
- **Event key convention:** `domain.action` (e.g. `component.created`, `bom.line_added`).
- **Canonical user-side call** (added after a mutation's success guard, before `revalidatePath`/return):

  ```ts
  await logActivity({ event: "component.created", entityId: newComponent.id, metadata: { name } });
  ```

- **Canonical system-side call** (admin client, tenant known):

  ```ts
  await logSystemActivity({
    supabase: admin,
    tenantId,
    event: "shopify.sync_completed",
    actorType: "shopify",
    actorLabel: "Shopify sync",
    metadata: { shop_domain: shopDomain, products: products.length },
  });
  ```

- **Coverage granularity note:** The wiring of `logActivity` calls into ~25 action files is mechanical glue, not logic. Logic lives in `buildActivityRow` + the catalog + query helpers, which get full TDD (Phase 1–2). Coverage tasks (Phase 3) are verified by `npx tsc --noEmit` (every `event` string must exist in the catalog or it's a type error) plus the catalog test (every event yields a non-empty summary), rather than a separate unit test per call site.

---

## Phase 1 — Foundation (DB + helpers)

### Task 1: Additive migration — new activity_log columns + indexes

**Files:**
- Create: `supabase/patches/activity_log_audit_columns.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Activity log: promote audit fields to first-class columns for a customer-facing
-- audit trail (actor type/label snapshot, entity reference, human summary) + indexes
-- for server-side paged filtering. Additive only; existing rows keep working.

ALTER TABLE public.activity_log
  ADD COLUMN IF NOT EXISTS actor_type  text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS actor_label text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id   uuid,
  ADD COLUMN IF NOT EXISTS summary     text;

CREATE INDEX IF NOT EXISTS activity_log_tenant_created_idx
  ON public.activity_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_tenant_event_idx
  ON public.activity_log (tenant_id, event);
CREATE INDEX IF NOT EXISTS activity_log_tenant_actor_idx
  ON public.activity_log (tenant_id, actor_id);
CREATE INDEX IF NOT EXISTS activity_log_tenant_entity_idx
  ON public.activity_log (tenant_id, entity_type, entity_id);
```

- [ ] **Step 2: Apply the migration to the dev project**

Apply via the Supabase MCP `apply_migration` tool (name: `activity_log_audit_columns`) OR, if using local CLI, `supabase db push`. Confirm success.

- [ ] **Step 3: Verify columns exist**

Run (MCP `execute_sql` or psql):
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'activity_log'
ORDER BY ordinal_position;
```
Expected: includes `actor_type`, `actor_label`, `entity_type`, `entity_id`, `summary`.

- [ ] **Step 4: Mirror the change into the canonical schema file**

Edit `supabase/schema.sql` — the `create table public.activity_log (...)` block (around line 565) — adding the five columns to keep the checked-in schema authoritative:

```sql
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  actor_id uuid references auth.users(id),
  actor_type text not null default 'user',
  actor_label text,
  event text not null,
  entity_type text,
  entity_id uuid,
  summary text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 5: Commit**

```bash
git add supabase/patches/activity_log_audit_columns.sql supabase/schema.sql
git commit -m "feat(activity): add audit columns + indexes to activity_log"
```

---

### Task 2: Event catalog (`events.ts`)

**Files:**
- Create: `src/lib/activity/events.ts`
- Test: `src/lib/activity/events.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { ACTIVITY_EVENTS } from "./events";

describe("ACTIVITY_EVENTS catalog", () => {
  it("every event produces a non-empty summary string", () => {
    for (const [key, def] of Object.entries(ACTIVITY_EVENTS)) {
      const summary = def.summary({ name: "X", poNumber: "PO-1", email: "a@b.c", version: 2 });
      expect(typeof summary, key).toBe("string");
      expect(summary.length, key).toBeGreaterThan(0);
    }
  });

  it("entityType is a non-empty string or null", () => {
    for (const [key, def] of Object.entries(ACTIVITY_EVENTS)) {
      if (def.entityType !== null) {
        expect(def.entityType.length, key).toBeGreaterThan(0);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/activity/events.test.ts`
Expected: FAIL — cannot resolve `./events`.

- [ ] **Step 3: Write the catalog**

Create `src/lib/activity/events.ts`. `summary` builders must tolerate missing metadata keys (coalesce). This is the complete catalog; Phase 3 tasks wire calls to these keys.

```ts
export type ActivityActorType = "user" | "system" | "shopify" | "stripe";

type SummaryFn = (meta: Record<string, unknown>) => string;

export type ActivityEventDef = {
  entityType: string | null;
  summary: SummaryFn;
};

const s = (v: unknown, fallback = ""): string => {
  if (v === null || v === undefined) return fallback;
  return String(v);
};

export const ACTIVITY_EVENTS = {
  // --- Components ---
  "component.created": { entityType: "component", summary: (m) => `Created component ${s(m.name)}`.trim() },
  "component.updated": { entityType: "component", summary: (m) => `Updated component ${s(m.name)}`.trim() },
  "component.bin_location_updated": { entityType: "component", summary: (m) => `Updated bin location for ${s(m.name, "component")}` },
  "component.supplier_updated": { entityType: "component", summary: () => `Updated component supplier link` },
  "component.archived": { entityType: "component", summary: (m) => `Archived component ${s(m.name)}`.trim() },
  "component.image_updated": { entityType: "component", summary: (m) => `Updated image for ${s(m.name, "component")}` },
  "component.image_removed": { entityType: "component", summary: (m) => `Removed image for ${s(m.name, "component")}` },
  "component_group.created": { entityType: "component_group", summary: (m) => `Created group ${s(m.name)}`.trim() },

  // --- BOMs ---
  "bom.created": { entityType: "bom", summary: (m) => `Created BOM v${s(m.version, "1")}` },
  "bom.draft_created": { entityType: "bom", summary: () => `Created draft BOM` },
  "bom.created_from_template": { entityType: "bom", summary: (m) => `Created BOM from template ${s(m.templateName)}`.trim() },
  "bom.duplicated": { entityType: "bom", summary: () => `Duplicated BOM as draft` },
  "bom.status_changed": { entityType: "bom", summary: (m) => `Changed BOM status to ${s(m.status)}`.trim() },
  "bom.activated": { entityType: "bom", summary: () => `Set BOM active` },
  "bom.archived": { entityType: "bom", summary: () => `Archived BOM` },
  "bom.deleted": { entityType: "bom", summary: () => `Deleted draft BOM` },
  "bom.template_published": { entityType: "bom", summary: (m) => `Published template to BOM v${s(m.new_version)}` },
  "bom.line_added": { entityType: "bom", summary: () => `Added BOM component line` },
  "bom.line_updated": { entityType: "bom", summary: () => `Updated BOM component line` },
  "bom.line_removed": { entityType: "bom", summary: () => `Removed BOM component line` },
  "bom.lines_reordered": { entityType: "bom", summary: () => `Reordered BOM component lines` },
  "bom.labor_added": { entityType: "bom", summary: (m) => `Added labor step ${s(m.operationName)}`.trim() },
  "bom.labor_updated": { entityType: "bom", summary: (m) => `Updated labor step ${s(m.operationName)}`.trim() },
  "bom.labor_removed": { entityType: "bom", summary: () => `Removed labor step` },
  "bom.labor_template_applied": { entityType: "bom", summary: (m) => `Applied labor template ${s(m.templateName)}`.trim() },
  "product.notification_set": { entityType: "product", summary: () => `Set product notification trigger` },
  "product.notification_removed": { entityType: "product", summary: () => `Removed product notification trigger` },

  // --- Templates ---
  "template.created": { entityType: "bom_template", summary: (m) => `Created template ${s(m.name)}`.trim() },
  "template.updated": { entityType: "bom_template", summary: () => `Updated template lines` },
  "template.reordered": { entityType: "bom_template", summary: () => `Reordered template lines` },
  "template.deleted": { entityType: "bom_template", summary: () => `Deleted template` },
  "labor_template.created": { entityType: "labor_template", summary: (m) => `Created labor template ${s(m.name)}`.trim() },
  "labor_template.updated": { entityType: "labor_template", summary: () => `Updated labor template` },
  "labor_template.deleted": { entityType: "labor_template", summary: () => `Deleted labor template` },

  // --- Purchasing & inwards ---
  "purchase_order.created": { entityType: "purchase_order", summary: (m) => `Created ${s(m.poNumber, "purchase order")}` },
  "purchase_order.status_changed": { entityType: "purchase_order", summary: (m) => `Changed PO status to ${s(m.status)}`.trim() },
  "purchase_order.line_added": { entityType: "purchase_order", summary: () => `Added purchase order line` },
  "purchase_order.line_updated": { entityType: "purchase_order", summary: () => `Updated purchase order line quantity` },
  "goods_receipt.created": { entityType: "delivery_receipt", summary: (m) => `Created delivery receipt ${s(m.reference)}`.trim() },
  "goods_receipt.linked_to_po": { entityType: "delivery_receipt", summary: () => `Linked receipt to purchase order` },
  "goods_receipt.updated": { entityType: "delivery_receipt", summary: () => `Updated delivery receipt` },
  "supplier.created": { entityType: "supplier", summary: (m) => `Created supplier ${s(m.name)}`.trim() },
  "supplier.updated": { entityType: "supplier", summary: () => `Updated supplier` },
  "supplier.archived": { entityType: "supplier", summary: () => `Archived supplier` },
  "supplier.contact_added": { entityType: "supplier", summary: () => `Added supplier contact` },
  "supplier.contact_removed": { entityType: "supplier", summary: () => `Removed supplier contact` },
  "supplier.component_linked": { entityType: "supplier", summary: () => `Linked component to supplier` },
  "supplier.component_updated": { entityType: "supplier", summary: () => `Updated supplier component` },
  "supplier.component_unlinked": { entityType: "supplier", summary: () => `Unlinked component from supplier` },
  "supplier.preferred_changed": { entityType: "supplier", summary: () => `Changed preferred supplier` },
  "supplier.price_break_added": { entityType: "supplier", summary: () => `Added supplier price break` },
  "supplier.price_break_removed": { entityType: "supplier", summary: () => `Removed supplier price break` },

  // --- Inventory ---
  "inventory.movement_logged": { entityType: "component", summary: () => `Logged inventory movement` },
  "stocktake.opened": { entityType: "stocktake_session", summary: (m) => `Opened stocktake ${s(m.reference)}`.trim() },
  "stocktake.status_changed": { entityType: "stocktake_session", summary: (m) => `Changed stocktake status to ${s(m.status)}`.trim() },
  "stocktake.submitted": { entityType: "stocktake_session", summary: () => `Submitted stocktake for review` },
  "stocktake.applied": { entityType: "stocktake_session", summary: (m) => `Applied stocktake (${s(m.applied_lines, "0")} lines)` },
  "stocktake.sent_back": { entityType: "stocktake_session", summary: () => `Sent stocktake back for recount` },
  "stocktake.opening_stock_applied": { entityType: "stocktake_session", summary: () => `Applied opening stock` },
  "location.created": { entityType: "location", summary: (m) => `Created location ${s(m.name)}`.trim() },
  "location.updated": { entityType: "location", summary: (m) => `Updated location ${s(m.name)}`.trim() },
  "location.default_changed": { entityType: "location", summary: (m) => `Set default location to ${s(m.location_name)}`.trim() },
  "sub_location.created": { entityType: "bin_sub_location", summary: (m) => `Created sub-location ${s(m.name)}`.trim() },
  "sub_location.updated": { entityType: "bin_sub_location", summary: (m) => `Updated sub-location ${s(m.name)}`.trim() },
  "sub_location.deleted": { entityType: "bin_sub_location", summary: () => `Deleted sub-location` },
  "aisle.created": { entityType: "bin_aisle", summary: (m) => `Created aisle ${s(m.name)}`.trim() },
  "aisle.updated": { entityType: "bin_aisle", summary: (m) => `Updated aisle ${s(m.name)}`.trim() },
  "aisle.deleted": { entityType: "bin_aisle", summary: () => `Deleted aisle` },
  "bay.created": { entityType: "bin_bay", summary: (m) => `Created bay ${s(m.name)}`.trim() },
  "bay.updated": { entityType: "bin_bay", summary: (m) => `Updated bay ${s(m.name)}`.trim() },
  "bay.deleted": { entityType: "bin_bay", summary: () => `Deleted bay` },

  // --- Orders & production ---
  "order.allocation_run": { entityType: "order", summary: (m) => `Ran allocation (${s(m.changes_applied, "0")} changes)` },
  "order.labor_plan_updated": { entityType: "order", summary: () => `Updated job labor plan week` },
  "production.job_started": { entityType: "order_line", summary: () => `Started job` },
  "production.step_started": { entityType: "job_routing_step", summary: () => `Started routing step` },
  "production.step_completed": { entityType: "job_routing_step", summary: () => `Completed routing step` },
  "production.actual_time_logged": { entityType: "order_line", summary: () => `Logged actual time entry` },
  "capacity.week_refreshed": { entityType: null, summary: (m) => `Refreshed capacity for week ${s(m.week)}`.trim() },
  "staffing.week_prepared": { entityType: null, summary: (m) => `Prepared staffing for week ${s(m.weekStart)}`.trim() },
  "staff.created": { entityType: "staff_member", summary: (m) => `Added staff member ${s(m.name)}`.trim() },
  "staff.updated": { entityType: "staff_member", summary: () => `Updated staff member` },
  "department.created": { entityType: "department", summary: (m) => `Created department ${s(m.name)}`.trim() },
  "department.updated": { entityType: "department", summary: () => `Updated department` },
  "department.rate_changed": { entityType: "component", summary: () => `Updated department rate` },
  "department.rate_removed": { entityType: "component", summary: () => `Removed department` },
  "department.rate_added": { entityType: "component", summary: (m) => `Added department ${s(m.name)}`.trim() },
  "costing.financial_plans_generated": { entityType: null, summary: (m) => `Generated financial plans for week ${s(m.weekStart)}`.trim() },

  // --- Settings / admin ---
  "team.member_invited": { entityType: null, summary: (m) => `Invited ${s(m.email)}`.trim() },
  "team.invite_revoked": { entityType: null, summary: () => `Revoked invitation` },
  "team.invite_resent": { entityType: null, summary: (m) => `Resent invitation to ${s(m.email)}`.trim() },
  "team.role_changed": { entityType: null, summary: (m) => `Changed member role to ${s(m.role)}`.trim() },
  "team.member_deactivated": { entityType: null, summary: () => `Deactivated member` },
  "profile.updated": { entityType: null, summary: () => `Updated profile` },
  "profile.avatar_updated": { entityType: null, summary: () => `Updated avatar` },
  "company.updated": { entityType: null, summary: (m) => `Updated company ${s(m.name)}`.trim() },
  "company.logo_updated": { entityType: null, summary: () => `Updated company logo` },
  "settings.order_sla_updated": { entityType: null, summary: () => `Updated order SLA settings` },
  "integration.stats_only_set": { entityType: null, summary: () => `Updated Shopify import cutoff` },

  // --- Lifecycle / system ---
  "trash.emptied": { entityType: null, summary: () => `Emptied trash` },
  "trash.purchase_order_restored": { entityType: "purchase_order", summary: () => `Restored purchase order` },
  "trash.stocktake_restored": { entityType: "stocktake_session", summary: () => `Restored stocktake` },
  "trash.bom_restored": { entityType: "bom", summary: () => `Restored BOM` },
  "shopify.sync_completed": { entityType: null, summary: (m) => `Shopify sync completed (${s(m.products, "0")} products)` },
  "shopify.app_uninstalled": { entityType: null, summary: () => `Shopify app uninstalled` },
  "subscription.activated": { entityType: null, summary: (m) => `Subscription activated (${s(m.tier)} ${s(m.billing)})`.trim() },
} satisfies Record<string, ActivityEventDef>;

export type ActivityEvent = keyof typeof ACTIVITY_EVENTS;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/activity/events.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/activity/events.ts src/lib/activity/events.test.ts
git commit -m "feat(activity): add typed event catalog"
```

---

### Task 3: Pure row-builder (`buildActivityRow`)

**Files:**
- Create: `src/lib/activity/build.ts`
- Test: `src/lib/activity/build.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildActivityRow } from "./build";

describe("buildActivityRow", () => {
  it("populates entity_type and summary from the catalog", () => {
    const row = buildActivityRow({
      event: "component.created",
      tenantId: "t1",
      actorId: "u1",
      actorType: "user",
      actorLabel: "Kasper",
      entityId: "c1",
      metadata: { name: "Resistor" },
    });
    expect(row).toMatchObject({
      tenant_id: "t1",
      actor_id: "u1",
      actor_type: "user",
      actor_label: "Kasper",
      event: "component.created",
      entity_type: "component",
      entity_id: "c1",
      summary: "Created component Resistor",
      metadata: { name: "Resistor" },
    });
  });

  it("defaults entity_id to null and metadata to {}", () => {
    const row = buildActivityRow({
      event: "trash.emptied",
      tenantId: "t1",
      actorId: "u1",
      actorType: "user",
      actorLabel: null,
    });
    expect(row.entity_id).toBeNull();
    expect(row.entity_type).toBeNull();
    expect(row.metadata).toEqual({});
    expect(row.summary).toBe("Emptied trash");
  });

  it("supports null actor for system events", () => {
    const row = buildActivityRow({
      event: "shopify.sync_completed",
      tenantId: "t1",
      actorId: null,
      actorType: "shopify",
      actorLabel: "Shopify sync",
      metadata: { products: 12 },
    });
    expect(row.actor_id).toBeNull();
    expect(row.actor_type).toBe("shopify");
    expect(row.summary).toContain("12 products");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/activity/build.test.ts`
Expected: FAIL — cannot resolve `./build`.

- [ ] **Step 3: Write the builder**

```ts
import { ACTIVITY_EVENTS, type ActivityEvent, type ActivityActorType } from "./events";

export type BuildActivityRowParams = {
  event: ActivityEvent;
  tenantId: string;
  actorId: string | null;
  actorType: ActivityActorType;
  actorLabel: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export function buildActivityRow(params: BuildActivityRowParams) {
  const def = ACTIVITY_EVENTS[params.event];
  const metadata = params.metadata ?? {};
  return {
    tenant_id: params.tenantId,
    actor_id: params.actorId,
    actor_type: params.actorType,
    actor_label: params.actorLabel,
    event: params.event as string,
    entity_type: def.entityType,
    entity_id: params.entityId ?? null,
    summary: def.summary(metadata),
    metadata,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/activity/build.test.ts`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add src/lib/activity/build.ts src/lib/activity/build.test.ts
git commit -m "feat(activity): add pure activity row builder"
```

---

### Task 4: Writers (`logActivity`, `logSystemActivity`)

**Files:**
- Create: `src/lib/activity/log.ts`
- Test: `src/lib/activity/log.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the tenant context module before importing the SUT.
vi.mock("@/lib/tenant/context", () => ({
  getServerTenantContext: vi.fn(),
}));

import { getServerTenantContext } from "@/lib/tenant/context";
import { logActivity, logSystemActivity } from "./log";

type Row = Record<string, unknown>;

function fakeClient(opts: { insertError?: unknown; profileName?: string | null; throwOnInsert?: boolean } = {}) {
  const inserted: Row[] = [];
  const client = {
    inserted,
    auth: { getUser: async () => ({ data: { user: { email: "fallback@x.com" } } }) },
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { full_name: opts.profileName ?? null }, error: null }),
          }),
        }),
        insert: async (row: Row) => {
          if (opts.throwOnInsert) throw new Error("boom");
          inserted.push({ table, ...row });
          return { data: null, error: opts.insertError ?? null };
        },
      };
    },
  };
  return client;
}

beforeEach(() => vi.clearAllMocks());

describe("logActivity", () => {
  it("inserts a row with resolved user actor + snapshotted full_name", async () => {
    const client = fakeClient({ profileName: "Kasper" });
    (getServerTenantContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      supabase: client, tenantId: "t1", userId: "u1", role: "admin", superAdminHomeTenantId: null,
    });
    await logActivity({ event: "component.created", entityId: "c1", metadata: { name: "R" } });
    const row = client.inserted.find((r) => r.table === "activity_log")!;
    expect(row).toMatchObject({
      tenant_id: "t1", actor_id: "u1", actor_type: "user",
      actor_label: "Kasper", event: "component.created", entity_id: "c1", summary: "Created component R",
    });
  });

  it("falls back to email when full_name is null", async () => {
    const client = fakeClient({ profileName: null });
    (getServerTenantContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      supabase: client, tenantId: "t1", userId: "u1", role: "admin", superAdminHomeTenantId: null,
    });
    await logActivity({ event: "trash.emptied" });
    const row = client.inserted.find((r) => r.table === "activity_log")!;
    expect(row.actor_label).toBe("fallback@x.com");
  });

  it("does nothing when there is no tenant context", async () => {
    (getServerTenantContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(logActivity({ event: "trash.emptied" })).resolves.toBeUndefined();
  });

  it("never throws when the insert throws", async () => {
    const client = fakeClient({ throwOnInsert: true, profileName: "Kasper" });
    (getServerTenantContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      supabase: client, tenantId: "t1", userId: "u1", role: "admin", superAdminHomeTenantId: null,
    });
    await expect(logActivity({ event: "trash.emptied" })).resolves.toBeUndefined();
  });
});

describe("logSystemActivity", () => {
  it("inserts a typed system row with no actor_id", async () => {
    const client = fakeClient();
    await logSystemActivity({
      supabase: client as never, tenantId: "t1", event: "shopify.sync_completed",
      actorType: "shopify", actorLabel: "Shopify sync", metadata: { products: 3 },
    });
    const row = client.inserted.find((r) => r.table === "activity_log")!;
    expect(row).toMatchObject({
      tenant_id: "t1", actor_id: null, actor_type: "shopify", actor_label: "Shopify sync",
      event: "shopify.sync_completed",
    });
  });

  it("never throws when the insert throws", async () => {
    const client = fakeClient({ throwOnInsert: true });
    await expect(
      logSystemActivity({
        supabase: client as never, tenantId: "t1", event: "shopify.sync_completed",
        actorType: "shopify", actorLabel: "Shopify sync",
      })
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/activity/log.test.ts`
Expected: FAIL — cannot resolve `./log`.

- [ ] **Step 3: Write the writers**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerTenantContext } from "@/lib/tenant/context";
import { buildActivityRow } from "./build";
import type { ActivityEvent, ActivityActorType } from "./events";

type LogActivityInput = {
  event: ActivityEvent;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Log a user-initiated activity. Resolves actor + tenant from the request context.
 * Never throws — a logging failure must not break the business action.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const ctx = await getServerTenantContext();
    if (!ctx || !ctx.tenantId) return;

    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", ctx.userId)
      .maybeSingle();

    let actorLabel = (profile as { full_name?: string | null } | null)?.full_name ?? null;
    if (!actorLabel) {
      const { data } = await ctx.supabase.auth.getUser();
      actorLabel = data.user?.email ?? null;
    }

    const row = buildActivityRow({
      event: input.event,
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorType: "user",
      actorLabel,
      entityId: input.entityId,
      metadata: input.metadata,
    });

    await ctx.supabase.from("activity_log").insert(row);
  } catch (err) {
    console.error("[activity] logActivity failed", input.event, err);
  }
}

type LogSystemActivityInput = {
  supabase: SupabaseClient;
  tenantId: string;
  event: ActivityEvent;
  actorType: Exclude<ActivityActorType, "user">;
  actorLabel: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Log an automated/system activity (Shopify sync, Stripe billing, scheduled jobs).
 * Caller supplies the admin client + tenant explicitly. Never throws.
 */
export async function logSystemActivity(input: LogSystemActivityInput): Promise<void> {
  try {
    const row = buildActivityRow({
      event: input.event,
      tenantId: input.tenantId,
      actorId: null,
      actorType: input.actorType,
      actorLabel: input.actorLabel,
      entityId: input.entityId,
      metadata: input.metadata,
    });
    await input.supabase.from("activity_log").insert(row);
  } catch (err) {
    console.error("[activity] logSystemActivity failed", input.event, err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/activity/log.test.ts`
Expected: PASS (all six).

- [ ] **Step 5: Commit**

```bash
git add src/lib/activity/log.ts src/lib/activity/log.test.ts
git commit -m "feat(activity): add logActivity + logSystemActivity writers"
```

---

## Phase 2 — Read side (query helpers + page rebuild)

### Task 5: Pure query helpers (filters, range, paging math)

**Files:**
- Create: `src/lib/activity/query.ts`
- Test: `src/lib/activity/query.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseActivityFilters, activityRange, totalPages, ACTIVITY_PAGE_SIZE } from "./query";

describe("parseActivityFilters", () => {
  it("defaults to page 1 and empty filters", () => {
    expect(parseActivityFilters({})).toEqual({
      page: 1, event: null, actorId: null, dateFrom: null, dateTo: null, search: null,
    });
  });

  it("parses provided params and clamps page to >= 1", () => {
    const f = parseActivityFilters({
      page: "0", event: "bom.created", actor: "u1", from: "2026-01-01", to: "2026-02-01", q: "PO",
    });
    expect(f).toEqual({
      page: 1, event: "bom.created", actorId: "u1",
      dateFrom: "2026-01-01", dateTo: "2026-02-01", search: "PO",
    });
  });

  it("takes the first value when a param is an array", () => {
    expect(parseActivityFilters({ page: ["3", "9"] }).page).toBe(3);
  });
});

describe("activityRange", () => {
  it("computes inclusive range for a page", () => {
    expect(activityRange(1)).toEqual({ from: 0, to: ACTIVITY_PAGE_SIZE - 1 });
    expect(activityRange(3)).toEqual({ from: 2 * ACTIVITY_PAGE_SIZE, to: 3 * ACTIVITY_PAGE_SIZE - 1 });
  });
});

describe("totalPages", () => {
  it("computes ceil(count / pageSize), min 1", () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(1)).toBe(1);
    expect(totalPages(ACTIVITY_PAGE_SIZE)).toBe(1);
    expect(totalPages(ACTIVITY_PAGE_SIZE + 1)).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/activity/query.test.ts`
Expected: FAIL — cannot resolve `./query`.

- [ ] **Step 3: Write the helpers**

```ts
export const ACTIVITY_PAGE_SIZE = 50;

export type ActivityFilters = {
  page: number;
  event: string | null;
  actorId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  search: string | null;
};

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export function parseActivityFilters(params: RawParams): ActivityFilters {
  const pageRaw = Number(first(params.page) ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const norm = (v: string | null) => (v && v.trim().length > 0 ? v.trim() : null);
  return {
    page,
    event: norm(first(params.event)),
    actorId: norm(first(params.actor)),
    dateFrom: norm(first(params.from)),
    dateTo: norm(first(params.to)),
    search: norm(first(params.q)),
  };
}

export function activityRange(page: number, pageSize = ACTIVITY_PAGE_SIZE) {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function totalPages(count: number, pageSize = ACTIVITY_PAGE_SIZE) {
  return Math.max(1, Math.ceil(count / pageSize));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/activity/query.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/activity/query.ts src/lib/activity/query.test.ts
git commit -m "feat(activity): add read-side query helpers"
```

---

### Task 6: Rebuild the page as a server-side filtered/paged query

**Files:**
- Modify: `src/app/app/activity-log/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite `page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { ACTIVITY_EVENTS } from "@/lib/activity/events";
import { parseActivityFilters, activityRange, totalPages, ACTIVITY_PAGE_SIZE } from "@/lib/activity/query";
import ActivityLogClient from "./table";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;

  const filters = parseActivityFilters(await searchParams);
  const { from, to } = activityRange(filters.page);

  // Build the filtered query (reused for both rows and count).
  const applyFilters = <T extends { eq: (c: string, v: unknown) => T; gte: (c: string, v: string) => T; lte: (c: string, v: string) => T; or: (q: string) => T }>(q: T): T => {
    let out = q;
    if (filters.event) out = out.eq("event", filters.event);
    if (filters.actorId) out = out.eq("actor_id", filters.actorId);
    if (filters.dateFrom) out = out.gte("created_at", filters.dateFrom);
    if (filters.dateTo) out = out.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
    if (filters.search) {
      const term = filters.search.replace(/[%,]/g, "");
      out = out.or(`summary.ilike.%${term}%,actor_label.ilike.%${term}%`);
    }
    return out;
  };

  const rowsQuery = applyFilters(
    supabase
      .from("activity_log")
      .select("id,event,created_at,metadata,actor_id,actor_type,actor_label,entity_type,entity_id,summary")
      .eq("tenant_id", tenantId) as never
  )
    .order("created_at", { ascending: false })
    .range(from, to);

  const countQuery = applyFilters(
    supabase
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId) as never
  );

  const [{ data, error }, { count }, { data: actorRows }] = await Promise.all([
    rowsQuery,
    countQuery,
    supabase.from("profiles").select("id,full_name").eq("tenant_id", tenantId).order("full_name"),
  ]);

  const eventOptions = Object.keys(ACTIVITY_EVENTS).sort();
  const actorOptions = (actorRows ?? []).map((a) => ({
    id: a.id as string,
    label: (a.full_name as string | null) ?? "Unnamed user",
  }));

  return (
    <ActivityLogClient
      rows={data ?? []}
      error={error?.message}
      filters={filters}
      eventOptions={eventOptions}
      actorOptions={actorOptions}
      page={filters.page}
      totalPages={totalPages(count ?? 0)}
      pageSize={ACTIVITY_PAGE_SIZE}
      totalCount={count ?? 0}
    />
  );
}
```

> Note: the `applyFilters` generic is a pragmatic typing of the PostgREST builder. If `tsc` objects to the generic, fall back to `// eslint-disable` + `any` typing of the builder param — the runtime behavior is what matters. Keep the two queries sharing one filter function so rows and count never diverge.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: passes (or only pre-existing unrelated errors). Fix any error originating in `page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/app/app/activity-log/page.tsx
git commit -m "feat(activity): server-side filtered + paged activity query"
```

---

### Task 7: Rebuild the table client component (real actors, typed chips, pagination)

**Files:**
- Modify: `src/app/app/activity-log/table.tsx` (full rewrite)
- Modify: `src/app/app/activity-log/activity-log.module.css` (add pagination + chip styles)

- [ ] **Step 1: Rewrite `table.tsx`**

Filters now drive the URL (server does the filtering); selection of a row for the detail pane stays client-side. The `"Shopify"` fallback is gone — actor comes from `actor_label`, with a typed chip for non-user actors.

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "../_ui/page-header";
import StatusBadge from "../_ui/status-badge";
import EmptyState from "../_ui/empty-state";
import styles from "./activity-log.module.css";
import type { ActivityFilters } from "@/lib/activity/query";

type LogRow = {
  id: string;
  event: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  actor_id: string | null;
  actor_type: string;
  actor_label: string | null;
  entity_type: string | null;
  entity_id: string | null;
  summary: string | null;
};

type Props = {
  rows: LogRow[];
  error?: string;
  filters: ActivityFilters;
  eventOptions: string[];
  actorOptions: { id: string; label: string }[];
  page: number;
  totalPages: number;
  pageSize: number;
  totalCount: number;
};

function getEventVariant(event: string) {
  const n = event.toLowerCase();
  if (n.includes("delete") || n.includes("archived") || n.includes("uninstall") || n.includes("removed")) return "danger";
  if (n.includes("sync") || n.includes("updated") || n.includes("changed")) return "info";
  if (n.includes("created") || n.includes("restored") || n.includes("activated")) return "success";
  return "default";
}

const SYSTEM_ACTOR_LABEL: Record<string, string> = {
  shopify: "Shopify",
  stripe: "Stripe billing",
  system: "System",
};

function actorDisplay(row: LogRow): string {
  if (row.actor_type !== "user") return row.actor_label ?? SYSTEM_ACTOR_LABEL[row.actor_type] ?? "System";
  return row.actor_label ?? "Unknown user";
}

export default function ActivityLogClient(props: Props) {
  const { rows, error, filters, eventOptions, actorOptions, page, totalPages, totalCount } = props;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState(rows[0]?.id ?? "");
  const [searchDraft, setSearchDraft] = useState(filters.search ?? "");

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? rows[0],
    [rows, selectedId]
  );

  function pushParams(next: Record<string, string | null>, resetPage = true) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    if (resetPage) params.delete("page");
    startTransition(() => router.push(`?${params.toString()}`));
  }

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Audit"
        title="Activity log"
        description="Search and page through all platform activity, inspect event details, and review the raw metadata recorded for each action."
      />

      <div className={styles.filters}>
        <input
          aria-label="Search activity"
          placeholder="Search messages, users..."
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") pushParams({ q: searchDraft || null }); }}
          onBlur={() => { if ((filters.search ?? "") !== searchDraft) pushParams({ q: searchDraft || null }); }}
        />
        <input aria-label="From date" type="date" value={filters.dateFrom ?? ""} onChange={(e) => pushParams({ from: e.target.value || null })} />
        <input aria-label="To date" type="date" value={filters.dateTo ?? ""} onChange={(e) => pushParams({ to: e.target.value || null })} />
        <select value={filters.actorId ?? "all"} onChange={(e) => pushParams({ actor: e.target.value === "all" ? null : e.target.value })}>
          <option value="all">All users</option>
          {actorOptions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <select value={filters.event ?? "all"} onChange={(e) => pushParams({ event: e.target.value === "all" ? null : e.target.value })}>
          <option value="all">All events</option>
          {eventOptions.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
        </select>
      </div>

      <div className={styles.content}>
        <section className={styles.tableCard} data-pending={isPending ? "true" : undefined}>
          <div className={styles.tableHeader}>
            <span>Date</span><span>User</span><span>Event</span><span>Entity</span><span>Message</span>
          </div>
          {error ? (
            <EmptyState title="Failed to load activity" message={error} />
          ) : rows.length === 0 ? (
            <EmptyState title="No activity found" message="Try widening the filters or search term to inspect more events." />
          ) : (
            rows.map((row) => {
              const isActive = row.id === selected?.id;
              const isSystem = row.actor_type !== "user";
              return (
                <button
                  type="button"
                  key={row.id}
                  className={isActive ? styles.tableRowActive : styles.tableRow}
                  onClick={() => setSelectedId(row.id)}
                >
                  <span className={styles.meta}>
                    {new Date(row.created_at).toLocaleDateString("en-GB")}{" "}
                    {new Date(row.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span>
                    {actorDisplay(row)}
                    {isSystem && <span className={styles.systemChip}>auto</span>}
                  </span>
                  <StatusBadge variant={getEventVariant(row.event)}>{row.event}</StatusBadge>
                  <span>{row.entity_type ?? "—"}</span>
                  <span>{row.summary ?? row.event}</span>
                </button>
              );
            })
          )}

          <div className={styles.pagination}>
            <span className={styles.meta}>
              {totalCount} event{totalCount === 1 ? "" : "s"} · page {page} of {totalPages}
            </span>
            <div className={styles.pageButtons}>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={page <= 1 || isPending}
                onClick={() => pushParams({ page: String(page - 1) }, false)}
              >
                ← Prev
              </button>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={page >= totalPages || isPending}
                onClick={() => pushParams({ page: String(page + 1) }, false)}
              >
                Next →
              </button>
            </div>
          </div>
        </section>

        <aside className={styles.detailCard}>
          <div className={styles.detailHeader}>
            <div>
              <p className={styles.eyebrow}>Selected event</p>
              <h2>{selected?.event ?? "Log entry"}</h2>
            </div>
          </div>

          <div className={styles.detailSection}>
            <p className={styles.detailLabel}>Operator</p>
            <div className={styles.detailUser}>
              <span className={styles.avatar}>
                {(selected ? actorDisplay(selected) : "?").slice(0, 1).toUpperCase()}
              </span>
              <div>
                <p>{selected ? actorDisplay(selected) : "—"}</p>
                <span>{selected?.actor_type === "user" ? (selected?.actor_id ?? "—") : "Automated"}</span>
              </div>
            </div>
          </div>

          <div className={styles.detailSection}>
            <p className={styles.detailLabel}>Entity</p>
            <div className={styles.detailBox}>
              {selected?.entity_type ?? "—"}
              {selected?.entity_id ? ` · ${selected.entity_id}` : ""}
            </div>
          </div>

          <div className={styles.detailSection}>
            <p className={styles.detailLabel}>Message</p>
            <p className={styles.detailMessage}>{selected?.summary ?? "Activity logged"}</p>
          </div>

          <div className={styles.detailSection}>
            <p className={styles.detailLabel}>Raw metadata</p>
            <pre className={styles.detailCode}>{JSON.stringify(selected?.metadata ?? {}, null, 2)}</pre>
          </div>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS for the system chip + pagination**

Append to `src/app/app/activity-log/activity-log.module.css`:

```css
.systemChip {
  margin-left: 6px;
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
  color: var(--ink-muted);
  background: var(--surface-1);
  border: 1px solid var(--stroke);
  border-radius: var(--radius-lg);
  padding: 1px 6px;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-top: 1px solid var(--stroke);
}

.pageButtons {
  display: flex;
  gap: 8px;
}

.pageBtn {
  composes: secondary from "../_ui/buttons.module.css";
}

.tableCard[data-pending="true"] {
  opacity: 0.6;
}
```

> Verify `secondary` exists in `../_ui/buttons.module.css`. If the export name differs, use the actual secondary-button class name. Do not hand-roll button styles.

- [ ] **Step 3: Type-check + run the activity tests**

Run: `npx tsc --noEmit`
Then: `npx vitest run src/lib/activity/`
Expected: tsc clean for these files; all activity unit tests pass.

- [ ] **Step 4: Manual smoke (browser)**

Start `npm run dev`, visit `/app/activity-log`. Confirm: page renders, pagination shows "page 1 of N", changing the event/user dropdown updates the URL and the list, system events (if any) show the "auto" chip with a real label (not "Shopify" for everything). No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/activity-log/table.tsx src/app/app/activity-log/activity-log.module.css
git commit -m "feat(activity): rebuild activity log UI with real actors + pagination"
```

---

## Phase 3 — Coverage rollout

Each task wires `logActivity`/`logSystemActivity` calls. Insert the call **after the success guard** (`if (error) return ...` / after the `throw` check) and **before** `revalidatePath`/`redirect`/`return`. Where an action currently inserts to `activity_log` directly, **replace** that insert with the helper call (delete the old `.from("activity_log").insert(...)`). Line numbers reference the enumeration captured during planning and may have shifted — locate by function name.

After each task: `npx tsc --noEmit` (catches any event key not in the catalog) and `npm test`.

### Task 8: Migrate system loggers (Shopify + Stripe)

**Files:**
- Modify: `src/lib/shopify/sync.ts` (existing insert ~line 415)
- Modify: `src/lib/shopify/uninstall.ts` (existing insert ~line 53)
- Modify: `src/lib/stripe/webhook-events.ts` (existing insert ~line 112)
- Modify: `src/lib/shopify/uninstall.test.ts` + `src/lib/stripe/webhook-events.test.ts` (event-string assertions)

- [ ] **Step 1: Replace the Shopify sync insert**

In `sync.ts`, replace the `.from("activity_log").insert({...})` (and its `assertNoError(activityError, ...)`) with:

```ts
import { logSystemActivity } from "@/lib/activity/log";
// …
await logSystemActivity({
  supabase: admin,
  tenantId,
  event: "shopify.sync_completed",
  actorType: "shopify",
  actorLabel: "Shopify sync",
  metadata: {
    shop_domain: shopDomain,
    products: products.length,
    variants: variantRows.length,
    orders: orderRows.length,
  },
});
```

- [ ] **Step 2: Replace the uninstall insert**

In `uninstall.ts`, replace the insert with:

```ts
import { logSystemActivity } from "@/lib/activity/log";
// …
await logSystemActivity({
  supabase: admin,
  tenantId: store.tenant_id,
  event: "shopify.app_uninstalled",
  actorType: "shopify",
  actorLabel: "Shopify",
  metadata: { shop_domain: shopDomain, shopify_store_id: store.id, token_deleted: tokenDeleted, status_changed: statusChanged },
});
```

- [ ] **Step 3: Replace the Stripe insert**

In `webhook-events.ts`, replace the `subscription.activated` insert with:

```ts
import { logSystemActivity } from "@/lib/activity/log";
// …
await logSystemActivity({
  supabase: admin,
  tenantId,
  event: "subscription.activated",
  actorType: "stripe",
  actorLabel: "Stripe billing",
  metadata: { tier: resolved.tier, billing: resolved.billing },
});
```

- [ ] **Step 4: Update the affected tests**

- `uninstall.test.ts`: change assertions from `event === "SHOPIFY_APP_UNINSTALLED"` to `"shopify.app_uninstalled"`. The fake admin already routes `from("activity_log")` through the in-memory table, so `logSystemActivity` will push a row — keep the `toHaveLength(1)` assertions.
- `webhook-events.test.ts`: the `metadata` assertion stays `{ tier: "growth", billing: "annual" }`; the event stays `"subscription.activated"`. No change needed unless it asserts extra fields — if it does `toMatchObject` on the row it will still pass; confirm `actor_type`/`summary` extra fields don't break it (toMatchObject ignores extras).

- [ ] **Step 5: Run tests + type-check**

Run: `npm test`
Run: `npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shopify/sync.ts src/lib/shopify/uninstall.ts src/lib/stripe/webhook-events.ts src/lib/shopify/uninstall.test.ts src/lib/stripe/webhook-events.test.ts
git commit -m "refactor(activity): route shopify + stripe logging through logSystemActivity"
```

---

### Task 9: Coverage — Components (migrate existing inserts)

**Files:** Modify `src/app/app/components/actions.ts`

Every mutation here already inserts to `activity_log`. **Replace each existing insert** with the helper call below. Add `import { logActivity } from "@/lib/activity/log";` at the top.

- [ ] **Step 1: Wire calls (replace existing inserts)**

| Function | Replace existing insert with |
|---|---|
| `createComponent` | `await logActivity({ event: "component.created", entityId: newComponent.id, metadata: { name, sku: sku || null } });` |
| `updateComponent` | `await logActivity({ event: "component.updated", entityId: componentId, metadata: { name } });` |
| `updateBinLocation` | `await logActivity({ event: "component.bin_location_updated", entityId: componentId, metadata: { name: current?.name } });` |
| `updateComponentSupplier` | `await logActivity({ event: "component.supplier_updated", entityId: componentId });` |
| `archiveComponent` | `await logActivity({ event: "component.archived", entityId: componentId });` |
| `createComponentGroup` | `await logActivity({ event: "component_group.created", entityId: data.id, metadata: { name: trimmedName } });` |
| `uploadComponentImage` | `await logActivity({ event: "component.image_updated", entityId: componentId });` |
| `fetchComponentImageFromNexar` | `await logActivity({ event: "component.image_updated", entityId: componentId });` |
| `removeComponentImage` | `await logActivity({ event: "component.image_removed", entityId: componentId });` |

> Use the actual id variable in scope at each call site (e.g. `componentId` from formData, or `newComponent.id`). If a function lacks a clean id variable, pass `entityId` omitted.

- [ ] **Step 2: Type-check** — `npx tsc --noEmit` (clean for this file).
- [ ] **Step 3: Commit**

```bash
git add src/app/app/components/actions.ts
git commit -m "feat(activity): migrate components logging to helper"
```

---

### Task 10: Coverage — BOM editor (`bom/actions.ts`, all new)

**Files:** Modify `src/app/app/bom/actions.ts`. Add `import { logActivity } from "@/lib/activity/log";`.

- [ ] **Step 1: Add calls after each function's success point**

| Function | Call |
|---|---|
| `createBom` | `await logActivity({ event: "bom.created", entityId: <newBomId>, metadata: { version } });` |
| `updateBomStatus` | `await logActivity({ event: "bom.status_changed", entityId: <bomId>, metadata: { status } });` |
| `setBomActive` | `await logActivity({ event: "bom.activated", entityId: <bomId> });` |
| `setBomArchived` | `await logActivity({ event: "bom.archived", entityId: <bomId> });` |
| `createBomComponentLine` | `await logActivity({ event: "bom.line_added", entityId: <bomId> });` |
| `addComponentsToBom` | `await logActivity({ event: "bom.line_added", entityId: <bomId> });` |
| `updateBomComponentQuantity` | `await logActivity({ event: "bom.line_updated", entityId: <bomId> });` |
| `updateBomComponentYieldPct` | `await logActivity({ event: "bom.line_updated", entityId: <bomId> });` |
| `removeBomComponentLine` | `await logActivity({ event: "bom.line_removed", entityId: <bomId> });` |
| `reorderBomComponents` | `await logActivity({ event: "bom.lines_reordered", entityId: <bomId> });` |
| `deleteBomDraft` | `await logActivity({ event: "bom.deleted", entityId: <bomId> });` |

> `<bomId>` = the BOM id available in each function (parameter or formData). For line-level functions where only the line id is in scope, pass the parent BOM id if available, else omit `entityId`.

- [ ] **Step 2: Type-check** — `npx tsc --noEmit`.
- [ ] **Step 3: Commit** — `git commit -am "feat(activity): log BOM editor mutations"`

---

### Task 11: Coverage — Products & Templates

**Files:** Modify `src/app/app/products/actions.ts` and `src/app/app/templates/actions.ts`. Add the `logActivity` import to each.

- [ ] **Step 1: products/actions.ts** — replace the existing `bom_created` insert in `createBomWithComponents`; add the rest.

| Function | Call |
|---|---|
| `createBomWithComponents` | replace insert → `await logActivity({ event: "bom.created", entityId: <bomId>, metadata: { version } });` |
| `createDraftBomFromScratch` | `await logActivity({ event: "bom.draft_created", entityId: <bomId> });` |
| `copyBomToDraft` | `await logActivity({ event: "bom.draft_created", entityId: <bomId> });` |
| `createBomFromTemplate` | `await logActivity({ event: "bom.created_from_template", entityId: <bomId>, metadata: { templateName: template.name } });` |
| `createBomLaborLine` | `await logActivity({ event: "bom.labor_added", entityId: <bomId>, metadata: { operationName } });` |
| `updateBomLaborLine` | `await logActivity({ event: "bom.labor_updated", entityId: <bomId>, metadata: { operationName } });` |
| `deleteBomLaborLine` | `await logActivity({ event: "bom.labor_removed", entityId: <bomId> });` |
| `duplicateBomAsDraft` | `await logActivity({ event: "bom.duplicated", entityId: <bomId> });` |
| `saveBomAsTemplate` | `await logActivity({ event: "template.created", entityId: <templateId>, metadata: { name: templateName } });` |
| `upsertNotificationTrigger` | `await logActivity({ event: "product.notification_set", entityId: <productId> });` |
| `removeNotificationTrigger` | `await logActivity({ event: "product.notification_removed", entityId: <productId> });` |
| `applyLaborTemplate` | `await logActivity({ event: "bom.labor_template_applied", entityId: <bomId>, metadata: { templateName: template.name } });` |

- [ ] **Step 2: templates/actions.ts** — replace the existing `bom.template_publish` insert in `publishTemplate`; add the rest.

| Function | Call |
|---|---|
| `createTemplate` | `await logActivity({ event: "template.created", entityId: <templateId>, metadata: { name } });` |
| `removeTemplateLine` | `await logActivity({ event: "template.updated", entityId: <templateId> });` |
| `deleteTemplate` | `await logActivity({ event: "template.deleted", entityId: <templateId> });` |
| `setTemplateLines` | `await logActivity({ event: "template.updated", entityId: <templateId> });` |
| `reorderTemplateLines` | `await logActivity({ event: "template.reordered", entityId: <templateId> });` |
| `createLaborTemplate` | `await logActivity({ event: "labor_template.created", entityId: <id>, metadata: { name } });` |
| `updateLaborTemplateMode` | `await logActivity({ event: "labor_template.updated", entityId: <id> });` |
| `deleteLaborTemplate` | `await logActivity({ event: "labor_template.deleted", entityId: <id> });` |
| `setLaborTemplateLines` | `await logActivity({ event: "labor_template.updated", entityId: <id> });` |
| `publishTemplate` | replace insert → `await logActivity({ event: "bom.template_published", entityId: newBom.id, metadata: { template_id: templateId, new_version: (oldBom.version as number) + 1 } });` |

- [ ] **Step 3: Type-check** — `npx tsc --noEmit`.
- [ ] **Step 4: Commit** — `git commit -am "feat(activity): log products + templates mutations"`

---

### Task 12: Coverage — Purchasing & inwards

**Files:** Modify `src/app/app/purchasing/actions.ts`, `src/app/app/goods-inwards/actions.ts`, `src/app/app/suppliers/actions.ts`, `src/app/app/suppliers/[supplierId]/actions.ts`. Add the import to each.

- [ ] **Step 1: Wire calls**

purchasing/actions.ts:
- `createPurchaseOrder` → `await logActivity({ event: "purchase_order.created", metadata: { poNumber: <poNumber> } });`
- `updatePurchaseOrderStatus` → `await logActivity({ event: "purchase_order.status_changed", metadata: { status: <status> } });`
- `createPurchaseOrderLine` → `await logActivity({ event: "purchase_order.line_added" });`
- `updatePurchaseOrderLineQuantity` → `await logActivity({ event: "purchase_order.line_updated" });`

goods-inwards/actions.ts:
- `createDeliveryReceipt` → `await logActivity({ event: "goods_receipt.created", entityId: receipt.id, metadata: { reference: <supplier_reference> } });`
- `linkReceiptToPo` → `await logActivity({ event: "goods_receipt.linked_to_po", entityId: <receiptId> });`
- `updateDeliveryReceipt` → `await logActivity({ event: "goods_receipt.updated", entityId: <receiptId> });`

suppliers/actions.ts:
- `createSupplier` → `await logActivity({ event: "supplier.created", metadata: { name } });`

suppliers/[supplierId]/actions.ts:
- `updateSupplier` → `await logActivity({ event: "supplier.updated", entityId: <supplierId> });`
- `archiveSupplier` → `await logActivity({ event: "supplier.archived", entityId: <supplierId> });`
- `addContact` → `await logActivity({ event: "supplier.contact_added", entityId: <supplierId> });`
- `removeContact` → `await logActivity({ event: "supplier.contact_removed", entityId: <supplierId> });`
- `linkComponent` → `await logActivity({ event: "supplier.component_linked", entityId: <supplierId> });`
- `updateSupplierComponent` → `await logActivity({ event: "supplier.component_updated", entityId: <supplierId> });`
- `unlinkComponent` → `await logActivity({ event: "supplier.component_unlinked", entityId: <supplierId> });`
- `togglePreferred` → `await logActivity({ event: "supplier.preferred_changed", entityId: <supplierId> });`
- `addPriceBreak` → `await logActivity({ event: "supplier.price_break_added", entityId: <supplierId> });`
- `removePriceBreak` → `await logActivity({ event: "supplier.price_break_removed", entityId: <supplierId> });`

> `updateComponentCosts` in goods-inwards is a bulk cost-correction loop — omit per-row logging (not a discrete user-meaningful event).

- [ ] **Step 2: Type-check** — `npx tsc --noEmit`.
- [ ] **Step 3: Commit** — `git commit -am "feat(activity): log purchasing, inwards, suppliers mutations"`

---

### Task 13: Coverage — Inventory, stocktake, locations

**Files:** Modify `src/app/app/inventory/actions.ts`, `src/app/app/stocktake/actions.ts`, `src/app/app/stocktake/[sessionId]/actions.ts`, `src/app/app/warehouse/locations/actions.ts`, `src/app/app/settings/locations/actions.ts`. Add the import to each. Replace existing `activity_log` inserts in the stocktake files and settings/locations.

- [ ] **Step 1: Wire calls**

inventory/actions.ts:
- `createMovement` → `await logActivity({ event: "inventory.movement_logged" });`

stocktake/actions.ts (replace existing insert in `createStocktakeSession`):
- `createStocktakeSession` → `await logActivity({ event: "stocktake.opened", entityId: session.id, metadata: { reference: referenceNumber } });`
- `updateStocktakeStatus` → `await logActivity({ event: "stocktake.status_changed", metadata: { status: <status> } });`

stocktake/[sessionId]/actions.ts (replace existing insert in `approveAndApply`):
- `submitForReview` → `await logActivity({ event: "stocktake.submitted", entityId: sessionId });`
- `approveAndApply` → `await logActivity({ event: "stocktake.applied", entityId: sessionId, metadata: { applied_lines: summary?.applied_lines } });`
- `sendBackForRecount` → `await logActivity({ event: "stocktake.sent_back", entityId: sessionId });`
- `applyOpeningStock` → `await logActivity({ event: "stocktake.opening_stock_applied", entityId: sessionId });`
- (`saveLineCountClient`, `saveVarianceReason` are per-cell autosaves — omit, too noisy.)

warehouse/locations/actions.ts:
- `addWarehouse` → `await logActivity({ event: "location.created", metadata: { name: <name> } });`
- `editWarehouse` → `await logActivity({ event: "location.updated", metadata: { name: <name> } });`
- `addSubLocation` → `await logActivity({ event: "sub_location.created", metadata: { name: <name> } });`
- `editSubLocation` → `await logActivity({ event: "sub_location.updated", metadata: { name: <name> } });`
- `deleteSubLocation` → `await logActivity({ event: "sub_location.deleted" });`
- `addAisle` → `await logActivity({ event: "aisle.created", metadata: { name: <name> } });`
- `editAisle` → `await logActivity({ event: "aisle.updated", metadata: { name: <name> } });`
- `deleteAisle` → `await logActivity({ event: "aisle.deleted" });`
- `addBay` → `await logActivity({ event: "bay.created", metadata: { name: <name> } });`
- `editBay` → `await logActivity({ event: "bay.updated", metadata: { name: <name> } });`
- `deleteBay` → `await logActivity({ event: "bay.deleted" });`

settings/locations/actions.ts (replace existing insert in `setDefaultLocation`):
- `setDefaultLocation` → `await logActivity({ event: "location.default_changed", entityId: locationId, metadata: { location_name: (check as { name: string }).name } });`

- [ ] **Step 2: Type-check** — `npx tsc --noEmit`.
- [ ] **Step 3: Commit** — `git commit -am "feat(activity): log inventory, stocktake, location mutations"`

---

### Task 14: Coverage — Orders & production

**Files:** Modify `src/app/app/orders/actions.ts` (replace existing insert), `src/app/app/planning/(gated)/floor/actions.ts`, `src/app/app/capacity/actions.ts`, `src/app/app/staffing/actions.ts`, `src/app/app/staff-costings/actions.ts`, `src/app/app/actual-time/actions.ts`, `src/app/app/departments/actions.ts`, `src/app/app/costing/actions.ts`. Add the import to each.

- [ ] **Step 1: Wire calls**

orders/actions.ts (replace existing `order_allocation_run` insert — preserve its existing metadata, just route through the helper):
- `allocateOrder` → `await logActivity({ event: "order.allocation_run", entityId: orderId, metadata: { order_id: orderId, changes_applied: result.applied, idempotency_key: idempotencyKey } });`
- `updateJobLaborPlanWeek` → `await logActivity({ event: "order.labor_plan_updated", entityId: planId });`

floor/actions.ts:
- `startJob` → `await logActivity({ event: "production.job_started", entityId: orderLineId });`
- `startStep` → `await logActivity({ event: "production.step_started", entityId: stepId });`
- `completeStep` → `await logActivity({ event: "production.step_completed", entityId: completed.id });`

capacity/actions.ts:
- `refreshCapacityWeek` → `await logActivity({ event: "capacity.week_refreshed", metadata: { week: <week> } });`

staffing/actions.ts:
- `prepareStaffingWeek` → `await logActivity({ event: "staffing.week_prepared", metadata: { weekStart: <weekStart> } });`
- `createStaffMember` → `await logActivity({ event: "staff.created", entityId: staffMember.id, metadata: { name: <name> } });`
- `updateStaffMember` → `await logActivity({ event: "staff.updated", entityId: <staffMemberId> });`

staff-costings/actions.ts:
- `addDepartment` → `await logActivity({ event: "department.rate_added", metadata: { name: <name> } });`
- `updateRate` → `await logActivity({ event: "department.rate_changed", entityId: <componentId> });`
- `removeDepartment` → `await logActivity({ event: "department.rate_removed", entityId: <componentId> });`

actual-time/actions.ts:
- `createActualTimeEntry` → `await logActivity({ event: "production.actual_time_logged", entityId: orderLineId });`

departments/actions.ts:
- `createDepartment` → `await logActivity({ event: "department.created", entityId: department.id, metadata: { name: <name> } });`
- `updateDepartment` → `await logActivity({ event: "department.updated", entityId: <departmentId> });`

costing/actions.ts:
- `generateFinancialPlansForWeek` → `await logActivity({ event: "costing.financial_plans_generated", metadata: { weekStart } });`

- [ ] **Step 2: Type-check** — `npx tsc --noEmit`.
- [ ] **Step 3: Commit** — `git commit -am "feat(activity): log orders + production mutations"`

---

### Task 15: Coverage — Settings & trash

**Files:** Modify `src/app/app/settings/team/actions.ts`, `src/app/app/settings/profile/actions.ts`, `src/app/app/settings/company/actions.ts`, `src/app/app/settings/orders/actions.ts`, `src/app/app/settings/integrations/actions.ts`, `src/app/app/trash/actions.ts` (replace existing insert). Add the import to each.

- [ ] **Step 1: Wire calls**

settings/team/actions.ts:
- `inviteMember` → `await logActivity({ event: "team.member_invited", metadata: { email: <email> } });`
- `revokeInvite` → `await logActivity({ event: "team.invite_revoked" });`
- `resendInvite` → `await logActivity({ event: "team.invite_resent", metadata: { email: <email> } });`
- `updateMemberRole` → `await logActivity({ event: "team.role_changed", metadata: { role: <role> } });`
- `deactivateMember` → `await logActivity({ event: "team.member_deactivated" });`

settings/profile/actions.ts:
- `updateProfile` → `await logActivity({ event: "profile.updated" });`
- `uploadAvatar` → `await logActivity({ event: "profile.avatar_updated" });`

settings/company/actions.ts:
- `updateCompany` → `await logActivity({ event: "company.updated", metadata: { name: <name> } });`
- `uploadLogo` → `await logActivity({ event: "company.logo_updated" });`

settings/orders/actions.ts:
- `updateOrderSourceSla` → `await logActivity({ event: "settings.order_sla_updated" });`

settings/integrations/actions.ts:
- `setStatsOnlyBefore` → `await logActivity({ event: "integration.stats_only_set" });`

trash/actions.ts (replace existing `trash.emptied` insert + add restores):
- `emptyTrash` → `await logActivity({ event: "trash.emptied", metadata: { archivedPurchaseOrdersDeleted: poIds.length, archivedStocktakesDeleted: stocktakeIds.length, archivedBomsDeleted: bomIds.length } });`
- `restorePurchaseOrder` → `await logActivity({ event: "trash.purchase_order_restored", entityId: <id> });`
- `restoreStocktakeSession` → `await logActivity({ event: "trash.stocktake_restored", entityId: <id> });`
- `restoreBom` → `await logActivity({ event: "trash.bom_restored", entityId: <id> });`

- [ ] **Step 2: Type-check + full test run** — `npx tsc --noEmit` then `npm test`.
- [ ] **Step 3: Commit** — `git commit -am "feat(activity): log settings + trash mutations"`

---

## Phase 4 — Docs & final verification

### Task 16: Update the QA feature test plan (required by CLAUDE.md)

**Files:** Modify `docs/qa-feature-test-plan.md`

- [ ] **Step 1: Amend the Activity Log feature entry**

Find the Activity Log feature (Audit section). Replace/expand its checklist to reflect the new behavior:

```markdown
### Activity log (Audit)

Entry point: `/app/activity-log`. Customer-facing audit trail of all meaningful mutations.

- [ ] Page lists activity newest-first, 50 per page, with Prev/Next pagination and a total count.
- [ ] Event filter (from the catalog), user filter (tenant members), date-from/date-to, and text search all run server-side over full history (not just the current page).
- [ ] Filters + page persist in the URL (shareable/bookmarkable).
- [ ] User-initiated events show the operator's real name (full_name, else email).
- [ ] Automated events show a typed actor label ("Shopify", "Stripe billing", "System") with an "auto" chip — never a blanket "Shopify".
- [ ] Creating/updating/deleting BOMs, components, POs, suppliers, inventory, stocktakes, locations, team members, etc. each produce a log entry with a human-readable summary.
- [ ] Deleting/archiving a record is logged (e.g. "who deleted that BOM").
- [ ] A logging failure never breaks the underlying action.
- [ ] Detail pane shows operator, entity (type + id), summary, and raw metadata.
```

- [ ] **Step 2: Append a changelog line**

Add under the `## Changelog` section at the bottom:

```markdown
- 2026-06-17 — amended Activity log: full audit-trail coverage of all mutations, real/typed actors, server-side paged filtering.
```

- [ ] **Step 3: Commit**

```bash
git add docs/qa-feature-test-plan.md
git commit -m "docs: update QA plan for activity-log audit trail"
```

---

### Task 17: Final verification

- [ ] **Step 1: Full type-check** — `npx tsc --noEmit`. Expected: no errors introduced by this work.
- [ ] **Step 2: Full test suite** — `npm test`. Expected: all activity tests pass; pre-existing unrelated failures unchanged (see memory note on known failures).
- [ ] **Step 3: Lint** — `npm run lint`. Fix any lint errors in touched files.
- [ ] **Step 4: Manual end-to-end smoke (browser)**

With `npm run dev`:
1. Create a component → visit `/app/activity-log` → confirm a `component.created` row appears with your real name and summary "Created component …".
2. Create then delete a draft BOM → confirm `bom.created` and `bom.deleted` rows.
3. Apply a filter (event = `component.created`) → confirm URL updates and only matching rows show.
4. Page to page 2 (if >50 rows) → confirm Prev/Next and count.
5. Confirm no row shows "Shopify" as the actor for a user action.

- [ ] **Step 5: Confirm migration is applied to all environments** before merge (dev verified in Task 1; apply to production at deploy time).

---

## Self-review checklist (completed by plan author)

- **Spec coverage:** Data model → Task 1; helper + catalog → Tasks 2–4; coverage (all domains) → Tasks 8–15; read side (paging + server filters + UI) → Tasks 5–7; testing → Tasks 2–5 + 17; docs → Task 16. Super-admin correctly excluded (separate `super_admin_audit_log`).
- **Actor snapshot** (`actor_label`) implemented in `buildActivityRow` + `logActivity` (full_name → email fallback) — Tasks 3–4.
- **"Never throws"** behavior tested in Task 4.
- **Type consistency:** `buildActivityRow` params, `logActivity`/`logSystemActivity` signatures, and `ActivityEvent`/`ActivityActorType` types are referenced consistently across Tasks 2–8. Every `event` string used in Phase 3 exists in the Task 2 catalog (enforced by `tsc`).
- **No placeholders:** `<bomId>` / `<name>` style tokens denote "use the in-scope variable at this call site" and are explained where used; they are not unfilled logic.
