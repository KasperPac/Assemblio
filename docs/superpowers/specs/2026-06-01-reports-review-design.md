# Design: Reports Review Fixes
**Date:** 2026-06-01  
**Status:** Approved  
**Source:** `docs/review/reports.md` — bugs 1–6, accessibility A1–A3, easy wins U1/U2/U6 + column sorting

---

## Scope

15 files (2 new, 13 modified). No DB migrations, no new routes, no new server actions.

---

## Bug Fixes

### Bug 1 — Hub page has no `<h1>` heading

**File:** `reports/page.tsx`

The hub renders a bare `<p className={styles.pageDesc}>` with no heading. Replace it with `<PageHeader eyebrow="Operations" title="Reports" />` at the top of the returned JSX. Remove the `<p>` element and its CSS class.

---

### Bug 2 — "Custom" date button does nothing

**File:** `reports/_components/date-preset-bar.tsx`

`applyPreset(-1)` returns immediately. The custom date inputs only appear when `isCustom` is true, which requires `from`/`to` already in the URL. Fix: when `days === -1`, navigate to `?from=<today>&to=<today>` (no `preset` param). This sets `isCustom = true` and reveals the inputs — consistent with the URL-driven pattern used by every other preset.

```typescript
if (days === -1) {
  const today = fmtParam(new Date());
  params.set("from", today);
  params.set("to", today);
  params.delete("preset");
  router.push(`${pathname}?${params.toString()}`);
  return;
}
```

---

### Bug 3 — Stock on hand: date bar is decorative

**File:** `reports/stock-on-hand/page.tsx`

`inventory_balance` is a live snapshot table — there is no `created_at` to filter by date. The date preset bar is structurally misleading. Fix: pass `hideDateRange={true}` to `<ReportShell>`. The prop already exists in `ReportShell`.

---

### Bug 4 — Valuation: date bar is decorative

**File:** `reports/valuation/page.tsx`

Same as Bug 3 — also queries `inventory_balance`. Fix: pass `hideDateRange={true}` to `<ReportShell>`.

---

### Bug 5 — PO # is an unlinked UUID fragment

**File:** `reports/po-summary/page.tsx`

`r.poNumber` (`po.id.slice(0, 8).toUpperCase()`) is rendered as plain text. The full PO `id` is already in `r.id`. Fix: wrap in a `<Link>`:

```tsx
<Link href={`/app/purchasing/${r.id}`} className={styles.reportLink}>
  PO-{r.poNumber}
</Link>
```

---

### Bug 6 — "Reference" column duplicates "Type" in movements

**File:** `reports/movements/page.tsx`

The "Type" column renders `m.reason ?? m.reference_type ?? "adjustment"` as a badge. The "Reference" column renders `m.reference_type ?? "—"`. When `reason` is null both columns show the same enum value. Fix: remove the "Reference" column from the `columns` array entirely. Remove `reference` from the `Row` interface and its mapping.

---

## Accessibility

### A1 — `<th>` missing `scope="col"`

**File:** `reports/_components/report-table.tsx`

Add `scope="col"` to every `<th>` in the thead:

```tsx
<th key={c.key} scope="col" className={c.align === "right" ? styles.right : ""}>
```

---

### A2 — Custom date inputs have no labels

**File:** `reports/_components/date-preset-bar.tsx`

Wrap each `<input type="date">` in a `<label>` with visually-hidden text. Add a `srOnly` CSS class to `date-preset-bar.module.css`:

```css
.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

Render:
```tsx
<label>
  <span className={styles.srOnly}>From</span>
  <input type="date" id="date-from" className={styles.dateInput} value={currentFrom} onChange={(e) => applyCustomDate("from", e.target.value)} />
</label>
<span aria-hidden="true" style={{ color: "var(--ink-muted)", fontSize: 13 }}>→</span>
<label>
  <span className={styles.srOnly}>To</span>
  <input type="date" id="date-to" className={styles.dateInput} value={currentTo} onChange={(e) => applyCustomDate("to", e.target.value)} />
</label>
```

---

### A3 — Charts have no ARIA

**File:** `reports/_components/report-chart.tsx`

Wrap the chart `<div>` in `<figure role="img" aria-label={title}>`. The `title` prop is already passed to every `ReportChart` call.

```tsx
<figure role="img" aria-label={title} style={{ margin: 0 }}>
  <div className={styles.chartWrap}>
    {/* existing recharts render */}
  </div>
</figure>
```

---

### A4 — Colour-only status (no action)

All `Badge` elements render visible text (`"Out"`, `"Low"`, `"OK"`, `"receipt"`, etc.). Quantity cells use `+`/`−` signs alongside colour. Nothing is colour-only — WCAG 1.4.1 is satisfied by the existing implementation.

---

## Navigation

### U1 — Back-navigation breadcrumbs

**File:** `reports/_components/report-shell.tsx`

`ReportShell` is used by all 10 individual report pages (not the hub). One change propagates everywhere. Update the `PageHeader` call:

```tsx
<PageHeader
  eyebrow={eyebrow}
  title={title}
  description={description}
  breadcrumbs={[{ label: "Reports", href: "/app/reports" }, { label: title }]}
/>
```

---

### Last-refreshed timestamp

**File:** `reports/_components/report-shell.tsx`

Add a small "as of" note rendered below the `<DatePresetBar>`. `ReportShell` is a server component rendered at request time, so `new Date()` is the exact moment the data was fetched:

```tsx
<p className={styles.refreshed}>
  as of {new Date().toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" })}
</p>
```

CSS in `report-shell.module.css`:

```css
.refreshed {
  font-size: var(--fs-xs);
  color: var(--ink-faint);
  text-align: right;
  margin: 0;
}
```

---

## Drill-through Links (U6)

All links use `import Link from "next/link"` and a shared `styles.reportLink` CSS class in each page's module:

```css
.reportLink {
  color: var(--brand-1);
  text-decoration: none;
}
.reportLink:hover {
  text-decoration: underline;
}
```

### Stock on hand

**File:** `reports/stock-on-hand/page.tsx`

`Row.id` is `"${component_id}-${location_id}"`. Add `componentId: string` to `Row`, set to `r.component_id`. Render the component name as:

```tsx
<Link href={`/app/components/${r.componentId}`} className={styles.reportLink}>{r.name}</Link>
```

### Valuation

**File:** `reports/valuation/page.tsx`

`Row.id` is already `b.component_id`. Render:

```tsx
<Link href={`/app/components/${r.id}`} className={styles.reportLink}>{r.name}</Link>
```

### Dead stock

**File:** `reports/dead-stock/page.tsx`

`Row.id` is already `b.component_id`. Same pattern as valuation.

### Movements

**File:** `reports/movements/page.tsx`

Extend the Supabase select from `component:component_id(name)` to `component:component_id(id,name)`. Add `componentId: string | null` to `MovementRaw` and `Row`. Render:

```tsx
r.componentId
  ? <Link href={`/app/components/${r.componentId}`} className={styles.reportLink}>{r.component}</Link>
  : r.component
```

### PO summary

Done alongside Bug 5 — the PO # link serves as the drill-through.

### PO variance

**File:** `reports/po-variance/page.tsx`

Add `poId: string | null` to `VarianceRow`. In the mapping, set `poId: poObj?.id ?? null`. Render:

```tsx
r.poId
  ? <Link href={`/app/purchasing/${r.poId}`} className={styles.reportLink}>PO-{r.poNumber}</Link>
  : r.poNumber
```

### Spend by supplier

**File:** `reports/spend-by-supplier/page.tsx`

`supplierId` is already in `SupplierRow`. Render:

```tsx
<Link href={`/app/suppliers/${r.supplierId}`} className={styles.reportLink}>{r.supplier}</Link>
```

### Lead-time accuracy

**File:** `reports/lead-time-accuracy/page.tsx`

Add `supplier_id` to the nested `purchase_order` select:

```typescript
purchase_order:purchase_order_id(
  expected_date,
  supplier_id,
  supplier:supplier_id(name)
)
```

Update `ReceiptRow.purchase_order` type to include `supplier_id?: string | null`. Rekey the `supplierMap` from supplier name to supplier ID. Add `supplierId: string` to `SupplierAccuracy`. Render:

```tsx
<Link href={`/app/suppliers/${r.supplierId}`} className={styles.reportLink}>{r.supplier}</Link>
```

---

## Column Sorting

### New file: `reports/_components/sortable-report-table.tsx`

A `"use client"` component. Takes the same props as `ReportTable` plus optional `defaultSortKey?: string`. Manages `sortKey` and `sortDir` with `useState`. Renders its own `<table>` using the same CSS classes as `ReportTable` — no dependency on `ReportTable`'s render path.

**Sort logic:**
- Click a column header → sort ascending by that column's `key`
- Click the same header again → toggle to descending
- Active header shows `↑` (asc) or `↓` (desc) suffix
- Numeric values sort numerically; everything else uses `String.localeCompare`

**Column headers:**

```tsx
<th
  key={c.key}
  scope="col"
  className={`${c.align === "right" ? styles.right : ""} ${styles.sortable}`}
  onClick={() => handleSort(c.key)}
  aria-sort={sortKey === c.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
>
  <button type="button" className={styles.sortBtn}>
    {c.header}
    {sortKey === c.key && (
      <span aria-hidden="true">{sortDir === "asc" ? " ↑" : " ↓"}</span>
    )}
  </button>
</th>
```

**Sort implementation:**

```typescript
function handleSort(key: string) {
  if (key === sortKey) {
    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  } else {
    setSortKey(key);
    setSortDir("asc");
  }
}

const sorted = sortKey
  ? [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    })
  : rows;
```

**Usage:** All report pages that currently use `<ReportTable>` switch to `<SortableReportTable>` (except `stocktake-history` and `inventory-integrity` which are left unchanged). `ReportTable` itself is not modified.

CSS additions to a new `sortable-report-table.module.css` (composes table styles from `report-table.module.css`):

```css
.sortable { cursor: pointer; user-select: none; }
.sortBtn {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-align: inherit;
}
```

---

## Dead-stock Threshold Control (U2)

### New file: `reports/dead-stock/idle-threshold-control.tsx`

A `"use client"` component. Receives `current: number` from the parent server component. Renders four buttons (30 / 60 / 90 / 180 days). Clicking navigates to `?idle={days}` using `useRouter` + `usePathname` + `useSearchParams`. The active button is highlighted.

```tsx
const OPTIONS = [30, 60, 90, 180];

export function IdleThresholdControl({ current }: { current: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function select(days: number) {
    const params = new URLSearchParams(sp.toString());
    params.set("idle", String(days));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className={styles.control}>
      <span className={styles.label}>Idle threshold:</span>
      {OPTIONS.map((d) => (
        <button
          key={d}
          type="button"
          className={`${styles.btn} ${current === d ? styles.active : ""}`}
          onClick={() => select(d)}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}
```

**In `dead-stock/page.tsx`:** render `<IdleThresholdControl current={idleThreshold} />` inside a `<Suspense fallback={null}>` wrapper (same pattern as `DatePresetBar`) immediately after `<ReportStatCards>`.

CSS mirrors the date preset bar's visual language: inactive buttons use `--bg-card-alt` / `--ink-muted`, active uses `--brand-1` background with white text.

---

## Files Changed

| File | Change |
|------|--------|
| `reports/page.tsx` | Add `PageHeader` — Bug 1 |
| `reports/_components/date-preset-bar.tsx` | Fix Custom button — Bug 2; add SR labels — A2 |
| `reports/_components/report-table.tsx` | Add `scope="col"` — A1 |
| `reports/_components/report-shell.tsx` | Breadcrumbs — U1; last-refreshed note |
| `reports/_components/report-chart.tsx` | `<figure role="img">` wrapper — A3 |
| `reports/stock-on-hand/page.tsx` | `hideDateRange` — Bug 3; component link — U6 |
| `reports/valuation/page.tsx` | `hideDateRange` — Bug 4; component link — U6 |
| `reports/movements/page.tsx` | Remove Reference column — Bug 6; component link — U6 |
| `reports/po-summary/page.tsx` | PO link — Bug 5 + U6 |
| `reports/po-variance/page.tsx` | PO link — U6 |
| `reports/spend-by-supplier/page.tsx` | Supplier link — U6 |
| `reports/lead-time-accuracy/page.tsx` | Supplier link, rekey grouping — U6 |
| `reports/dead-stock/page.tsx` | Threshold control — U2; component link — U6 |
| `reports/_components/sortable-report-table.tsx` | **New** — client-side sortable table |
| `reports/dead-stock/idle-threshold-control.tsx` | **New** — threshold segmented control |

---

## Out of Scope

- U3 (section labels visually identical on hub) — cosmetic, deferred
- U4 column sorting on stocktake-history and inventory-integrity — no sortable columns add value there
- U5 (search/filter on tables) — separate feature
- U7 (inventory-integrity raw delta descriptions) — separate finding
- U8 (receipts with no expected_date counted as on-time) — data modelling question, deferred
- A5 (sidebar `<a>` vs `<Link>`) — sidebar is shared infrastructure, separate concern
- A6 (hub card aria-label) — low impact, deferred
- Reports Easy Wins 1, 4, 5 (column sorting on stocktake/integrity, trend indicators, refresh button) — sorted by SortableReportTable where it matters; trend indicators are a feature addition
