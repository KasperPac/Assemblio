# Design: A-05 — "Due In" Tab on Goods Inwards List

**Date:** 2026-06-03  
**Status:** Approved

---

## Goal

Add a "Due In" tab to the goods inwards list page showing open purchase orders that are expected within the next 14 days (or already overdue) and have no delivery receipt yet. Warehouse teams use this to plan dock space, brief staff, and flag late deliveries.

---

## Scope

- `page.tsx` — add a second Supabase query for due POs; pass `duePOs` prop to `<ReceiptList>`
- `receipt-list.tsx` — add `DuePO` type, `"due_in"` tab, due-in table rendering with urgency labels

No DB migrations. No new CSS files. No new components.

---

## Data (`page.tsx`)

### Query

```typescript
const { data: duePOsRaw } = await supabase
  .from("purchase_order")
  .select(
    "id, status, expected_date, supplier:supplier_id(name), purchase_order_line(id), delivery_receipt(id)"
  )
  .in("status", ["open", "in_transit"])
  .not("expected_date", "is", null)
  .eq("tenant_id", tenantId)
  .order("expected_date", { ascending: true });
```

### Server-side filtering and mapping

After the query, filter and map to the `DuePO` shape:

```typescript
const now = new Date();
const cutoff = new Date(now);
cutoff.setDate(cutoff.getDate() + 14);

const duePOs = (duePOsRaw ?? [])
  .filter((po) => {
    // Exclude POs that already have a receipt
    const receipts = po.delivery_receipt ?? [];
    if (Array.isArray(receipts) ? receipts.length > 0 : !!receipts) return false;
    // Include overdue (past expected_date) and due within 14 days
    const expected = new Date(po.expected_date as string);
    return expected <= cutoff;
  })
  .map((po) => {
    const rawSupplier = Array.isArray(po.supplier) ? po.supplier[0] : po.supplier;
    const lines = po.purchase_order_line ?? [];
    return {
      id: po.id as string,
      status: po.status as string,
      expected_date: po.expected_date as string,
      supplier_name: (rawSupplier as { name: string } | null)?.name ?? "Unknown supplier",
      line_count: Array.isArray(lines) ? lines.length : 0,
    };
  });
```

### Pass to `<ReceiptList>`

```tsx
<ReceiptList receipts={receipts ?? []} duePOs={duePOs} />
```

---

## `DuePO` type (in `receipt-list.tsx`)

```typescript
type DuePO = {
  id: string;
  status: string;
  expected_date: string;
  supplier_name: string;
  line_count: number;
};
```

---

## Tab changes (`receipt-list.tsx`)

### FilterTab union

```typescript
type FilterTab = "all" | "unmatched" | "discrepancy" | "this_week" | "due_in";
```

### TABS array

```typescript
const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unmatched", label: "Unmatched" },
  { key: "discrepancy", label: "Discrepancy" },
  { key: "this_week", label: "This Week" },
  { key: "due_in", label: "Due In" },
];
```

### Props

Add `duePOs: DuePO[]` to the component props:

```typescript
function ReceiptList({ receipts, duePOs }: { receipts: Receipt[]; duePOs: DuePO[] }) {
```

---

## "Due In" table rendering

When `activeFilter === "due_in"`, replace the entire `<table>` block with a due-in table. The existing receipt table is unchanged.

### Urgency label helper (defined inside the component, before the return)

```typescript
function dueLabel(expectedDateStr: string): { text: string; color: string } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expected = new Date(expectedDateStr);
  expected.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (expected.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 0) {
    return {
      text: `⚠ ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} overdue`,
      color: "var(--danger)",
    };
  }
  if (diffDays === 0) {
    return { text: "Due today", color: "var(--warning)" };
  }
  if (diffDays <= 3) {
    return { text: `Due in ${diffDays} day${diffDays === 1 ? "" : "s"}`, color: "var(--warning)" };
  }
  return { text: `Due in ${diffDays} day${diffDays === 1 ? "" : "s"}`, color: "var(--ink-muted)" };
}
```

### Due-in table JSX

```tsx
{activeFilter === "due_in" ? (
  <div className={styles.tableCard}>
    <table className={styles.table}>
      <thead>
        <tr>
          <th>PO</th>
          <th>Supplier</th>
          <th>Expected</th>
          <th>Due</th>
          <th>Lines</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {duePOs.length === 0 ? (
          <tr>
            <td colSpan={6}>
              <EmptyState
                title="No upcoming deliveries"
                message="No open purchase orders are due within the next 14 days."
              />
            </td>
          </tr>
        ) : (
          duePOs.map((po) => {
            const { text, color } = dueLabel(po.expected_date);
            return (
              <tr key={po.id}>
                <td>
                  <Link
                    href={`/app/purchasing/${po.id}`}
                    className={styles.link}
                  >
                    PO-{po.id.slice(0, 8).toUpperCase()}
                  </Link>
                </td>
                <td>{po.supplier_name}</td>
                <td>
                  {new Date(po.expected_date).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td>
                  <span style={{ color, fontWeight: color === "var(--ink-muted)" ? undefined : 600 }}>
                    {text}
                  </span>
                </td>
                <td>{po.line_count}</td>
                <td>
                  <Link
                    href={`/app/goods-inwards/new?po=${po.id}`}
                    className={styles.secondary}
                    style={{ padding: "4px 10px", whiteSpace: "nowrap" }}
                  >
                    Receive →
                  </Link>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  </div>
) : (
  /* existing receipt table unchanged */
  <div className={styles.tableCard}>
    ...
  </div>
)}
```

**Note:** The "Receive →" link uses `className={styles.secondary}` with an inline `padding` override — this is a dynamic sizing adjustment (same pattern used in receipt-form.tsx for the Browse button). The `whiteSpace: "nowrap"` prevents line-break on small screens.

---

## Files Changed

| File | Change |
|------|--------|
| `src/app/app/goods-inwards/page.tsx` | Add PO query, server-side filter/map, pass `duePOs` to `<ReceiptList>` |
| `src/app/app/goods-inwards/receipt-list.tsx` | Add `DuePO` type; extend `FilterTab`; add `"due_in"` to TABS; add `duePOs` prop; add `dueLabel()` helper; add due-in table branch |

---

## Success Criteria

- "Due In" tab appears on the goods inwards list page
- Tab shows open/in-transit POs with `expected_date` set, no linked receipt, due within 14 days or overdue
- Overdue POs show `⚠ N days overdue` in `var(--danger)` at the top of the list (sorted by expected_date ascending)
- Due today shows `Due today` in `var(--warning)`
- Due within 3 days shows `Due in N days` in `var(--warning)`
- Due in 4–14 days shows `Due in N days` in `var(--ink-muted)`
- PO reference links to `/app/purchasing/{id}`
- "Receive →" links to `/app/goods-inwards/new?po={id}` (pre-fills the receipt form)
- Empty state: "No upcoming deliveries" when no matching POs
- All other tabs (All, Unmatched, Discrepancy, This Week) unchanged
- `npx tsc --noEmit` passes with no errors
