# Live Search (Remove Enter-to-Search) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all list-page search boxes filter live as the user types (300ms debounce) instead of requiring Enter, via one shared client component.

**Architecture:** A new shared client component `SearchInput` owns the debounce and writes the search term to a URL query param via `router.replace`, preserving all other params. The three pages with search (Components, Products, Orders) swap their hand-rolled inputs for it. No server changes — all pages already read search from the URL.

**Tech Stack:** Next.js 15 App Router, `next/navigation` (`useRouter`/`usePathname`/`useSearchParams`), CSS Modules.

**Spec:** `docs/superpowers/specs/2026-06-11-live-search-design.md`

**Testing note:** This repo has no React component test infrastructure (vitest is lib-only; no RTL/jsdom). Verification is `npx tsc --noEmit` against the known baseline (7 pre-existing missing-module errors: @zxing/browser, @zxing/library, qrcode, sanitize-html, plus implicit-any collateral in scan/_components/scanner.tsx) plus manual browser checks. Do not add new test dependencies.

---

### Task 1: Shared SearchInput component

**Goal:** Create the reusable debounced URL-param search input.

**Files:**
- Create: `src/app/app/_ui/search-input.tsx`

**Acceptance Criteria:**
- [ ] Renders an `<input type="search">` seeded from the current URL param value
- [ ] Debounces 300ms, then `router.replace` with the trimmed value set on the given param
- [ ] Deletes the param when the trimmed value is empty
- [ ] Deletes the `page` param on every search change (resets pagination)
- [ ] Preserves all other existing query params
- [ ] Skips navigation when the trimmed value already matches the URL

**Verify:** `npx tsc --noEmit` → only the 7 known baseline errors (zxing/qrcode/sanitize-html/scanner.tsx), no new errors.

**Steps:**

- [ ] **Step 1: Create `src/app/app/_ui/search-input.tsx`**

```tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  /** URL query param to read/write, e.g. "q" or "search". */
  param: string;
  placeholder: string;
  ariaLabel: string;
  className?: string;
};

export default function SearchInput({ param, placeholder, ariaLabel, className }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [value, setValue] = useState(sp.get(param) ?? "");

  // Debounce the search box -> URL.
  useEffect(() => {
    const current = sp.get(param) ?? "";
    const trimmed = value.trim();
    if (trimmed === current) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (trimmed) params.set(param, trimmed);
      else params.delete(param);
      params.delete("page");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      className={className}
      type="search"
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the 7 known baseline errors; nothing referencing `search-input.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/app/app/_ui/search-input.tsx
git commit -m "feat(ui): add shared debounced SearchInput component"
```

---

### Task 2: Components page live search

**Goal:** Replace the Enter-to-search GET form on the Components list with `SearchInput`.

**Files:**
- Modify: `src/app/app/components/page.tsx:159-169` (the `<form className={styles.search} method="get">` block) plus imports at top of file

**Acceptance Criteria:**
- [ ] Typing in the search box filters components without pressing Enter
- [ ] Low Stock tab (`filter=lowstock`) and sort params (`sort`, `dir`) are preserved while searching
- [ ] Clearing the box removes `q` from the URL
- [ ] Hidden inputs are gone

**Verify:** `npx tsc --noEmit` → baseline errors only. Manual: on `/app/components`, type a name — table filters live; switch to Low Stock tab, search again — tab stays active.

**Steps:**

- [ ] **Step 1: Add import in `src/app/app/components/page.tsx`**

Alongside the existing `_ui` imports near the top of the file:

```tsx
import SearchInput from "../_ui/search-input";
```

- [ ] **Step 2: Replace the search form (currently lines 159–169)**

Replace this block:

```tsx
<form className={styles.search} method="get">
  {filterLowStock && <input type="hidden" name="filter" value="lowstock" />}
  {sortCol !== "name" && <input type="hidden" name="sort" value={sortCol} />}
  {sortCol !== "name" && sortDir === "desc" && <input type="hidden" name="dir" value={sortDir} />}
  <input
    name="q"
    defaultValue={params.q ?? ""}
    placeholder="Search by name, SKU, or description"
    aria-label="Search by name, SKU, or description"
  />
</form>
```

with:

```tsx
<div className={styles.search}>
  <SearchInput
    param="q"
    placeholder="Search by name, SKU, or description"
    ariaLabel="Search by name, SKU, or description"
  />
</div>
```

(The `.search` CSS class styles a descendant `input` selector — `components.module.css:201-224` — so the wrapper div keeps the styling working unchanged. Param preservation now comes from `SearchInput` building on the live `useSearchParams`, so the hidden inputs are unnecessary.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: baseline errors only.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/components/page.tsx
git commit -m "feat(components): live search without Enter"
```

---

### Task 3: Products page live search

**Goal:** Convert `ProductFilters` from a GET form to live search + direct param-setting select.

**Files:**
- Modify: `src/app/app/products/product-filters.tsx` (full rewrite, 30 lines)
- Modify: `src/app/app/products/page.tsx:323` (call site drops props)

**Acceptance Criteria:**
- [ ] Typing in the search box filters products without pressing Enter
- [ ] Variant filter select updates results immediately on change (as today) and survives searching
- [ ] No `<form>` remains in `product-filters.tsx`

**Verify:** `npx tsc --noEmit` → baseline errors only. Manual: on `/app/products`, type — list filters live; pick "With variants", then search — filter stays applied.

**Steps:**

- [ ] **Step 1: Rewrite `src/app/app/products/product-filters.tsx`**

Replace the entire file with:

```tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import SearchInput from "../_ui/search-input";
import styles from "./products.module.css";

export default function ProductFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setFilter(value: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("filter", value);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className={styles.filters}>
      <SearchInput
        param="q"
        placeholder="Search by name or SKU"
        ariaLabel="Search by name or SKU"
      />
      <select
        aria-label="Filter products by variants"
        value={sp.get("filter") ?? "all"}
        onChange={(e) => setFilter(e.target.value)}
      >
        <option value="all">All</option>
        <option value="with-variants">With variants</option>
        <option value="without-variants">Without variants</option>
      </select>
    </div>
  );
}
```

(Always `set`-ing `filter` — including `"all"` — matches today's form behavior, which always submitted `filter=all` explicitly. `.filters` CSS styles descendant `input`/`select` — `products.module.css:37-49` — so the form→div swap keeps styling.)

- [ ] **Step 2: Update the call site in `src/app/app/products/page.tsx` (line 323)**

Replace:

```tsx
<ProductFilters defaultQ={params.q} defaultFilter={filter} />
```

with:

```tsx
<ProductFilters />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: baseline errors only (in particular, no unused-prop or missing-prop errors in products files).

- [ ] **Step 4: Commit**

```bash
git add src/app/app/products/product-filters.tsx src/app/app/products/page.tsx
git commit -m "feat(products): live search without Enter"
```

---

### Task 4: Orders page uses shared SearchInput

**Goal:** Replace the inline debounced search in `OrdersFilters` with the shared component (behavior unchanged).

**Files:**
- Modify: `src/app/app/orders/_components/orders-filters.tsx`

**Acceptance Criteria:**
- [ ] Search input uses `SearchInput` with `param="search"` and `className={styles.filterSearch}`
- [ ] Inline `useState`/`useEffect` debounce for search is removed
- [ ] Status/source/historical selects and date inputs keep their existing `setParam` handling (including `page=1` reset)
- [ ] Searching still resets pagination to page 1 (SearchInput deletes `page`, which defaults to 1)

**Verify:** `npx tsc --noEmit` → baseline errors only. Manual: on `/app/orders`, type an order # — list filters live after ~300ms; change status filter — still works.

**Steps:**

- [ ] **Step 1: Rewrite `src/app/app/orders/_components/orders-filters.tsx`**

Replace the entire file with:

```tsx
"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import SearchInput from "../../_ui/search-input";
import styles from "../orders.module.css";

export default function OrdersFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set("page", "1");
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className={styles.filterBar}>
      <SearchInput
        className={styles.filterSearch}
        param="search"
        placeholder="Search order # or customer"
        ariaLabel="Search orders"
      />
      <select className={styles.filterSelect} aria-label="Filter by status" value={sp.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}>
        <option value="">All statuses</option>
        <option value="open">Open</option>
        <option value="fulfilled">Fulfilled</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <select className={styles.filterSelect} aria-label="Filter by source" value={sp.get("source") ?? ""}
        onChange={(e) => setParam("source", e.target.value)}>
        <option value="">All sources</option>
        <option value="shopify">Shopify</option>
        <option value="manual">B2B</option>
      </select>
      <select className={styles.filterSelect} aria-label="Filter by historical" value={sp.get("historical") ?? "all"}
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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: baseline errors only.

- [ ] **Step 3: Commit**

```bash
git add src/app/app/orders/_components/orders-filters.tsx
git commit -m "refactor(orders): use shared SearchInput for live search"
```
