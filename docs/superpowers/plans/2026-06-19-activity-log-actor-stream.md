# Activity Log Actor-Stream Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add People / System / All tabs to `/app/activity-log` that split the log by `actor_type` (default People), without changing logging behavior.

**Architecture:** A `?tab=people|system|all` URL param drives an `actor_type` filter applied to both the rows query and the count query in the server page component, so pagination and counts stay correct per tab. Tabs are `<Link>`s reusing the established `.tabBar` pattern from the templates page. Pure parsing logic lives in `query.ts` and is unit-tested.

**Tech Stack:** Next.js 15 App Router (server components), Supabase PostgREST, CSS Modules, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-19-activity-log-actor-stream-design.md`

---

### Task 1: Add `tab` filter to query parsing

**Goal:** `ActivityFilters` carries a `tab` ("all" | "people" | "system") parsed from the URL, defaulting to "people".

**Files:**
- Modify: `src/lib/activity/query.ts`
- Test: `src/lib/activity/query.test.ts`

**Acceptance Criteria:**
- [ ] `ActivityTab` type exported as `"all" | "people" | "system"`.
- [ ] `ActivityFilters` has a `tab: ActivityTab` field.
- [ ] Missing/unknown `tab` → `"people"`; `tab=system` → `"system"`; `tab=all` → `"all"`.
- [ ] Existing `parseActivityFilters` tests updated to include `tab`.

**Verify:** `npx vitest run src/lib/activity/query.test.ts --pool threads --maxWorkers 1` → all pass.

**Steps:**

- [ ] **Step 1: Update the existing tests and add tab cases**

In `src/lib/activity/query.test.ts`, update the two `parseActivityFilters` `.toEqual` objects to include `tab`, and add a tab-parsing test:

```ts
  it("defaults to page 1 and empty filters", () => {
    expect(parseActivityFilters({})).toEqual({
      page: 1, event: null, actorId: null, dateFrom: null, dateTo: null, search: null, tab: "people",
    });
  });

  it("parses provided params and clamps page to >= 1", () => {
    const f = parseActivityFilters({
      page: "0", event: "bom.created", actor: "u1", from: "2026-01-01", to: "2026-02-01", q: "PO", tab: "system",
    });
    expect(f).toEqual({
      page: 1, event: "bom.created", actorId: "u1",
      dateFrom: "2026-01-01", dateTo: "2026-02-01", search: "PO", tab: "system",
    });
  });

  it("normalizes the tab param", () => {
    expect(parseActivityFilters({ tab: "all" }).tab).toBe("all");
    expect(parseActivityFilters({ tab: "system" }).tab).toBe("system");
    expect(parseActivityFilters({ tab: "people" }).tab).toBe("people");
    expect(parseActivityFilters({}).tab).toBe("people");
    expect(parseActivityFilters({ tab: "garbage" }).tab).toBe("people");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/activity/query.test.ts --pool threads --maxWorkers 1`
Expected: FAIL — `tab` missing from output / `ActivityTab` not exported.

- [ ] **Step 3: Implement in `query.ts`**

Add the type and a parse helper, and include `tab` in the returned object:

```ts
export const ACTIVITY_PAGE_SIZE = 50;

export type ActivityTab = "all" | "people" | "system";

export type ActivityFilters = {
  page: number;
  event: string | null;
  actorId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  search: string | null;
  tab: ActivityTab;
};
```

In `parseActivityFilters`, before the `return`, add:

```ts
  const tabRaw = first(params.tab);
  const tab: ActivityTab = tabRaw === "all" || tabRaw === "system" ? tabRaw : "people";
```

and add `tab,` to the returned object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/activity/query.test.ts --pool threads --maxWorkers 1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/activity/query.ts src/lib/activity/query.test.ts
git commit -m "feat(activity-log): parse tab filter (people/system/all)"
```

---

### Task 2: Apply actor_type filter per tab in the page query

**Goal:** The server page filters both the rows query and the count query by the active tab's `actor_type`.

**Files:**
- Modify: `src/app/app/activity-log/page.tsx`

**Acceptance Criteria:**
- [ ] `people` tab → only `actor_type = "user"` rows; `system` tab → only non-user rows; `all` → unfiltered.
- [ ] The same filter is applied to the count query so totals/paging match the rows shown.
- [ ] No change to existing event/user/date/search filters.

**Verify:** `npx tsc --noEmit` → no new errors under `src/`. Manual: load `/app/activity-log` (People default → no Shopify rows), `?tab=system` (only Shopify/Stripe/System), `?tab=all` (everything); count + page numbers correct on each.

**Steps:**

- [ ] **Step 1: Add tab filtering to the shared `applyFilters`**

In `src/app/app/activity-log/page.tsx`, inside the `applyFilters` function, add a tab branch (it already receives `filters` via closure). After the existing `if (filters.search) { ... }` block and before `return out;`, add:

```ts
    if (filters.tab === "people") out = out.eq("actor_type", "user");
    else if (filters.tab === "system") out = out.neq("actor_type", "user");
    // "all" applies no actor_type filter
```

No other changes needed — `applyFilters` is already used for both `rowsQuery` and `countQuery`, so both stay in sync.

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no new errors under `src/` (baseline is 2 pre-existing errors in `.next/types/validator.ts` only).

- [ ] **Step 3: Commit**

```bash
git add src/app/app/activity-log/page.tsx
git commit -m "feat(activity-log): filter rows and counts by active tab"
```

---

### Task 3: Render the People / System / All tabs

**Goal:** Three tab links above the filters, active state from `filters.tab`, with the user filter hidden on the System tab and per-tab empty states.

**Files:**
- Modify: `src/app/app/activity-log/table.tsx`
- Modify: `src/app/app/activity-log/activity-log.module.css`

**Acceptance Criteria:**
- [ ] A `.tabBar` with three links: People (`?tab=people`), System (`?tab=system`), All (`?tab=all`).
- [ ] The link matching `filters.tab` uses the active style; clicking a tab preserves other query params but resets `page`.
- [ ] The "All users" actor `<select>` is hidden when `filters.tab === "system"`.
- [ ] Empty state message is tab-specific.

**Verify:** `npx tsc --noEmit` → no new errors. Manual: tabs render and highlight correctly; switching tabs keeps date/search but goes to page 1; System tab hides the user dropdown; empty tabs show the right message.

**Steps:**

- [ ] **Step 1: Add a tab href helper and the tab bar**

In `src/app/app/activity-log/table.tsx`, add a helper next to `pushParams` that builds a tab href from the current params (preserving filters, dropping `page`):

```tsx
  function tabHref(tab: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    params.delete("page");
    return `?${params.toString()}`;
  }

  const TABS: { key: string; label: string }[] = [
    { key: "people", label: "People" },
    { key: "system", label: "System" },
    { key: "all", label: "All" },
  ];
```

Add `Link` to the next/navigation import at the top of the file:

```tsx
import Link from "next/link";
```

Render the tab bar immediately after `</PageHeader>` (the closing of the `<PageHeader ... />` element) and before `<div className={styles.filters}>`:

```tsx
      <div className={styles.tabBar}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            className={filters.tab === t.key ? styles.tabActive : styles.tab}
          >
            {t.label}
          </Link>
        ))}
      </div>
```

- [ ] **Step 2: Hide the user select on the System tab**

In the `.filters` block, wrap the "All users" `<select>` so it does not render on the system tab:

```tsx
        {filters.tab !== "system" && (
          <select value={filters.actorId ?? "all"} onChange={(e) => pushParams({ actor: e.target.value === "all" ? null : e.target.value })}>
            <option value="all">All users</option>
            {actorOptions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        )}
```

- [ ] **Step 3: Tab-specific empty state**

Replace the no-rows `EmptyState` (the branch after `rows.length === 0 ?`) with a tab-aware message:

```tsx
          ) : rows.length === 0 ? (
            <EmptyState
              title={
                filters.tab === "system" ? "No system activity recorded yet"
                : filters.tab === "people" ? "No people activity yet"
                : "No activity found"
              }
              message={
                filters.tab === "system" ? "Automated events (Shopify, billing) will appear here."
                : filters.tab === "people" ? "Actions taken by your team will appear here."
                : "Try widening the filters or search term to inspect more events."
              }
            />
          ) : (
```

- [ ] **Step 4: Add tab CSS**

In `src/app/app/activity-log/activity-log.module.css`, append the tab styles (mirroring `templates.module.css`):

```css
.tabBar {
  display: flex;
  gap: 8px;
}
.tab {
  composes: secondary from "../_ui/buttons.module.css";
  min-height: 34px;
  padding: 6px 16px;
  font-size: var(--fs-sm);
}
.tabActive {
  composes: primary from "../_ui/buttons.module.css";
  min-height: 34px;
  padding: 6px 16px;
  font-size: var(--fs-sm);
}
```

- [ ] **Step 5: Verify types and build**

Run: `npx tsc --noEmit`
Expected: no new errors under `src/`.

- [ ] **Step 6: Commit**

```bash
git add src/app/app/activity-log/table.tsx src/app/app/activity-log/activity-log.module.css
git commit -m "feat(activity-log): People/System/All tabs UI"
```

---

### Task 4: Update the QA feature test plan

**Goal:** Document the new tab behavior per CLAUDE.md (Activity Log checklist + dated changelog line).

**Files:**
- Modify: `docs/qa-feature-test-plan.md`

**Acceptance Criteria:**
- [ ] Activity log section gains `- [ ]` checks for the three tabs, default People, and per-tab actor_type filtering with correct counts/paging.
- [ ] A dated changelog line is appended.

**Verify:** Visual review of the diff — checks added under `### Activity log` and one changelog line at the bottom.

**Steps:**

- [ ] **Step 1: Add checklist items**

In `docs/qa-feature-test-plan.md` under `### Activity log — \`/app/activity-log\``, add after the existing first bullet:

```markdown
- [ ] Three tabs — People / System / All — split the log by actor_type; defaults to People on load so automated noise is hidden
- [ ] People tab shows only user-initiated events; System tab shows only automated (Shopify/Stripe/System) events; All shows everything
- [ ] Counts and Prev/Next paging are correct per tab; switching tabs preserves date/search/event filters but resets to page 1
- [ ] The user filter is hidden on the System tab; each tab has its own empty-state message
```

- [ ] **Step 2: Append changelog line**

At the end of the `## Changelog` section (after the `2026-06-17` line), add:

```markdown
- 2026-06-19 — amended Activity log: People/System/All tabs split the log by actor_type (default People) to separate the human audit trail from Shopify/system noise.
```

- [ ] **Step 3: Commit**

```bash
git add docs/qa-feature-test-plan.md
git commit -m "docs(qa): activity log People/System/All tabs"
```

---

## Final verification

After all tasks:
- [ ] `npx vitest run src/lib/activity/query.test.ts --pool threads --maxWorkers 1` → pass
- [ ] `npx tsc --noEmit` → only the 2 pre-existing `.next/types/validator.ts` errors, none under `src/`
- [ ] Manual: People (default, no Shopify), System (only automated), All (everything); counts/paging correct; filters compose with tab; System tab hides user dropdown.
