# Purchasing & Inventory Design System Alignment — Spec

**Goal:** Rebuild the Purchasing and Inventory pages to conform strictly to the Manuva design system — single-column layout, forms in `<dialog>` modals, canonical `_ui/` component usage, and correct token usage throughout.

**Audience:** Claude subagents implementing the changes.

**Scope:** Two pages. No new `_ui/` components. No backend changes. CSS and TSX only.

---

## Context

Both pages were built before the design system was formalised. They have:
- Embedded create forms in the page body (violates "no embedded create forms")
- Token violations (`--surface-1` used on card backgrounds instead of `--bg-card`)
- Custom CSS that duplicates patterns from `_ui/table.module.css` and `_ui/list-panel.module.css`
- Inventory: two-column dashboard layout (violates "single column only")

The canonical pattern to follow is the Components page (`src/app/app/components/page.tsx`), which is the visual source of truth. Its `ComponentCreateForm` is the reference for the dialog modal pattern.

---

## 1. Purchasing Page

**File:** `src/app/app/purchasing/page.tsx`
**CSS:** `src/app/app/purchasing/purchasing.module.css`
**Forms:** `src/app/app/purchasing/po-create-form.tsx`, `src/app/app/purchasing/po-line-form.tsx`

### What changes

The page is already close to conforming — it uses `PageHeader`, `ListPanel`/`ListRow`, `StatusBadge`, `EmptyState`, `HelpLink`. Two issues:

**1. Embedded forms → dialog modals**

`PurchaseOrderCreateForm` and `PurchaseOrderLineForm` currently render in the page body. Both must become client dialog components following the `ComponentCreateForm` pattern:
- `"use client"`
- `useState(open)` to control visibility
- `useRef<HTMLDialogElement>` + `useEffect` to call `showModal()`/`close()`
- The trigger button is rendered by the component itself (so it can be dropped into `PageHeader actions`)
- On `state.success`, call `setOpen(false)` to close

Both components move to `PageHeader`'s `actions` prop.

**2. CSS token fixes**

`purchasing.module.css` has input/select borders using `var(--stroke)` (inner divider token). Interactive element borders must use `var(--stroke-strong)`:

```css
/* Wrong */
.formRow select,
.formRowWide select,
.formRowWide input,
.inlineForm select,
.inlineForm input {
  border: 1px solid var(--stroke);
  ...
}

/* Right */
.formRow select,
.formRowWide select,
.formRowWide input,
.inlineForm select,
.inlineForm input {
  border: 1px solid var(--stroke-strong);
  ...
}
```

The `.inlineForm button` uses `background: var(--surface-1)`. It should compose from `secondary` in `buttons.module.css`:

```css
/* Remove the hand-written inlineForm button styles, compose instead */
.inlineFormBtn {
  composes: secondary from "../_ui/buttons.module.css";
}
```

### Target page structure

```tsx
<div className={styles.page}>
  <PageHeader
    eyebrow="Operations"
    title="Purchasing"
    description="..."
    actions={
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <PurchaseOrderLineForm ... />
        <PurchaseOrderCreateForm ... />
      </div>
    }
  />
  <HelpLink slug="purchasing/purchase-orders" label="How to create a purchase order" />
  <ListPanel eyebrow="Orders" title="Purchase orders" ...>
    {/* PO rows */}
  </ListPanel>
  <ListPanel eyebrow="Lines" title="Purchase order lines" ...>
    {/* Line rows */}
  </ListPanel>
</div>
```

---

## 2. Inventory Page

**File:** `src/app/app/inventory/page.tsx`
**CSS:** `src/app/app/inventory/inventory.module.css`
**Form:** `src/app/app/inventory/movement-form.tsx`

### What changes

**1. Two-column layout → single column**

Remove `.contentGrid`, `.primaryColumn`, `.secondaryColumn` entirely. All sections stack vertically inside `.page`.

**2. Movement form → dialog modal**

`MovementForm` becomes a client dialog component following the `ComponentCreateForm` pattern. The trigger button ("Log Movement") moves to `PageHeader actions`.

**3. Balance view → `tableCard` / `table`**

The custom `.balanceRow` / `.balanceHeader` card pattern is replaced by a standard table composing from `_ui/table.module.css`:

```tsx
<div className={styles.tableCard}>
  <table className={styles.table}>
    <thead>
      <tr>
        <th>Component</th>
        <th>Location</th>
        <th className={styles.alignRight}>On hand</th>
        <th className={styles.alignRight}>In prod</th>
        <th className={styles.alignRight}>Reserved</th>
      </tr>
    </thead>
    <tbody>
      {rows.map(row => (
        <tr key={row.id}>
          <td>
            <strong>{component?.name}</strong>
            <span className={styles.sku}>{component?.sku ?? "No SKU"}</span>
          </td>
          <td>{location?.name ?? "Unassigned"}</td>
          <td className={styles.alignRight}>
            {row.on_hand}
            {lowStock && <StatusBadge variant="warning">Below reorder</StatusBadge>}
          </td>
          <td className={styles.alignRight}>{row.in_prod}</td>
          <td className={styles.alignRight}>{row.reserved}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

**4. Recent movements → `ListPanel`**

The custom `.movementList` / `.movementRow` pattern is replaced by a `ListPanel` with `ListRow` entries. Each row shows: component name, location, on-hand delta, in-prod delta, reason, date. The nested delta-card grid is dropped — deltas display as plain signed values (`+5`, `-2`) using `deltaPositive` / `deltaNegative` / `deltaNeutral` colour classes inline in the row.

**5. Inventory summary panel → removed**

The green/blue/amber dot summary is redundant with the metric cards at the top. Remove it.

**6. CSS module cleanup**

Classes to remove from `inventory.module.css` (replaced by `_ui/` patterns):
- `contentGrid`, `primaryColumn`, `secondaryColumn`
- `balanceTable`, `balanceHeader`, `balanceRow`, `balanceCellMain`, `balanceCell`
- `movementList`, `movementRow`, `movementTop`
- `summaryList`, `summaryItem`, `summaryDot`, `summaryDotBlue`, `summaryDotAmber`
- `panelIntro` (if no longer used after restructure)

Classes to add:
```css
.tableCard {
  composes: tableCard from "../_ui/table.module.css";
}

.table {
  composes: table from "../_ui/table.module.css";
}

.alignRight {
  text-align: right;
}

.sku {
  display: block;
  font-size: var(--fs-xs);
  color: var(--ink-faint);
}
```

Classes to keep: `page`, `export`, `metricGrid`, `metricCard`, `eyebrow`, `panel`, `panelHeader`, `primary`, `formActions`, `success`, `error`, `deltaGrid`, `deltaCard`, `deltaPositive`, `deltaNegative`, `deltaNeutral`.

### Target page structure

```tsx
<section className={styles.page}>
  <PageHeader
    eyebrow="Operations"
    title="Inventory"
    description="..."
    actions={
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <MovementForm components={...} locations={...} />
        <a className={styles.export} href="/app/inventory/export">Export CSV</a>
      </div>
    }
  />

  {/* Metric strip */}
  <div className={styles.metricGrid}>
    {metrics.map(m => (
      <div key={m.label} className={styles.metricCard}>
        <span>{m.label}</span>
        <strong>{m.value}</strong>
        <p>{m.detail}</p>
      </div>
    ))}
  </div>

  {/* Balance table */}
  <div className={styles.tableCard}>
    <table className={styles.table}>...balance rows...</table>
  </div>

  {/* Recent movements */}
  <ListPanel eyebrow="Latest ledger events" title="Recent movements" ...>
    {movementRows.map(m => (
      <ListRow key={m.id} ...>
        {/* component, location, deltas, reason, date */}
      </ListRow>
    ))}
  </ListPanel>
</section>
```

---

## Dialog Modal Pattern (both pages)

Reference implementation: `src/app/app/components/component-create-form.tsx`

Every form converted to a modal must follow this structure:

```tsx
"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import styles from "./[page].module.css";

export default function SomeForm({ action, ...props }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = React.useActionState(action, {});
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) dialog.showModal();
    else dialog.close();
  }, [open]);

  return (
    <>
      <button className={styles.primaryBtn} onClick={() => setOpen(true)}>
        New [Thing] +
      </button>
      <dialog ref={dialogRef} className={styles.dialog}>
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>New [Thing]</h2>
            <button className={styles.dialogClose} onClick={() => setOpen(false)}>×</button>
          </div>
          <form action={formAction} className={styles.dialogForm}>
            {/* form fields */}
            {state.error && <p className={styles.error}>{state.error}</p>}
            <div className={styles.dialogActions}>
              <button type="button" className={styles.btnCancel} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={styles.btnSubmit}>Save</button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
```

The dialog CSS classes (`dialog`, `dialogInner`, `dialogHeader`, `dialogClose`, `dialogForm`, `dialogActions`, `btnCancel`, `btnSubmit`) already exist in `components.module.css` — copy only what's needed into the purchasing/inventory CSS modules.

---

## Files Changed

| File | Change |
|---|---|
| `src/app/app/purchasing/po-create-form.tsx` | Convert to dialog modal pattern |
| `src/app/app/purchasing/po-line-form.tsx` | Convert to dialog modal pattern |
| `src/app/app/purchasing/page.tsx` | Move forms to PageHeader actions, remove from page body |
| `src/app/app/purchasing/purchasing.module.css` | Fix input border tokens, add dialog classes, compose secondary button |
| `src/app/app/inventory/movement-form.tsx` | Convert to dialog modal pattern |
| `src/app/app/inventory/page.tsx` | Remove two-column layout, balance → table, movements → ListPanel, summary removed |
| `src/app/app/inventory/inventory.module.css` | Remove two-column/custom classes, add tableCard/table composes |
