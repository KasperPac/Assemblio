# Orders Table: Filter, Sort, Paginate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the orders table server-side filterable, sortable, and paginated against the full dataset.

**Architecture:** A Postgres RPC `list_orders` does all filtering/sorting (including by summed total)/pagination in SQL and returns the page rows + a total count. The orders page is URL-driven: it parses search params via a tested pure helper, calls the RPC, computes pipeline pills only for the visible rows, and renders a filter bar, sortable headers, and prev/next pagination.

**Tech Stack:** Next.js 15 App Router (Server + Client Components), Supabase Postgres (RPC + RLS), TypeScript, Vitest. Spec: `docs/superpowers/specs/2026-06-04-orders-table-query-design.md`.

---

### Task 1: `parseOrdersQuery` helper (pure, TDD)

**Files:**
- Create: `src/lib/orders/orders-query.ts`
- Test: `src/lib/orders/orders-query.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { parseOrdersQuery, ORDER_SORT_KEYS } from "./orders-query";

describe("parseOrdersQuery", () => {
  it("applies defaults for empty input", () => {
    const q = parseOrdersQuery({});
    expect(q).toMatchObject({
      search: null, status: null, source: null, historical: "all",
      dateFrom: null, dateTo: null, sort: "order_date", dir: "desc",
      page: 1, pageSize: 25, limit: 25, offset: 0,
    });
  });

  it("whitelists sort and falls back to order_date", () => {
    expect(parseOrdersQuery({ sort: "total" }).sort).toBe("total");
    expect(parseOrdersQuery({ sort: "drop_table" }).sort).toBe("order_date");
    expect(ORDER_SORT_KEYS).toContain("order_date");
  });

  it("validates dir and historical", () => {
    expect(parseOrdersQuery({ dir: "asc" }).dir).toBe("asc");
    expect(parseOrdersQuery({ dir: "sideways" }).dir).toBe("desc");
    expect(parseOrdersQuery({ historical: "hide" }).historical).toBe("hide");
    expect(parseOrdersQuery({ historical: "weird" }).historical).toBe("all");
  });

  it("clamps page and computes offset", () => {
    expect(parseOrdersQuery({ page: "3" })).toMatchObject({ page: 3, offset: 50 });
    expect(parseOrdersQuery({ page: "0" }).page).toBe(1);
    expect(parseOrdersQuery({ page: "-5" }).page).toBe(1);
    expect(parseOrdersQuery({ page: "abc" }).page).toBe(1);
  });

  it("normalizes empty-string filters to null and trims search", () => {
    expect(parseOrdersQuery({ search: "  ", status: "" })).toMatchObject({
      search: null, status: null,
    });
    expect(parseOrdersQuery({ search: "  PO-123 " }).search).toBe("PO-123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/orders/orders-query.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
export const ORDER_SORT_KEYS = [
  "order_date",
  "order_number",
  "customer_email",
  "status",
  "target_ship_date",
  "total",
] as const;
export type OrderSortKey = (typeof ORDER_SORT_KEYS)[number];

export type HistoricalFilter = "all" | "only" | "hide";

export type OrdersQuery = {
  search: string | null;
  status: string | null;
  source: string | null;
  historical: HistoricalFilter;
  dateFrom: string | null;
  dateTo: string | null;
  sort: OrderSortKey;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
};

const PAGE_SIZE = 25;

function clean(v: string | undefined | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function parseOrdersQuery(
  sp: Record<string, string | undefined>
): OrdersQuery {
  const sortRaw = clean(sp.sort);
  const sort: OrderSortKey =
    sortRaw && (ORDER_SORT_KEYS as readonly string[]).includes(sortRaw)
      ? (sortRaw as OrderSortKey)
      : "order_date";

  const dir = clean(sp.dir) === "asc" ? "asc" : "desc";

  const histRaw = clean(sp.historical);
  const historical: HistoricalFilter =
    histRaw === "only" || histRaw === "hide" ? histRaw : "all";

  const pageNum = Number.parseInt(sp.page ?? "", 10);
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1;

  return {
    search: clean(sp.search),
    status: clean(sp.status),
    source: clean(sp.source),
    historical,
    dateFrom: clean(sp.dateFrom),
    dateTo: clean(sp.dateTo),
    sort,
    dir,
    page,
    pageSize: PAGE_SIZE,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/orders/orders-query.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/orders/orders-query.ts src/lib/orders/orders-query.test.ts
git commit -m "feat(orders): parseOrdersQuery — whitelist/clamp orders table query params"
```

---

### Task 2: `list_orders` RPC

**Files:**
- Create: `supabase/patches/list_orders_rpc.sql`

> The controller applies this to prod via Supabase MCP and verifies — the implementer only writes the file and commits it. Do NOT run DB commands.

- [ ] **Step 1: Write the RPC SQL**

Create `supabase/patches/list_orders_rpc.sql`:

```sql
-- Server-side filter/sort/paginate for the orders table. SECURITY INVOKER so the
-- caller's RLS on orders/order_line applies; p_tenant_id is belt-and-suspenders.
create or replace function public.list_orders(
  p_tenant_id  uuid,
  p_search     text default null,
  p_status     text default null,
  p_source     text default null,
  p_historical text default 'all',   -- 'all' | 'only' | 'hide'
  p_date_from  date default null,
  p_date_to    date default null,
  p_sort       text default 'order_date',
  p_dir        text default 'desc',
  p_limit      int  default 25,
  p_offset     int  default 0
)
returns table (
  id uuid,
  order_number text,
  customer_email text,
  status text,
  source text,
  target_ship_date timestamptz,
  shopify_processed_at timestamptz,
  shopify_created_at timestamptz,
  fulfilled_at timestamptz,
  historical boolean,
  order_total numeric,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      o.id, o.order_number, o.customer_email, o.status, o.source,
      o.target_ship_date, o.shopify_processed_at, o.shopify_created_at,
      o.fulfilled_at, o.historical,
      coalesce(ol.total, 0) as order_total,
      coalesce(o.shopify_processed_at, o.shopify_created_at) as order_date
    from public.orders o
    left join (
      select order_id, sum(line_sell_price) as total
      from public.order_line
      where tenant_id = p_tenant_id
      group by order_id
    ) ol on ol.order_id = o.id
    where o.tenant_id = p_tenant_id
      and (p_search is null or p_search = ''
           or o.order_number ilike '%' || p_search || '%'
           or o.customer_email ilike '%' || p_search || '%')
      and (p_status is null or o.status = p_status)
      and (p_source is null or o.source = p_source)
      and (p_historical = 'all'
           or (p_historical = 'only' and o.historical)
           or (p_historical = 'hide' and not o.historical))
      and (p_date_from is null
           or coalesce(o.shopify_processed_at, o.shopify_created_at) >= p_date_from)
      and (p_date_to is null
           or coalesce(o.shopify_processed_at, o.shopify_created_at) < (p_date_to + 1))
  )
  select
    id, order_number, customer_email, status, source, target_ship_date,
    shopify_processed_at, shopify_created_at, fulfilled_at, historical, order_total,
    count(*) over() as total_count
  from base
  order by
    case when p_sort = 'order_number'     and p_dir = 'asc'  then order_number end asc nulls last,
    case when p_sort = 'order_number'     and p_dir = 'desc' then order_number end desc nulls last,
    case when p_sort = 'customer_email'   and p_dir = 'asc'  then customer_email end asc nulls last,
    case when p_sort = 'customer_email'   and p_dir = 'desc' then customer_email end desc nulls last,
    case when p_sort = 'status'           and p_dir = 'asc'  then status end asc nulls last,
    case when p_sort = 'status'           and p_dir = 'desc' then status end desc nulls last,
    case when p_sort = 'target_ship_date' and p_dir = 'asc'  then target_ship_date end asc nulls last,
    case when p_sort = 'target_ship_date' and p_dir = 'desc' then target_ship_date end desc nulls last,
    case when p_sort = 'total'            and p_dir = 'asc'  then order_total end asc nulls last,
    case when p_sort = 'total'            and p_dir = 'desc' then order_total end desc nulls last,
    -- default + order_date
    case when p_sort = 'order_date'       and p_dir = 'asc'  then order_date end asc nulls last,
    case when p_sort not in ('order_number','customer_email','status','target_ship_date','total')
              or p_dir = 'desc' then order_date end desc nulls last,
    id
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;
```

> Note: the trailing `order_date desc` branch also serves as the fallback for any
> unrecognized `p_sort`, and `id` is the stable tiebreaker.

- [ ] **Step 2: Commit**

```bash
git add supabase/patches/list_orders_rpc.sql
git commit -m "feat(db): list_orders RPC — filter/sort/paginate orders with totals"
```

---

### Task 3: Sortable header + pagination client components

**Files:**
- Create: `src/app/app/orders/_components/sortable-header.tsx`
- Create: `src/app/app/orders/_components/orders-pagination.tsx`

- [ ] **Step 1: Write `sortable-header.tsx`**

A header cell that links to the same page with `sort`/`dir` updated (toggles dir
if already the active sort), preserving other params and resetting `page` to 1.

```tsx
"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "../orders.module.css";

export default function SortableHeader({
  label, sortKey, className,
}: { label: string; sortKey: string; className?: string }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const activeSort = sp.get("sort") ?? "order_date";
  const activeDir = sp.get("dir") ?? "desc";
  const isActive = activeSort === sortKey;
  const nextDir = isActive && activeDir === "asc" ? "desc" : "asc";

  const params = new URLSearchParams(sp.toString());
  params.set("sort", sortKey);
  params.set("dir", isActive ? nextDir : "asc");
  params.set("page", "1");

  return (
    <th className={className}>
      <Link href={`${pathname}?${params.toString()}`} className={styles.sortLink}>
        {label}
        <span className={styles.sortIndicator}>
          {isActive ? (activeDir === "asc" ? " ▲" : " ▼") : ""}
        </span>
      </Link>
    </th>
  );
}
```

- [ ] **Step 2: Write `orders-pagination.tsx`**

```tsx
"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "../orders.module.css";

export default function OrdersPagination({
  page, pageSize, total,
}: { page: number; pageSize: number; total: number }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const href = (p: number) => {
    const params = new URLSearchParams(sp.toString());
    params.set("page", String(p));
    return `${pathname}?${params.toString()}`;
  };

  return (
    <div className={styles.pagination}>
      <span className={styles.pageInfo}>
        {from}–{to} of {total}
      </span>
      <div className={styles.pageButtons}>
        {page > 1 ? (
          <Link href={href(page - 1)} className={styles.pageBtn}>← Prev</Link>
        ) : (
          <span className={`${styles.pageBtn} ${styles.pageBtnDisabled}`}>← Prev</span>
        )}
        {page < totalPages ? (
          <Link href={href(page + 1)} className={styles.pageBtn}>Next →</Link>
        ) : (
          <span className={`${styles.pageBtn} ${styles.pageBtnDisabled}`}>Next →</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit -p tsconfig.json` (no new errors outside worktrees). The
`styles.*` classes are added in Task 5; tsc on CSS-module access is fine (typed as any).

```bash
git add src/app/app/orders/_components/sortable-header.tsx src/app/app/orders/_components/orders-pagination.tsx
git commit -m "feat(orders): sortable header + pagination client components"
```

---

### Task 4: Filter bar client component

**Files:**
- Create: `src/app/app/orders/_components/orders-filters.tsx`

- [ ] **Step 1: Write `orders-filters.tsx`**

A client component with: a debounced search input, status + source + historical
selects, and date-from/date-to inputs. Every change writes to the URL (router.replace)
and resets `page` to 1. Reads current values from `useSearchParams` so it stays in sync.

```tsx
"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "../orders.module.css";

export default function OrdersFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [search, setSearch] = useState(sp.get("search") ?? "");

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set("page", "1");
    router.replace(`${pathname}?${params.toString()}`);
  }

  // Debounce the search box → URL.
  useEffect(() => {
    const current = sp.get("search") ?? "";
    if (search === current) return;
    const t = setTimeout(() => setParam("search", search.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className={styles.filterBar}>
      <input
        className={styles.filterSearch}
        type="search"
        placeholder="Search order # or customer"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select className={styles.filterSelect} value={sp.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}>
        <option value="">All statuses</option>
        <option value="open">Open</option>
        <option value="fulfilled">Fulfilled</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <select className={styles.filterSelect} value={sp.get("source") ?? ""}
        onChange={(e) => setParam("source", e.target.value)}>
        <option value="">All sources</option>
        <option value="shopify">Shopify</option>
        <option value="manual">B2B</option>
      </select>
      <select className={styles.filterSelect} value={sp.get("historical") ?? "all"}
        onChange={(e) => setParam("historical", e.target.value)}>
        <option value="all">All orders</option>
        <option value="hide">Hide historical</option>
        <option value="only">Only historical</option>
      </select>
      <input className={styles.filterDate} type="date" aria-label="Order date from"
        value={sp.get("dateFrom") ?? ""} onChange={(e) => setParam("dateFrom", e.target.value)} />
      <input className={styles.filterDate} type="date" aria-label="Order date to"
        value={sp.get("dateTo") ?? ""} onChange={(e) => setParam("dateTo", e.target.value)} />
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit -p tsconfig.json` and `npx eslint src/app/app/orders/_components/orders-filters.tsx`.
Expected: clean.

```bash
git add src/app/app/orders/_components/orders-filters.tsx
git commit -m "feat(orders): URL-driven filter bar (search/status/source/date/historical)"
```

---

### Task 5: Rewrite `orders/page.tsx` to use the RPC + new components

**Files:**
- Modify: `src/app/app/orders/page.tsx`
- Modify: `src/app/app/orders/orders.module.css`

- [ ] **Step 1: Add CSS classes**

Append to `orders.module.css`, using design-system tokens only (no hardcoded hex;
follow the existing classes in the file for patterns):

```css
.filterBar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.filterSearch { flex: 1 1 220px; min-width: 180px; }
.filterSelect, .filterDate, .filterSearch {
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-lg);
  background: var(--bg-input);
  color: var(--ink-strong);
  padding: 6px 10px;
  font-size: var(--fs-sm);
}
.sortLink { color: inherit; text-decoration: none; display: inline-flex; align-items: center; }
.sortLink:hover { color: var(--ink-strong); }
.sortIndicator { color: var(--ink-muted); }
.pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.pageInfo { font-size: var(--fs-sm); color: var(--ink-muted); }
.pageButtons { display: flex; gap: 8px; }
.pageBtn {
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  color: var(--ink-strong);
  padding: 6px 12px;
  font-size: var(--fs-sm);
  text-decoration: none;
}
.pageBtnDisabled { color: var(--ink-faint); pointer-events: none; opacity: 0.5; }
```

> If `--bg-input` is not in `C:\dev\manuva-tokens\Manuva Design System\colors_and_type.css`, use `--surface-1`. (It exists as of this writing.)

- [ ] **Step 2: Rewrite the page to call the RPC**

Replace the data-fetch + tab logic in `src/app/app/orders/page.tsx`. Keep the
existing `PageHeader`, `HelpLink`, sync button, the `formatDate`/`formatCurrency`/
`customerLabel`/`sourceChipText` helpers, `StatusBadge` historical badge, the
pipeline pills, and the `getOrdersPipelineRollup` call. Changes:

- Remove `parseTab`/`TAB_LABELS`/`matchesTab`/`counts`/the tab `<nav>` and the
  200-row `.from("orders").select(...)` query.
- Parse params: `const q = parseOrdersQuery(params as Record<string,string|undefined>);`
  (import from `@/lib/orders/orders-query`).
- Call the RPC:

```tsx
  const { data: rows, error } = await supabase.rpc("list_orders", {
    p_tenant_id: tenantId,
    p_search: q.search,
    p_status: q.status,
    p_source: q.source,
    p_historical: q.historical,
    p_date_from: q.dateFrom,
    p_date_to: q.dateTo,
    p_sort: q.sort,
    p_dir: q.dir,
    p_limit: q.limit,
    p_offset: q.offset,
  });
  const orderRows = (rows ?? []) as Array<{
    id: string; order_number: string | null; customer_email: string | null;
    status: string; source: string; target_ship_date: string | null;
    shopify_processed_at: string | null; shopify_created_at: string | null;
    fulfilled_at: string | null; historical: boolean; order_total: number;
    total_count: number;
  }>;
  const total = orderRows[0]?.total_count ?? 0;
```

- Build rollups for the page only:

```tsx
  const { rollups } = await getOrdersPipelineRollup(
    supabase, tenantId,
    orderRows.map((o) => ({ id: o.id, status: o.status, target_ship_date: o.target_ship_date }))
  );
```

- Render: `<OrdersFilters />` above the table; in `<thead>` use `<SortableHeader label="Order date" sortKey="order_date" />` etc. for the sortable columns (Order #→`order_number`, Customer→`customer_email`, Status→`status`, Target ship→`target_ship_date`, Total→`total` with `className={styles.cellRight}`); plain `<th>` for Components/Production/Delivery/Actions. Add an **Order date** cell per row (`formatDate(new Date(o.shopify_processed_at ?? o.shopify_created_at))` or "—"), the Total from `o.order_total` (via `formatCurrency`), and the existing pills via `rollups.get(o.id)`. Keep the Historical badge. Below the table render `<OrdersPagination page={q.page} pageSize={q.pageSize} total={total} />`. Keep an `EmptyState` when `orderRows.length === 0` (with `colSpan` matching the new column count). On `error`, render the existing error EmptyState with `error.message`.

Imports to add:
```tsx
import { parseOrdersQuery } from "@/lib/orders/orders-query";
import OrdersFilters from "./_components/orders-filters";
import SortableHeader from "./_components/sortable-header";
import OrdersPagination from "./_components/orders-pagination";
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p tsconfig.json` (no new errors outside worktrees) and
`npx eslint src/app/app/orders/page.tsx`. Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/orders/page.tsx src/app/app/orders/orders.module.css
git commit -m "feat(orders): server-side filter/sort/paginate via list_orders RPC"
```

---

### Task 6: End-to-end verification (manual, post-deploy)

- [ ] **Step 1:** Controller applies `list_orders` RPC to prod and smoke-tests with sample params (read-only `select * from list_orders('<tenant>', ...)` for each sort + a filter + a page).
- [ ] **Step 2:** After deploy: load `/app/orders`, verify default sort (order date desc), each sortable header toggles asc/desc, each filter narrows results, search works, prev/next pages move and "X–Y of N" is correct, Historical badge + Historical filter behave, and pills render for the page.

---

## Notes for the implementer

- Supabase clients are **untyped**; cast RPC rows as shown.
- `getServerTenantContext()` returns `{ supabase, tenantId, role }` (tenantId may be null for platform operators — the page already non-null-asserts it via `_tenantId!`). Keep the existing redirect guards.
- Follow the existing `orders.module.css` patterns; do not hardcode hex.
- The RPC sort uses CASE-per-column ordering — keep the column list in the
  `not in (...)` fallback in sync with the named sort keys.
