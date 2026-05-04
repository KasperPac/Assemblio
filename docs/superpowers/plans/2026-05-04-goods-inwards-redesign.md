# Goods Inwards Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the PO-led receiving flow with a Delivery Receipt model — a record of what physically arrived, with PO linking optional at save time.

**Architecture:** New `delivery_receipt` + `delivery_receipt_line` tables hold the GRN record. A new `receive_delivery_receipt` RPC writes inventory movements atomically (replacing the two retired POs RPCs). Three new routes handle list, new receipt form, and detail/link-to-PO. Existing `apply_inventory_movement` RPC is unchanged.

**Tech Stack:** Next.js 14 App Router (server + client components), Supabase JS client, Vitest, CSS Modules.

---

## File Structure

**New files:**
- `supabase/patches/delivery_receipt_tables.sql` — DDL + RLS for both new tables
- `supabase/patches/receive_delivery_receipt_rpc.sql` — atomic receive RPC; drops old RPCs
- `src/app/app/goods-inwards/actions.ts` — **replaces** existing file; all server actions + pure helpers
- `src/app/app/goods-inwards/actions.test.ts` — unit tests for pure helpers
- `src/app/app/goods-inwards/page.tsx` — **replaces** existing file; receipt list server component
- `src/app/app/goods-inwards/receipt-list.tsx` — client component; filter tabs + table
- `src/app/app/goods-inwards/goods-inwards.module.css` — **replaces** existing file
- `src/app/app/goods-inwards/new/page.tsx` — server component; fetches form options
- `src/app/app/goods-inwards/receipt-form.tsx` — client component; dynamic receipt entry form
- `src/app/app/goods-inwards/[id]/page.tsx` — server component; receipt detail
- `src/app/app/goods-inwards/receipt-detail.tsx` — client component; GRN view + link-to-PO modal

**Modified files:**
- `src/app/app/route-meta.ts` — update goods-inwards subtitle

---

### Task 0: Database tables

**Goal:** Create `delivery_receipt` and `delivery_receipt_line` tables with RLS.

**Files:**
- Create: `supabase/patches/delivery_receipt_tables.sql`

**Acceptance Criteria:**
- [ ] Both tables exist with correct columns and constraints
- [ ] RLS enabled; tenant isolation policy on both tables
- [ ] `status` check constraint enforces ('unmatched','po_linked','discrepancy')
- [ ] `stock_in_reason` check constraint enforces the six allowed values
- [ ] `quantity_delivered > 0` enforced on receipt line

**Verify:** `supabase db reset` completes without error; `\d delivery_receipt` shows all columns.

**Steps:**

- [ ] **Step 1: Create the SQL patch**

Create `supabase/patches/delivery_receipt_tables.sql`:

```sql
-- delivery_receipt
create table if not exists public.delivery_receipt (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenant(id),
  supplier_id           uuid references public.suppliers(id),
  supplier_name_override text,
  supplier_reference    text not null,
  purchase_order_id     uuid references public.purchase_order(id),
  location_id           uuid not null references public.location(id),
  received_at           timestamptz not null default now(),
  notes                 text,
  stock_in_reason       text check (stock_in_reason in (
                          'supplier_delivery','customer_return','opening_stock',
                          'sample','adjustment','other'
                        )),
  status                text not null default 'unmatched'
                          check (status in ('unmatched','po_linked','discrepancy')),
  created_by            uuid not null references auth.users(id),
  created_at            timestamptz not null default now()
);

alter table public.delivery_receipt enable row level security;

create policy "tenant_isolation_select" on public.delivery_receipt
  for select using (tenant_id = public.current_tenant_id());

create policy "tenant_isolation_insert" on public.delivery_receipt
  for insert with check (tenant_id = public.current_tenant_id());

create policy "tenant_isolation_update" on public.delivery_receipt
  for update using (tenant_id = public.current_tenant_id());

-- delivery_receipt_line
create table if not exists public.delivery_receipt_line (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenant(id),
  delivery_receipt_id    uuid not null references public.delivery_receipt(id) on delete cascade,
  component_id           uuid not null references public.component(id),
  purchase_order_line_id uuid references public.purchase_order_line(id),
  quantity_delivered     numeric not null check (quantity_delivered > 0),
  quantity_expected      numeric,
  notes                  text,
  created_at             timestamptz not null default now()
);

alter table public.delivery_receipt_line enable row level security;

create policy "tenant_isolation_select" on public.delivery_receipt_line
  for select using (tenant_id = public.current_tenant_id());

create policy "tenant_isolation_insert" on public.delivery_receipt_line
  for insert with check (tenant_id = public.current_tenant_id());

create policy "tenant_isolation_update" on public.delivery_receipt_line
  for update using (tenant_id = public.current_tenant_id());
```

- [ ] **Step 2: Apply patch**

```bash
# Apply directly to local Supabase
supabase db reset
# OR if you want to apply without full reset:
# supabase db diff --use-migra | supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/patches/delivery_receipt_tables.sql
git commit -m "feat(db): add delivery_receipt and delivery_receipt_line tables"
```

---

### Task 1: receive_delivery_receipt RPC

**Goal:** Atomic RPC that writes inventory movements for all receipt lines, updates linked PO line quantities, auto-closes fully-received POs, and sets receipt status. Retires the old receive RPCs.

**Files:**
- Create: `supabase/patches/receive_delivery_receipt_rpc.sql`

**Acceptance Criteria:**
- [ ] `receive_delivery_receipt(uuid)` callable by `authenticated` role
- [ ] Each receipt line produces an `inventory_movement` row via `apply_inventory_movement`
- [ ] Linked PO lines have `quantity_received` incremented (capped at `quantity`)
- [ ] Receipt `status` is set: `unmatched` (no PO), `discrepancy` (any variance), `po_linked` (all exact)
- [ ] PO auto-closes to `received` when all its lines are fully received
- [ ] `receive_purchase_order` and `receive_purchase_order_line` functions are dropped

**Verify:** After `supabase db reset`, `\df receive_delivery_receipt` shows the function; `\df receive_purchase_order` returns nothing.

**Steps:**

- [ ] **Step 1: Create the SQL patch**

Create `supabase/patches/receive_delivery_receipt_rpc.sql`:

```sql
create or replace function public.receive_delivery_receipt(
  p_delivery_receipt_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_tenant_id  uuid;
  v_receipt    record;
  v_line       record;
  v_remaining  numeric;
  v_applied    numeric;
  v_discrepant boolean := false;
  v_complete   boolean;
begin
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'No tenant context';
  end if;

  select * into v_receipt
  from public.delivery_receipt
  where id = p_delivery_receipt_id and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'Delivery receipt not found: %', p_delivery_receipt_id;
  end if;

  for v_line in
    select * from public.delivery_receipt_line
    where delivery_receipt_id = p_delivery_receipt_id
      and tenant_id = v_tenant_id
  loop
    perform public.apply_inventory_movement(
      v_line.component_id,
      v_receipt.location_id,
      v_line.quantity_delivered,
      0,
      'delivery_receipt',
      'delivery_receipt',
      p_delivery_receipt_id
    );

    if v_line.purchase_order_line_id is not null then
      select (pol.quantity - pol.quantity_received)
        into v_remaining
      from public.purchase_order_line pol
      where pol.id = v_line.purchase_order_line_id
        and pol.tenant_id = v_tenant_id
      for update;

      v_applied := least(v_line.quantity_delivered, greatest(v_remaining, 0));

      if v_applied > 0 then
        update public.purchase_order_line
        set quantity_received = quantity_received + v_applied
        where id = v_line.purchase_order_line_id;
      end if;

      if v_line.quantity_expected is not null
         and v_line.quantity_delivered <> v_line.quantity_expected then
        v_discrepant := true;
      end if;
    end if;
  end loop;

  -- compute receipt status
  if v_receipt.purchase_order_id is null then
    update public.delivery_receipt set status = 'unmatched'
    where id = p_delivery_receipt_id;
  elsif v_discrepant then
    update public.delivery_receipt set status = 'discrepancy'
    where id = p_delivery_receipt_id;
  else
    update public.delivery_receipt set status = 'po_linked'
    where id = p_delivery_receipt_id;
  end if;

  -- auto-close PO if fully received
  if v_receipt.purchase_order_id is not null then
    select not exists (
      select 1 from public.purchase_order_line
      where purchase_order_id = v_receipt.purchase_order_id
        and tenant_id = v_tenant_id
        and quantity_received < quantity
    ) into v_complete;

    if v_complete then
      update public.purchase_order
      set status = 'received'
      where id = v_receipt.purchase_order_id
        and tenant_id = v_tenant_id;
    end if;
  end if;
end;
$$;

grant execute on function public.receive_delivery_receipt(uuid) to authenticated;

-- retire old RPCs
drop function if exists public.receive_purchase_order(uuid, uuid);
drop function if exists public.receive_purchase_order_line(uuid, numeric, uuid);
```

- [ ] **Step 2: Apply and verify**

```bash
supabase db reset
# Verify new function exists, old ones gone:
# \df receive_delivery_receipt  → 1 row
# \df receive_purchase_order    → 0 rows
```

- [ ] **Step 3: Commit**

```bash
git add supabase/patches/receive_delivery_receipt_rpc.sql
git commit -m "feat(db): add receive_delivery_receipt RPC, retire old receive RPCs"
```

---

### Task 2: Server actions + helpers

**Goal:** Replace `actions.ts` with `createDeliveryReceipt`, `linkReceiptToPo`, and pure helper functions. Unit-test the pure helpers.

**Files:**
- Create: `src/app/app/goods-inwards/actions.ts` (replaces existing)
- Create: `src/app/app/goods-inwards/actions.test.ts`

**Acceptance Criteria:**
- [ ] `createDeliveryReceipt` inserts header + lines, calls RPC, logs activity, redirects to detail
- [ ] `linkReceiptToPo` updates receipt + PO lines, recomputes status, auto-closes PO if complete
- [ ] `computeReceiptStatus` returns correct status for all four cases
- [ ] `computeVariance` returns null/zero/negative/positive correctly
- [ ] All 9 unit tests pass

**Verify:** `npm test -- src/app/app/goods-inwards/actions.test.ts` → 9 tests pass

**Steps:**

- [ ] **Step 1: Write failing tests**

Create `src/app/app/goods-inwards/actions.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { computeReceiptStatus, computeVariance } from "./actions";

describe("computeReceiptStatus", () => {
  it("returns unmatched when no PO linked", () => {
    expect(computeReceiptStatus(null, [])).toBe("unmatched");
  });

  it("returns po_linked when all lines match expected", () => {
    const lines = [
      { quantity_delivered: 10, quantity_expected: 10 },
      { quantity_delivered: 5, quantity_expected: 5 },
    ];
    expect(computeReceiptStatus("po-id", lines)).toBe("po_linked");
  });

  it("returns discrepancy when any line is short", () => {
    expect(
      computeReceiptStatus("po-id", [
        { quantity_delivered: 8, quantity_expected: 10 },
      ])
    ).toBe("discrepancy");
  });

  it("returns discrepancy when any line is over", () => {
    expect(
      computeReceiptStatus("po-id", [
        { quantity_delivered: 12, quantity_expected: 10 },
      ])
    ).toBe("discrepancy");
  });

  it("returns po_linked when expected is null (unlinked line)", () => {
    expect(
      computeReceiptStatus("po-id", [
        { quantity_delivered: 5, quantity_expected: null },
      ])
    ).toBe("po_linked");
  });
});

describe("computeVariance", () => {
  it("returns null when expected is null", () => {
    expect(computeVariance(10, null)).toBeNull();
  });

  it("returns 0 for exact match", () => {
    expect(computeVariance(10, 10)).toBe(0);
  });

  it("returns negative for short delivery", () => {
    expect(computeVariance(8, 10)).toBe(-2);
  });

  it("returns positive for over-delivery", () => {
    expect(computeVariance(12, 10)).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- src/app/app/goods-inwards/actions.test.ts
```

Expected: FAIL — `computeReceiptStatus` and `computeVariance` not exported.

- [ ] **Step 3: Write actions.ts**

Create `src/app/app/goods-inwards/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

export type ReceiptStatus = "unmatched" | "po_linked" | "discrepancy";

export function computeReceiptStatus(
  purchaseOrderId: string | null,
  lines: Array<{ quantity_delivered: number; quantity_expected: number | null }>
): ReceiptStatus {
  if (!purchaseOrderId) return "unmatched";
  const hasDiscrepancy = lines.some(
    (l) =>
      l.quantity_expected !== null &&
      l.quantity_delivered !== l.quantity_expected
  );
  return hasDiscrepancy ? "discrepancy" : "po_linked";
}

export function computeVariance(
  delivered: number,
  expected: number | null
): number | null {
  if (expected === null) return null;
  return delivered - expected;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type DeliveryReceiptLineInput = {
  component_id: string;
  purchase_order_line_id: string | null;
  quantity_delivered: number;
  quantity_expected: number | null;
  notes: string | null;
};

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function createDeliveryReceipt(formData: FormData) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/auth/login");

  const linesJson = formData.get("lines") as string;
  let lines: DeliveryReceiptLineInput[];
  try {
    lines = JSON.parse(linesJson);
  } catch {
    return { error: "Invalid line data" };
  }
  if (lines.length === 0) return { error: "At least one line is required" };

  const purchaseOrderId =
    (formData.get("purchase_order_id") as string) || null;
  const supplierId = (formData.get("supplier_id") as string) || null;
  const supplierNameOverride =
    (formData.get("supplier_name_override") as string) || null;

  if (!supplierId && !supplierNameOverride)
    return { error: "Supplier is required" };

  const supplierReference = (formData.get("supplier_reference") as string) ?? "";
  if (!supplierReference) return { error: "Supplier reference is required" };

  const stockInReason = purchaseOrderId
    ? "supplier_delivery"
    : ((formData.get("stock_in_reason") as string) || null);
  if (!purchaseOrderId && !stockInReason)
    return { error: "Reason is required for non-PO receipts" };

  const { data: receipt, error: receiptError } = await supabase
    .from("delivery_receipt")
    .insert({
      tenant_id: tenantId,
      supplier_id: supplierId,
      supplier_name_override: supplierNameOverride,
      supplier_reference: supplierReference,
      purchase_order_id: purchaseOrderId,
      location_id: formData.get("location_id") as string,
      received_at:
        (formData.get("received_at") as string) || new Date().toISOString(),
      notes: (formData.get("notes") as string) || null,
      stock_in_reason: stockInReason,
      status: "unmatched",
      created_by: authData.user.id,
    })
    .select("id")
    .single();

  if (receiptError || !receipt)
    return { error: receiptError?.message ?? "Failed to create receipt" };

  const { error: linesError } = await supabase
    .from("delivery_receipt_line")
    .insert(
      lines.map((l) => ({
        tenant_id: tenantId,
        delivery_receipt_id: receipt.id,
        component_id: l.component_id,
        purchase_order_line_id: l.purchase_order_line_id,
        quantity_delivered: l.quantity_delivered,
        quantity_expected: l.quantity_expected,
        notes: l.notes,
      }))
    );

  if (linesError) {
    await supabase.from("delivery_receipt").delete().eq("id", receipt.id);
    return { error: linesError.message };
  }

  const { error: rpcError } = await supabase.rpc("receive_delivery_receipt", {
    p_delivery_receipt_id: receipt.id,
  });

  if (rpcError) return { error: rpcError.message };

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "delivery_receipt_created",
    metadata: {
      delivery_receipt_id: receipt.id,
      supplier_reference: supplierReference,
      lines_count: lines.length,
      purchase_order_id: purchaseOrderId,
    },
  });

  revalidatePath("/app/goods-inwards");
  revalidatePath("/app/purchasing");
  revalidatePath("/app/inventory");
  revalidatePath("/app/activity-log");

  redirect(`/app/goods-inwards/${receipt.id}`);
}

export async function linkReceiptToPo(formData: FormData) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const receiptId = formData.get("receipt_id") as string;
  const purchaseOrderId = formData.get("purchase_order_id") as string;

  const { data: receipt } = await supabase
    .from("delivery_receipt")
    .select("*, delivery_receipt_line(*)")
    .eq("id", receiptId)
    .eq("tenant_id", tenantId)
    .single();

  if (!receipt) return { error: "Receipt not found" };
  if (receipt.status !== "unmatched")
    return { error: "Receipt is already linked to a PO" };

  const { data: poLines } = await supabase
    .from("purchase_order_line")
    .select("id, component_id, quantity, quantity_received")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("tenant_id", tenantId);

  if (!poLines) return { error: "Purchase order not found" };

  const poLineByComponent = new Map(poLines.map((l) => [l.component_id, l]));
  const receiptLines: Array<{
    quantity_delivered: number;
    quantity_expected: number | null;
  }> = [];

  for (const line of receipt.delivery_receipt_line) {
    const poLine = poLineByComponent.get(line.component_id);
    const qtyExpected = poLine
      ? poLine.quantity - poLine.quantity_received
      : null;

    await supabase
      .from("delivery_receipt_line")
      .update({
        purchase_order_line_id: poLine?.id ?? null,
        quantity_expected: qtyExpected,
      })
      .eq("id", line.id);

    if (poLine) {
      const applied = Math.min(
        line.quantity_delivered,
        Math.max(poLine.quantity - poLine.quantity_received, 0)
      );
      if (applied > 0) {
        await supabase
          .from("purchase_order_line")
          .update({ quantity_received: poLine.quantity_received + applied })
          .eq("id", poLine.id);
      }
    }

    receiptLines.push({
      quantity_delivered: line.quantity_delivered,
      quantity_expected: qtyExpected,
    });
  }

  const newStatus = computeReceiptStatus(purchaseOrderId, receiptLines);

  await supabase
    .from("delivery_receipt")
    .update({ purchase_order_id: purchaseOrderId, status: newStatus })
    .eq("id", receiptId);

  const { data: remaining } = await supabase
    .from("purchase_order_line")
    .select("quantity, quantity_received")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("tenant_id", tenantId);

  if (remaining?.every((l) => l.quantity_received >= l.quantity)) {
    await supabase
      .from("purchase_order")
      .update({ status: "received" })
      .eq("id", purchaseOrderId)
      .eq("tenant_id", tenantId);
  }

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "delivery_receipt_linked",
    metadata: { delivery_receipt_id: receiptId, purchase_order_id: purchaseOrderId },
  });

  revalidatePath("/app/goods-inwards");
  revalidatePath("/app/purchasing");

  redirect(`/app/goods-inwards/${receiptId}`);
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- src/app/app/goods-inwards/actions.test.ts
```

Expected: **9 tests pass**

- [ ] **Step 5: Commit**

```bash
git add src/app/app/goods-inwards/actions.ts \
        src/app/app/goods-inwards/actions.test.ts
git commit -m "feat(goods-inwards): server actions for delivery receipt"
```

---

### Task 3: Receipt list page

**Goal:** Replace the main goods-inwards page with a receipt list showing filter tabs and a link to create new receipts.

**Files:**
- Create: `src/app/app/goods-inwards/page.tsx` (replaces existing)
- Create: `src/app/app/goods-inwards/receipt-list.tsx`
- Create: `src/app/app/goods-inwards/goods-inwards.module.css` (replaces existing)
- Modify: `src/app/app/route-meta.ts` lines ~94–98

**Acceptance Criteria:**
- [ ] Page loads at `/app/goods-inwards` showing a table of all delivery receipts
- [ ] Filter tabs (All / Unmatched / Discrepancy / This Week) filter the table client-side
- [ ] Each row links to the receipt detail at `/app/goods-inwards/[id]`
- [ ] "New Receipt" button links to `/app/goods-inwards/new`
- [ ] Status badges show `unmatched`, `po_linked`, `discrepancy` with distinct styles
- [ ] Empty state message shown when no receipts match the filter
- [ ] Route-meta subtitle updated

**Verify:** `npm run build` passes; navigate to `/app/goods-inwards` in browser — list renders.

**Steps:**

- [ ] **Step 1: Update route-meta.ts**

In `src/app/app/route-meta.ts`, find the goods-inwards entry and update the subtitle:

```typescript
// Before:
{
  prefix: "/app/goods-inwards",
  title: "Goods Inwards",
  subtitle: "Receive purchase orders and monitor inbound stock flow.",
  crumbs: ["Goods Inwards"],
},

// After:
{
  prefix: "/app/goods-inwards",
  title: "Goods Inwards",
  subtitle: "Record deliveries and receipt stock into inventory.",
  crumbs: ["Goods Inwards"],
},
```

- [ ] **Step 2: Write the server page**

Create `src/app/app/goods-inwards/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import ReceiptList from "./receipt-list";

export default async function GoodsInwardsPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const { data: receipts } = await supabase
    .from("delivery_receipt")
    .select(
      `id, supplier_name_override, supplier_reference, purchase_order_id,
       status, received_at, stock_in_reason,
       supplier:supplier_id(name),
       location:location_id(name),
       delivery_receipt_line(id)`
    )
    .eq("tenant_id", tenantId)
    .order("received_at", { ascending: false });

  return <ReceiptList receipts={receipts ?? []} />;
}
```

- [ ] **Step 3: Write the receipt list client component**

Create `src/app/app/goods-inwards/receipt-list.tsx`:

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./goods-inwards.module.css";

type Receipt = {
  id: string;
  supplier_name_override: string | null;
  supplier_reference: string;
  purchase_order_id: string | null;
  status: "unmatched" | "po_linked" | "discrepancy";
  received_at: string;
  supplier: { name: string } | Array<{ name: string }> | null;
  location: { name: string } | Array<{ name: string }> | null;
  delivery_receipt_line: Array<{ id: string }>;
};

type FilterTab = "all" | "unmatched" | "discrepancy" | "this_week";

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unmatched", label: "Unmatched" },
  { key: "discrepancy", label: "Discrepancy" },
  { key: "this_week", label: "This Week" },
];

const STATUS_LABELS: Record<Receipt["status"], string> = {
  unmatched: "Unmatched",
  po_linked: "PO linked",
  discrepancy: "Discrepancy",
};

function resolveSupplier(r: Receipt): string {
  if (r.supplier) {
    const s = Array.isArray(r.supplier) ? r.supplier[0] : r.supplier;
    if (s?.name) return s.name;
  }
  return r.supplier_name_override ?? "—";
}

function resolveLocation(r: Receipt): string {
  if (!r.location) return "—";
  const l = Array.isArray(r.location) ? r.location[0] : r.location;
  return l?.name ?? "—";
}

function isThisWeek(dateStr: string): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  return new Date(dateStr) >= cutoff;
}

export default function ReceiptList({ receipts }: { receipts: Receipt[] }) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  const filtered = receipts.filter((r) => {
    if (activeFilter === "unmatched") return r.status === "unmatched";
    if (activeFilter === "discrepancy") return r.status === "discrepancy";
    if (activeFilter === "this_week") return isThisWeek(r.received_at);
    return true;
  });

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={activeFilter === t.key ? styles.tabActive : styles.tab}
              onClick={() => setActiveFilter(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Link href="/app/goods-inwards/new" className={styles.primary}>
          New Receipt
        </Link>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>No receipts found.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Reference</th>
              <th>Lines</th>
              <th>Received</th>
              <th>Location</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{resolveSupplier(r)}</td>
                <td>
                  <Link href={`/app/goods-inwards/${r.id}`} className={styles.link}>
                    {r.supplier_reference}
                  </Link>
                </td>
                <td>{r.delivery_receipt_line.length}</td>
                <td>
                  {new Date(r.received_at).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td>{resolveLocation(r)}</td>
                <td>
                  <span className={`${styles.badge} ${styles[`badge_${r.status}`]}`}>
                    {STATUS_LABELS[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the CSS module**

Create `src/app/app/goods-inwards/goods-inwards.module.css`:

```css
.page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tabs {
  display: flex;
  gap: 4px;
  background: var(--surface-raised);
  border: 1px solid var(--stroke);
  border-radius: 10px;
  padding: 4px;
}

.tab,
.tabActive {
  padding: 6px 14px;
  border-radius: 7px;
  border: none;
  font-size: 0.85rem;
  cursor: pointer;
  background: transparent;
  color: var(--ink-muted);
}

.tabActive {
  background: var(--surface);
  color: var(--ink-strong);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.primary {
  padding: 8px 18px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--brand-1), var(--brand-2));
  color: #fff;
  font-weight: 600;
  font-size: 0.9rem;
  text-decoration: none;
  border: none;
  cursor: pointer;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.table th {
  text-align: left;
  padding: 8px 12px;
  color: var(--ink-muted);
  font-weight: 600;
  border-bottom: 1px solid var(--stroke);
}

.table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--stroke);
  color: var(--ink-strong);
  vertical-align: middle;
}

.table tr:last-child td {
  border-bottom: none;
}

.link {
  color: var(--brand-1);
  text-decoration: none;
  font-weight: 500;
}

.link:hover {
  text-decoration: underline;
}

.badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: capitalize;
}

.badge_unmatched {
  background: color-mix(in srgb, var(--ink-muted) 12%, transparent);
  color: var(--ink-muted);
}

.badge_po_linked {
  background: color-mix(in srgb, var(--ok) 15%, transparent);
  color: var(--ok);
}

.badge_discrepancy {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}

.empty {
  color: var(--ink-muted);
  font-size: 0.9rem;
  padding: 24px 0;
}

/* ── Form shared styles (used by receipt-form and receipt-detail) ── */

.formCard {
  background: var(--surface-raised);
  border: 1px solid var(--stroke);
  border-radius: 16px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.formGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field label {
  font-size: 0.8rem;
  color: var(--ink-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field input,
.field select,
.field textarea {
  padding: 8px 12px;
  border: 1px solid var(--stroke);
  border-radius: 8px;
  font-size: 0.9rem;
  background: var(--surface);
  color: var(--ink-strong);
  outline: none;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: var(--focus-border);
}

.fieldFull {
  composes: field;
  grid-column: 1 / -1;
}

.linesTable {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}

.linesTable th {
  padding: 6px 10px;
  text-align: left;
  color: var(--ink-muted);
  font-weight: 600;
  border-bottom: 1px solid var(--stroke);
}

.linesTable td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--stroke);
  vertical-align: middle;
}

.linesTable tr:last-child td {
  border-bottom: none;
}

.variance {
  font-weight: 600;
}

.varianceShort {
  color: var(--danger);
}

.varianceOver {
  color: #d97706;
}

.secondary {
  padding: 7px 16px;
  border-radius: 8px;
  border: 1px solid var(--stroke);
  background: var(--surface);
  color: var(--ink-strong);
  font-size: 0.88rem;
  cursor: pointer;
}

.actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

@media (max-width: 860px) {
  .formGrid {
    grid-template-columns: 1fr;
  }

  .toolbar {
    flex-direction: column;
    align-items: flex-start;
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/app/goods-inwards/page.tsx \
        src/app/app/goods-inwards/receipt-list.tsx \
        src/app/app/goods-inwards/goods-inwards.module.css \
        src/app/app/route-meta.ts
git commit -m "feat(goods-inwards): receipt list page with filter tabs"
```

---

### Task 4: New receipt form

**Goal:** `/app/goods-inwards/new` — a form where the user enters header info and dynamic lines, optionally links to an open PO, and submits to create a receipt.

**Files:**
- Create: `src/app/app/goods-inwards/new/page.tsx`
- Create: `src/app/app/goods-inwards/receipt-form.tsx`

**Acceptance Criteria:**
- [ ] Supplier dropdown lists existing suppliers; selecting "Other" reveals a free-text input
- [ ] Location dropdown lists all locations; defaults to the `is_default` location
- [ ] "Link to PO" dropdown lists open POs filtered by selected supplier; selecting one pre-fills expected quantities on lines
- [ ] Reason dropdown is hidden when a PO is linked, visible (and required) when not
- [ ] Lines can be added and removed dynamically; at least one line required to submit
- [ ] Variance column auto-calculates (Delivered − Expected); red for negative, orange for positive
- [ ] Submitting calls `createDeliveryReceipt` and redirects to the detail page on success
- [ ] Validation errors display inline without losing form state

**Verify:** Submit a receipt with a PO link — receipt appears in list with `po_linked` or `discrepancy` status and inventory has moved.

**Steps:**

- [ ] **Step 1: Write the server page (fetches form options)**

Create `src/app/app/goods-inwards/new/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import ReceiptForm from "../receipt-form";

export default async function NewReceiptPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const [suppliersResult, componentsResult, locationsResult, openPOsResult] =
    await Promise.all([
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name"),
      supabase
        .from("component")
        .select("id, name, sku")
        .eq("tenant_id", tenantId)
        .order("name"),
      supabase
        .from("location")
        .select("id, name, is_default")
        .eq("tenant_id", tenantId)
        .order("name"),
      supabase
        .from("purchase_order")
        .select(
          `id, supplier_id,
           purchase_order_line(id, component_id, quantity, quantity_received,
             component:component_id(name, sku))`
        )
        .eq("tenant_id", tenantId)
        .eq("status", "open")
        .order("created_at", { ascending: false }),
    ]);

  return (
    <ReceiptForm
      suppliers={suppliersResult.data ?? []}
      components={componentsResult.data ?? []}
      locations={locationsResult.data ?? []}
      openPOs={openPOsResult.data ?? []}
    />
  );
}
```

- [ ] **Step 2: Write the receipt form client component**

Create `src/app/app/goods-inwards/receipt-form.tsx`:

```typescript
"use client";

import { useRef, useState, useTransition } from "react";
import { createDeliveryReceipt } from "./actions";
import { computeVariance } from "./actions";
import styles from "./goods-inwards.module.css";

type Supplier = { id: string; name: string };
type Component = { id: string; name: string; sku: string | null };
type Location = { id: string; name: string; is_default: boolean };
type POLine = {
  id: string;
  component_id: string;
  quantity: number;
  quantity_received: number;
  component: { name: string; sku: string | null } | Array<{ name: string; sku: string | null }> | null;
};
type OpenPO = { id: string; supplier_id: string; purchase_order_line: POLine[] };

type LineState = {
  key: string;
  component_id: string;
  purchase_order_line_id: string | null;
  quantity_delivered: string;
  quantity_expected: number | null;
  notes: string;
};

const REASONS = [
  { value: "supplier_delivery", label: "Supplier delivery" },
  { value: "customer_return", label: "Customer return" },
  { value: "opening_stock", label: "Opening stock" },
  { value: "sample", label: "Sample" },
  { value: "adjustment", label: "Adjustment" },
  { value: "other", label: "Other" },
];

function blankLine(): LineState {
  return {
    key: crypto.randomUUID(),
    component_id: "",
    purchase_order_line_id: null,
    quantity_delivered: "",
    quantity_expected: null,
    notes: "",
  };
}

function componentName(c: Component): string {
  return c.sku ? `${c.name} (${c.sku})` : c.name;
}

export default function ReceiptForm({
  suppliers,
  components,
  locations,
  openPOs,
}: {
  suppliers: Supplier[];
  components: Component[];
  locations: Location[];
  openPOs: OpenPO[];
}) {
  const defaultLocation = locations.find((l) => l.is_default) ?? locations[0];

  const [supplierId, setSupplierId] = useState<string>("");
  const [showSupplierOverride, setShowSupplierOverride] = useState(false);
  const [locationId, setLocationId] = useState(defaultLocation?.id ?? "");
  const [selectedPoId, setSelectedPoId] = useState<string>("");
  const [lines, setLines] = useState<LineState[]>([blankLine()]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const filteredPOs = supplierId
    ? openPOs.filter((po) => po.supplier_id === supplierId)
    : openPOs;

  function handleSupplierChange(value: string) {
    setSupplierId(value);
    setShowSupplierOverride(value === "__other__");
    setSelectedPoId("");
    setLines([blankLine()]);
  }

  function handlePoChange(poId: string) {
    setSelectedPoId(poId);
    if (!poId) {
      setLines([blankLine()]);
      return;
    }
    const po = openPOs.find((p) => p.id === poId);
    if (!po) return;
    const newLines: LineState[] = po.purchase_order_line.map((pol) => ({
      key: crypto.randomUUID(),
      component_id: pol.component_id,
      purchase_order_line_id: pol.id,
      quantity_delivered: "",
      quantity_expected: pol.quantity - pol.quantity_received,
      notes: "",
    }));
    setLines(newLines.length > 0 ? newLines : [blankLine()]);
  }

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    );
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const filledLines = lines.filter((l) => l.component_id && l.quantity_delivered);
    if (filledLines.length === 0) {
      setError("At least one complete line is required.");
      return;
    }

    const fd = new FormData(formRef.current!);
    fd.set(
      "lines",
      JSON.stringify(
        filledLines.map((l) => ({
          component_id: l.component_id,
          purchase_order_line_id: l.purchase_order_line_id,
          quantity_delivered: parseFloat(l.quantity_delivered),
          quantity_expected: l.quantity_expected,
          notes: l.notes || null,
        }))
      )
    );

    startTransition(async () => {
      const result = await createDeliveryReceipt(fd);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className={styles.page}>
      {error && <div className={styles.errorNotice}>{error}</div>}

      <div className={styles.formCard}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
          Delivery details
        </h2>

        <div className={styles.formGrid}>
          {/* Supplier */}
          <div className={styles.field}>
            <label htmlFor="supplier_id">Supplier</label>
            <select
              id="supplier_id"
              name="supplier_id"
              value={showSupplierOverride ? "__other__" : supplierId}
              onChange={(e) => handleSupplierChange(e.target.value)}
            >
              <option value="">Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="__other__">Other / not in system</option>
            </select>
          </div>

          {/* Supplier name override */}
          {showSupplierOverride && (
            <div className={styles.field}>
              <label htmlFor="supplier_name_override">Supplier name</label>
              <input
                id="supplier_name_override"
                name="supplier_name_override"
                type="text"
                placeholder="Enter supplier name"
                required
              />
            </div>
          )}

          {/* Reference */}
          <div className={styles.field}>
            <label htmlFor="supplier_reference">Docket / reference number</label>
            <input
              id="supplier_reference"
              name="supplier_reference"
              type="text"
              placeholder="e.g. DEL-10042"
              required
            />
          </div>

          {/* Date */}
          <div className={styles.field}>
            <label htmlFor="received_at">Date received</label>
            <input
              id="received_at"
              name="received_at"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </div>

          {/* Location */}
          <div className={styles.field}>
            <label htmlFor="location_id">Location</label>
            <select
              id="location_id"
              name="location_id"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              required
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.is_default ? " (default)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Link to PO */}
          <div className={styles.field}>
            <label htmlFor="purchase_order_id">Link to PO (optional)</label>
            <select
              id="purchase_order_id"
              name="purchase_order_id"
              value={selectedPoId}
              onChange={(e) => handlePoChange(e.target.value)}
            >
              <option value="">No PO — manual stock-in</option>
              {filteredPOs.map((po) => (
                <option key={po.id} value={po.id}>
                  PO {po.id.slice(0, 8).toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Reason — only when no PO */}
          {!selectedPoId && (
            <div className={styles.field}>
              <label htmlFor="stock_in_reason">Reason</label>
              <select id="stock_in_reason" name="stock_in_reason" required>
                <option value="">Select reason…</option>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div className={styles.fieldFull}>
            <label htmlFor="notes">Notes (optional)</label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              placeholder="Any overall delivery notes…"
            />
          </div>
        </div>
      </div>

      {/* Lines */}
      <div className={styles.formCard}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Lines</h2>

        <table className={styles.linesTable}>
          <thead>
            <tr>
              <th>Component</th>
              <th>Expected</th>
              <th>Delivered</th>
              <th>Variance</th>
              <th>Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const variance = computeVariance(
                parseFloat(line.quantity_delivered) || 0,
                line.quantity_expected
              );
              return (
                <tr key={line.key}>
                  <td>
                    <select
                      value={line.component_id}
                      onChange={(e) =>
                        updateLine(line.key, { component_id: e.target.value })
                      }
                      disabled={!!line.purchase_order_line_id}
                    >
                      <option value="">Select component…</option>
                      {components.map((c) => (
                        <option key={c.id} value={c.id}>
                          {componentName(c)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {line.quantity_expected !== null
                      ? line.quantity_expected
                      : "—"}
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={line.quantity_delivered}
                      onChange={(e) =>
                        updateLine(line.key, {
                          quantity_delivered: e.target.value,
                        })
                      }
                      style={{ width: 90 }}
                    />
                  </td>
                  <td>
                    {variance !== null ? (
                      <span
                        className={`${styles.variance} ${
                          variance < 0
                            ? styles.varianceShort
                            : variance > 0
                            ? styles.varianceOver
                            : ""
                        }`}
                      >
                        {variance > 0 ? `+${variance}` : variance}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <input
                      type="text"
                      placeholder="Note…"
                      value={line.notes}
                      onChange={(e) =>
                        updateLine(line.key, { notes: e.target.value })
                      }
                      style={{ width: 140 }}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className={styles.secondary}
                      style={{ padding: "4px 10px" }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, blankLine()])}
          className={styles.secondary}
          style={{ alignSelf: "flex-start" }}
        >
          + Add line
        </button>
      </div>

      <div className={styles.actions}>
        <a href="/app/goods-inwards" className={styles.secondary}>
          Cancel
        </a>
        <button type="submit" className={styles.primary} disabled={isPending}>
          {isPending ? "Saving…" : "Save Receipt"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app/goods-inwards/new/page.tsx \
        src/app/app/goods-inwards/receipt-form.tsx
git commit -m "feat(goods-inwards): new receipt form with dynamic lines and PO linking"
```

---

### Task 5: Receipt detail + post-save PO linking

**Goal:** `/app/goods-inwards/[id]` shows the GRN record (read-only) with a "Link to PO" button for unmatched receipts.

**Files:**
- Create: `src/app/app/goods-inwards/[id]/page.tsx`
- Create: `src/app/app/goods-inwards/receipt-detail.tsx`

**Acceptance Criteria:**
- [ ] Detail page shows supplier, reference, date, location, status, lines with expected/delivered/variance
- [ ] Status badge matches list page styling
- [ ] "Link to PO" button visible only when `status === 'unmatched'`
- [ ] Clicking "Link to PO" shows an inline selector of open POs; submitting calls `linkReceiptToPo`
- [ ] After linking, page re-renders with updated status and variances
- [ ] Over-delivery variance is highlighted orange; short delivery is highlighted red
- [ ] Material asterisk note shown when `actual_material_cost` source is planned (not applicable here — just ensure variance display is clear)

**Verify:** Create a receipt linked to a PO with one short line — detail page shows `discrepancy` badge and the short line has a red variance. Create an unmatched receipt — "Link to PO" button appears and works.

**Steps:**

- [ ] **Step 1: Write the server page**

Create `src/app/app/goods-inwards/[id]/page.tsx`:

```typescript
import { notFound, redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import ReceiptDetail from "../receipt-detail";

export default async function ReceiptDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const { data: receipt } = await supabase
    .from("delivery_receipt")
    .select(
      `id, supplier_name_override, supplier_reference, purchase_order_id,
       status, received_at, notes, stock_in_reason, created_at,
       supplier:supplier_id(name),
       location:location_id(name),
       delivery_receipt_line(
         id, component_id, quantity_delivered, quantity_expected, notes,
         component:component_id(name, sku)
       )`
    )
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .single();

  if (!receipt) notFound();

  // Fetch open POs for the link-to-PO selector (only needed when unmatched)
  const openPOs =
    receipt.status === "unmatched"
      ? (
          await supabase
            .from("purchase_order")
            .select("id, supplier_id, suppliers:supplier_id(name)")
            .eq("tenant_id", tenantId)
            .eq("status", "open")
            .order("created_at", { ascending: false })
        ).data ?? []
      : [];

  return <ReceiptDetail receipt={receipt} openPOs={openPOs} />;
}
```

- [ ] **Step 2: Write the receipt detail client component**

Create `src/app/app/goods-inwards/receipt-detail.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { linkReceiptToPo } from "./actions";
import { computeVariance } from "./actions";
import styles from "./goods-inwards.module.css";

type ReceiptLine = {
  id: string;
  component_id: string;
  quantity_delivered: number;
  quantity_expected: number | null;
  notes: string | null;
  component:
    | { name: string; sku: string | null }
    | Array<{ name: string; sku: string | null }>
    | null;
};

type Receipt = {
  id: string;
  supplier_name_override: string | null;
  supplier_reference: string;
  purchase_order_id: string | null;
  status: "unmatched" | "po_linked" | "discrepancy";
  received_at: string;
  notes: string | null;
  stock_in_reason: string | null;
  created_at: string;
  supplier: { name: string } | Array<{ name: string }> | null;
  location: { name: string } | Array<{ name: string }> | null;
  delivery_receipt_line: ReceiptLine[];
};

type OpenPO = {
  id: string;
  supplier_id: string;
  suppliers: { name: string } | Array<{ name: string }> | null;
};

const STATUS_LABELS: Record<Receipt["status"], string> = {
  unmatched: "Unmatched",
  po_linked: "PO linked",
  discrepancy: "Discrepancy",
};

function resolveSupplier(r: Receipt): string {
  if (r.supplier) {
    const s = Array.isArray(r.supplier) ? r.supplier[0] : r.supplier;
    if (s?.name) return s.name;
  }
  return r.supplier_name_override ?? "—";
}

function resolveLocation(r: Receipt): string {
  if (!r.location) return "—";
  const l = Array.isArray(r.location) ? r.location[0] : r.location;
  return l?.name ?? "—";
}

function resolveComponentName(line: ReceiptLine): string {
  if (!line.component) return "Unknown";
  const c = Array.isArray(line.component) ? line.component[0] : line.component;
  if (!c) return "Unknown";
  return c.sku ? `${c.name} (${c.sku})` : c.name;
}

export default function ReceiptDetail({
  receipt,
  openPOs,
}: {
  receipt: Receipt;
  openPOs: OpenPO[];
}) {
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleLink(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPoId) return;
    setLinkError(null);
    const fd = new FormData();
    fd.set("receipt_id", receipt.id);
    fd.set("purchase_order_id", selectedPoId);
    startTransition(async () => {
      const result = await linkReceiptToPo(fd);
      if (result?.error) setLinkError(result.error);
    });
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.formCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
              {receipt.supplier_reference}
            </h2>
            <p style={{ margin: "4px 0 0", color: "var(--ink-muted)", fontSize: "0.85rem" }}>
              {resolveSupplier(receipt)} ·{" "}
              {new Date(receipt.received_at).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <span className={`${styles.badge} ${styles[`badge_${receipt.status}`]}`}>
            {STATUS_LABELS[receipt.status]}
          </span>
        </div>

        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label>Location</label>
            <span>{resolveLocation(receipt)}</span>
          </div>
          {receipt.stock_in_reason && (
            <div className={styles.field}>
              <label>Reason</label>
              <span style={{ textTransform: "capitalize" }}>
                {receipt.stock_in_reason.replace(/_/g, " ")}
              </span>
            </div>
          )}
          {receipt.notes && (
            <div className={styles.fieldFull}>
              <label>Notes</label>
              <span>{receipt.notes}</span>
            </div>
          )}
        </div>

        {receipt.status === "unmatched" && (
          <div>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setShowLinkModal((v) => !v)}
            >
              {showLinkModal ? "Cancel" : "Link to PO"}
            </button>

            {showLinkModal && (
              <form onSubmit={handleLink} style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
                {linkError && (
                  <span style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
                    {linkError}
                  </span>
                )}
                <select
                  value={selectedPoId}
                  onChange={(e) => setSelectedPoId(e.target.value)}
                  required
                >
                  <option value="">Select open PO…</option>
                  {openPOs.map((po) => {
                    const sup = po.suppliers
                      ? Array.isArray(po.suppliers)
                        ? po.suppliers[0]
                        : po.suppliers
                      : null;
                    return (
                      <option key={po.id} value={po.id}>
                        PO {po.id.slice(0, 8).toUpperCase()}
                        {sup ? ` — ${sup.name}` : ""}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={isPending || !selectedPoId}
                >
                  {isPending ? "Linking…" : "Confirm"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Lines */}
      <div className={styles.formCard}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Lines</h2>
        <table className={styles.linesTable}>
          <thead>
            <tr>
              <th>Component</th>
              <th>Expected</th>
              <th>Delivered</th>
              <th>Variance</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {receipt.delivery_receipt_line.map((line) => {
              const variance = computeVariance(
                line.quantity_delivered,
                line.quantity_expected
              );
              return (
                <tr key={line.id}>
                  <td>{resolveComponentName(line)}</td>
                  <td>{line.quantity_expected ?? "—"}</td>
                  <td>{line.quantity_delivered}</td>
                  <td>
                    {variance !== null ? (
                      <span
                        className={`${styles.variance} ${
                          variance < 0
                            ? styles.varianceShort
                            : variance > 0
                            ? styles.varianceOver
                            : ""
                        }`}
                      >
                        {variance > 0 ? `+${variance}` : variance}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{line.notes ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add error notice CSS class** (used by receipt-form; add to goods-inwards.module.css):

Open `src/app/app/goods-inwards/goods-inwards.module.css` and append:

```css
.errorNotice {
  padding: 12px 16px;
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
  border-radius: 10px;
  color: var(--danger);
  font-size: 0.88rem;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/app/goods-inwards/[id]/page.tsx \
        src/app/app/goods-inwards/receipt-detail.tsx \
        src/app/app/goods-inwards/goods-inwards.module.css
git commit -m "feat(goods-inwards): receipt detail view with link-to-PO"
```
