# Reports Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 bugs, 3 accessibility gaps, add breadcrumbs + last-refreshed, drill-through links on all report pages, client-side column sorting, and a dead-stock idle-threshold control.

**Architecture:** Shared components (`ReportTable`, `ReportShell`, `ReportChart`, `DatePresetBar`) are patched first, then two new client components are created (`SortableReportTable`, `IdleThresholdControl`), then each of the 8 affected report pages is updated in isolation. No DB migrations, no new routes, no new server actions.

**Tech Stack:** Next.js 15 App Router, TypeScript, CSS Modules, Supabase JS, React `useState`/`useRouter`.

---

## File Map

| File | Action | Covers |
|------|--------|--------|
| `src/app/app/reports/_components/report-table.tsx` | Modify | A1 (`scope="col"`) |
| `src/app/app/reports/_components/report-chart.tsx` | Modify | A3 (ARIA figure wrapper) |
| `src/app/app/reports/_components/report-shell.tsx` | Modify | U1 (breadcrumbs), last-refreshed |
| `src/app/app/reports/_components/report-shell.module.css` | Modify | `.refreshed` style |
| `src/app/app/reports/_components/date-preset-bar.tsx` | Modify | Bug 2 (Custom button), A2 (SR labels) |
| `src/app/app/reports/_components/date-preset-bar.module.css` | Modify | `.srOnly` style |
| `src/app/app/reports/_components/sortable-report-table.tsx` | **Create** | Column sorting |
| `src/app/app/reports/_components/sortable-report-table.module.css` | **Create** | Sortable table styles |
| `src/app/app/reports/page.tsx` | Modify | Bug 1 (hub heading) |
| `src/app/app/reports/dead-stock/idle-threshold-control.tsx` | **Create** | U2 (threshold control) |
| `src/app/app/reports/dead-stock/idle-threshold-control.module.css` | **Create** | Threshold control styles |
| `src/app/app/reports/stock-on-hand/page.tsx` | Modify | Bug 3, U6, sorting |
| `src/app/app/reports/valuation/page.tsx` | Modify | Bug 4, U6, sorting |
| `src/app/app/reports/movements/page.tsx` | Modify | Bug 6, U6, sorting |
| `src/app/app/reports/po-summary/page.tsx` | Modify | Bug 5, U6, sorting |
| `src/app/app/reports/po-variance/page.tsx` | Modify | U6, sorting |
| `src/app/app/reports/spend-by-supplier/page.tsx` | Modify | U6, sorting |
| `src/app/app/reports/lead-time-accuracy/page.tsx` | Modify | U6, sorting |
| `src/app/app/reports/dead-stock/page.tsx` | Modify | U2, U6, sorting |

---

## Task 1: Fix shared component accessibility — `scope="col"` and chart ARIA

**Files:**
- Modify: `src/app/app/reports/_components/report-table.tsx`
- Modify: `src/app/app/reports/_components/report-chart.tsx`

### report-table.tsx — add `scope="col"` to `<th>`

- [ ] Open `src/app/app/reports/_components/report-table.tsx`. Find the `<th>` in the `<thead>` render (line ~37):

```tsx
<th key={c.key} className={c.align === "right" ? styles.right : ""}>
  {c.header}
</th>
```

Change to:

```tsx
<th key={c.key} scope="col" className={c.align === "right" ? styles.right : ""}>
  {c.header}
</th>
```

### report-chart.tsx — wrap chart in `<figure role="img">`

- [ ] Open `src/app/app/reports/_components/report-chart.tsx`. Find the outer `return` (line ~49):

```tsx
return (
  <div className={styles.wrapper}>
    <div className={styles.title}>{props.title}</div>
    <ResponsiveContainer width="100%" height={220}>
```

Change to:

```tsx
return (
  <figure role="img" aria-label={props.title} style={{ margin: 0 }}>
    <div className={styles.wrapper}>
      <div className={styles.title}>{props.title}</div>
      <ResponsiveContainer width="100%" height={220}>
```

And close the `</figure>` tag after the closing `</div>` of `.wrapper`:

```tsx
      </ResponsiveContainer>
    </div>
  </figure>
);
```

The full updated `return` block in `report-chart.tsx`:

```tsx
return (
  <figure role="img" aria-label={props.title} style={{ margin: 0 }}>
    <div className={styles.wrapper}>
      <div className={styles.title}>{props.title}</div>
      <ResponsiveContainer width="100%" height={220}>
        {props.type === "bar" ? (
          <BarChart
            data={props.data}
            layout={props.layout ?? "horizontal"}
            margin={{ top: 4, right: 12, bottom: 4, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-strong)" />
            {props.layout === "vertical" ? (
              <>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey={props.xKey} type="category" tick={{ fontSize: 11 }} width={120} />
              </>
            ) : (
              <>
                <XAxis dataKey={props.xKey} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={48} />
              </>
            )}
            <Tooltip />
            {props.series.length > 1 && <Legend />}
            {props.series.map((s) => (
              <Bar
                key={s.dataKey}
                dataKey={s.dataKey}
                fill={s.color}
                name={s.name ?? s.dataKey}
                radius={props.layout === "vertical" ? [0, 2, 2, 0] : [2, 2, 0, 0]}
              />
            ))}
          </BarChart>
        ) : (
          <LineChart
            data={props.data}
            margin={{ top: 4, right: 12, bottom: 4, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-strong)" />
            <XAxis dataKey={props.xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={48} />
            <Tooltip />
            {props.series.length > 1 && <Legend />}
            {props.series.map((s) => (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                stroke={s.color}
                dot={false}
                name={s.name ?? s.dataKey}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  </figure>
);
```

- [ ] Run `npx tsc --noEmit` — expect no new errors.

- [ ] Commit:

```bash
git add src/app/app/reports/_components/report-table.tsx src/app/app/reports/_components/report-chart.tsx
git commit -m "fix(reports): add scope=col to th headers (A1), wrap chart in figure[role=img] (A3)"
```

---

## Task 2: ReportShell — breadcrumbs + last-refreshed

**Files:**
- Modify: `src/app/app/reports/_components/report-shell.tsx`
- Modify: `src/app/app/reports/_components/report-shell.module.css`

### report-shell.module.css — add `.refreshed`

- [ ] Open `src/app/app/reports/_components/report-shell.module.css`. Append at the end:

```css
.refreshed {
  font-size: var(--fs-xs);
  color: var(--ink-faint);
  text-align: right;
  margin: 0 0 4px 0;
}
```

### report-shell.tsx — add breadcrumbs + refreshed note

- [ ] Open `src/app/app/reports/_components/report-shell.tsx`. Replace the full file content with:

```tsx
import { Suspense } from "react";
import PageHeader from "@/app/app/_ui/page-header";
import { DatePresetBar } from "./date-preset-bar";
import styles from "./report-shell.module.css";

interface Props {
  eyebrow: string;
  title: string;
  description: string;
  csvSlug: string;
  searchParams: Record<string, string | string[] | undefined>;
  hideDateRange?: boolean;
  children: React.ReactNode;
}

export function ReportShell({
  eyebrow,
  title,
  description,
  csvSlug,
  searchParams,
  hideDateRange,
  children,
}: Props) {
  const sp = new URLSearchParams();
  if (typeof searchParams.from === "string") sp.set("from", searchParams.from);
  if (typeof searchParams.to === "string") sp.set("to", searchParams.to);
  const csvHref = `/app/reports/${csvSlug}/export?${sp.toString()}`;

  const refreshed = new Date().toLocaleString("en-AU", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <div className={styles.shell}>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        breadcrumbs={[{ label: "Reports", href: "/app/reports" }, { label: title }]}
      />
      <Suspense fallback={null}>
        <DatePresetBar csvHref={csvHref} hideDateRange={hideDateRange} />
      </Suspense>
      <p className={styles.refreshed}>as of {refreshed}</p>
      {children}
    </div>
  );
}
```

- [ ] Run `npx tsc --noEmit` — expect no new errors.

- [ ] Commit:

```bash
git add src/app/app/reports/_components/report-shell.tsx src/app/app/reports/_components/report-shell.module.css
git commit -m "fix(reports): add breadcrumbs to all report pages (U1), last-refreshed timestamp"
```

---

## Task 3: DatePresetBar — fix Custom button + SR labels

**Files:**
- Modify: `src/app/app/reports/_components/date-preset-bar.tsx`
- Modify: `src/app/app/reports/_components/date-preset-bar.module.css`

### date-preset-bar.module.css — add `.srOnly`

- [ ] Open `src/app/app/reports/_components/date-preset-bar.module.css`. Append at the end:

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

### date-preset-bar.tsx — fix Custom + labels

- [ ] Open `src/app/app/reports/_components/date-preset-bar.tsx`. Replace the `applyPreset` function (lines 31–59) with:

```typescript
function applyPreset(days: number) {
  const params = new URLSearchParams(sp.toString());
  if (days === -1) {
    // Custom: navigate to today→today with no preset so isCustom becomes true
    const today = fmtParam(new Date());
    params.set("from", today);
    params.set("to", today);
    params.delete("preset");
    router.push(`${pathname}?${params.toString()}`);
    return;
  }
  if (days === 365) {
    const now = new Date();
    params.set("from", `${now.getFullYear()}-01-01`);
    params.set("to", fmtParam(now));
    params.set("preset", "365");
    router.push(`${pathname}?${params.toString()}`);
    return;
  }
  if (days === 0) {
    const today = fmtParam(new Date());
    params.set("from", today);
    params.set("to", today);
    params.set("preset", "0");
  } else {
    const now = new Date();
    params.set("to", fmtParam(now));
    params.set(
      "from",
      fmtParam(new Date(now.getTime() - days * 24 * 60 * 60 * 1000))
    );
    params.set("preset", String(days));
  }
  router.push(`${pathname}?${params.toString()}`);
}
```

- [ ] In the same file, find the `customInputs` block (lines 88–103):

```tsx
{!hideDateRange && isCustom && (
  <div className={styles.customInputs}>
    <input
      type="date"
      className={styles.dateInput}
      value={currentFrom}
      onChange={(e) => applyCustomDate("from", e.target.value)}
    />
    <span style={{ color: "var(--ink-muted)", fontSize: 13 }}>→</span>
    <input
      type="date"
      className={styles.dateInput}
      value={currentTo}
      onChange={(e) => applyCustomDate("to", e.target.value)}
    />
  </div>
)}
```

Replace with:

```tsx
{!hideDateRange && isCustom && (
  <div className={styles.customInputs}>
    <label>
      <span className={styles.srOnly}>From</span>
      <input
        type="date"
        className={styles.dateInput}
        value={currentFrom}
        onChange={(e) => applyCustomDate("from", e.target.value)}
      />
    </label>
    <span aria-hidden="true" style={{ color: "var(--ink-muted)", fontSize: 13 }}>→</span>
    <label>
      <span className={styles.srOnly}>To</span>
      <input
        type="date"
        className={styles.dateInput}
        value={currentTo}
        onChange={(e) => applyCustomDate("to", e.target.value)}
      />
    </label>
  </div>
)}
```

- [ ] Run `npx tsc --noEmit` — expect no new errors.

- [ ] Commit:

```bash
git add src/app/app/reports/_components/date-preset-bar.tsx src/app/app/reports/_components/date-preset-bar.module.css
git commit -m "fix(reports): Custom date button now reveals inputs (Bug 2), add SR labels to date inputs (A2)"
```

---

## Task 4: Hub page — add PageHeader heading

**Files:**
- Modify: `src/app/app/reports/page.tsx`

- [ ] Open `src/app/app/reports/page.tsx`. Add `PageHeader` to the imports at the top of the file (it's at `@/app/app/_ui/page-header`):

```tsx
import PageHeader from "@/app/app/_ui/page-header";
```

- [ ] Find the JSX return (line ~174). The current opening is:

```tsx
return (
  <div className={styles.page}>
    <p className={styles.pageDesc}>
      Live data across inventory, purchasing, and system health.
    </p>
```

Replace with:

```tsx
return (
  <div className={styles.page}>
    <PageHeader
      eyebrow="Operations"
      title="Reports"
      description="Live data across inventory, purchasing, and system health."
    />
```

- [ ] Run `npx tsc --noEmit` — expect no new errors.

- [ ] Commit:

```bash
git add src/app/app/reports/page.tsx
git commit -m "fix(reports): add PageHeader h1 to hub page (Bug 1)"
```

---

## Task 5: Create SortableReportTable

**Files:**
- Create: `src/app/app/reports/_components/sortable-report-table.tsx`
- Create: `src/app/app/reports/_components/sortable-report-table.module.css`

### sortable-report-table.module.css

- [ ] Create `src/app/app/reports/_components/sortable-report-table.module.css`:

```css
.wrapper {
  composes: wrapper from "./report-table.module.css";
}

.empty {
  composes: empty from "./report-table.module.css";
}

.table {
  composes: table from "../../_ui/table.module.css";
}

.table th {
  white-space: nowrap;
}

.table th.right,
.table td.right {
  text-align: right;
}

.sortBtn {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-align: inherit;
  white-space: nowrap;
  display: block;
  width: 100%;
}

.sortBtnActive {
  color: var(--brand-1);
}

@media print {
  .wrapper {
    border: none;
    border-radius: 0;
    overflow: visible;
  }
}
```

### sortable-report-table.tsx

- [ ] Create `src/app/app/reports/_components/sortable-report-table.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { TableColumn } from "./report-table";
import styles from "./sortable-report-table.module.css";

interface Props<T extends Record<string, unknown>> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  defaultSortKey?: string;
  emptyMessage?: string;
}

export function SortableReportTable<T extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  defaultSortKey = "",
  emptyMessage = "No data for this period.",
}: Props<T>) {
  const [sortKey, setSortKey] = useState<string>(defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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

  if (rows.length === 0) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.empty}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={c.align === "right" ? styles.right : ""}
                aria-sort={
                  sortKey === c.key
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <button
                  type="button"
                  className={`${styles.sortBtn} ${sortKey === c.key ? styles.sortBtnActive : ""}`}
                  onClick={() => handleSort(c.key)}
                >
                  {c.header}
                  {sortKey === c.key && (
                    <span aria-hidden="true">{sortDir === "asc" ? " ↑" : " ↓"}</span>
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} className={c.align === "right" ? styles.right : ""}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] Run `npx tsc --noEmit` — expect no errors.

- [ ] Commit:

```bash
git add src/app/app/reports/_components/sortable-report-table.tsx src/app/app/reports/_components/sortable-report-table.module.css
git commit -m "feat(reports): add SortableReportTable client component with column sorting"
```

---

## Task 6: Create IdleThresholdControl

**Files:**
- Create: `src/app/app/reports/dead-stock/idle-threshold-control.tsx`
- Create: `src/app/app/reports/dead-stock/idle-threshold-control.module.css`

### idle-threshold-control.module.css

- [ ] Create `src/app/app/reports/dead-stock/idle-threshold-control.module.css`:

```css
.control {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.label {
  font-size: var(--fs-sm);
  color: var(--ink-muted);
}

.btn {
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-sm);
  padding: 5px 10px;
  background: var(--surface-1);
  color: var(--ink-muted);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.btn:hover {
  border-color: var(--brand-1);
  color: var(--ink-strong);
}

.active {
  border-color: var(--brand-1);
  background: var(--brand-dim);
  color: var(--brand-1);
  font-weight: 600;
}
```

### idle-threshold-control.tsx

- [ ] Create `src/app/app/reports/dead-stock/idle-threshold-control.tsx`:

```tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import styles from "./idle-threshold-control.module.css";

const OPTIONS = [30, 60, 90, 180] as const;

interface Props {
  current: number;
}

export function IdleThresholdControl({ current }: Props) {
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

- [ ] Run `npx tsc --noEmit` — expect no errors.

- [ ] Commit:

```bash
git add src/app/app/reports/dead-stock/idle-threshold-control.tsx src/app/app/reports/dead-stock/idle-threshold-control.module.css
git commit -m "feat(reports): add IdleThresholdControl for dead-stock page (U2)"
```

---

## Task 7: Stock on hand page

**Files:**
- Modify: `src/app/app/reports/stock-on-hand/page.tsx`

Changes: hide date bar (Bug 3), add `componentId` to `Row` for component link (U6), switch to `SortableReportTable`.

- [ ] Open `src/app/app/reports/stock-on-hand/page.tsx`. Add `Link` and `SortableReportTable` imports. Change the import block at the top to:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { SortableReportTable } from "../_components/sortable-report-table";
import { Badge } from "../_components/report-table";
import type { TableColumn } from "../_components/report-table";
import styles from "./stock-on-hand.module.css";
```

- [ ] Add `componentId` to the `Row` interface and make it extend `Record<string, unknown>`:

```typescript
interface Row extends Record<string, unknown> {
  id: string;
  componentId: string;
  name: string;
  sku: string | null;
  location: string;
  on_hand: number;
  reserved: number;
  in_prod: number;
  value: number;
  reorder_point: number | null;
}
```

- [ ] In the `rows` mapping (inside `.map((r) => {`), add `componentId: r.component_id` to the returned object:

```typescript
const rows: Row[] = balances.map((r) => {
  const c = r.component;
  const loc = r.location;
  return {
    id: `${r.component_id}-${r.location_id}`,
    componentId: r.component_id,
    name: c?.name ?? "—",
    sku: c?.sku ?? null,
    location: loc?.name ?? "—",
    on_hand: r.on_hand,
    reserved: r.reserved ?? 0,
    in_prod: r.in_prod ?? 0,
    value: r.on_hand * (c?.cost_per_unit ?? 0),
    reorder_point: c?.reorder_point ?? null,
  };
});
```

- [ ] Update the `columns` — change the `name` column render to use a `<Link>`:

```typescript
{ key: "name", header: "Component", render: (r) => (
  <Link href={`/app/components/${r.componentId}`} className={styles.reportLink}>{r.name}</Link>
)},
```

- [ ] Add a `styles.reportLink` CSS class. Create `src/app/app/reports/stock-on-hand/stock-on-hand.module.css` if it doesn't exist, or append to it:

```css
.reportLink {
  color: var(--brand-1);
  text-decoration: none;
}
.reportLink:hover {
  text-decoration: underline;
}
```

- [ ] In the `return`, switch from `<ReportTable>` to `<SortableReportTable>` and add `hideDateRange`:

```tsx
return (
  <ReportShell
    eyebrow="Inventory"
    title="Stock on hand"
    description="Current on-hand quantities and values across all locations."
    csvSlug="stock-on-hand"
    searchParams={sp}
    hideDateRange={true}
  >
    <ReportStatCards
      cards={[
        { label: "Components in stock", value: rows.length },
        { label: "Total value", value: fmtCurrency(totalValue) },
        { label: "Below reorder point", value: belowReorder, variant: belowReorder > 0 ? "amber" : "default" },
      ]}
    />
    <SortableReportTable columns={columns} rows={rows} rowKey={(r) => r.id} />
  </ReportShell>
);
```

- [ ] Run `npx tsc --noEmit` — expect no errors.

- [ ] Commit:

```bash
git add src/app/app/reports/stock-on-hand/
git commit -m "fix(reports): hide decorative date bar on stock-on-hand (Bug 3), add component links + sorting"
```

---

## Task 8: Valuation page

**Files:**
- Modify: `src/app/app/reports/valuation/page.tsx`

Changes: hide date bar (Bug 4), component link via `id` (U6), switch to `SortableReportTable`.

- [ ] Open `src/app/app/reports/valuation/page.tsx`. Update imports:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { SortableReportTable } from "../_components/sortable-report-table";
import type { TableColumn } from "../_components/report-table";
import styles from "./valuation.module.css";
```

- [ ] Add `extends Record<string, unknown>` to `Row`:

```typescript
interface Row extends Record<string, unknown> {
  id: string; name: string; sku: string | null;
  on_hand: number; in_prod: number; reserved: number;
  cost: number; value: number; pct: number;
}
```

- [ ] Update the `name` column in `columns` to link (note: `r.id` in valuation IS the `component_id`):

```typescript
{ key: "name", header: "Component", render: (r) => (
  <Link href={`/app/components/${r.id}`} className={styles.reportLink}>{r.name}</Link>
)},
```

- [ ] Create or append to `src/app/app/reports/valuation/valuation.module.css`:

```css
.reportLink {
  color: var(--brand-1);
  text-decoration: none;
}
.reportLink:hover {
  text-decoration: underline;
}
```

- [ ] In the `return`, add `hideDateRange={true}` and switch to `<SortableReportTable>`:

```tsx
return (
  <ReportShell
    eyebrow="Inventory"
    title="Inventory valuation"
    description="On-hand stock value broken down by component."
    csvSlug="valuation"
    searchParams={sp}
    hideDateRange={true}
  >
    <ReportStatCards
      cards={[
        { label: "On-hand value", value: fmtCurrency(totalOnHandValue) },
        { label: "In-production value", value: fmtCurrency(totalInProdValue) },
        { label: "Reserved value", value: fmtCurrency(totalReservedValue) },
      ]}
    />
    <SortableReportTable columns={columns} rows={rows} rowKey={(r) => r.id} />
  </ReportShell>
);
```

- [ ] Run `npx tsc --noEmit` — expect no errors.

- [ ] Commit:

```bash
git add src/app/app/reports/valuation/
git commit -m "fix(reports): hide decorative date bar on valuation (Bug 4), add component links + sorting"
```

---

## Task 9: Movements page

**Files:**
- Modify: `src/app/app/reports/movements/page.tsx`

Changes: remove "Reference" column (Bug 6), add `componentId` to `Row` for link (U6), switch to `SortableReportTable`.

- [ ] Open `src/app/app/reports/movements/page.tsx`. Update imports:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../_lib/date-range";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { ReportChart } from "../_components/report-chart";
import { SortableReportTable, } from "../_components/sortable-report-table";
import { Badge } from "../_components/report-table";
import type { TableColumn, BadgeVariant } from "../_components/report-table";
import styles from "./movements.module.css";
```

- [ ] Update `Row` interface — remove `reference`, add `componentId`, add `extends Record<string, unknown>`:

```typescript
interface Row extends Record<string, unknown> {
  id: string;
  date: string;
  componentId: string | null;
  component: string;
  type: string;
  qty: number;
}
```

- [ ] Update `MovementRaw` to include `id` on the nested component:

```typescript
type MovementRaw = {
  id: string;
  created_at: string;
  delta_on_hand: number;
  reason: string | null;
  reference_type: string | null;
  component: { id: string; name: string } | null;
};
```

- [ ] Update the Supabase select to fetch `id` from the component join:

```typescript
const { data } = await supabase
  .from("inventory_movement")
  .select("id,created_at,delta_on_hand,reason,reference_type,component:component_id(id,name)")
  .eq("tenant_id", tenantId)
  .gte("created_at", range.from.toISOString())
  .lte("created_at", range.to.toISOString())
  .order("created_at", { ascending: false });
```

- [ ] Update the `rows` mapping — remove `reference`, add `componentId`:

```typescript
const rows: Row[] = movements.map((m) => ({
  id: m.id,
  date: new Date(m.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
  componentId: m.component?.id ?? null,
  component: m.component?.name ?? "—",
  type: m.reason ?? m.reference_type ?? "adjustment",
  qty: m.delta_on_hand,
}));
```

- [ ] Replace the `columns` definition — remove the `ref` column, update `component` to use a link:

```typescript
const columns: TableColumn<Row>[] = [
  { key: "date", header: "Date", render: (r) => <span style={{ color: "var(--ink-muted)" }}>{r.date}</span> },
  {
    key: "component", header: "Component",
    render: (r) => r.componentId
      ? <Link href={`/app/components/${r.componentId}`} className={styles.reportLink}>{r.component}</Link>
      : <span>{r.component}</span>,
  },
  { key: "type", header: "Type", render: (r) => <Badge variant={TYPE_VARIANT[r.type] ?? "gray"}>{r.type}</Badge> },
  {
    key: "qty", header: "Qty", align: "right",
    render: (r) => (
      <span style={{ color: r.qty > 0 ? "var(--ok)" : r.qty < 0 ? "var(--danger)" : "var(--ink-muted)", fontWeight: 600 }}>
        {r.qty > 0 ? `+${r.qty}` : r.qty}
      </span>
    ),
  },
];
```

- [ ] Create or append to `src/app/app/reports/movements/movements.module.css`:

```css
.reportLink {
  color: var(--brand-1);
  text-decoration: none;
}
.reportLink:hover {
  text-decoration: underline;
}
```

- [ ] In the `return`, switch `<ReportTable>` to `<SortableReportTable>`:

```tsx
<SortableReportTable columns={columns} rows={rows} rowKey={(r) => r.id} />
```

- [ ] Run `npx tsc --noEmit` — expect no errors.

- [ ] Commit:

```bash
git add src/app/app/reports/movements/
git commit -m "fix(reports): remove duplicate Reference column (Bug 6), add component links + sorting"
```

---

## Task 10: PO summary page

**Files:**
- Modify: `src/app/app/reports/po-summary/page.tsx`

Changes: link PO # to detail page (Bug 5 + U6), switch to `SortableReportTable`.

- [ ] Open `src/app/app/reports/po-summary/page.tsx`. Update imports:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../_lib/date-range";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { SortableReportTable } from "../_components/sortable-report-table";
import { Badge } from "../_components/report-table";
import type { TableColumn, BadgeVariant } from "../_components/report-table";
import styles from "./po-summary.module.css";
```

- [ ] Add `extends Record<string, unknown>` to `Row`:

```typescript
interface Row extends Record<string, unknown> {
  id: string;
  poNumber: string;
  supplier: string;
  status: string;
  expectedDate: string | null;
  totalValue: number;
  lineCount: number;
  overdue: boolean;
}
```

- [ ] Update the `poNumber` column render to a link:

```typescript
{ key: "poNumber", header: "PO #", render: (r) => (
  <Link href={`/app/purchasing/${r.id}`} className={styles.reportLink}>
    PO-{r.poNumber}
  </Link>
)},
```

- [ ] Create or append to `src/app/app/reports/po-summary/po-summary.module.css`:

```css
.reportLink {
  color: var(--brand-1);
  text-decoration: none;
  font-weight: 700;
}
.reportLink:hover {
  text-decoration: underline;
}
```

- [ ] In the `return`, switch to `<SortableReportTable>`:

```tsx
<SortableReportTable columns={columns} rows={rows} rowKey={(r) => r.id} />
```

- [ ] Run `npx tsc --noEmit` — expect no errors.

- [ ] Commit:

```bash
git add src/app/app/reports/po-summary/
git commit -m "fix(reports): link PO # to detail page (Bug 5), add sorting"
```

---

## Task 11: PO variance page

**Files:**
- Modify: `src/app/app/reports/po-variance/page.tsx`

Changes: add `poId` to row for PO link (U6), switch to `SortableReportTable`.

- [ ] Open `src/app/app/reports/po-variance/page.tsx`. Update imports:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../_lib/date-range";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { SortableReportTable } from "../_components/sortable-report-table";
import type { TableColumn } from "../_components/report-table";
import styles from "./po-variance.module.css";
```

- [ ] Add `poId` to `VarianceRow` (it already extends `Record<string, unknown>`):

```typescript
interface VarianceRow extends Record<string, unknown> {
  id: string;
  poId: string | null;
  poNumber: string;
  supplier: string;
  component: string;
  ordered: number;
  received: number;
  variance: number;
  variancePct: number;
}
```

- [ ] Update the row mapping — add `poId: poObj?.id ?? null`:

```typescript
return {
  id: l.id,
  poId: poObj?.id ?? null,
  poNumber,
  supplier,
  component,
  ordered,
  received,
  variance,
  variancePct,
};
```

- [ ] Update the `poNumber` column render:

```typescript
{ key: "poNumber", header: "PO #", render: (r) => r.poId
  ? <Link href={`/app/purchasing/${r.poId}`} className={styles.reportLink}>PO-{r.poNumber}</Link>
  : <span>PO-{r.poNumber}</span>
},
```

- [ ] Create or append to `src/app/app/reports/po-variance/po-variance.module.css`:

```css
.reportLink {
  color: var(--brand-1);
  text-decoration: none;
  font-weight: 700;
}
.reportLink:hover {
  text-decoration: underline;
}
```

- [ ] Switch to `<SortableReportTable>` in the return:

```tsx
<SortableReportTable columns={columns} rows={rows} rowKey={(r) => r.id} />
```

- [ ] Run `npx tsc --noEmit` — expect no errors.

- [ ] Commit:

```bash
git add src/app/app/reports/po-variance/
git commit -m "fix(reports): link PO # to detail page in variance report (U6), add sorting"
```

---

## Task 12: Spend by supplier page

**Files:**
- Modify: `src/app/app/reports/spend-by-supplier/page.tsx`

Changes: supplier name links to `/app/suppliers/{supplierId}` (U6), switch to `SortableReportTable`.

- [ ] Open `src/app/app/reports/spend-by-supplier/page.tsx`. Update imports:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../_lib/date-range";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { SortableReportTable } from "../_components/sortable-report-table";
import type { TableColumn } from "../_components/report-table";
import { ReportChart } from "../_components/report-chart";
import styles from "./spend-by-supplier.module.css";
```

- [ ] Add `extends Record<string, unknown>` to `SupplierRow`:

```typescript
interface SupplierRow extends Record<string, unknown> {
  supplierId: string;
  supplier: string;
  poCount: number;
  totalSpend: number;
  pctOfTotal: number;
  avgPoValue: number;
}
```

- [ ] Update the `supplier` column render:

```typescript
{ key: "supplier", header: "Supplier", render: (r) => (
  <Link href={`/app/suppliers/${r.supplierId}`} className={styles.reportLink}>{r.supplier}</Link>
)},
```

- [ ] Create or append to `src/app/app/reports/spend-by-supplier/spend-by-supplier.module.css`:

```css
.reportLink {
  color: var(--brand-1);
  text-decoration: none;
}
.reportLink:hover {
  text-decoration: underline;
}
```

- [ ] Switch `<ReportTable>` to `<SortableReportTable>` in the return:

```tsx
<SortableReportTable
  columns={columns}
  rows={rows}
  rowKey={(r) => r.supplierId}
/>
```

- [ ] Run `npx tsc --noEmit` — expect no errors.

- [ ] Commit:

```bash
git add src/app/app/reports/spend-by-supplier/
git commit -m "fix(reports): link supplier names to detail pages (U6), add sorting"
```

---

## Task 13: Lead-time accuracy page

**Files:**
- Modify: `src/app/app/reports/lead-time-accuracy/page.tsx`

Changes: add `supplier_id` to query, rekey grouping map, supplier link (U6), switch to `SortableReportTable`.

- [ ] Open `src/app/app/reports/lead-time-accuracy/page.tsx`. Update imports:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../_lib/date-range";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { SortableReportTable } from "../_components/sortable-report-table";
import type { TableColumn } from "../_components/report-table";
import styles from "./lead-time-accuracy.module.css";
```

- [ ] Update `ReceiptRow` type to include `supplier_id`:

```typescript
type ReceiptRow = {
  id: string;
  received_at: string;
  purchase_order: {
    expected_date?: string | null;
    supplier_id?: string | null;
    supplier?: { name: string } | null;
  } | null;
};
```

- [ ] Update `SupplierAccuracy` to include `supplierId` (it already extends `Record<string, unknown>`):

```typescript
interface SupplierAccuracy extends Record<string, unknown> {
  supplierId: string;
  supplier: string;
  received: number;
  onTime: number;
  late: number;
  accuracy: number;
  avgDaysLate: number;
}
```

- [ ] Update the Supabase query to include `supplier_id` in the `purchase_order` nested select:

```typescript
const { data: receipts } = await supabase
  .from("delivery_receipt")
  .select(`
    id,
    received_at,
    purchase_order:purchase_order_id(
      expected_date,
      supplier_id,
      supplier:supplier_id(name)
    )
  `)
  .eq("tenant_id", tenantId)
  .not("purchase_order_id", "is", null)
  .gte("received_at", range.from.toISOString())
  .lte("received_at", range.to.toISOString());
```

- [ ] Replace the `supplierMap` grouping — key by `supplier_id` instead of supplier name:

```typescript
const supplierMap = new Map<
  string,
  { name: string; received: number; onTime: number; late: number; lateDaysTotal: number }
>();

for (const receipt of receiptData) {
  const supplierId = receipt.purchase_order?.supplier_id ?? "unknown";
  const supplierName = receipt.purchase_order?.supplier?.name ?? "Unknown";
  if (!supplierMap.has(supplierId)) {
    supplierMap.set(supplierId, { name: supplierName, received: 0, onTime: 0, late: 0, lateDaysTotal: 0 });
  }
  const entry = supplierMap.get(supplierId)!;
  entry.received += 1;

  const expectedDate = receipt.purchase_order?.expected_date;
  if (!expectedDate) {
    entry.onTime += 1;
  } else {
    const receivedAt = new Date(receipt.received_at);
    const expected = new Date(expectedDate);
    if (receivedAt <= expected) {
      entry.onTime += 1;
    } else {
      entry.late += 1;
      const daysLate = (receivedAt.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24);
      entry.lateDaysTotal += daysLate;
    }
  }
}
```

- [ ] Update the `rows` mapping to include `supplierId`:

```typescript
const rows: SupplierAccuracy[] = Array.from(supplierMap.entries())
  .map(([supplierId, entry]) => ({
    supplierId,
    supplier: entry.name,
    received: entry.received,
    onTime: entry.onTime,
    late: entry.late,
    accuracy: Math.round((entry.onTime / entry.received) * 100),
    avgDaysLate: entry.late > 0 ? entry.lateDaysTotal / entry.late : 0,
  }))
  .sort((a, b) => a.accuracy - b.accuracy);
```

- [ ] Update the `supplier` column render:

```typescript
{ key: "supplier", header: "Supplier", render: (r) => (
  <Link href={`/app/suppliers/${r.supplierId}`} className={styles.reportLink}>{r.supplier}</Link>
)},
```

- [ ] Change `rowKey` from `(r) => r.supplier` to `(r) => r.supplierId`.

- [ ] Create or append to `src/app/app/reports/lead-time-accuracy/lead-time-accuracy.module.css`:

```css
.reportLink {
  color: var(--brand-1);
  text-decoration: none;
}
.reportLink:hover {
  text-decoration: underline;
}
```

- [ ] Switch to `<SortableReportTable>` in the return:

```tsx
<SortableReportTable
  columns={columns}
  rows={rows}
  rowKey={(r) => r.supplierId}
/>
```

- [ ] Run `npx tsc --noEmit` — expect no errors.

- [ ] Commit:

```bash
git add src/app/app/reports/lead-time-accuracy/
git commit -m "fix(reports): link supplier names to detail pages, rekey grouping by ID (U6), add sorting"
```

---

## Task 14: Dead stock page

**Files:**
- Modify: `src/app/app/reports/dead-stock/page.tsx`

Changes: add `IdleThresholdControl` (U2), component link (U6), switch to `SortableReportTable`.

- [ ] Open `src/app/app/reports/dead-stock/page.tsx`. Update imports:

```tsx
import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { SortableReportTable } from "../_components/sortable-report-table";
import type { TableColumn } from "../_components/report-table";
import { IdleThresholdControl } from "./idle-threshold-control";
import styles from "./dead-stock.module.css";
```

- [ ] Add `extends Record<string, unknown>` to `Row`:

```typescript
interface Row extends Record<string, unknown> {
  id: string;
  name: string;
  sku: string | null;
  on_hand: number;
  value: number;
  daysIdle: number;
}
```

- [ ] Update the `name` column render (note: `r.id` in dead-stock IS the `component_id`):

```typescript
{ key: "name", header: "Component", render: (r) => (
  <Link href={`/app/components/${r.id}`} className={styles.reportLink}>{r.name}</Link>
)},
```

- [ ] Create or append to `src/app/app/reports/dead-stock/dead-stock.module.css`:

```css
.reportLink {
  color: var(--brand-1);
  text-decoration: none;
}
.reportLink:hover {
  text-decoration: underline;
}
```

- [ ] In the `return`, add `<IdleThresholdControl>` and switch to `<SortableReportTable>`:

```tsx
return (
  <ReportShell
    eyebrow="Inventory"
    title="Dead stock"
    description={`Components with on-hand stock and no movement in the last ${idleThreshold} days.`}
    csvSlug="dead-stock"
    searchParams={sp}
  >
    <ReportStatCards
      cards={[
        { label: "Dead components", value: rows.length, variant: rows.length > 0 ? "amber" : "default" },
        { label: "Capital tied up", value: fmtCurrency(totalCapital), variant: rows.length > 0 ? "amber" : "default" },
        { label: "Longest idle", value: longestIdle === 999 ? "—" : `${longestIdle}d` },
      ]}
    />
    <Suspense fallback={null}>
      <IdleThresholdControl current={idleThreshold} />
    </Suspense>
    <SortableReportTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      emptyMessage={`No components idle for ${idleThreshold}+ days.`}
    />
  </ReportShell>
);
```

- [ ] Run `npx tsc --noEmit` — expect no errors.

- [ ] Commit:

```bash
git add src/app/app/reports/dead-stock/
git commit -m "feat(reports): idle threshold control on dead-stock (U2), component links + sorting"
```

---

## Final verification

- [ ] Run `npx tsc --noEmit` — expect no errors across the whole project.

- [ ] Run `npm test` — expect the same 16 pre-existing failures (allocation engine + inventory invariants), no new failures.

- [ ] Verify in the browser (run `npm run dev`):
  - Hub page at `/app/reports` shows a heading "Reports"
  - Any individual report (e.g. `/app/reports/movements`) shows "← Reports / Movements ledger" breadcrumb
  - Each report shows "as of [date time]" note
  - Clicking "Custom" on the date bar reveals date inputs
  - Stock on hand and Valuation pages have no date bar
  - Movements page has no "Reference" column
  - All report tables have clickable column headers with ↑/↓ sort indicators
  - Component names in stock-on-hand, valuation, movements, dead-stock link to the component detail page
  - Supplier names in spend-by-supplier and lead-time-accuracy link to the supplier detail page
  - PO # in po-summary and po-variance links to `/app/purchasing/{id}`
  - Dead-stock page shows 30d / 60d / 90d / 180d threshold buttons; clicking one re-runs the report
