# Orders & Order Detail Redesign — Design Spec

**Date:** 2026-05-05
**Author:** Kasper Simonsen (with Claude)
**Status:** Approved — ready for implementation plan

---

## 1. Purpose

Fix three interrelated problems with the current orders experience:

1. **Allocation is invisible** — auto-allocation already runs on every Shopify sync, but the UI never communicates this. When allocation skips lines (no active BOM), it does so silently. Users see "0 units" with no explanation.
2. **No BOM visibility on order detail** — the detail page shows line items but never shows which BOM was used, what components were reserved, or whether stock is sufficient.
3. **Order detail is too complex** — a "Planning controls" sidebar with a week picker, two action buttons, a finance strip, and a labor schedule per line, all competing for attention.

---

## 2. Context

- **Auto-allocation already exists** — `syncShopifyStoreData` in `src/lib/shopify/sync.ts` (lines 300–309) already calls `reconcileOrderAllocations` for every order after upserting lines. This is not a missing feature; it needs surfacing.
- **Financial planning is not yet automatic** — `generate_job_financial_plan` is still a manual step. This spec adds it to the sync loop alongside allocation.
- **Root cause of "0 units"** — `reconcileOrderAllocations` silently skips any order line whose variant has no active BOM (`is_active = true` on `product_bom`). The fix is making this state visible in the UI, not changing the allocation logic.
- **No schema migrations required** — all data already exists in `product_bom`, `product_bom_component`, `inventory_balance`, `order_component_allocation`.

---

## 3. Scope

**In scope:**

- Add `generate_job_financial_plan` to the sync loop (after allocation)
- New shared helper `getOrderLineStatus()` for BOM + component + stock data
- Orders list page: replace allocation metric column with status badge
- Order detail page: full redesign — BOM visibility per line, remove planning sidebar, collapse labor by default

**Out of scope:**

- Changing allocation logic — `reconcileOrderAllocations` is correct as-is
- Sell price capture fix — covered in the financial profitability spec
- Labor scheduling UI — the week picker and "Move week" form stay, just collapsed by default
- Multi-location allocation — deferred; allocation uses the default location only

---

## 4. Architecture

### 4.1 Sync loop — add financial planning (`src/lib/shopify/sync.ts`)

After the existing allocation loop, add a financial planning loop:

```typescript
const weekStart = getCurrentMondayIso(); // same helper already used in actions.ts

for (const localOrderId of orderLocalIds) {
  const { data: lines } = await admin
    .from("order_line")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("order_id", localOrderId);

  for (const line of lines ?? []) {
    try {
      await admin.rpc("generate_job_financial_plan", {
        p_order_line_id: line.id,
        p_start_week: weekStart,
      });
      planRuns += 1;
    } catch {
      continue;
    }
  }
}
```

Include `planRuns` in the `SyncResult` type and activity log metadata. Both loops run after all upserts complete.

### 4.2 Shared helper — `src/lib/orders/order-line-status.ts`

```typescript
export type ComponentStatus = {
  componentId: string;
  name: string;
  requiredQty: number;   // BOM qty × order line quantity
  availableQty: number;  // inventory_balance.on_hand - inventory_balance.reserved
  isShort: boolean;      // availableQty < requiredQty
};

export type OrderLineStatus = {
  lineId: string;
  bom: { id: string; version: number; name: string } | null;
  components: ComponentStatus[];
  allocatedQty: number;
  allocationState: "allocated" | "no-bom" | "empty-bom";
};
```

**Query chain per line:**

1. `product_bom` where `variant_id = line.variant_id AND is_active = true AND tenant_id = ?` → get active BOM
2. `product_bom_component` where `product_bom_id = bom.id` → get component rows
3. `component` join + `inventory_balance` (default location) → get name and available stock
4. `order_component_allocation` where `order_line_id = line.id` → sum allocated quantity

**Allocation state logic:**

| Condition | State |
|---|---|
| No active BOM | `no-bom` |
| Active BOM exists but has no components | `empty-bom` |
| Active BOM with components, allocation rows exist | `allocated` |

For the **order list badge**, a lightweight version queries only whether each order has any lines with missing BOMs — no component detail needed.

### 4.3 Orders list page (`src/app/app/orders/page.tsx`)

**New query — allocation badge state per order:**

For each order, count `order_line` rows and join to check whether an active `product_bom` exists for each variant. Derive badge state:

| Condition | Badge |
|---|---|
| All lines have `allocationState === "allocated"` | ✓ Allocated (green) |
| Some lines have `allocationState === "no-bom"` or `"empty-bom"` | ⚠ N lines need BOM (amber) |
| All lines have `allocationState === "no-bom"` or `"empty-bom"` | ⚠ No BOMs set up (red) |
| Order fulfilled or cancelled | — (muted) |

**Column changes:**

| Removed | Replaced with |
|---|---|
| "Allocated" metric (lines / qty count) | Allocation status badge |
| "Plan" metric (hours / margin) | — (removed; lives on detail) |
| "Run allocation" button per row | — (removed; automatic) |
| "Generate plans" header button | — (removed; automatic) |

Add a "View →" link column. Keep "Sync orders" button. Remove "Generate plans" header button.

### 4.4 Order detail page (`src/app/app/orders/[orderId]/page.tsx`)

**Page structure — top to bottom:**

1. **Header** — Order number, date, status badge. "Re-run allocation" as a single secondary button (keeps `allocateOrder` server action; replaces the current header-level "Run allocation"). No "Allocate and plan" — this is now the sync's job.

2. **Summary row** — 4 stat cards:
   - Order value (total `line_sell_price`)
   - Planned margin (sum from `job_cost_snapshot`)
   - Lines allocated (e.g. "2 / 3" with sub-text "1 needs a BOM" when applicable)
   - Labor scheduled (total planned hours)

3. **Order lines** — one card per line. Each card:

   **Line header:**
   - Product + variant title, status badge (✓ Allocated / ⚠ No active BOM)
   - SKU · Qty · Unit sell price · BOM version link (e.g. "BOM v3 →" to `/app/bom/[bomId]`)
   - Planned margin (right-aligned, from `job_cost_snapshot`)

   **Component section (always visible when BOM exists):**
   - Label: "Reserved components — BOM v{n} × {qty}"
   - Table: Component name | Reserved qty | Available badge (green if sufficient, red ⚠ if short)

   **No-BOM / empty-BOM state (when `allocationState === "no-bom"` or `"empty-bom"`):**
   - Amber border on card
   - `no-bom`: "Allocation skipped — create an active BOM for this variant to reserve components and generate a cost plan."
   - `empty-bom`: "Allocation skipped — the active BOM has no components. Add components to the BOM and re-run allocation."
   - Link: "Go to BOM →" → `/app/bom` (plain link; the BOM page does not currently support a `?variant=` filter param — add filtering only if the BOM page is updated to support it)

   **Labor section (collapsed by default):**
   - Disclosure toggle: "Labor: N operations · X hrs"
   - Expanded: existing `job_labor_plan` rows with week picker and "Move week" form (unchanged from current)

4. **Capacity warnings** — kept as-is (only shown when `overload_hours > 0`)

**Removed from current page:**
- "Planning controls" sidebar (week picker + Generate plans + Allocate and plan buttons)
- The `lineFinanceStrip` section (planned/actual finance detail per line) — this detail moves to the profitability page; the detail page shows summary margin only
- "Generate plans" as an explicit action

---

## 5. File map

**Modified:**
- `src/lib/shopify/sync.ts` — add financial planning loop; add `planRuns` to `SyncResult`
- `src/app/app/orders/page.tsx` — new allocation badge query; remove Generate plans button; remove Run allocation per-row; add View link
- `src/app/app/orders/[orderId]/page.tsx` — full redesign per section 4.4
- `src/app/app/orders/[orderId]/page.module.css` — update styles for new layout

**Created:**
- `src/lib/orders/order-line-status.ts` — shared helper with `getOrderLineStatus()`

---

## 6. Acceptance criteria

1. After a Shopify sync, each newly synced order has allocation rows in `order_component_allocation` AND a `job_cost_snapshot` per line (where an active BOM exists).
2. Orders list shows ✓ Allocated badge for orders where all lines have allocation rows.
3. Orders list shows ⚠ badge for orders with any lines missing an active BOM.
4. Order detail — "Planning controls" sidebar is gone.
5. Order detail — each line card shows the active BOM version and component list with reserved qty and available stock.
6. Order detail — a line with no active BOM shows an amber "No active BOM" state with a "Set up BOM →" link.
7. Order detail — a short-stock component (available < reserved) shows a red ⚠ available badge.
8. Labor schedule is present but collapsed by default on each line card.
9. "Re-run allocation" button in the order detail header triggers `allocateOrder` and redirects back with a success message.
10. The orders list page has no "Run allocation" or "Generate plans" buttons.
