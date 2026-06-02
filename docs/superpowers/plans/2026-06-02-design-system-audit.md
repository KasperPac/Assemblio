# Design System Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all Manuva design system violations across the core app, reports, and settings sections.

**Architecture:** Three independent tasks — one per section — each auditing and fixing all violations in its files and committing a clean diff. Tasks have no file overlap and can run in parallel.

**Tech Stack:** Next.js 15 App Router, CSS Modules, TypeScript. Design tokens sourced from `C:\dev\manuva-tokens\Manuva Design System\colors_and_type.css`.

---

## Violation Codes (reference)

| Code | Rule |
|---|---|
| T1 | `PageHeader` missing `eyebrow` |
| T2 | `PageHeader` missing `title` |
| T3 | Empty state uses raw `<p>`/`<div>` instead of `<EmptyState>` |
| T4 | Status chip is hand-written `<span>` instead of `<StatusBadge>` |
| T5 | `style={{}}` used for static layout or colour |
| C1 | Hardcoded hex colour |
| C2 | Hardcoded `rgba(…)` (non-backdrop) |
| C6 | Table CSS hand-written instead of composing from `_ui/table.module.css` |
| C7 | Button CSS hand-written instead of composing from `_ui/buttons.module.css` |

---

## Task 1: Core App Section

**Goal:** Fix all design system violations in the core app pages.

**Files:**
- Modify: `src/app/app/products/page.tsx`
- Modify: `src/app/app/stocktake/page.tsx`
- Modify: `src/app/app/components/page.tsx`
- Modify: `src/app/app/components/[componentId]/component-detail.module.css`
- Modify: `src/app/app/warehouse/locations/page.module.css`
- Modify: `src/app/app/goods-inwards/goods-inwards.module.css`
- Modify: `src/app/app/bom/templates/templates.module.css`

**Acceptance Criteria:**
- [ ] `products/page.tsx` PageHeader has `eyebrow="Products"`
- [ ] `stocktake/page.tsx` PageHeader has `eyebrow="Operations"` and `title="Stocktakes"`
- [ ] `components/page.tsx` empty/error states use `<EmptyState>` not raw `<p>`
- [ ] `products/page.tsx` empty/error states use `<EmptyState>` not raw `<div>`
- [ ] `component-detail.module.css` `.alarmBanner` uses `var(--danger-dim)` and `var(--danger)` (no rgba)
- [ ] `component-detail.module.css` `.tabActive` uses `var(--ink-on-brand)` not `#0b0f19`
- [ ] `component-detail.module.css` `.statBlue` uses `var(--info)` not `#60a5fa`
- [ ] `warehouse/locations/page.module.css` uses `var(--bg-card)`, `var(--ink-strong)`, `var(--ink-muted)` not `#fff`, `#111`, `#888`
- [ ] `goods-inwards.module.css` `.tabActive` uses `var(--shadow-card)` not `rgba(0,0,0,0.08)`
- [ ] `bom/templates/templates.module.css` `.dialog` uses `var(--shadow-lg)` not `rgba(0,0,0,0.5)` in `box-shadow`

**Verify:** `grep -r "#[0-9a-fA-F]\{3,6\}" src/app/app/components src/app/app/warehouse src/app/app/goods-inwards src/app/app/bom/templates` should return no matches outside of comments.

**Steps:**

- [ ] **Fix T1: `products/page.tsx` — add `eyebrow="Products"` to PageHeader**

  Read `src/app/app/products/page.tsx` lines 296-310. The PageHeader is:
  ```tsx
  <PageHeader
    title="Products"
    description={`${filteredProducts.length} of ${products.length} products`}
    actions={…}
  />
  ```
  Change to:
  ```tsx
  <PageHeader
    eyebrow="Products"
    title="Products"
    description={`${filteredProducts.length} of ${products.length} products`}
    actions={…}
  />
  ```

- [ ] **Fix T1+T2: `stocktake/page.tsx` — add `eyebrow` and `title` to PageHeader**

  Read `src/app/app/stocktake/page.tsx` lines 76-85. The PageHeader is:
  ```tsx
  <PageHeader
    description="Manage physical counts and reconcile inventory discrepancies."
    actions={…}
  />
  ```
  Change to:
  ```tsx
  <PageHeader
    eyebrow="Operations"
    title="Stocktakes"
    description="Manage physical counts and reconcile inventory discrepancies."
    actions={…}
  />
  ```

- [ ] **Fix T3: `components/page.tsx` — replace raw `<p>` empty states with `<EmptyState>`**

  Read `src/app/app/components/page.tsx` lines 163-174. The error/empty block is:
  ```tsx
  {error ? (
    <p className={styles.empty}>Failed to load components.</p>
  ) : filtered.length === 0 ? (
    <p className={styles.empty}>
      {filterLowStock
        ? "All components have sufficient available stock."
        : q.length > 0
        ? "No components match that search."
        : "No components yet. Add one above."}
    </p>
  ) : (
  ```
  Change to (ensure `EmptyState` is already imported at the top; if not, add `import EmptyState from "../_ui/empty-state";`):
  ```tsx
  {error ? (
    <EmptyState title="Failed to load" message="Could not load components. Please refresh." />
  ) : filtered.length === 0 ? (
    <EmptyState
      title={filterLowStock ? "All stocked up" : q.length > 0 ? "No results" : "No components yet"}
      message={
        filterLowStock
          ? "All components have sufficient available stock."
          : q.length > 0
          ? "No components match that search."
          : "Add your first component to get started."
      }
    />
  ) : (
  ```

- [ ] **Fix T3: `products/page.tsx` — replace raw `<div>` empty states with `<EmptyState>`**

  Read `src/app/app/products/page.tsx` lines 330-336. The error/empty block is:
  ```tsx
  {productsError ? (
    <div className={styles.empty}>Failed to load products: {productsError}</div>
  ) : filteredProducts.length === 0 ? (
    <div className={styles.empty}>No products match your filters.</div>
  ) : (
  ```
  Change to (ensure `EmptyState` is imported; add `import EmptyState from "../_ui/empty-state";` if needed):
  ```tsx
  {productsError ? (
    <EmptyState title="Failed to load" message={`Could not load products: ${productsError}`} />
  ) : filteredProducts.length === 0 ? (
    <EmptyState title="No results" message="No products match your filters." />
  ) : (
  ```

- [ ] **Fix C2: `component-detail.module.css` — `.alarmBanner` rgba → tokens**

  Read `src/app/app/components/[componentId]/component-detail.module.css` lines 24-32. Current:
  ```css
  .alarmBanner {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-md);
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
    color: var(--danger);
  }
  ```
  Change to:
  ```css
  .alarmBanner {
    background: var(--danger-dim);
    border: 1px solid var(--danger);
    border-radius: var(--radius-md);
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
    color: var(--danger);
  }
  ```

- [ ] **Fix C1: `component-detail.module.css` — `.tabActive` hex → token**

  Read lines 157-165. Current:
  ```css
  .tabActive {
    background: var(--brand-1);
    color: #0b0f19;
  }
  
  .tabActive:hover {
    background: var(--brand-2);
    color: #0b0f19;
  }
  ```
  Change to:
  ```css
  .tabActive {
    background: var(--brand-1);
    color: var(--ink-on-brand);
  }
  
  .tabActive:hover {
    background: var(--brand-2);
    color: var(--ink-on-brand);
  }
  ```

- [ ] **Fix C1: `component-detail.module.css` — `.statBlue` hex → token**

  Read lines 212-214. Current:
  ```css
  .statBlue {
    color: #60a5fa;
  }
  ```
  Change to:
  ```css
  .statBlue {
    color: var(--info);
  }
  ```

- [ ] **Fix C1: `warehouse/locations/page.module.css` — hex colours in barcode modal**

  Read lines 362-384. Current:
  ```css
  .barcodeBox {
    text-align: center;
    background: #fff;
    border: 1px solid var(--stroke-card);
    border-radius: var(--radius-lg);
    padding: 16px;
    margin-bottom: 16px;
  }
  
  .shortCode2 {
    font-size: 22px;
    font-weight: 700;
    font-family: monospace;
    letter-spacing: 0.2em;
    margin-top: 8px;
    color: #111;
  }
  
  .shortCodeLabel {
    font-size: 11px;
    color: #888;
    margin-top: 2px;
  }
  ```
  Change to:
  ```css
  .barcodeBox {
    text-align: center;
    background: var(--bg-card);
    border: 1px solid var(--stroke-card);
    border-radius: var(--radius-lg);
    padding: 16px;
    margin-bottom: 16px;
  }
  
  .shortCode2 {
    font-size: 22px;
    font-weight: 700;
    font-family: monospace;
    letter-spacing: 0.2em;
    margin-top: 8px;
    color: var(--ink-strong);
  }
  
  .shortCodeLabel {
    font-size: 11px;
    color: var(--ink-muted);
    margin-top: 2px;
  }
  ```

- [ ] **Fix C2: `goods-inwards.module.css` — tab shadow rgba → token**

  Read lines 34-39. Current:
  ```css
  .tabActive {
    background: var(--bg-card);
    color: var(--ink-strong);
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }
  ```
  Change to:
  ```css
  .tabActive {
    background: var(--bg-card);
    color: var(--ink-strong);
    font-weight: 600;
    box-shadow: var(--shadow-card);
  }
  ```

- [ ] **Fix C2: `bom/templates/templates.module.css` — dialog box-shadow rgba → token**

  Read lines 149-158. Current:
  ```css
  .dialog {
    border: none;
    border-radius: var(--radius-xl);
    background: var(--bg-card);
    color: var(--ink-strong);
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
    padding: 0;
    max-width: 440px;
    width: 92vw;
  }
  ```
  Change to:
  ```css
  .dialog {
    border: none;
    border-radius: var(--radius-xl);
    background: var(--bg-card);
    color: var(--ink-strong);
    box-shadow: var(--shadow-lg);
    padding: 0;
    max-width: 440px;
    width: 92vw;
  }
  ```

- [ ] **Commit**
  ```bash
  git add \
    src/app/app/products/page.tsx \
    src/app/app/stocktake/page.tsx \
    src/app/app/components/page.tsx \
    src/app/app/components/\[componentId\]/component-detail.module.css \
    src/app/app/warehouse/locations/page.module.css \
    src/app/app/goods-inwards/goods-inwards.module.css \
    src/app/app/bom/templates/templates.module.css
  git commit -m "fix(design-system): align core-app pages with Manuva design system"
  ```

---

## Task 2: Reports Section

**Goal:** Fix all design system violations in the reports pages.

**Files:**
- Modify: `src/app/app/reports/valuation/page.tsx`
- Modify: `src/app/app/reports/valuation/valuation.module.css`
- Modify: `src/app/app/reports/movements/page.tsx`
- Modify: `src/app/app/reports/movements/movements.module.css`
- Modify: `src/app/app/reports/po-summary/page.tsx`
- Modify: `src/app/app/reports/po-summary/po-summary.module.css`
- Modify: `src/app/app/reports/po-variance/page.tsx`
- Modify: `src/app/app/reports/po-variance/po-variance.module.css`
- Modify: `src/app/app/reports/lead-time-accuracy/page.tsx`
- Modify: `src/app/app/reports/lead-time-accuracy/lead-time-accuracy.module.css`
- Modify: `src/app/app/reports/dead-stock/page.tsx`
- Modify: `src/app/app/reports/dead-stock/dead-stock.module.css`
- Modify: `src/app/app/reports/stocktake-history/page.tsx`
- Modify: `src/app/app/reports/stocktake-history/stocktake-history.module.css` (create if absent)

**Acceptance Criteria:**
- [ ] No `style={{ color: "var(--...)" }}` with a *static* (non-conditional) value remains in any report page
- [ ] Conditional color styles (`color: condition ? "var(--ok)" : "var(--danger)"`) are replaced with CSS classes in the module
- [ ] Dynamic non-color values (e.g. `style={{ opacity: ... }}`) are left untouched

**Note on T5 pattern:** The correct replacement for `style={{ color: condition ? "var(--ok)" : "var(--danger)" }}` is:
- Add two CSS classes to the module:
  ```css
  .positive { color: var(--ok); }
  .negative { color: var(--danger); }
  ```
- Update the TSX to use `className`:
  ```tsx
  <span className={value > 0 ? styles.positive : styles.negative}>
  ```

**Verify:** `grep -rn "style={{" src/app/app/reports` — the output should contain only truly dynamic non-colour values (opacity, transform, width, etc.).

**Steps:**

- [ ] **Fix T5: `valuation/page.tsx` line 75 — static muted colour inline style**

  Current:
  ```tsx
  { key: "pct", header: "% of total", align: "right",
    render: (r) => <span style={{ color: "var(--ink-muted)" }}>{r.pct.toFixed(1)}%</span> },
  ```
  Add to `valuation.module.css`:
  ```css
  .muted { color: var(--ink-muted); }
  ```
  Change TSX to:
  ```tsx
  { key: "pct", header: "% of total", align: "right",
    render: (r) => <span className={styles.muted}>{r.pct.toFixed(1)}%</span> },
  ```

- [ ] **Fix T5: `movements/page.tsx` — static and mixed inline styles**

  **Line 82 — static muted colour:**
  Current: `render: (r) => <span style={{ color: "var(--ink-muted)" }}>{r.date}</span>`

  Add to `movements.module.css`:
  ```css
  .muted { color: var(--ink-muted); }
  .qtyPositive { color: var(--ok); font-weight: 600; }
  .qtyNegative { color: var(--danger); font-weight: 600; }
  .qtyNeutral  { color: var(--ink-muted); font-weight: 600; }
  ```
  Change line 82 TSX to:
  ```tsx
  render: (r) => <span className={styles.muted}>{r.date}</span>
  ```

  **Line 93 — conditional colour + static fontWeight:**
  Current:
  ```tsx
  render: (r) => (
    <span style={{ color: r.qty > 0 ? "var(--ok)" : r.qty < 0 ? "var(--danger)" : "var(--ink-muted)", fontWeight: 600 }}>
      {r.qty > 0 ? `+${r.qty}` : r.qty}
    </span>
  ),
  ```
  Change to:
  ```tsx
  render: (r) => (
    <span className={r.qty > 0 ? styles.qtyPositive : r.qty < 0 ? styles.qtyNegative : styles.qtyNeutral}>
      {r.qty > 0 ? `+${r.qty}` : r.qty}
    </span>
  ),
  ```

- [ ] **Fix T5: `po-summary/page.tsx` — conditional overdue colour**

  Read line ~87. Current:
  ```tsx
  render: (r) => (
    <span style={{ color: r.overdue ? "var(--danger)" : "inherit" }}>
      {r.expectedDate ?? "—"}{r.overdue ? " ⚠" : ""}
    </span>
  )
  ```
  Add to `po-summary.module.css`:
  ```css
  .overdue { color: var(--danger); }
  ```
  Change to:
  ```tsx
  render: (r) => (
    <span className={r.overdue ? styles.overdue : undefined}>
      {r.expectedDate ?? "—"}{r.overdue ? " ⚠" : ""}
    </span>
  )
  ```

- [ ] **Fix T5: `po-variance/page.tsx` — variance colour (lines ~130 and ~140)**

  Add to `po-variance.module.css`:
  ```css
  .positive { color: var(--ok); }
  .negative { color: var(--danger); }
  ```
  Change lines ~130 and ~140:
  ```tsx
  // line ~130
  render: (row) => (
    <span className={row.variance > 0 ? styles.positive : styles.negative}>
      {row.variance > 0 ? "+" : ""}{row.variance}
    </span>
  ),
  // line ~140
  render: (row) => (
    <span className={row.variancePct > 0 ? styles.positive : styles.negative}>
      {row.variancePct > 0 ? "+" : ""}{row.variancePct}%
    </span>
  ),
  ```

- [ ] **Fix T5: `lead-time-accuracy/page.tsx` — late/accuracy colours (lines ~124 and ~134)**

  Add to `lead-time-accuracy.module.css`:
  ```css
  .late    { color: var(--warning); }
  .poor    { color: var(--danger); }
  ```
  Change lines ~124:
  ```tsx
  render: (row) => (
    <span className={row.late > 0 ? styles.late : undefined}>
      {row.late}
    </span>
  )
  ```
  Change line ~134:
  ```tsx
  render: (row) => (
    <span className={row.accuracy < 80 ? styles.poor : undefined}>
      {row.accuracy}%
    </span>
  )
  ```

- [ ] **Fix T5: `dead-stock/page.tsx` — daysIdle colour + fontWeight**

  Add to `dead-stock.module.css`:
  ```css
  .idleHigh   { color: var(--danger);   font-weight: 600; }
  .idleMed    { color: var(--warning);  font-weight: 600; }
  .idleLow    { color: var(--ink-strong); font-weight: 600; }
  ```
  Change the render (~line 95):
  ```tsx
  render: (r) => (
    <span className={
      r.daysIdle >= 180 ? styles.idleHigh
      : r.daysIdle >= 90 ? styles.idleMed
      : styles.idleLow
    }>
      {r.daysIdle}
    </span>
  )
  ```

- [ ] **Fix T5: `stocktake-history/page.tsx` — variance lines colour (~line 69)**

  Add to `stocktake-history.module.css` (create file if it doesn't exist, otherwise add to existing):
  ```css
  .variance    { color: var(--warning); }
  .noVariance  { color: var(--ink-muted); }
  ```
  Change line ~69:
  ```tsx
  render: (r) => (
    <span className={r.varianceLines > 0 ? styles.variance : styles.noVariance}>
      {r.varianceLines}
    </span>
  )
  ```
  If `stocktake-history.module.css` already exists, add only the new classes to it and verify the import is present in the page file.

- [ ] **Commit**
  ```bash
  git add src/app/app/reports/
  git commit -m "fix(design-system): align reports pages with Manuva design system"
  ```

---

## Task 3: Settings Section

**Goal:** Fix all design system violations in the settings pages.

**Files:**
- Modify: `src/app/app/settings/appearance/page.tsx`
- Modify: `src/app/app/settings/invoices/page.tsx`
- Modify: `src/app/app/settings/invoices/invoices.module.css`
- Modify: `src/app/app/settings/team/page.tsx`
- Modify: `src/app/app/settings/team/team.module.css`
- Modify: `src/app/app/settings/company/company.module.css`
- Modify: `src/app/app/settings/profile/profile.module.css`
- Modify: `src/app/app/settings/integrations/integrations.module.css`
- Modify: `src/app/app/settings/locations/locations.module.css`
- Modify: `src/app/app/settings/orders/sla-form.module.css`

**Acceptance Criteria:**
- [ ] `appearance/page.tsx` PageHeader has `title="Appearance"`
- [ ] `invoices/page.tsx` PageHeader has `title="Invoices"`; empty state uses `<EmptyState>`; `paidBadge` replaced with `<StatusBadge variant="success">`
- [ ] `team/page.tsx` PageHeader has `title="Team"`; member status badge uses `<StatusBadge>`
- [ ] All other settings sub-pages: verify PageHeader has `title` and add it if missing
- [ ] `invoices.module.css` `.table` composes from `_ui/table.module.css` (removes the `.paidBadge` rule after moving to `<StatusBadge>`)
- [ ] `team/team.module.css` `.table` composes from `_ui/table.module.css`
- [ ] `company/company.module.css`, `profile/profile.module.css`, `team/team.module.css`, `integrations/integrations.module.css`, `locations/locations.module.css`, `orders/sla-form.module.css` — all primary/secondary button selectors compose from `_ui/buttons.module.css`

**Verify:** `grep -rn "border-collapse\|border-radius: 999\|min-height: 42" src/app/app/settings` should return no matches.

**Steps:**

- [ ] **Fix T2: `appearance/page.tsx` — add `title` to PageHeader**

  Current:
  ```tsx
  <PageHeader
    eyebrow="Personal"
    description="Choose a visual theme for your workspace."
  />
  ```
  Change to:
  ```tsx
  <PageHeader
    eyebrow="Personal"
    title="Appearance"
    description="Choose a visual theme for your workspace."
  />
  ```

- [ ] **Fix T2: `invoices/page.tsx` — add `title` to PageHeader**

  Current:
  ```tsx
  <PageHeader
    eyebrow="Workspace"
    description="Monthly subscription invoices for your workspace."
  />
  ```
  Change to:
  ```tsx
  <PageHeader
    eyebrow="Workspace"
    title="Invoices"
    description="Monthly subscription invoices for your workspace."
  />
  ```

- [ ] **Audit remaining settings sub-pages for missing `title`**

  Read the following pages and add `title` to any PageHeader that is missing it. Follow the pattern above. Pages to check:
  - `src/app/app/settings/company/page.tsx` → title should be `"Company"`
  - `src/app/app/settings/profile/page.tsx` → title should be `"Profile"`
  - `src/app/app/settings/team/page.tsx` → title should be `"Team"`
  - `src/app/app/settings/integrations/page.tsx` → title should be `"Integrations"`
  - `src/app/app/settings/orders/page.tsx` → title should be `"Order Settings"`
  - `src/app/app/settings/locations/page.tsx` → title should be `"Locations"`

  For each page, read it, check if `title` is present on PageHeader, add it if not.

- [ ] **Fix T3: `invoices/page.tsx` — replace raw `<p>` empty state**

  Current (lines 34-37):
  ```tsx
  {invoicesWithUrls.length === 0 ? (
    <p className={styles.empty}>
      Invoices will appear here once your first billing period ends.
    </p>
  ) : (
  ```
  Add `import EmptyState from "../../_ui/empty-state";` at the top if not already present.
  Change to:
  ```tsx
  {invoicesWithUrls.length === 0 ? (
    <EmptyState
      title="No invoices yet"
      message="Invoices will appear here once your first billing period ends."
    />
  ) : (
  ```
  Remove the `.empty` class from `invoices.module.css` if it becomes unused.

- [ ] **Fix T4: `invoices/page.tsx` — replace `paidBadge` span with `<StatusBadge>`**

  Add `import StatusBadge from "../../_ui/status-badge";` at the top of `invoices/page.tsx` if not already present.

  Current (line 60):
  ```tsx
  <span className={styles.paidBadge}>Paid</span>
  ```
  Change to:
  ```tsx
  <StatusBadge variant="success">Paid</StatusBadge>
  ```
  Remove the `.paidBadge` rule from `invoices.module.css` (lines 51-58) once the span is gone.

- [ ] **Fix T4: `team/page.tsx` — replace status badge span with `<StatusBadge>`**

  Add `import StatusBadge from "../../_ui/status-badge";` at the top of `team/page.tsx` if not already present.

  Current (lines 141-149):
  ```tsx
  <span
    className={
      member.status === "active"
        ? styles.activeBadge
        : styles.deactivatedBadge
    }
  >
    {member.status}
  </span>
  ```
  Change to:
  ```tsx
  <StatusBadge variant={member.status === "active" ? "success" : "warning"}>
    {member.status}
  </StatusBadge>
  ```
  After making this change, search `team/team.module.css` for `.activeBadge` and `.deactivatedBadge` and remove those rules.

- [ ] **Fix C6: `invoices.module.css` — table composes from shared module**

  Current (lines 15-18):
  ```css
  .table {
    width: 100%;
    border-collapse: collapse;
  }
  ```
  Change to:
  ```css
  .table {
    composes: table from "../../_ui/table.module.css";
  }
  ```

- [ ] **Fix C6: `team/team.module.css` — table composes from shared module**

  Find the `.table` rule (around line 92):
  ```css
  .table {
    width: 100%;
    border-collapse: collapse;
  }
  ```
  Change to:
  ```css
  .table {
    composes: table from "../../_ui/table.module.css";
  }
  ```

- [ ] **Fix C7: Audit and compose button styles in all settings CSS modules**

  For each of the following files, read the file and find any CSS classes that implement button styles from scratch (look for `border-radius`, `padding`, `font-weight`, `cursor: pointer` all in the same rule, or classes named `primaryButton`, `secondaryButton`, `submit`, `connectButton`, `disconnectButton`, `syncButton`, `setDefaultButton`).

  For each such class, determine whether it is a primary action (solid brand fill) or secondary action (outlined). Replace the hand-written properties with a compose:

  ```css
  /* Primary button */
  .primaryButton {
    composes: primary from "../../_ui/buttons.module.css";
  }

  /* Secondary button */
  .secondaryButton {
    composes: secondary from "../../_ui/buttons.module.css";
  }
  ```

  If a hand-written button has *additional* properties beyond what `buttons.module.css` provides (e.g. a unique colour for a "danger" or "disconnect" action), keep those overrides as separate rules:
  ```css
  .dangerButton {
    composes: secondary from "../../_ui/buttons.module.css";
    color: var(--danger);
    border-color: var(--danger);
  }
  .dangerButton:hover {
    background: var(--danger-dim);
  }
  ```

  Files to process:
  - `src/app/app/settings/company/company.module.css`
  - `src/app/app/settings/profile/profile.module.css`
  - `src/app/app/settings/team/team.module.css`
  - `src/app/app/settings/integrations/integrations.module.css`
  - `src/app/app/settings/locations/locations.module.css`
  - `src/app/app/settings/orders/sla-form.module.css`

- [ ] **Commit**
  ```bash
  git add src/app/app/settings/
  git commit -m "fix(design-system): align settings pages with Manuva design system"
  ```
