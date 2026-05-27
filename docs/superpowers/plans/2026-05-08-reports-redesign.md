# Reports Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current reports stub with a hub-and-spoke reports section covering 10 operational reports across inventory, purchasing, and system integrity — each with date filtering, stat cards, optional charts, and PDF/CSV export.

**Architecture:** Hub page at `/app/reports` shows live-data summary cards grouped by category; each card links to a dedicated report page. Shared components (`ReportShell`, `ReportStatCards`, `ReportTable`, `ReportChart`) live in `_components/`. Date range flows as `?from=&to=` URL params — pages are server components that read params directly. PDF export via `window.print()` + `@media print` CSS; CSV via `/app/reports/[slug]/export` route handlers.

**Tech Stack:** Next.js 15 App Router (server components + "use client" islands), Supabase PostgREST, CSS Modules with Manuva design tokens, Recharts (bar/line charts, install required)

---

## File Structure

**New files to create:**
```
src/app/app/reports/
  _lib/
    date-range.ts                    date param parsing + preset helpers
  _components/
    date-preset-bar.tsx              "use client" — preset buttons + custom inputs
    date-preset-bar.module.css
    print-button.tsx                 "use client" — calls window.print()
    report-shell.tsx                 server wrapper: PageHeader + DatePresetBar + children
    report-shell.module.css
    report-stat-cards.tsx            row of 2–3 summary stat cards
    report-stat-cards.module.css
    report-table.tsx                 sortable table with status badges
    report-table.module.css
    report-chart.tsx                 "use client" Recharts wrapper
    report-chart.module.css
  stock-on-hand/
    page.tsx
    export/route.ts
  movements/
    page.tsx
    export/route.ts
  valuation/
    page.tsx
    export/route.ts
  dead-stock/
    page.tsx
    export/route.ts
  stocktake-history/
    page.tsx
    export/route.ts
  po-summary/
    page.tsx
    export/route.ts
  spend-by-supplier/
    page.tsx
    export/route.ts
  lead-time-accuracy/
    page.tsx
    export/route.ts
  po-variance/
    page.tsx
    export/route.ts
  inventory-integrity/
    page.tsx
    export/route.ts
```

**Files to replace:**
```
src/app/app/reports/page.tsx         hub page (full replacement)
src/app/app/reports/reports.module.css  hub CSS (full replacement)
```

**Files to keep (unchanged):**
```
src/app/app/reports/export/route.ts  existing CSV export endpoint — leave alone
```

---

## Task 0: Shared Infrastructure

**Goal:** Install Recharts, create `_lib/date-range.ts`, and build all 10 shared components so every subsequent task can import them without circular dependencies.

**Files:**
- Modify: `package.json` (recharts install)
- Create: `src/app/app/reports/_lib/date-range.ts`
- Create: `src/app/app/reports/_components/date-preset-bar.tsx`
- Create: `src/app/app/reports/_components/date-preset-bar.module.css`
- Create: `src/app/app/reports/_components/print-button.tsx`
- Create: `src/app/app/reports/_components/report-shell.tsx`
- Create: `src/app/app/reports/_components/report-shell.module.css`
- Create: `src/app/app/reports/_components/report-stat-cards.tsx`
- Create: `src/app/app/reports/_components/report-stat-cards.module.css`
- Create: `src/app/app/reports/_components/report-table.tsx`
- Create: `src/app/app/reports/_components/report-table.module.css`
- Create: `src/app/app/reports/_components/report-chart.tsx`
- Create: `src/app/app/reports/_components/report-chart.module.css`

**Acceptance Criteria:**
- [ ] `npm run build` passes with no new TS errors
- [ ] `recharts` appears in `package.json` dependencies
- [ ] All shared components export their types correctly (no implicit `any`)

**Verify:** `npx tsc --noEmit` → 0 errors

**Steps:**

- [ ] **Step 1: Install recharts**

```bash
npm install recharts
```

- [ ] **Step 2: Create `_lib/date-range.ts`**

```ts
// src/app/app/reports/_lib/date-range.ts
export type DateRange = { from: Date; to: Date };

export function resolveDateRange(
  sp: { from?: string; to?: string },
  defaultDays = 30
): DateRange {
  const now = new Date();
  const to = sp.to ? new Date(sp.to) : now;
  const from = sp.from
    ? new Date(sp.from)
    : new Date(now.getTime() - defaultDays * 24 * 60 * 60 * 1000);
  return { from, to };
}

export function fmtParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fmtDisplay(d: Date): string {
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
```

- [ ] **Step 3: Create `print-button.tsx`**

```tsx
// src/app/app/reports/_components/print-button.tsx
"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        border: "1px solid var(--stroke-strong)",
        borderRadius: 6,
        padding: "6px 12px",
        background: "var(--surface-raised)",
        color: "var(--ink-strong)",
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      Print / PDF
    </button>
  );
}
```

- [ ] **Step 4: Create `date-preset-bar.module.css`**

```css
/* src/app/app/reports/_components/date-preset-bar.module.css */
.bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.preset {
  border: 1px solid var(--stroke-strong);
  border-radius: 6px;
  padding: 5px 10px;
  background: var(--surface-raised);
  color: var(--ink-muted);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.preset:hover {
  border-color: var(--brand-1);
  color: var(--ink-strong);
}

.presetActive {
  border-color: var(--brand-1);
  background: var(--brand-dim);
  color: var(--brand-1);
  font-weight: 600;
}

.exports {
  margin-left: auto;
  display: flex;
  gap: 6px;
}

.customInputs {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dateInput {
  border: 1px solid var(--stroke-strong);
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 13px;
  background: var(--surface-raised);
  color: var(--ink-strong);
}

@media print {
  .bar {
    display: none !important;
  }
}
```

- [ ] **Step 5: Create `date-preset-bar.tsx`**

```tsx
// src/app/app/reports/_components/date-preset-bar.tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { fmtParam } from "../_lib/date-range";
import styles from "./date-preset-bar.module.css";

const PRESETS = [
  { label: "Today", days: 0 },
  { label: "This week", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "This year", days: 365 },
  { label: "Custom", days: -1 },
] as const;

interface Props {
  csvHref: string;
  hideDateRange?: boolean;
}

export function DatePresetBar({ csvHref, hideDateRange }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const currentFrom = sp.get("from") ?? "";
  const currentTo = sp.get("to") ?? "";
  const isCustom = !!(currentFrom || currentTo);

  function applyPreset(days: number) {
    const params = new URLSearchParams(sp.toString());
    if (days === -1) {
      // custom — keep existing or set defaults
      return;
    }
    if (days === 0) {
      const today = fmtParam(new Date());
      params.set("from", today);
      params.set("to", today);
    } else {
      const now = new Date();
      params.set("to", fmtParam(now));
      params.set(
        "from",
        fmtParam(new Date(now.getTime() - days * 24 * 60 * 60 * 1000))
      );
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function applyCustomDate(key: "from" | "to", value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className={styles.bar}>
      {!hideDateRange &&
        PRESETS.map((p) => {
          const active =
            p.days === -1
              ? isCustom
              : !isCustom && !currentFrom && p.days === 30;
          return (
            <button
              key={p.label}
              type="button"
              className={`${styles.preset} ${active ? styles.presetActive : ""}`}
              onClick={() => applyPreset(p.days)}
            >
              {p.label}
            </button>
          );
        })}
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
      <div className={styles.exports}>
        <a
          href={csvHref}
          download
          style={{
            border: "1px solid var(--stroke-strong)",
            borderRadius: 6,
            padding: "5px 10px",
            background: "var(--surface-raised)",
            color: "var(--ink-strong)",
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          Export CSV
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            border: "1px solid var(--stroke-strong)",
            borderRadius: 6,
            padding: "5px 10px",
            background: "var(--surface-raised)",
            color: "var(--ink-strong)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Print / PDF
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `report-shell.module.css`**

```css
/* src/app/app/reports/_components/report-shell.module.css */
.shell {
  padding: 32px 40px;
  max-width: 1200px;
}

@media print {
  .shell {
    padding: 0;
    max-width: none;
  }
  :global(aside) {
    display: none !important;
  }
}
```

- [ ] **Step 7: Create `report-shell.tsx`**

```tsx
// src/app/app/reports/_components/report-shell.tsx
import { Suspense } from "react";
import { PageHeader } from "@/app/app/_ui/page-header";
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

  return (
    <div className={styles.shell}>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <Suspense fallback={null}>
        <DatePresetBar csvHref={csvHref} hideDateRange={hideDateRange} />
      </Suspense>
      {children}
    </div>
  );
}
```

- [ ] **Step 8: Create `report-stat-cards.module.css`**

```css
/* src/app/app/reports/_components/report-stat-cards.module.css */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.card {
  border: 1px solid var(--stroke-strong);
  border-radius: 10px;
  padding: 16px;
  background: var(--bg-card);
}

.cardAmber {
  border-color: #fcd34d;
  background: #fffbeb;
}

.cardRed {
  border-color: #fca5a5;
  background: #fff5f5;
}

.cardGreen {
  border-color: #86efac;
  background: #f0fdf4;
}

.label {
  font-size: 12px;
  color: var(--ink-muted);
  margin-bottom: 4px;
}

.labelAmber {
  color: #92400e;
}

.labelRed {
  color: #991b1b;
}

.labelGreen {
  color: #166534;
}

.value {
  font-size: 24px;
  font-weight: 700;
  color: var(--ink-strong);
  line-height: 1.1;
}

.valueAmber {
  color: #d97706;
}

.valueRed {
  color: #dc2626;
}

.valueGreen {
  color: #16a34a;
}

.sub {
  font-size: 12px;
  color: var(--ink-muted);
  margin-top: 2px;
}

@media print {
  .grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

- [ ] **Step 9: Create `report-stat-cards.tsx`**

```tsx
// src/app/app/reports/_components/report-stat-cards.tsx
import styles from "./report-stat-cards.module.css";

export type CardVariant = "default" | "amber" | "red" | "green";

export interface StatCard {
  label: string;
  value: string | number;
  sub?: string;
  variant?: CardVariant;
}

interface Props {
  cards: StatCard[];
}

export function ReportStatCards({ cards }: Props) {
  return (
    <div className={styles.grid}>
      {cards.map((c, i) => {
        const v = c.variant ?? "default";
        const cardCls = [
          styles.card,
          v === "amber" ? styles.cardAmber : "",
          v === "red" ? styles.cardRed : "",
          v === "green" ? styles.cardGreen : "",
        ]
          .filter(Boolean)
          .join(" ");
        const labelCls = [
          styles.label,
          v === "amber" ? styles.labelAmber : "",
          v === "red" ? styles.labelRed : "",
          v === "green" ? styles.labelGreen : "",
        ]
          .filter(Boolean)
          .join(" ");
        const valueCls = [
          styles.value,
          v === "amber" ? styles.valueAmber : "",
          v === "red" ? styles.valueRed : "",
          v === "green" ? styles.valueGreen : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div key={i} className={cardCls}>
            <div className={labelCls}>{c.label}</div>
            <div className={valueCls}>{c.value}</div>
            {c.sub && <div className={styles.sub}>{c.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 10: Create `report-table.module.css`**

```css
/* src/app/app/reports/_components/report-table.module.css */
.wrapper {
  overflow-x: auto;
  border: 1px solid var(--stroke-strong);
  border-radius: 10px;
  background: var(--bg-card);
  margin-bottom: 24px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.table th {
  text-align: left;
  padding: 10px 14px;
  color: var(--ink-muted);
  font-weight: 600;
  font-size: 12px;
  border-bottom: 1px solid var(--stroke-strong);
  white-space: nowrap;
}

.table th.right {
  text-align: right;
}

.table td {
  padding: 10px 14px;
  color: var(--ink-strong);
  border-bottom: 1px solid var(--stroke-strong);
}

.table td.right {
  text-align: right;
}

.table tr:last-child td {
  border-bottom: none;
}

.table tr:hover td {
  background: var(--surface-raised);
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.badgeGreen { background: #dcfce7; color: #166534; }
.badgeBlue  { background: #dbeafe; color: #1e40af; }
.badgeAmber { background: #fef3c7; color: #92400e; }
.badgeRed   { background: #fee2e2; color: #991b1b; }
.badgeGray  { background: var(--surface-raised); color: var(--ink-muted); }

.empty {
  padding: 40px;
  text-align: center;
  color: var(--ink-muted);
  font-size: 13px;
}

@media print {
  .wrapper {
    border: none;
    border-radius: 0;
    overflow: visible;
  }
}
```

- [ ] **Step 11: Create `report-table.tsx`**

```tsx
// src/app/app/reports/_components/report-table.tsx
import styles from "./report-table.module.css";

export type BadgeVariant = "green" | "blue" | "amber" | "red" | "gray";

export interface TableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: T) => React.ReactNode;
}

interface Props<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}

export function ReportTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No data for this period.",
}: Props<T>) {
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
              <th key={c.key} className={c.align === "right" ? styles.right : ""}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
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

export function Badge({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: BadgeVariant;
}) {
  const cls = {
    green: styles.badgeGreen,
    blue: styles.badgeBlue,
    amber: styles.badgeAmber,
    red: styles.badgeRed,
    gray: styles.badgeGray,
  }[variant];
  return <span className={`${styles.badge} ${cls}`}>{children}</span>;
}
```

- [ ] **Step 12: Create `report-chart.module.css`**

```css
/* src/app/app/reports/_components/report-chart.module.css */
.wrapper {
  border: 1px solid var(--stroke-strong);
  border-radius: 10px;
  padding: 16px;
  background: var(--bg-card);
  margin-bottom: 24px;
}

.title {
  font-size: 12px;
  color: var(--ink-muted);
  margin-bottom: 12px;
  font-weight: 600;
}

@media print {
  .wrapper {
    break-inside: avoid;
  }
}
```

- [ ] **Step 13: Create `report-chart.tsx`**

```tsx
// src/app/app/reports/_components/report-chart.tsx
"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import styles from "./report-chart.module.css";

export interface BarSeries {
  dataKey: string;
  color: string;
  name?: string;
}

interface BarProps {
  type: "bar";
  data: Record<string, unknown>[];
  series: BarSeries[];
  xKey: string;
  title: string;
  layout?: "horizontal" | "vertical";
}

interface LineProps {
  type: "line";
  data: Record<string, unknown>[];
  series: BarSeries[];
  xKey: string;
  title: string;
}

type Props = BarProps | LineProps;

export function ReportChart(props: Props) {
  return (
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
            <XAxis dataKey={props.xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={48} />
            <Tooltip />
            {props.series.length > 1 && <Legend />}
            {props.series.map((s) => (
              <Bar key={s.dataKey} dataKey={s.dataKey} fill={s.color} name={s.name ?? s.dataKey} radius={[2, 2, 0, 0]} />
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
  );
}
```

- [ ] **Step 14: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors related to the new files.

- [ ] **Step 15: Commit**

```bash
git add src/app/app/reports/_lib src/app/app/reports/_components package.json package-lock.json
git commit -m "feat(reports): shared infrastructure — date-range, ReportShell, ReportStatCards, ReportTable, ReportChart"
```

---

## Task 1: Hub Page

**Goal:** Replace the current `/app/reports` page with a live-data hub showing 10 report cards grouped by category, with amber/red highlight for issues.

**Files:**
- Replace: `src/app/app/reports/page.tsx`
- Replace: `src/app/app/reports/reports.module.css`

**Acceptance Criteria:**
- [ ] Hub renders with all 10 report cards grouped into Inventory, Purchasing, System
- [ ] Dead stock card is amber when count > 0
- [ ] Lead time accuracy card is red when on-time % < 80
- [ ] PO overdue count card is red when > 0
- [ ] Inventory integrity card is red when issues > 0
- [ ] All cards link to correct sub-routes
- [ ] TypeScript builds clean

**Verify:** `npx tsc --noEmit` → 0 errors; navigate to `/app/reports` in dev server — all cards visible

**Steps:**

- [ ] **Step 1: Create new `reports.module.css`**

```css
/* src/app/app/reports/reports.module.css */
.page {
  padding: 32px 40px;
  max-width: 1200px;
}

.pageTitle {
  font-size: 26px;
  font-weight: 700;
  color: var(--ink-strong);
  margin-bottom: 4px;
}

.pageDesc {
  font-size: 14px;
  color: var(--ink-muted);
  margin-bottom: 32px;
}

.section {
  margin-bottom: 32px;
}

.sectionLabel {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 3px 10px;
  border-radius: 5px;
  margin-bottom: 12px;
}

.sectionLabelInventory {
  background: #dbeafe;
  color: #1d4ed8;
}

.sectionLabelPurchasing {
  background: #ede9fe;
  color: #6d28d9;
}

.sectionLabelSystem {
  background: var(--surface-raised);
  color: var(--ink-muted);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.card {
  border: 1px solid var(--stroke-strong);
  border-radius: 12px;
  padding: 16px;
  background: var(--bg-card);
  cursor: pointer;
  text-decoration: none;
  display: block;
  transition: border-color 0.15s;
}

.card:hover {
  border-color: var(--brand-1);
}

.cardAmber {
  border-color: #fcd34d;
  background: #fffbeb;
}

.cardAmber:hover {
  border-color: #f59e0b;
}

.cardRed {
  border-color: #fca5a5;
  background: #fff5f5;
}

.cardRed:hover {
  border-color: #ef4444;
}

.cardName {
  font-size: 12px;
  color: var(--ink-muted);
  margin-bottom: 4px;
}

.cardNameAmber { color: #92400e; }
.cardNameRed   { color: #991b1b; }

.cardValue {
  font-size: 26px;
  font-weight: 700;
  color: var(--ink-strong);
  margin-bottom: 2px;
  line-height: 1.1;
}

.cardValueAmber { color: #d97706; }
.cardValueRed   { color: #dc2626; }
.cardValueGreen { color: #16a34a; }

.cardSub {
  font-size: 12px;
  color: var(--ink-muted);
}

.cardSubAmber { color: #92400e; }
.cardSubRed   { color: #991b1b; }

.cardLink {
  margin-top: 12px;
  font-size: 12px;
  color: var(--brand-1);
  font-weight: 600;
}
```

- [ ] **Step 2: Replace `page.tsx`**

```tsx
// src/app/app/reports/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { loadInventoryIntegrityAudit } from "@/lib/inventory/audit";
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "./reports.module.css";

type AuditClient = Parameters<typeof loadInventoryIntegrityAudit>[0];

export default async function ReportsHubPage() {
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) redirect("/login");

  const now = new Date();
  const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString();

  const [
    balancesRes,
    movCountRes,
    allMovsRes,
    stocktakeCountRes,
    lastStocktakeRes,
    openPOsRes,
    supplierSpendRes,
    receiptsRes,
    discrepancyRes,
  ] = await Promise.all([
    supabase
      .from("inventory_balance")
      .select("component_id,on_hand,component:component_id(cost_per_unit)")
      .gt("on_hand", 0),
    supabase
      .from("inventory_movement")
      .select("id", { count: "exact", head: true })
      .gte("created_at", cutoff30d),
    supabase
      .from("inventory_movement")
      .select("component_id,created_at")
      .gte("created_at", cutoff90d),
    supabase
      .from("stocktake_session")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("stocktake_session")
      .select("created_at,status")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("purchase_order")
      .select("id,expected_date,status,lines:purchase_order_line(quantity,unit_cost)")
      .not("status", "in", '("received","cancelled")'),
    supabase
      .from("purchase_order")
      .select("supplier_id,lines:purchase_order_line(quantity,unit_cost)")
      .gte("created_at", startOfYear),
    supabase
      .from("delivery_receipt")
      .select("received_at,purchase_order:purchase_order_id(expected_date)")
      .not("purchase_order_id", "is", null)
      .gte("received_at", cutoff90d),
    supabase
      .from("delivery_receipt")
      .select("id", { count: "exact", head: true })
      .eq("status", "discrepancy"),
  ]);

  const integrity = await loadInventoryIntegrityAudit(
    supabase as unknown as AuditClient,
    tenantId
  );

  // --- Inventory stats ---
  const balances = balancesRes.data ?? [];
  const totalComponents = balances.length;
  const totalValue = balances.reduce((sum, b) => {
    const cost =
      (b.component as { cost_per_unit?: number } | null)?.cost_per_unit ?? 0;
    return sum + b.on_hand * cost;
  }, 0);

  const movCount = movCountRes.count ?? 0;

  const activeComponentIds = new Set(
    (allMovsRes.data ?? []).map((m) => m.component_id)
  );
  const deadBalances = balances.filter((b) => !activeComponentIds.has(b.component_id));
  const deadCount = deadBalances.length;
  const deadValue = deadBalances.reduce((sum, b) => {
    const cost =
      (b.component as { cost_per_unit?: number } | null)?.cost_per_unit ?? 0;
    return sum + b.on_hand * cost;
  }, 0);

  const stocktakeTotal = stocktakeCountRes.count ?? 0;
  const lastStocktake = (lastStocktakeRes.data ?? [])[0];
  const lastStocktakeDaysAgo = lastStocktake
    ? Math.floor(
        (now.getTime() - new Date(lastStocktake.created_at).getTime()) /
          (24 * 60 * 60 * 1000)
      )
    : null;

  // --- Purchasing stats ---
  const openPOs = openPOsRes.data ?? [];
  const openLiability = openPOs.reduce((sum, po) => {
    const lines = po.lines as { quantity: number; unit_cost: number }[] ?? [];
    return sum + lines.reduce((s, l) => s + l.quantity * (l.unit_cost ?? 0), 0);
  }, 0);
  const overduePOs = openPOs.filter(
    (po) => po.expected_date && new Date(po.expected_date) < now
  ).length;

  const yearSpend = (supplierSpendRes.data ?? []).reduce((sum, po) => {
    const lines = po.lines as { quantity: number; unit_cost: number }[] ?? [];
    return sum + lines.reduce((s, l) => s + l.quantity * (l.unit_cost ?? 0), 0);
  }, 0);
  const supplierCount = new Set(
    (supplierSpendRes.data ?? []).map((po) => po.supplier_id)
  ).size;

  const receipts = receiptsRes.data ?? [];
  const onTimeReceipts = receipts.filter((r) => {
    const po = r.purchase_order as { expected_date?: string } | null;
    if (!po?.expected_date) return true;
    return new Date(r.received_at) <= new Date(po.expected_date);
  });
  const onTimePct =
    receipts.length > 0
      ? Math.round((onTimeReceipts.length / receipts.length) * 100)
      : 100;
  const discrepancyCount = discrepancyRes.count ?? 0;

  // --- Integrity ---
  const totalIssues =
    integrity.invariantIssues.length +
    integrity.reconciliationIssues.length +
    integrity.duplicateAllocationKeys.length +
    integrity.poOverReceipt.length;

  const fmt = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Reports</h1>
      <p className={styles.pageDesc}>
        Live data across inventory, purchasing, and system health.
      </p>

      {/* INVENTORY */}
      <div className={styles.section}>
        <span className={`${styles.sectionLabel} ${styles.sectionLabelInventory}`}>
          📦 Inventory
        </span>
        <div className={styles.grid}>
          <Link href="/app/reports/stock-on-hand" className={styles.card}>
            <div className={styles.cardName}>Stock on hand</div>
            <div className={styles.cardValue}>{totalComponents}</div>
            <div className={styles.cardSub}>{fmt(totalValue)} total value</div>
            <div className={styles.cardLink}>View report →</div>
          </Link>

          <Link href="/app/reports/movements" className={styles.card}>
            <div className={styles.cardName}>Movements ledger</div>
            <div className={styles.cardValue}>{movCount}</div>
            <div className={styles.cardSub}>movements in last 30 days</div>
            <div className={styles.cardLink}>View report →</div>
          </Link>

          <Link href="/app/reports/valuation" className={styles.card}>
            <div className={styles.cardName}>Inventory valuation</div>
            <div className={styles.cardValue}>{fmt(totalValue)}</div>
            <div className={styles.cardSub}>current on-hand value</div>
            <div className={styles.cardLink}>View report →</div>
          </Link>

          <Link
            href="/app/reports/dead-stock"
            className={`${styles.card} ${deadCount > 0 ? styles.cardAmber : ""}`}
          >
            <div className={`${styles.cardName} ${deadCount > 0 ? styles.cardNameAmber : ""}`}>
              Dead stock
            </div>
            <div className={`${styles.cardValue} ${deadCount > 0 ? styles.cardValueAmber : ""}`}>
              {deadCount > 0 ? `${deadCount} components` : "None"}
            </div>
            <div className={`${styles.cardSub} ${deadCount > 0 ? styles.cardSubAmber : ""}`}>
              {deadCount > 0 ? `${fmt(deadValue)} tied up · no demand 90d` : "No idle stock"}
            </div>
            <div className={styles.cardLink}>View report →</div>
          </Link>

          <Link href="/app/reports/stocktake-history" className={styles.card}>
            <div className={styles.cardName}>Stocktake history</div>
            <div className={styles.cardValue}>{stocktakeTotal}</div>
            <div className={styles.cardSub}>
              {lastStocktakeDaysAgo != null
                ? `last: ${lastStocktakeDaysAgo} day${lastStocktakeDaysAgo === 1 ? "" : "s"} ago`
                : "No stocktakes yet"}
            </div>
            <div className={styles.cardLink}>View report →</div>
          </Link>
        </div>
      </div>

      {/* PURCHASING */}
      <div className={styles.section}>
        <span className={`${styles.sectionLabel} ${styles.sectionLabelPurchasing}`}>
          🛒 Purchasing
        </span>
        <div className={styles.grid}>
          <Link
            href="/app/reports/po-summary"
            className={`${styles.card} ${overduePOs > 0 ? styles.cardRed : ""}`}
          >
            <div className={`${styles.cardName} ${overduePOs > 0 ? styles.cardNameRed : ""}`}>
              PO summary
            </div>
            <div className={`${styles.cardValue} ${overduePOs > 0 ? styles.cardValueRed : ""}`}>
              {fmt(openLiability)}
            </div>
            <div className={`${styles.cardSub} ${overduePOs > 0 ? styles.cardSubRed : ""}`}>
              open liability
              {overduePOs > 0 ? ` · ${overduePOs} overdue` : ` · ${openPOs.length} POs outstanding`}
            </div>
            <div className={styles.cardLink}>View report →</div>
          </Link>

          <Link href="/app/reports/spend-by-supplier" className={styles.card}>
            <div className={styles.cardName}>Spend by supplier</div>
            <div className={styles.cardValue}>{fmt(yearSpend)}</div>
            <div className={styles.cardSub}>this year · {supplierCount} suppliers</div>
            <div className={styles.cardLink}>View report →</div>
          </Link>

          <Link
            href="/app/reports/lead-time-accuracy"
            className={`${styles.card} ${onTimePct < 80 ? styles.cardRed : ""}`}
          >
            <div className={`${styles.cardName} ${onTimePct < 80 ? styles.cardNameRed : ""}`}>
              Lead time accuracy
            </div>
            <div className={`${styles.cardValue} ${onTimePct < 80 ? styles.cardValueRed : onTimePct >= 95 ? styles.cardValueGreen : ""}`}>
              {onTimePct}%
            </div>
            <div className={`${styles.cardSub} ${onTimePct < 80 ? styles.cardSubRed : ""}`}>
              on-time deliveries · last 90 days
            </div>
            <div className={styles.cardLink}>View report →</div>
          </Link>

          <Link
            href="/app/reports/po-variance"
            className={`${styles.card} ${discrepancyCount > 0 ? styles.cardAmber : ""}`}
          >
            <div className={`${styles.cardName} ${discrepancyCount > 0 ? styles.cardNameAmber : ""}`}>
              PO quantity variance
            </div>
            <div className={`${styles.cardValue} ${discrepancyCount > 0 ? styles.cardValueAmber : ""}`}>
              {discrepancyCount > 0 ? `${discrepancyCount} lines` : "None"}
            </div>
            <div className={`${styles.cardSub} ${discrepancyCount > 0 ? styles.cardSubAmber : ""}`}>
              received ≠ ordered
            </div>
            <div className={styles.cardLink}>View report →</div>
          </Link>
        </div>
      </div>

      {/* SYSTEM */}
      <div className={styles.section}>
        <span className={`${styles.sectionLabel} ${styles.sectionLabelSystem}`}>
          🔧 System
        </span>
        <div className={styles.grid}>
          <Link
            href="/app/reports/inventory-integrity"
            className={`${styles.card} ${totalIssues > 0 ? styles.cardRed : ""}`}
          >
            <div className={`${styles.cardName} ${totalIssues > 0 ? styles.cardNameRed : ""}`}>
              Inventory integrity
            </div>
            <div className={`${styles.cardValue} ${totalIssues > 0 ? styles.cardValueRed : styles.cardValueGreen}`}>
              {totalIssues > 0 ? `${totalIssues} issues` : "✓ Healthy"}
            </div>
            <div className={`${styles.cardSub} ${totalIssues > 0 ? styles.cardSubRed : ""}`}>
              {totalIssues > 0 ? "action required" : "0 issues · checked now"}
            </div>
            <div className={styles.cardLink}>View report →</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
git add src/app/app/reports/page.tsx src/app/app/reports/reports.module.css
git commit -m "feat(reports): hub page with live-data cards"
```

---

## Task 2: Stock on Hand Report

**Goal:** Build `/app/reports/stock-on-hand` — stats + table showing all components with on-hand stock, plus CSV export.

**Files:**
- Create: `src/app/app/reports/stock-on-hand/page.tsx`
- Create: `src/app/app/reports/stock-on-hand/export/route.ts`

**Acceptance Criteria:**
- [ ] Page renders stat cards: total components, total value, count below reorder point
- [ ] Table shows Component, SKU, On hand, Reserved, In production, Value, Status badge
- [ ] CSV export downloads correct data
- [ ] Date range filter has no effect (stock on hand is point-in-time) — date preset bar shows but query is always current

**Verify:** Navigate to `/app/reports/stock-on-hand` — table renders; click "Export CSV" — file downloads

**Steps:**

- [ ] **Step 1: Create `page.tsx`**

```tsx
// src/app/app/reports/stock-on-hand/page.tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { ReportTable, Badge } from "../_components/report-table";
import type { TableColumn } from "../_components/report-table";

interface Row {
  id: string;
  name: string;
  sku: string | null;
  location: string;
  on_hand: number;
  reserved: number;
  in_prod: number;
  value: number;
  reorder_point: number | null;
}

export default async function StockOnHandPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; location?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) redirect("/login");

  const { data: raw } = await supabase
    .from("inventory_balance")
    .select(
      "component_id,on_hand,reserved,in_prod,location_id," +
      "component:component_id(id,name,sku,cost_per_unit,reorder_point)," +
      "location:location_id(name)"
    )
    .gt("on_hand", 0)
    .order("on_hand", { ascending: false });

  const rows: Row[] = (raw ?? []).map((r) => {
    const c = r.component as {
      id: string; name: string; sku: string | null;
      cost_per_unit: number | null; reorder_point: number | null;
    } | null;
    const loc = r.location as { name: string } | null;
    return {
      id: `${r.component_id}-${r.location_id}`,
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

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const belowReorder = rows.filter(
    (r) => r.reorder_point != null && r.on_hand <= r.reorder_point
  ).length;

  const fmt = (n: number) =>
    n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

  const columns: TableColumn<Row>[] = [
    { key: "name", header: "Component", render: (r) => r.name },
    { key: "sku", header: "SKU", render: (r) => r.sku ?? "—" },
    { key: "location", header: "Location", render: (r) => r.location },
    { key: "on_hand", header: "On hand", align: "right", render: (r) => r.on_hand.toLocaleString() },
    { key: "reserved", header: "Reserved", align: "right", render: (r) => r.reserved.toLocaleString() },
    { key: "in_prod", header: "In production", align: "right", render: (r) => r.in_prod.toLocaleString() },
    { key: "value", header: "Value", align: "right", render: (r) => fmt(r.value) },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        if (r.on_hand === 0) return <Badge variant="red">Out</Badge>;
        if (r.reorder_point != null && r.on_hand <= r.reorder_point)
          return <Badge variant="amber">Low</Badge>;
        return <Badge variant="green">OK</Badge>;
      },
    },
  ];

  return (
    <ReportShell
      eyebrow="Inventory"
      title="Stock on hand"
      description="Current on-hand quantities and values across all locations."
      csvSlug="stock-on-hand"
      searchParams={sp}
    >
      <ReportStatCards
        cards={[
          { label: "Components in stock", value: rows.length },
          { label: "Total value", value: fmt(totalValue) },
          {
            label: "Below reorder point",
            value: belowReorder,
            variant: belowReorder > 0 ? "amber" : "default",
          },
        ]}
      />
      <ReportTable columns={columns} rows={rows} rowKey={(r) => r.id} />
    </ReportShell>
  );
}
```

- [ ] **Step 2: Create `export/route.ts`**

```ts
// src/app/app/reports/stock-on-hand/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";

export async function GET(_req: NextRequest) {
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) return new NextResponse("Unauthorized", { status: 401 });

  const { data } = await supabase
    .from("inventory_balance")
    .select(
      "on_hand,reserved,in_prod," +
      "component:component_id(name,sku,cost_per_unit,reorder_point)," +
      "location:location_id(name)"
    )
    .gt("on_hand", 0)
    .order("on_hand", { ascending: false });

  const rows = data ?? [];
  const headers = ["Component", "SKU", "Location", "On Hand", "Reserved", "In Production", "Value", "Status"];
  const lines = rows.map((r) => {
    const c = r.component as { name: string; sku: string | null; cost_per_unit: number | null; reorder_point: number | null } | null;
    const loc = r.location as { name: string } | null;
    const value = r.on_hand * (c?.cost_per_unit ?? 0);
    const status =
      r.on_hand === 0 ? "Out" :
      (c?.reorder_point != null && r.on_hand <= c.reorder_point) ? "Low" : "OK";
    return [c?.name ?? "", c?.sku ?? "", loc?.name ?? "", r.on_hand, r.reserved ?? 0, r.in_prod ?? 0, value.toFixed(2), status]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });

  const csv = [headers.join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="stock-on-hand.csv"',
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app/reports/stock-on-hand
git commit -m "feat(reports): stock on hand report page + CSV export"
```

---

## Task 3: Movements Ledger Report

**Goal:** Build `/app/reports/movements` — bar chart of daily in/out + table of every movement in the date range.

**Files:**
- Create: `src/app/app/reports/movements/page.tsx`
- Create: `src/app/app/reports/movements/export/route.ts`

**Acceptance Criteria:**
- [ ] Stat cards: total movements, total stock in (sum of positive deltas), total stock out (sum of negative deltas)
- [ ] Bar chart shows daily stock-in (green) and stock-out (red) bars
- [ ] Table shows Date, Component, Type badge, Reference, Qty (signed, coloured)
- [ ] Date range filter works — changing preset re-queries correctly
- [ ] CSV export includes all columns

**Verify:** Navigate to `/app/reports/movements` — chart and table render; change date preset — data updates

**Steps:**

- [ ] **Step 1: Create `page.tsx`**

```tsx
// src/app/app/reports/movements/page.tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../_lib/date-range";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { ReportChart } from "../_components/report-chart";
import { ReportTable, Badge } from "../_components/report-table";
import type { TableColumn, BadgeVariant } from "../_components/report-table";

interface Row {
  id: string;
  date: string;
  component: string;
  type: string;
  reference: string;
  qty: number;
}

interface ChartPoint {
  day: string;
  in: number;
  out: number;
}

const TYPE_VARIANT: Record<string, BadgeVariant> = {
  receipt: "green",
  allocation: "blue",
  adjustment: "amber",
  stocktake: "gray",
};

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) redirect("/login");

  const range = resolveDateRange(sp, 30);

  const { data } = await supabase
    .from("inventory_movement")
    .select(
      "id,created_at,delta_on_hand,reason,reference_type," +
      "component:component_id(name)"
    )
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .order("created_at", { ascending: false });

  const movements = data ?? [];

  const totalIn = movements
    .filter((m) => m.delta_on_hand > 0)
    .reduce((s, m) => s + m.delta_on_hand, 0);
  const totalOut = Math.abs(
    movements.filter((m) => m.delta_on_hand < 0).reduce((s, m) => s + m.delta_on_hand, 0)
  );

  const byDay: Record<string, { in: number; out: number }> = {};
  for (const m of movements) {
    const day = m.created_at.slice(0, 10);
    if (!byDay[day]) byDay[day] = { in: 0, out: 0 };
    if (m.delta_on_hand > 0) byDay[day].in += m.delta_on_hand;
    else byDay[day].out += Math.abs(m.delta_on_hand);
  }
  const chartData: ChartPoint[] = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day: day.slice(5), ...v }));

  const rows: Row[] = movements.map((m) => ({
    id: m.id,
    date: new Date(m.created_at).toLocaleDateString("en-AU", {
      day: "numeric", month: "short",
    }),
    component: (m.component as { name: string } | null)?.name ?? "—",
    type: m.reason ?? m.reference_type ?? "adjustment",
    reference: m.reference_type ?? "—",
    qty: m.delta_on_hand,
  }));

  const columns: TableColumn<Row>[] = [
    { key: "date", header: "Date", render: (r) => <span style={{ color: "var(--ink-muted)" }}>{r.date}</span> },
    { key: "component", header: "Component", render: (r) => r.component },
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <Badge variant={TYPE_VARIANT[r.type] ?? "gray"}>{r.type}</Badge>
      ),
    },
    { key: "ref", header: "Reference", render: (r) => r.reference },
    {
      key: "qty",
      header: "Qty",
      align: "right",
      render: (r) => (
        <span
          style={{
            color: r.qty > 0 ? "#16a34a" : r.qty < 0 ? "#dc2626" : "var(--ink-muted)",
            fontWeight: 600,
          }}
        >
          {r.qty > 0 ? `+${r.qty}` : r.qty}
        </span>
      ),
    },
  ];

  return (
    <ReportShell
      eyebrow="Inventory"
      title="Movements ledger"
      description="Every stock movement in the selected period."
      csvSlug="movements"
      searchParams={sp}
    >
      <ReportStatCards
        cards={[
          { label: "Total movements", value: movements.length },
          { label: "Stock in", value: `+${totalIn.toLocaleString()}`, variant: "green" },
          { label: "Stock out", value: `−${totalOut.toLocaleString()}`, variant: "red" },
        ]}
      />
      {chartData.length > 0 && (
        <ReportChart
          type="bar"
          title="Daily movements"
          data={chartData}
          xKey="day"
          series={[
            { dataKey: "in", color: "#86efac", name: "Stock in" },
            { dataKey: "out", color: "#fca5a5", name: "Stock out" },
          ]}
        />
      )}
      <ReportTable columns={columns} rows={rows} rowKey={(r) => r.id} />
    </ReportShell>
  );
}
```

- [ ] **Step 2: Create `export/route.ts`**

```ts
// src/app/app/reports/movements/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../../_lib/date-range";

export async function GET(req: NextRequest) {
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) return new NextResponse("Unauthorized", { status: 401 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const range = resolveDateRange(sp, 30);

  const { data } = await supabase
    .from("inventory_movement")
    .select("id,created_at,delta_on_hand,reason,reference_type,component:component_id(name)")
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  const headers = ["Date", "Component", "Type", "Reference", "Qty"];
  const lines = rows.map((m) => {
    const c = m.component as { name: string } | null;
    return [
      new Date(m.created_at).toLocaleDateString("en-AU"),
      c?.name ?? "",
      m.reason ?? m.reference_type ?? "adjustment",
      m.reference_type ?? "",
      m.delta_on_hand,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });

  const csv = [headers.join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="movements.csv"',
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app/reports/movements
git commit -m "feat(reports): movements ledger report page + CSV export"
```

---

## Task 4: Inventory Valuation Report

**Goal:** Build `/app/reports/valuation` — current on-hand value by component with stat cards + table + CSV.

**Files:**
- Create: `src/app/app/reports/valuation/page.tsx`
- Create: `src/app/app/reports/valuation/export/route.ts`

**Acceptance Criteria:**
- [ ] Stat cards: total on-hand value, in-production value, reserved value
- [ ] Table shows Component, SKU, On hand qty, Cost per unit, Total value, % of total
- [ ] % of total column sums to 100% across all rows
- [ ] CSV export works

**Verify:** Navigate to `/app/reports/valuation` — stat cards and table visible

**Steps:**

- [ ] **Step 1: Create `page.tsx`**

```tsx
// src/app/app/reports/valuation/page.tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { ReportTable } from "../_components/report-table";
import type { TableColumn } from "../_components/report-table";

interface Row {
  id: string;
  name: string;
  sku: string | null;
  on_hand: number;
  in_prod: number;
  reserved: number;
  cost: number;
  value: number;
  pct: number;
}

export default async function ValuationPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) redirect("/login");

  const { data: raw } = await supabase
    .from("inventory_balance")
    .select(
      "component_id,on_hand,in_prod,reserved," +
      "component:component_id(name,sku,cost_per_unit)"
    )
    .gt("on_hand", 0)
    .order("on_hand", { ascending: false });

  const balances = raw ?? [];
  const totalOnHandValue = balances.reduce((s, b) => {
    const c = b.component as { cost_per_unit: number | null } | null;
    return s + b.on_hand * (c?.cost_per_unit ?? 0);
  }, 0);
  const totalInProdValue = balances.reduce((s, b) => {
    const c = b.component as { cost_per_unit: number | null } | null;
    return s + (b.in_prod ?? 0) * (c?.cost_per_unit ?? 0);
  }, 0);
  const totalReservedValue = balances.reduce((s, b) => {
    const c = b.component as { cost_per_unit: number | null } | null;
    return s + (b.reserved ?? 0) * (c?.cost_per_unit ?? 0);
  }, 0);

  const rows: Row[] = balances.map((b) => {
    const c = b.component as { name: string; sku: string | null; cost_per_unit: number | null } | null;
    const cost = c?.cost_per_unit ?? 0;
    const value = b.on_hand * cost;
    return {
      id: b.component_id,
      name: c?.name ?? "—",
      sku: c?.sku ?? null,
      on_hand: b.on_hand,
      in_prod: b.in_prod ?? 0,
      reserved: b.reserved ?? 0,
      cost,
      value,
      pct: totalOnHandValue > 0 ? (value / totalOnHandValue) * 100 : 0,
    };
  }).sort((a, b) => b.value - a.value);

  const fmt = (n: number) =>
    n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

  const columns: TableColumn<Row>[] = [
    { key: "name", header: "Component", render: (r) => r.name },
    { key: "sku", header: "SKU", render: (r) => r.sku ?? "—" },
    { key: "on_hand", header: "On hand", align: "right", render: (r) => r.on_hand.toLocaleString() },
    { key: "cost", header: "Cost / unit", align: "right", render: (r) => fmt(r.cost) },
    { key: "value", header: "Total value", align: "right", render: (r) => fmt(r.value) },
    {
      key: "pct",
      header: "% of total",
      align: "right",
      render: (r) => (
        <span style={{ color: "var(--ink-muted)" }}>{r.pct.toFixed(1)}%</span>
      ),
    },
  ];

  return (
    <ReportShell
      eyebrow="Inventory"
      title="Inventory valuation"
      description="On-hand stock value broken down by component."
      csvSlug="valuation"
      searchParams={sp}
    >
      <ReportStatCards
        cards={[
          { label: "On-hand value", value: fmt(totalOnHandValue) },
          { label: "In-production value", value: fmt(totalInProdValue) },
          { label: "Reserved value", value: fmt(totalReservedValue) },
        ]}
      />
      <ReportTable columns={columns} rows={rows} rowKey={(r) => r.id} />
    </ReportShell>
  );
}
```

- [ ] **Step 2: Create `export/route.ts`**

```ts
// src/app/app/reports/valuation/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";

export async function GET(_req: NextRequest) {
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) return new NextResponse("Unauthorized", { status: 401 });

  const { data } = await supabase
    .from("inventory_balance")
    .select("component_id,on_hand,in_prod,reserved,component:component_id(name,sku,cost_per_unit)")
    .gt("on_hand", 0)
    .order("on_hand", { ascending: false });

  const rows = data ?? [];
  const totalValue = rows.reduce((s, b) => {
    const c = b.component as { cost_per_unit: number | null } | null;
    return s + b.on_hand * (c?.cost_per_unit ?? 0);
  }, 0);

  const headers = ["Component", "SKU", "On Hand", "Cost Per Unit", "Total Value", "% of Total"];
  const lines = rows.map((b) => {
    const c = b.component as { name: string; sku: string | null; cost_per_unit: number | null } | null;
    const value = b.on_hand * (c?.cost_per_unit ?? 0);
    const pct = totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : "0.0";
    return [c?.name ?? "", c?.sku ?? "", b.on_hand, (c?.cost_per_unit ?? 0).toFixed(2), value.toFixed(2), pct]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });

  const csv = [headers.join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="inventory-valuation.csv"',
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app/reports/valuation
git commit -m "feat(reports): inventory valuation report page + CSV export"
```

---

## Task 5: Dead Stock Report

**Goal:** Build `/app/reports/dead-stock` — components with stock but no recent movement, sorted by days idle.

**Files:**
- Create: `src/app/app/reports/dead-stock/page.tsx`
- Create: `src/app/app/reports/dead-stock/export/route.ts`

**Acceptance Criteria:**
- [ ] Stat cards: dead count (amber), capital tied up (amber), longest idle (days)
- [ ] Table shows Component, SKU, On hand, Value, Days since last movement — sorted days descending
- [ ] Idle threshold filter (30d / 60d / 90d / 180d) works — `?idle=90` param, default 90
- [ ] CSV export works

**Verify:** Navigate to `/app/reports/dead-stock` — amber stat cards visible when dead stock exists

**Steps:**

- [ ] **Step 1: Create `page.tsx`**

```tsx
// src/app/app/reports/dead-stock/page.tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { ReportTable } from "../_components/report-table";
import type { TableColumn } from "../_components/report-table";

interface Row {
  id: string;
  name: string;
  sku: string | null;
  on_hand: number;
  value: number;
  daysIdle: number;
}

export default async function DeadStockPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; idle?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) redirect("/login");

  const idleThreshold = Number(sp.idle ?? 90);
  const cutoff = new Date(
    Date.now() - idleThreshold * 24 * 60 * 60 * 1000
  ).toISOString();

  // Get all components with on-hand stock
  const { data: balances } = await supabase
    .from("inventory_balance")
    .select("component_id,on_hand,component:component_id(name,sku,cost_per_unit)")
    .gt("on_hand", 0);

  // Get components that had movement after the cutoff
  const { data: recentMov } = await supabase
    .from("inventory_movement")
    .select("component_id")
    .gte("created_at", cutoff);

  const activeIds = new Set((recentMov ?? []).map((m) => m.component_id));

  // For dead components, find the last movement date
  const deadComponentIds = (balances ?? [])
    .filter((b) => !activeIds.has(b.component_id))
    .map((b) => b.component_id);

  let lastMovementByComponent: Record<string, string> = {};
  if (deadComponentIds.length > 0) {
    const { data: lastMovs } = await supabase
      .from("inventory_movement")
      .select("component_id,created_at")
      .in("component_id", deadComponentIds)
      .order("created_at", { ascending: false });

    for (const m of lastMovs ?? []) {
      if (!lastMovementByComponent[m.component_id]) {
        lastMovementByComponent[m.component_id] = m.created_at;
      }
    }
  }

  const now = Date.now();
  const rows: Row[] = (balances ?? [])
    .filter((b) => !activeIds.has(b.component_id))
    .map((b) => {
      const c = b.component as { name: string; sku: string | null; cost_per_unit: number | null } | null;
      const lastMov = lastMovementByComponent[b.component_id];
      const daysIdle = lastMov
        ? Math.floor((now - new Date(lastMov).getTime()) / (24 * 60 * 60 * 1000))
        : 999;
      return {
        id: b.component_id,
        name: c?.name ?? "—",
        sku: c?.sku ?? null,
        on_hand: b.on_hand,
        value: b.on_hand * (c?.cost_per_unit ?? 0),
        daysIdle,
      };
    })
    .sort((a, b) => b.daysIdle - a.daysIdle);

  const totalCapital = rows.reduce((s, r) => s + r.value, 0);
  const longestIdle = rows[0]?.daysIdle ?? 0;

  const fmt = (n: number) =>
    n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

  const columns: TableColumn<Row>[] = [
    { key: "name", header: "Component", render: (r) => r.name },
    { key: "sku", header: "SKU", render: (r) => r.sku ?? "—" },
    { key: "on_hand", header: "On hand", align: "right", render: (r) => r.on_hand.toLocaleString() },
    { key: "value", header: "Value", align: "right", render: (r) => fmt(r.value) },
    {
      key: "daysIdle",
      header: "Days idle",
      align: "right",
      render: (r) => (
        <span
          style={{
            color: r.daysIdle >= 180 ? "#dc2626" : r.daysIdle >= 90 ? "#d97706" : "var(--ink-strong)",
            fontWeight: 600,
          }}
        >
          {r.daysIdle === 999 ? "never moved" : r.daysIdle}
        </span>
      ),
    },
  ];

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
          { label: "Capital tied up", value: fmt(totalCapital), variant: rows.length > 0 ? "amber" : "default" },
          { label: "Longest idle", value: longestIdle === 999 ? "—" : `${longestIdle}d` },
        ]}
      />
      <ReportTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        emptyMessage={`No components idle for ${idleThreshold}+ days.`}
      />
    </ReportShell>
  );
}
```

- [ ] **Step 2: Create `export/route.ts`**

```ts
// src/app/app/reports/dead-stock/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";

export async function GET(req: NextRequest) {
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) return new NextResponse("Unauthorized", { status: 401 });

  const idleThreshold = Number(req.nextUrl.searchParams.get("idle") ?? 90);
  const cutoff = new Date(Date.now() - idleThreshold * 24 * 60 * 60 * 1000).toISOString();

  const { data: balances } = await supabase
    .from("inventory_balance")
    .select("component_id,on_hand,component:component_id(name,sku,cost_per_unit)")
    .gt("on_hand", 0);

  const { data: recentMov } = await supabase
    .from("inventory_movement")
    .select("component_id")
    .gte("created_at", cutoff);

  const activeIds = new Set((recentMov ?? []).map((m) => m.component_id));
  const deadIds = (balances ?? []).filter((b) => !activeIds.has(b.component_id)).map((b) => b.component_id);

  let lastMovs: Record<string, string> = {};
  if (deadIds.length > 0) {
    const { data } = await supabase
      .from("inventory_movement")
      .select("component_id,created_at")
      .in("component_id", deadIds)
      .order("created_at", { ascending: false });
    for (const m of data ?? []) {
      if (!lastMovs[m.component_id]) lastMovs[m.component_id] = m.created_at;
    }
  }

  const now = Date.now();
  const rows = (balances ?? []).filter((b) => !activeIds.has(b.component_id)).map((b) => {
    const c = b.component as { name: string; sku: string | null; cost_per_unit: number | null } | null;
    const lastMov = lastMovs[b.component_id];
    const daysIdle = lastMov ? Math.floor((now - new Date(lastMov).getTime()) / (24 * 60 * 60 * 1000)) : 999;
    return { name: c?.name ?? "", sku: c?.sku ?? "", on_hand: b.on_hand, value: b.on_hand * (c?.cost_per_unit ?? 0), daysIdle };
  }).sort((a, b) => b.daysIdle - a.daysIdle);

  const headers = ["Component", "SKU", "On Hand", "Value", "Days Idle"];
  const lines = rows.map((r) =>
    [r.name, r.sku, r.on_hand, r.value.toFixed(2), r.daysIdle === 999 ? "never moved" : r.daysIdle]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = [headers.join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="dead-stock.csv"',
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app/reports/dead-stock
git commit -m "feat(reports): dead stock report page + CSV export"
```

---

## Task 6: Stocktake History Report

**Goal:** Build `/app/reports/stocktake-history` — bar chart of variance count per stocktake + summary table.

**Files:**
- Create: `src/app/app/reports/stocktake-history/page.tsx`
- Create: `src/app/app/reports/stocktake-history/export/route.ts`

**Acceptance Criteria:**
- [ ] Stat cards: total stocktakes, total variance lines, largest single variance
- [ ] Bar chart shows variance line count per stocktake over time
- [ ] Table shows Date, Location, Status, Lines counted, Variance lines, Total variance qty
- [ ] CSV export works

**Verify:** Navigate to `/app/reports/stocktake-history` — table renders with stocktake rows

**Steps:**

- [ ] **Step 1: Create `page.tsx`**

```tsx
// src/app/app/reports/stocktake-history/page.tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../_lib/date-range";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { ReportChart } from "../_components/report-chart";
import { ReportTable, Badge } from "../_components/report-table";
import type { TableColumn, BadgeVariant } from "../_components/report-table";

interface Row {
  id: string;
  date: string;
  location: string;
  status: string;
  lineCount: number;
  varianceLines: number;
  totalVarianceQty: number;
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  completed: "green",
  in_progress: "blue",
  draft: "gray",
};

export default async function StocktakeHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) redirect("/login");

  const range = resolveDateRange(sp, 365);

  const { data: sessions } = await supabase
    .from("stocktake_session")
    .select(
      "id,created_at,status,location:location_id(name)," +
      "lines:stocktake_line(id,expected_on_hand,counted)"
    )
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .order("created_at", { ascending: false });

  const rows: Row[] = (sessions ?? []).map((s) => {
    const lines = s.lines as { id: string; expected_on_hand: number; counted: number }[] ?? [];
    const varianceLines = lines.filter((l) => l.counted !== l.expected_on_hand);
    const totalVarianceQty = varianceLines.reduce(
      (sum, l) => sum + Math.abs(l.counted - l.expected_on_hand),
      0
    );
    return {
      id: s.id,
      date: new Date(s.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }),
      location: (s.location as { name: string } | null)?.name ?? "—",
      status: s.status ?? "completed",
      lineCount: lines.length,
      varianceLines: varianceLines.length,
      totalVarianceQty,
    };
  });

  const totalVarianceLines = rows.reduce((s, r) => s + r.varianceLines, 0);
  const largestVariance = rows.reduce(
    (max, r) => Math.max(max, r.totalVarianceQty),
    0
  );

  const chartData = [...rows]
    .reverse()
    .map((r) => ({ date: r.date.slice(0, 6), variances: r.varianceLines }));

  const columns: TableColumn<Row>[] = [
    { key: "date", header: "Date", render: (r) => r.date },
    { key: "location", header: "Location", render: (r) => r.location },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={STATUS_VARIANT[r.status] ?? "gray"}>{r.status.replace("_", " ")}</Badge>
      ),
    },
    { key: "lineCount", header: "Lines counted", align: "right", render: (r) => r.lineCount },
    {
      key: "varianceLines",
      header: "Variance lines",
      align: "right",
      render: (r) => (
        <span style={{ color: r.varianceLines > 0 ? "#d97706" : "var(--ink-muted)" }}>
          {r.varianceLines}
        </span>
      ),
    },
    {
      key: "totalVarianceQty",
      header: "Total variance qty",
      align: "right",
      render: (r) => r.totalVarianceQty.toLocaleString(),
    },
  ];

  return (
    <ReportShell
      eyebrow="Inventory"
      title="Stocktake history"
      description="All stocktake sessions and their variance results."
      csvSlug="stocktake-history"
      searchParams={sp}
    >
      <ReportStatCards
        cards={[
          { label: "Stocktakes completed", value: rows.length },
          { label: "Total variance lines", value: totalVarianceLines, variant: totalVarianceLines > 0 ? "amber" : "default" },
          { label: "Largest single variance", value: largestVariance.toLocaleString() },
        ]}
      />
      {chartData.length > 0 && (
        <ReportChart
          type="bar"
          title="Variance lines per stocktake"
          data={chartData}
          xKey="date"
          series={[{ dataKey: "variances", color: "#fcd34d", name: "Variance lines" }]}
        />
      )}
      <ReportTable columns={columns} rows={rows} rowKey={(r) => r.id} />
    </ReportShell>
  );
}
```

- [ ] **Step 2: Create `export/route.ts`**

```ts
// src/app/app/reports/stocktake-history/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../../_lib/date-range";

export async function GET(req: NextRequest) {
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) return new NextResponse("Unauthorized", { status: 401 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const range = resolveDateRange(sp, 365);

  const { data: sessions } = await supabase
    .from("stocktake_session")
    .select("id,created_at,status,location:location_id(name),lines:stocktake_line(id,expected_on_hand,counted)")
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .order("created_at", { ascending: false });

  const headers = ["Date", "Location", "Status", "Lines Counted", "Variance Lines", "Total Variance Qty"];
  const lines = (sessions ?? []).map((s) => {
    const loc = s.location as { name: string } | null;
    const slines = s.lines as { expected_on_hand: number; counted: number }[] ?? [];
    const varLines = slines.filter((l) => l.counted !== l.expected_on_hand);
    const varQty = varLines.reduce((sum, l) => sum + Math.abs(l.counted - l.expected_on_hand), 0);
    return [
      new Date(s.created_at).toLocaleDateString("en-AU"),
      loc?.name ?? "",
      s.status ?? "",
      slines.length,
      varLines.length,
      varQty,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });

  const csv = [headers.join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="stocktake-history.csv"',
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app/reports/stocktake-history
git commit -m "feat(reports): stocktake history report page + CSV export"
```

---

## Task 7: PO Summary Report

**Goal:** Build `/app/reports/po-summary` — open purchase orders with overdue highlighting.

**Files:**
- Create: `src/app/app/reports/po-summary/page.tsx`
- Create: `src/app/app/reports/po-summary/export/route.ts`

**Acceptance Criteria:**
- [ ] Stat cards: open liability ($), POs outstanding (count), overdue POs (red if > 0)
- [ ] Table shows PO number, Supplier, Status badge, Expected date, Total value, Lines
- [ ] Overdue rows are highlighted amber
- [ ] CSV export works

**Verify:** Navigate to `/app/reports/po-summary` — table renders with open POs

**Steps:**

- [ ] **Step 1: Create `page.tsx`**

```tsx
// src/app/app/reports/po-summary/page.tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../_lib/date-range";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { ReportTable, Badge } from "../_components/report-table";
import type { TableColumn, BadgeVariant } from "../_components/report-table";

interface Row {
  id: string;
  poNumber: string;
  supplier: string;
  status: string;
  expectedDate: string | null;
  totalValue: number;
  lineCount: number;
  overdue: boolean;
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: "gray",
  sent: "blue",
  partial: "amber",
  received: "green",
  cancelled: "gray",
};

export default async function POSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) redirect("/login");

  const range = resolveDateRange(sp, 90);

  const { data } = await supabase
    .from("purchase_order")
    .select(
      "id,created_at,expected_date,status," +
      "supplier:supplier_id(name)," +
      "lines:purchase_order_line(quantity,unit_cost)"
    )
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .order("created_at", { ascending: false });

  const now = new Date();
  const rows: Row[] = (data ?? []).map((po) => {
    const lines = po.lines as { quantity: number; unit_cost: number }[] ?? [];
    const totalValue = lines.reduce((s, l) => s + l.quantity * (l.unit_cost ?? 0), 0);
    const overdue =
      !["received", "cancelled"].includes(po.status ?? "") &&
      !!po.expected_date &&
      new Date(po.expected_date) < now;
    return {
      id: po.id,
      poNumber: po.id.slice(0, 8).toUpperCase(),
      supplier: (po.supplier as { name: string } | null)?.name ?? "—",
      status: po.status ?? "draft",
      expectedDate: po.expected_date
        ? new Date(po.expected_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
        : null,
      totalValue,
      lineCount: lines.length,
      overdue,
    };
  });

  const openRows = rows.filter((r) => !["received", "cancelled"].includes(r.status));
  const openLiability = openRows.reduce((s, r) => s + r.totalValue, 0);
  const overdueCount = rows.filter((r) => r.overdue).length;

  const fmt = (n: number) =>
    n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

  const columns: TableColumn<Row>[] = [
    { key: "poNumber", header: "PO #", render: (r) => r.poNumber },
    { key: "supplier", header: "Supplier", render: (r) => r.supplier },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={STATUS_VARIANT[r.status] ?? "gray"}>{r.status}</Badge>
      ),
    },
    {
      key: "expectedDate",
      header: "Expected date",
      render: (r) => (
        <span style={{ color: r.overdue ? "#dc2626" : "inherit" }}>
          {r.expectedDate ?? "—"}
          {r.overdue && " ⚠"}
        </span>
      ),
    },
    { key: "value", header: "Total value", align: "right", render: (r) => fmt(r.totalValue) },
    { key: "lines", header: "Lines", align: "right", render: (r) => r.lineCount },
  ];

  return (
    <ReportShell
      eyebrow="Purchasing"
      title="PO summary"
      description="Purchase orders in the selected period."
      csvSlug="po-summary"
      searchParams={sp}
    >
      <ReportStatCards
        cards={[
          { label: "Open liability", value: fmt(openLiability) },
          { label: "POs outstanding", value: openRows.length },
          { label: "Overdue POs", value: overdueCount, variant: overdueCount > 0 ? "red" : "default" },
        ]}
      />
      <ReportTable columns={columns} rows={rows} rowKey={(r) => r.id} />
    </ReportShell>
  );
}
```

- [ ] **Step 2: Create `export/route.ts`**

```ts
// src/app/app/reports/po-summary/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../../_lib/date-range";

export async function GET(req: NextRequest) {
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) return new NextResponse("Unauthorized", { status: 401 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const range = resolveDateRange(sp, 90);

  const { data } = await supabase
    .from("purchase_order")
    .select("id,created_at,expected_date,status,supplier:supplier_id(name),lines:purchase_order_line(quantity,unit_cost)")
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .order("created_at", { ascending: false });

  const now = new Date();
  const headers = ["PO #", "Supplier", "Status", "Expected Date", "Total Value", "Lines", "Overdue"];
  const lines = (data ?? []).map((po) => {
    const sup = po.supplier as { name: string } | null;
    const poLines = po.lines as { quantity: number; unit_cost: number }[] ?? [];
    const value = poLines.reduce((s, l) => s + l.quantity * (l.unit_cost ?? 0), 0);
    const overdue = !["received","cancelled"].includes(po.status ?? "") && !!po.expected_date && new Date(po.expected_date) < now;
    return [
      po.id.slice(0, 8).toUpperCase(),
      sup?.name ?? "",
      po.status ?? "",
      po.expected_date ? new Date(po.expected_date).toLocaleDateString("en-AU") : "",
      value.toFixed(2),
      poLines.length,
      overdue ? "Yes" : "No",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });

  const csv = [headers.join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="po-summary.csv"',
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app/reports/po-summary
git commit -m "feat(reports): PO summary report page + CSV export"
```

---

## Task 8: Spend by Supplier Report

**Goal:** Build `/app/reports/spend-by-supplier` — horizontal bar chart + table of supplier spend in the period.

**Files:**
- Create: `src/app/app/reports/spend-by-supplier/page.tsx`
- Create: `src/app/app/reports/spend-by-supplier/export/route.ts`

**Acceptance Criteria:**
- [ ] Stat cards: total spend, supplier count, largest single supplier spend
- [ ] Horizontal bar chart shows spend per supplier sorted descending
- [ ] Table shows Supplier, POs in period, Total spend, % of total spend, Avg PO value
- [ ] CSV export works

**Verify:** Navigate to `/app/reports/spend-by-supplier` — chart and table render

**Steps:**

- [ ] **Step 1: Create `page.tsx`**

```tsx
// src/app/app/reports/spend-by-supplier/page.tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../_lib/date-range";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { ReportChart } from "../_components/report-chart";
import { ReportTable } from "../_components/report-table";
import type { TableColumn } from "../_components/report-table";

interface Row {
  id: string;
  supplier: string;
  poCount: number;
  totalSpend: number;
  pct: number;
  avgPOValue: number;
}

export default async function SpendBySupplierPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) redirect("/login");

  const range = resolveDateRange(sp, 90);

  const { data } = await supabase
    .from("purchase_order")
    .select(
      "id,supplier_id,supplier:supplier_id(name),lines:purchase_order_line(quantity,unit_cost)"
    )
    .not("status", "eq", "cancelled")
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString());

  // Aggregate by supplier
  const bySupplier: Record<string, { name: string; pos: number; spend: number }> = {};
  for (const po of data ?? []) {
    const sid = po.supplier_id;
    const name = (po.supplier as { name: string } | null)?.name ?? "Unknown";
    const lines = po.lines as { quantity: number; unit_cost: number }[] ?? [];
    const value = lines.reduce((s, l) => s + l.quantity * (l.unit_cost ?? 0), 0);
    if (!bySupplier[sid]) bySupplier[sid] = { name, pos: 0, spend: 0 };
    bySupplier[sid].pos += 1;
    bySupplier[sid].spend += value;
  }

  const totalSpend = Object.values(bySupplier).reduce((s, v) => s + v.spend, 0);
  const supplierCount = Object.keys(bySupplier).length;
  const largestSpend = Math.max(...Object.values(bySupplier).map((v) => v.spend), 0);

  const rows: Row[] = Object.entries(bySupplier)
    .map(([id, v]) => ({
      id,
      supplier: v.name,
      poCount: v.pos,
      totalSpend: v.spend,
      pct: totalSpend > 0 ? (v.spend / totalSpend) * 100 : 0,
      avgPOValue: v.pos > 0 ? v.spend / v.pos : 0,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);

  const chartData = rows.map((r) => ({ supplier: r.supplier, spend: Math.round(r.totalSpend) }));

  const fmt = (n: number) =>
    n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

  const columns: TableColumn<Row>[] = [
    { key: "supplier", header: "Supplier", render: (r) => r.supplier },
    { key: "poCount", header: "POs in period", align: "right", render: (r) => r.poCount },
    { key: "totalSpend", header: "Total spend", align: "right", render: (r) => fmt(r.totalSpend) },
    { key: "pct", header: "% of total", align: "right", render: (r) => `${r.pct.toFixed(1)}%` },
    { key: "avgPO", header: "Avg PO value", align: "right", render: (r) => fmt(r.avgPOValue) },
  ];

  return (
    <ReportShell
      eyebrow="Purchasing"
      title="Spend by supplier"
      description="Purchasing spend broken down by supplier for the selected period."
      csvSlug="spend-by-supplier"
      searchParams={sp}
    >
      <ReportStatCards
        cards={[
          { label: "Total spend", value: fmt(totalSpend) },
          { label: "Suppliers", value: supplierCount },
          { label: "Largest supplier", value: fmt(largestSpend) },
        ]}
      />
      {chartData.length > 0 && (
        <ReportChart
          type="bar"
          layout="horizontal"
          title="Spend per supplier"
          data={chartData}
          xKey="supplier"
          series={[{ dataKey: "spend", color: "#818cf8", name: "Spend" }]}
        />
      )}
      <ReportTable columns={columns} rows={rows} rowKey={(r) => r.id} />
    </ReportShell>
  );
}
```

- [ ] **Step 2: Create `export/route.ts`**

```ts
// src/app/app/reports/spend-by-supplier/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../../_lib/date-range";

export async function GET(req: NextRequest) {
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) return new NextResponse("Unauthorized", { status: 401 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const range = resolveDateRange(sp, 90);

  const { data } = await supabase
    .from("purchase_order")
    .select("supplier_id,supplier:supplier_id(name),lines:purchase_order_line(quantity,unit_cost)")
    .not("status", "eq", "cancelled")
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString());

  const bySupplier: Record<string, { name: string; pos: number; spend: number }> = {};
  for (const po of data ?? []) {
    const sid = po.supplier_id;
    const name = (po.supplier as { name: string } | null)?.name ?? "Unknown";
    const lines = po.lines as { quantity: number; unit_cost: number }[] ?? [];
    const value = lines.reduce((s, l) => s + l.quantity * (l.unit_cost ?? 0), 0);
    if (!bySupplier[sid]) bySupplier[sid] = { name, pos: 0, spend: 0 };
    bySupplier[sid].pos += 1;
    bySupplier[sid].spend += value;
  }

  const totalSpend = Object.values(bySupplier).reduce((s, v) => s + v.spend, 0);
  const rows = Object.values(bySupplier).sort((a, b) => b.spend - a.spend);

  const headers = ["Supplier", "POs in Period", "Total Spend", "% of Total", "Avg PO Value"];
  const lines = rows.map((r) =>
    [
      r.name,
      r.pos,
      r.spend.toFixed(2),
      totalSpend > 0 ? ((r.spend / totalSpend) * 100).toFixed(1) + "%" : "0.0%",
      (r.pos > 0 ? r.spend / r.pos : 0).toFixed(2),
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = [headers.join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="spend-by-supplier.csv"',
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app/reports/spend-by-supplier
git commit -m "feat(reports): spend by supplier report page + CSV export"
```

---

## Task 9: Lead Time Accuracy Report

**Goal:** Build `/app/reports/lead-time-accuracy` — on-time delivery performance per supplier.

**Files:**
- Create: `src/app/app/reports/lead-time-accuracy/page.tsx`
- Create: `src/app/app/reports/lead-time-accuracy/export/route.ts`

**Acceptance Criteria:**
- [ ] Stat cards: overall on-time %, suppliers with < 80% accuracy (red if > 0), total receipts in period
- [ ] Table shows Supplier, POs received, On time, Late, Accuracy %, Avg days late
- [ ] Red variant on accuracy stat card when < 80%
- [ ] CSV export works

**Verify:** Navigate to `/app/reports/lead-time-accuracy` — table renders; red stat card when accuracy is low

**Steps:**

- [ ] **Step 1: Create `page.tsx`**

```tsx
// src/app/app/reports/lead-time-accuracy/page.tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../_lib/date-range";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { ReportTable } from "../_components/report-table";
import type { TableColumn } from "../_components/report-table";

interface Row {
  id: string;
  supplier: string;
  received: number;
  onTime: number;
  late: number;
  accuracyPct: number;
  avgDaysLate: number;
}

export default async function LeadTimeAccuracyPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) redirect("/login");

  const range = resolveDateRange(sp, 90);

  const { data } = await supabase
    .from("delivery_receipt")
    .select(
      "id,received_at," +
      "purchase_order:purchase_order_id(expected_date,supplier:supplier_id(id,name))"
    )
    .not("purchase_order_id", "is", null)
    .gte("received_at", range.from.toISOString())
    .lte("received_at", range.to.toISOString());

  type SupplierAgg = { name: string; received: number; onTime: number; lateDaysTotal: number };
  const bySupplier: Record<string, SupplierAgg> = {};

  for (const receipt of data ?? []) {
    const po = receipt.purchase_order as {
      expected_date: string | null;
      supplier: { id: string; name: string } | null;
    } | null;
    if (!po?.supplier) continue;
    const sid = po.supplier.id;
    if (!bySupplier[sid]) bySupplier[sid] = { name: po.supplier.name, received: 0, onTime: 0, lateDaysTotal: 0 };
    bySupplier[sid].received += 1;
    if (po.expected_date) {
      const daysLate = Math.floor(
        (new Date(receipt.received_at).getTime() - new Date(po.expected_date).getTime()) /
          (24 * 60 * 60 * 1000)
      );
      if (daysLate <= 0) bySupplier[sid].onTime += 1;
      else bySupplier[sid].lateDaysTotal += daysLate;
    } else {
      bySupplier[sid].onTime += 1;
    }
  }

  const rows: Row[] = Object.entries(bySupplier)
    .map(([id, v]) => {
      const late = v.received - v.onTime;
      return {
        id,
        supplier: v.name,
        received: v.received,
        onTime: v.onTime,
        late,
        accuracyPct: v.received > 0 ? Math.round((v.onTime / v.received) * 100) : 100,
        avgDaysLate: late > 0 ? Math.round(v.lateDaysTotal / late) : 0,
      };
    })
    .sort((a, b) => a.accuracyPct - b.accuracyPct);

  const totalReceipts = rows.reduce((s, r) => s + r.received, 0);
  const totalOnTime = rows.reduce((s, r) => s + r.onTime, 0);
  const overallPct = totalReceipts > 0 ? Math.round((totalOnTime / totalReceipts) * 100) : 100;
  const poorSuppliers = rows.filter((r) => r.accuracyPct < 80).length;

  const columns: TableColumn<Row>[] = [
    { key: "supplier", header: "Supplier", render: (r) => r.supplier },
    { key: "received", header: "POs received", align: "right", render: (r) => r.received },
    { key: "onTime", header: "On time", align: "right", render: (r) => <span style={{ color: "#16a34a" }}>{r.onTime}</span> },
    { key: "late", header: "Late", align: "right", render: (r) => <span style={{ color: r.late > 0 ? "#dc2626" : "var(--ink-muted)" }}>{r.late}</span> },
    {
      key: "accuracy",
      header: "Accuracy %",
      align: "right",
      render: (r) => (
        <span style={{ color: r.accuracyPct < 80 ? "#dc2626" : r.accuracyPct >= 95 ? "#16a34a" : "var(--ink-strong)", fontWeight: 600 }}>
          {r.accuracyPct}%
        </span>
      ),
    },
    {
      key: "avgLate",
      header: "Avg days late",
      align: "right",
      render: (r) => r.avgDaysLate > 0 ? <span style={{ color: "#d97706" }}>{r.avgDaysLate}d</span> : "—",
    },
  ];

  return (
    <ReportShell
      eyebrow="Purchasing"
      title="Lead time accuracy"
      description="On-time delivery performance by supplier."
      csvSlug="lead-time-accuracy"
      searchParams={sp}
    >
      <ReportStatCards
        cards={[
          {
            label: "Overall on-time %",
            value: `${overallPct}%`,
            variant: overallPct < 80 ? "red" : overallPct >= 95 ? "green" : "default",
          },
          {
            label: "Suppliers < 80% accuracy",
            value: poorSuppliers,
            variant: poorSuppliers > 0 ? "red" : "default",
          },
          { label: "Total receipts in period", value: totalReceipts },
        ]}
      />
      <ReportTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        emptyMessage="No delivery receipts in this period."
      />
    </ReportShell>
  );
}
```

- [ ] **Step 2: Create `export/route.ts`**

```ts
// src/app/app/reports/lead-time-accuracy/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../../_lib/date-range";

export async function GET(req: NextRequest) {
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) return new NextResponse("Unauthorized", { status: 401 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const range = resolveDateRange(sp, 90);

  const { data } = await supabase
    .from("delivery_receipt")
    .select("id,received_at,purchase_order:purchase_order_id(expected_date,supplier:supplier_id(id,name))")
    .not("purchase_order_id", "is", null)
    .gte("received_at", range.from.toISOString())
    .lte("received_at", range.to.toISOString());

  type Agg = { name: string; received: number; onTime: number; lateDays: number };
  const bySupplier: Record<string, Agg> = {};

  for (const r of data ?? []) {
    const po = r.purchase_order as { expected_date: string | null; supplier: { id: string; name: string } | null } | null;
    if (!po?.supplier) continue;
    const sid = po.supplier.id;
    if (!bySupplier[sid]) bySupplier[sid] = { name: po.supplier.name, received: 0, onTime: 0, lateDays: 0 };
    bySupplier[sid].received += 1;
    if (po.expected_date) {
      const days = Math.floor((new Date(r.received_at).getTime() - new Date(po.expected_date).getTime()) / (24 * 60 * 60 * 1000));
      if (days <= 0) bySupplier[sid].onTime += 1;
      else bySupplier[sid].lateDays += days;
    } else {
      bySupplier[sid].onTime += 1;
    }
  }

  const headers = ["Supplier", "POs Received", "On Time", "Late", "Accuracy %", "Avg Days Late"];
  const lines = Object.values(bySupplier).sort((a, b) => a.onTime / (a.received||1) - b.onTime / (b.received||1)).map((v) => {
    const late = v.received - v.onTime;
    const accuracy = v.received > 0 ? Math.round((v.onTime / v.received) * 100) : 100;
    const avgLate = late > 0 ? Math.round(v.lateDays / late) : 0;
    return [v.name, v.received, v.onTime, late, `${accuracy}%`, avgLate]
      .map((x) => `"${String(x).replace(/"/g, '""')}"`)
      .join(",");
  });

  const csv = [headers.join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="lead-time-accuracy.csv"',
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app/reports/lead-time-accuracy
git commit -m "feat(reports): lead time accuracy report page + CSV export"
```

---

## Task 10: PO Quantity Variance Report

**Goal:** Build `/app/reports/po-variance` — delivery receipt lines where quantity delivered ≠ expected.

**Files:**
- Create: `src/app/app/reports/po-variance/page.tsx`
- Create: `src/app/app/reports/po-variance/export/route.ts`

**Acceptance Criteria:**
- [ ] Stat cards: variance lines (amber if > 0), total over-received qty, total under-received qty
- [ ] Table shows PO #, Supplier, Component, Ordered qty, Received qty, Variance, Variance %
- [ ] CSV export works

**Verify:** Navigate to `/app/reports/po-variance` — amber stat cards when discrepancies exist

**Steps:**

- [ ] **Step 1: Create `page.tsx`**

```tsx
// src/app/app/reports/po-variance/page.tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../_lib/date-range";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { ReportTable } from "../_components/report-table";
import type { TableColumn } from "../_components/report-table";

interface Row {
  id: string;
  poNumber: string;
  supplier: string;
  component: string;
  ordered: number;
  received: number;
  variance: number;
  variancePct: number;
}

export default async function POVariancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) redirect("/login");

  const range = resolveDateRange(sp, 90);

  const { data } = await supabase
    .from("delivery_receipt_line")
    .select(
      "id,quantity_delivered,quantity_expected," +
      "component:component_id(name)," +
      "delivery_receipt:delivery_receipt_id(received_at," +
        "purchase_order:purchase_order_id(id,supplier:supplier_id(name)))"
    )
    .not("quantity_expected", "is", null)
    .gte("delivery_receipt.received_at", range.from.toISOString())
    .lte("delivery_receipt.received_at", range.to.toISOString());

  const rows: Row[] = ((data ?? []) as unknown[])
    .map((line: unknown) => {
      const l = line as {
        id: string;
        quantity_delivered: number;
        quantity_expected: number;
        component: { name: string } | null;
        delivery_receipt: {
          purchase_order: { id: string; supplier: { name: string } | null } | null;
        } | null;
      };
      const variance = l.quantity_delivered - l.quantity_expected;
      if (variance === 0) return null;
      return {
        id: l.id,
        poNumber: l.delivery_receipt?.purchase_order?.id?.slice(0, 8).toUpperCase() ?? "—",
        supplier: l.delivery_receipt?.purchase_order?.supplier?.name ?? "—",
        component: l.component?.name ?? "—",
        ordered: l.quantity_expected,
        received: l.quantity_delivered,
        variance,
        variancePct: l.quantity_expected > 0
          ? Math.round((variance / l.quantity_expected) * 100)
          : 0,
      };
    })
    .filter((r): r is Row => r !== null);

  const overReceived = rows
    .filter((r) => r.variance > 0)
    .reduce((s, r) => s + r.variance, 0);
  const underReceived = Math.abs(
    rows.filter((r) => r.variance < 0).reduce((s, r) => s + r.variance, 0)
  );

  const columns: TableColumn<Row>[] = [
    { key: "poNumber", header: "PO #", render: (r) => r.poNumber },
    { key: "supplier", header: "Supplier", render: (r) => r.supplier },
    { key: "component", header: "Component", render: (r) => r.component },
    { key: "ordered", header: "Ordered", align: "right", render: (r) => r.ordered.toLocaleString() },
    { key: "received", header: "Received", align: "right", render: (r) => r.received.toLocaleString() },
    {
      key: "variance",
      header: "Variance",
      align: "right",
      render: (r) => (
        <span style={{ color: r.variance > 0 ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
          {r.variance > 0 ? `+${r.variance}` : r.variance}
        </span>
      ),
    },
    {
      key: "variancePct",
      header: "Variance %",
      align: "right",
      render: (r) => (
        <span style={{ color: r.variance > 0 ? "#16a34a" : "#dc2626" }}>
          {r.variancePct > 0 ? "+" : ""}{r.variancePct}%
        </span>
      ),
    },
  ];

  return (
    <ReportShell
      eyebrow="Purchasing"
      title="PO quantity variance"
      description="Delivery receipt lines where received quantity differs from ordered."
      csvSlug="po-variance"
      searchParams={sp}
    >
      <ReportStatCards
        cards={[
          { label: "Variance lines", value: rows.length, variant: rows.length > 0 ? "amber" : "default" },
          { label: "Total over-received", value: `+${overReceived.toLocaleString()}`, variant: overReceived > 0 ? "green" : "default" },
          { label: "Total under-received", value: `−${underReceived.toLocaleString()}`, variant: underReceived > 0 ? "red" : "default" },
        ]}
      />
      <ReportTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        emptyMessage="No quantity variances in this period."
      />
    </ReportShell>
  );
}
```

- [ ] **Step 2: Create `export/route.ts`**

```ts
// src/app/app/reports/po-variance/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../../_lib/date-range";

export async function GET(req: NextRequest) {
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) return new NextResponse("Unauthorized", { status: 401 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const range = resolveDateRange(sp, 90);

  const { data } = await supabase
    .from("delivery_receipt_line")
    .select("id,quantity_delivered,quantity_expected,component:component_id(name),delivery_receipt:delivery_receipt_id(received_at,purchase_order:purchase_order_id(id,supplier:supplier_id(name)))")
    .not("quantity_expected", "is", null)
    .gte("delivery_receipt.received_at", range.from.toISOString())
    .lte("delivery_receipt.received_at", range.to.toISOString());

  const rows = ((data ?? []) as unknown[])
    .map((line: unknown) => {
      const l = line as { id: string; quantity_delivered: number; quantity_expected: number; component: { name: string } | null; delivery_receipt: { purchase_order: { id: string; supplier: { name: string } | null } | null } | null };
      const variance = l.quantity_delivered - l.quantity_expected;
      if (variance === 0) return null;
      return {
        poNumber: l.delivery_receipt?.purchase_order?.id?.slice(0, 8).toUpperCase() ?? "",
        supplier: l.delivery_receipt?.purchase_order?.supplier?.name ?? "",
        component: l.component?.name ?? "",
        ordered: l.quantity_expected,
        received: l.quantity_delivered,
        variance,
        variancePct: l.quantity_expected > 0 ? Math.round((variance / l.quantity_expected) * 100) : 0,
      };
    })
    .filter(Boolean) as { poNumber: string; supplier: string; component: string; ordered: number; received: number; variance: number; variancePct: number }[];

  const headers = ["PO #", "Supplier", "Component", "Ordered", "Received", "Variance", "Variance %"];
  const lines = rows.map((r) =>
    [r.poNumber, r.supplier, r.component, r.ordered, r.received, r.variance, `${r.variancePct}%`]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = [headers.join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="po-variance.csv"',
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app/reports/po-variance
git commit -m "feat(reports): PO quantity variance report page + CSV export"
```

---

## Task 11: Inventory Integrity Report

**Goal:** Migrate the existing integrity audit from the old hub page to its own dedicated `/app/reports/inventory-integrity` page.

**Files:**
- Create: `src/app/app/reports/inventory-integrity/page.tsx`
- Create: `src/app/app/reports/inventory-integrity/export/route.ts`

**Acceptance Criteria:**
- [ ] Stat cards: total issues (red if > 0), invariant issues, reconciliation drifts, duplicate allocations, PO over-receipts
- [ ] Table shows all issue rows from `loadInventoryIntegrityAudit` — Type, Component, Description
- [ ] No date range picker (integrity is always current state) — `hideDateRange` prop set
- [ ] CSV export works

**Verify:** Navigate to `/app/reports/inventory-integrity` — no date presets shown; green "✓ Healthy" or red issues

**Steps:**

- [ ] **Step 1: Create `page.tsx`**

```tsx
// src/app/app/reports/inventory-integrity/page.tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { loadInventoryIntegrityAudit } from "@/lib/inventory/audit";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { ReportTable, Badge } from "../_components/report-table";
import type { TableColumn, BadgeVariant } from "../_components/report-table";

type AuditClient = Parameters<typeof loadInventoryIntegrityAudit>[0];

interface Row {
  id: string;
  type: string;
  component: string;
  description: string;
}

const TYPE_VARIANT: Record<string, BadgeVariant> = {
  invariant: "red",
  reconciliation: "amber",
  duplicate: "amber",
  po_over_receipt: "amber",
};

export default async function InventoryIntegrityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) redirect("/login");

  const audit = await loadInventoryIntegrityAudit(
    supabase as unknown as AuditClient,
    tenantId
  );

  const rows: Row[] = [
    ...audit.invariantIssues.map((issue, i) => ({
      id: `inv-${i}`,
      type: "invariant",
      component: issue.componentId ?? "—",
      description: issue.message ?? JSON.stringify(issue),
    })),
    ...audit.reconciliationIssues.map((issue, i) => ({
      id: `rec-${i}`,
      type: "reconciliation",
      component: issue.componentId ?? "—",
      description: issue.message ?? JSON.stringify(issue),
    })),
    ...audit.duplicateAllocationKeys.map((key, i) => ({
      id: `dup-${i}`,
      type: "duplicate",
      component: "—",
      description: `Duplicate allocation key: ${String(key)}`,
    })),
    ...audit.poOverReceipt.map((issue, i) => ({
      id: `por-${i}`,
      type: "po_over_receipt",
      component: issue.componentId ?? "—",
      description: issue.message ?? JSON.stringify(issue),
    })),
  ];

  const totalIssues = rows.length;

  const columns: TableColumn<Row>[] = [
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <Badge variant={TYPE_VARIANT[r.type] ?? "gray"}>
          {r.type.replace("_", " ")}
        </Badge>
      ),
    },
    { key: "component", header: "Component", render: (r) => r.component },
    { key: "description", header: "Description", render: (r) => r.description },
  ];

  return (
    <ReportShell
      eyebrow="System"
      title="Inventory integrity"
      description="Real-time audit of inventory invariants, reconciliation, and allocation state."
      csvSlug="inventory-integrity"
      searchParams={sp}
      hideDateRange
    >
      <ReportStatCards
        cards={[
          {
            label: "Total issues",
            value: totalIssues === 0 ? "✓ Healthy" : totalIssues,
            variant: totalIssues > 0 ? "red" : "green",
          },
          { label: "Invariant issues", value: audit.invariantIssues.length, variant: audit.invariantIssues.length > 0 ? "red" : "default" },
          { label: "Reconciliation drifts", value: audit.reconciliationIssues.length, variant: audit.reconciliationIssues.length > 0 ? "amber" : "default" },
          { label: "PO over-receipts", value: audit.poOverReceipt.length, variant: audit.poOverReceipt.length > 0 ? "amber" : "default" },
        ]}
      />
      {totalIssues === 0 ? (
        <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>
          No integrity issues found. All invariants pass.
        </p>
      ) : (
        <ReportTable columns={columns} rows={rows} rowKey={(r) => r.id} />
      )}
    </ReportShell>
  );
}
```

**Note on audit shape:** `loadInventoryIntegrityAudit` returns `{ invariantIssues, reconciliationIssues, duplicateAllocationKeys, poOverReceipt }`. Each array element's exact shape depends on `src/lib/inventory/audit.ts` — if elements don't have `componentId` or `message` properties, adjust the mapping in the page to match what the function actually returns. Check the file before implementing.

- [ ] **Step 2: Create `export/route.ts`**

```ts
// src/app/app/reports/inventory-integrity/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { loadInventoryIntegrityAudit } from "@/lib/inventory/audit";

type AuditClient = Parameters<typeof loadInventoryIntegrityAudit>[0];

export async function GET(_req: NextRequest) {
  const { supabase, tenantId } = await getServerTenantContext();
  if (!tenantId) return new NextResponse("Unauthorized", { status: 401 });

  const audit = await loadInventoryIntegrityAudit(
    supabase as unknown as AuditClient,
    tenantId
  );

  const rows = [
    ...audit.invariantIssues.map((i) => ({ type: "invariant", component: (i as Record<string,unknown>).componentId ?? "—", description: (i as Record<string,unknown>).message ?? JSON.stringify(i) })),
    ...audit.reconciliationIssues.map((i) => ({ type: "reconciliation", component: (i as Record<string,unknown>).componentId ?? "—", description: (i as Record<string,unknown>).message ?? JSON.stringify(i) })),
    ...audit.duplicateAllocationKeys.map((k) => ({ type: "duplicate", component: "—", description: `Duplicate allocation key: ${String(k)}` })),
    ...audit.poOverReceipt.map((i) => ({ type: "po_over_receipt", component: (i as Record<string,unknown>).componentId ?? "—", description: (i as Record<string,unknown>).message ?? JSON.stringify(i) })),
  ];

  const headers = ["Type", "Component", "Description"];
  const lines = rows.map((r) =>
    [r.type, String(r.component), String(r.description)]
      .map((v) => `"${v.replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = [headers.join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="inventory-integrity.csv"',
    },
  });
}
```

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
git add src/app/app/reports/inventory-integrity
git commit -m "feat(reports): inventory integrity dedicated page + CSV export"
```



