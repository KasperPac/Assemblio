# Purchasing & Inventory Design System Alignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Purchasing and Inventory pages to strict design system compliance — single-column layouts, create forms in `<dialog>` modals, canonical `_ui/` component usage, and correct token usage throughout.

**Architecture:** Both pages follow the `ComponentCreateForm` dialog pattern from `src/app/app/components/component-create-form.tsx` — client components with `useState(open)`, `useRef<HTMLDialogElement>`, and `useEffect` to call `showModal()`/`close()`. Forms move from the page body to `PageHeader actions`. Purchasing is already mostly conforming; Inventory requires a full structural rebuild. No server-side logic changes.

**Tech Stack:** Next.js 15 App Router, CSS Modules, TypeScript, React `useActionState`, HTML `<dialog>`.

---

### Task 1: Purchasing page redesign

**Goal:** Convert both create forms to dialog modals, fix CSS token violations, remove embedded forms from page body.

**Files:**
- Modify: `src/app/app/purchasing/po-create-form.tsx`
- Modify: `src/app/app/purchasing/po-line-form.tsx`
- Modify: `src/app/app/purchasing/page.tsx`
- Modify: `src/app/app/purchasing/purchasing.module.css`

**Acceptance Criteria:**
- [ ] `po-create-form.tsx` renders a trigger button + `<dialog>` (no inline `<form className={styles.formCard}>`)
- [ ] `po-line-form.tsx` renders a trigger button + `<dialog>` (no inline `<form className={styles.formCard}>`)
- [ ] `page.tsx` has no `PurchaseOrderCreateForm` or `PurchaseOrderLineForm` in the page body — both are in `PageHeader actions`
- [ ] Input/select borders in `purchasing.module.css` use `var(--stroke-strong)` not `var(--stroke)`
- [ ] Inline update button composes from `secondary` in `buttons.module.css`
- [ ] `npx tsc --noEmit` exits 0

**Verify:** `npx tsc --noEmit` → exits 0 with no errors

**Steps:**

- [ ] **Step 1: Rewrite `po-create-form.tsx`**

Replace the entire file with the dialog modal version:

```tsx
"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import styles from "./purchasing.module.css";

type FormState = {
  error?: string;
  success?: string;
};

type SupplierOption = {
  id: string;
  name: string | null;
};

type Props = {
  suppliers: SupplierOption[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
};

const initialState: FormState = {};

export default function PurchaseOrderCreateForm({ suppliers, action }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = React.useActionState(action, initialState);
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
      <button
        type="button"
        className={styles.primaryBtn}
        onClick={() => setOpen(true)}
      >
        New PO +
      </button>

      <dialog ref={dialogRef} className={styles.dialog} onClose={() => setOpen(false)}>
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>New Purchase Order</h2>
            <button
              type="button"
              className={styles.dialogClose}
              aria-label="Close dialog"
              onClick={() => setOpen(false)}
            >
              &times;
            </button>
          </div>
          <form action={formAction} className={styles.dialogForm}>
            <label className={styles.field}>
              <span>Supplier *</span>
              <select name="supplier_id" required defaultValue="">
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name ?? "Unnamed supplier"}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Status</span>
              <select name="status" defaultValue="open">
                <option value="open">Open</option>
                <option value="in_transit">In Transit</option>
                <option value="received">Received</option>
              </select>
            </label>
            {state.error && <p className={styles.error}>{state.error}</p>}
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className={styles.btnSubmit}>
                Create PO
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
```

- [ ] **Step 2: Rewrite `po-line-form.tsx`**

Replace the entire file with the dialog modal version:

```tsx
"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import styles from "./purchasing.module.css";

type FormState = {
  error?: string;
  success?: string;
};

type Option = {
  id: string;
  label: string;
};

type Props = {
  purchaseOrders: Option[];
  components: Option[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
};

const initialState: FormState = {};

export default function PurchaseOrderLineForm({
  purchaseOrders,
  components,
  action,
}: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = React.useActionState(action, initialState);
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
      <button
        type="button"
        className={styles.secondaryBtn}
        onClick={() => setOpen(true)}
      >
        Add Line
      </button>

      <dialog ref={dialogRef} className={styles.dialog} onClose={() => setOpen(false)}>
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>Add PO Line</h2>
            <button
              type="button"
              className={styles.dialogClose}
              aria-label="Close dialog"
              onClick={() => setOpen(false)}
            >
              &times;
            </button>
          </div>
          <form action={formAction} className={styles.dialogForm}>
            <label className={styles.field}>
              <span>Purchase Order *</span>
              <select name="purchase_order_id" required defaultValue="">
                <option value="">Select PO</option>
                {purchaseOrders.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Component *</span>
              <select name="component_id" required defaultValue="">
                <option value="">Select component</option>
                {components.map((component) => (
                  <option key={component.id} value={component.id}>
                    {component.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Quantity *</span>
              <input name="quantity" type="number" step="0.01" min="0.01" required />
            </label>
            {state.error && <p className={styles.error}>{state.error}</p>}
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className={styles.btnSubmit}>
                Add Line
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
```

- [ ] **Step 3: Update `page.tsx` — move forms to PageHeader actions**

Replace the entire file with:

```tsx
import Link from "next/link";
import styles from "./purchasing.module.css";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { getStatusVariant } from "./status-utils";
import PurchaseOrderCreateForm from "./po-create-form";
import PurchaseOrderLineForm from "./po-line-form";
import {
  createPurchaseOrder,
  createPurchaseOrderLine,
  updatePurchaseOrderLineQuantity,
  updatePurchaseOrderStatus,
} from "./actions";
import PageHeader from "../_ui/page-header";
import StatusBadge from "../_ui/status-badge";
import EmptyState from "../_ui/empty-state";
import ListPanel, { ListRow } from "../_ui/list-panel";
import HelpLink from "../_ui/help-link";

type PurchaseOrderRow = {
  id: string;
  status: string;
  created_at: string;
  supplier: { name: string | null } | Array<{ name: string | null }> | null;
};

type PurchaseOrderLineRow = {
  id: string;
  quantity: number;
  quantity_received: number;
  purchase_order: { id: string } | Array<{ id: string }> | null;
  component:
    | { name: string | null; sku: string | null }
    | Array<{ name: string | null; sku: string | null }>
    | null;
};

export default async function PurchasingPage() {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;

  const [{ data, error }, { data: suppliers }, { data: components }, { data: poLines }] =
    await Promise.all([
      supabase
        .from("purchase_order")
        .select("id,status,created_at,supplier:supplier_id(name)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase.from("suppliers").select("id,name").eq("tenant_id", tenantId).order("name"),
      supabase.from("component").select("id,name,sku").eq("tenant_id", tenantId).order("name"),
      supabase
        .from("purchase_order_line")
        .select(
          "id,quantity,quantity_received,purchase_order:purchase_order_id(id),component:component_id(name,sku)"
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Operations"
        title="Purchasing"
        description="Create inbound purchase orders, manage status changes, and keep received quantities aligned with component demand."
        actions={
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <PurchaseOrderLineForm
              purchaseOrders={(data ?? []).map((po) => ({
                id: po.id,
                label: `PO-${po.id.slice(0, 6)} (${po.status})`,
              }))}
              components={(
                (components ?? []) as Array<{ id: string; name: string | null; sku: string | null }>
              ).map((c) => ({
                id: c.id,
                label: `${c.name ?? "Unnamed"}${c.sku ? ` (${c.sku})` : ""}`,
              }))}
              action={createPurchaseOrderLine}
            />
            <PurchaseOrderCreateForm
              suppliers={
                (suppliers ?? []) as Array<{ id: string; name: string | null }>
              }
              action={createPurchaseOrder}
            />
          </div>
        }
      />
      <HelpLink slug="purchasing/purchase-orders" label="How to create a purchase order" />

      <ListPanel
        eyebrow="Orders"
        title="Purchase orders"
        description="Track PO status and keep supplier communication in sync with warehouse reality."
        columns={["PO", "Supplier", "Status", "Created", "Actions"]}
        columnsTemplate="0.8fr 1.1fr 0.8fr 0.8fr 1.2fr"
      >
        {error ? (
          <EmptyState
            title="Failed to load purchase orders"
            message="The purchase order list could not be retrieved from Supabase."
          />
        ) : (data ?? []).length === 0 ? (
          <EmptyState
            title="No purchase orders yet"
            message="Create a purchase order to begin tracking inbound supply."
          />
        ) : (
          (data as PurchaseOrderRow[]).map((row) => {
            const supplier = Array.isArray(row.supplier)
              ? row.supplier[0] ?? null
              : row.supplier;
            return (
              <ListRow
                key={row.id}
                columnsTemplate="0.8fr 1.1fr 0.8fr 0.8fr 1.2fr"
                className={styles.row}
              >
                <Link href={`/app/purchasing/${row.id}`} className={styles.poLink}>
                  PO-{row.id.slice(0, 6)}
                </Link>
                <span className={styles.meta}>
                  {supplier?.name ?? "Unknown supplier"}
                </span>
                <StatusBadge variant={getStatusVariant(row.status)}>
                  {row.status}
                </StatusBadge>
                <span className={styles.meta}>
                  {new Date(row.created_at).toLocaleDateString("en-GB")}
                </span>
                <form action={updatePurchaseOrderStatus} className={styles.inlineForm}>
                  <input type="hidden" name="purchase_order_id" value={row.id} />
                  <select name="status" defaultValue={row.status}>
                    <option value="open">Open</option>
                    <option value="in_transit">In Transit</option>
                    <option value="received">Received</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="archived">Archived</option>
                  </select>
                  <button type="submit" className={styles.inlineFormBtn}>
                    Update
                  </button>
                </form>
              </ListRow>
            );
          })
        )}
      </ListPanel>

      <ListPanel
        eyebrow="Lines"
        title="Purchase order lines"
        description="Review ordered quantities versus receipts and correct PO lines in place."
        columns={["PO", "Component", "Qty / Received", "Actions"]}
        columnsTemplate="0.85fr 1.5fr 0.8fr 1.2fr"
      >
        {(poLines ?? []).length === 0 ? (
          <EmptyState
            title="No purchase order lines yet"
            message="Add a line to a purchase order to track quantities and receipts."
          />
        ) : (
          (poLines as PurchaseOrderLineRow[]).map((line) => {
            const po = Array.isArray(line.purchase_order)
              ? line.purchase_order[0] ?? null
              : line.purchase_order;
            const component = Array.isArray(line.component)
              ? line.component[0] ?? null
              : line.component;
            return (
              <ListRow
                key={line.id}
                columnsTemplate="0.85fr 1.5fr 0.8fr 1.2fr"
                className={styles.row}
              >
                {po?.id ? (
                  <Link href={`/app/purchasing/${po.id}`} className={styles.poLink}>
                    PO-{po.id.slice(0, 6)}
                  </Link>
                ) : (
                  <strong>???</strong>
                )}
                <div className={styles.cellStack}>
                  <strong>{component?.name ?? "Unknown"}</strong>
                  <span className={styles.meta}>
                    {component?.sku ?? "No SKU"}
                  </span>
                </div>
                <div className={styles.cellStack}>
                  <strong>{line.quantity}</strong>
                  <span className={styles.meta}>
                    Received {Number(line.quantity_received ?? 0)}
                  </span>
                </div>
                <form action={updatePurchaseOrderLineQuantity} className={styles.inlineForm}>
                  <input type="hidden" name="line_id" value={line.id} />
                  <input
                    name="quantity"
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={line.quantity}
                  />
                  <button type="submit" className={styles.inlineFormBtn}>
                    Save
                  </button>
                </form>
              </ListRow>
            );
          })
        )}
      </ListPanel>
    </div>
  );
}
```

- [ ] **Step 4: Update `purchasing.module.css`**

Replace the entire file with:

```css
.page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* ── Trigger buttons ── */

.primaryBtn {
  composes: primary from "../_ui/buttons.module.css";
}

.secondaryBtn {
  composes: secondary from "../_ui/buttons.module.css";
}

/* ── Inline status update form inside ListRow ── */

.inlineForm {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}

.inlineForm select {
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-lg);
  min-height: 38px;
  padding: 0 12px;
  background: var(--surface-1);
  color: var(--ink-strong);
}

.inlineFormBtn {
  composes: secondary from "../_ui/buttons.module.css";
}

@media (max-width: 860px) {
  .inlineForm {
    grid-template-columns: 1fr;
  }
}

/* ── Shared text styles ── */

.error,
.success,
.meta {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--ink-muted);
}

.error {
  color: var(--danger);
}

.success {
  color: var(--ok);
}

.cellStack {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.poLink {
  font-weight: 700;
  color: var(--brand-1);
  text-decoration: none;
}

.poLink:hover {
  text-decoration: underline;
}

/* ── Dialog ── */

.dialog {
  border: none;
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  color: var(--ink-strong);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
  padding: 0;
  max-width: 480px;
  width: 92vw;
}

.dialog::backdrop {
  background: rgba(0, 0, 0, 0.6);
}

.dialogInner {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dialogHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialogHeader h2 {
  font-size: 20px;
}

.dialogClose {
  border: none;
  background: none;
  color: var(--ink-muted);
  font-size: 24px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.dialogForm {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field span {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.field input,
.field select {
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-lg);
  min-height: 42px;
  padding: 0 12px;
  background: var(--surface-1);
  color: var(--ink-strong);
  font-size: 0.95rem;
}

.dialogActions {
  display: flex;
  gap: 10px;
  padding-top: 6px;
}

.btnCancel {
  composes: secondary from "../_ui/buttons.module.css";
  flex: 1;
}

.btnSubmit {
  composes: primary from "../_ui/buttons.module.css";
  flex: 1;
}

/* ── PO detail page ── */

.formCard {
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  padding: 18px;
  display: grid;
  gap: 10px;
}

.infoRow {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  align-items: center;
}

.infoField {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.linesTable {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}

.linesTable th {
  text-align: left;
  padding: 8px 0;
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
  color: var(--ink-muted);
  border-bottom: 1px solid var(--stroke);
}

.linesTable td {
  padding: 10px 0;
  border-bottom: 1px solid var(--stroke);
  color: var(--ink-strong);
  vertical-align: middle;
}

.linesTable tbody tr:last-child td {
  border-bottom: none;
}

.alignRight {
  text-align: right;
}

.faint {
  color: var(--ink-faint);
}

.backLink {
  font-size: var(--fs-sm);
  color: var(--ink-muted);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.backLink:hover {
  color: var(--ink-strong);
}

/* ── Row styles used in ListRow ── */

.row {
  align-items: center;
}

/* ── Used by purchasing/[id]/page.tsx for the "Receive Goods" button ── */

.primary {
  composes: primary from "../_ui/buttons.module.css";
}
```

Note: `src/app/app/purchasing/[id]/page.tsx` uses `styles.primary` for the "Receive Goods →" button. The `.primary` class is included above in the "Row styles" section — confirm it is present in the file you write.

- [ ] **Step 5: Verify build**

```bash
npx tsc --noEmit
```

Expected: exits 0 with no output. If there are errors about `styles.primary` in `[id]/page.tsx`, add `.primary { composes: primary from "../_ui/buttons.module.css"; }` to `purchasing.module.css`.

- [ ] **Step 6: Commit**

```bash
git add src/app/app/purchasing/po-create-form.tsx \
        src/app/app/purchasing/po-line-form.tsx \
        src/app/app/purchasing/page.tsx \
        src/app/app/purchasing/purchasing.module.css
git commit -m "fix(purchasing): forms to dialog modals, design system alignment

- PurchaseOrderCreateForm: dialog modal with useState/useRef pattern
- PurchaseOrderLineForm: dialog modal with useState/useRef pattern  
- page.tsx: forms moved to PageHeader actions, page body clean
- purchasing.module.css: input borders --stroke-strong, inline button
  composes secondary, dialog CSS classes added"
```

---

### Task 2: Inventory page redesign

**Goal:** Single-column layout — movement form to dialog modal, balance view to `tableCard`/`table`, recent movements to `ListPanel`, summary panel removed.

**Files:**
- Modify: `src/app/app/inventory/movement-form.tsx`
- Modify: `src/app/app/inventory/page.tsx`
- Modify: `src/app/app/inventory/inventory.module.css`

**Acceptance Criteria:**
- [ ] `movement-form.tsx` renders a trigger button + `<dialog>` (no `<form className={styles.movementForm}>` in page body)
- [ ] `page.tsx` has no `contentGrid` / `primaryColumn` / `secondaryColumn` two-column layout
- [ ] Balance view uses `<div className={styles.tableCard}><table className={styles.table}>` — not custom `.balanceRow` cards
- [ ] Recent movements use `<ListPanel>` with `<ListRow>` — not custom `.movementRow` cards
- [ ] Inventory summary panel (green/blue/amber dots) is removed
- [ ] `npx tsc --noEmit` exits 0

**Verify:** `npx tsc --noEmit` → exits 0 with no errors

**Steps:**

- [ ] **Step 1: Rewrite `movement-form.tsx`**

Replace the entire file with the dialog modal version:

```tsx
"use client";

import * as React from "react";
import { useActionState, useState, useEffect, useRef } from "react";
import { createMovement } from "./actions";
import styles from "./inventory.module.css";

type SelectOption = {
  id: string;
  name: string | null;
  sku?: string | null;
  is_default?: boolean | null;
};

type Props = {
  components: SelectOption[];
  locations: SelectOption[];
};

const initialState = { error: "", success: "" };

const movementPresets = {
  receipt: { onHand: "0", inProd: "0" },
  allocation: { onHand: "0", inProd: "0" },
  adjustment: { onHand: "0", inProd: "0" },
  production: { onHand: "0", inProd: "0" },
} as const;

export default function MovementForm({ components, locations }: Props) {
  type MovementType = keyof typeof movementPresets;
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createMovement, initialState);
  const [movementType, setMovementType] = useState<MovementType>("receipt");
  const [deltaOnHand, setDeltaOnHand] = useState<string>(movementPresets.receipt.onHand);
  const [deltaInProd, setDeltaInProd] = useState<string>(movementPresets.receipt.inProd);
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
      <button
        type="button"
        className={styles.primary}
        onClick={() => setOpen(true)}
      >
        Log Movement +
      </button>

      <dialog ref={dialogRef} className={styles.dialog} onClose={() => setOpen(false)}>
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>Log Inventory Movement</h2>
            <button
              type="button"
              className={styles.dialogClose}
              aria-label="Close dialog"
              onClick={() => setOpen(false)}
            >
              &times;
            </button>
          </div>
          <form action={formAction} className={styles.dialogForm}>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Component *</span>
                <select name="component_id" required>
                  <option value="">Select component</option>
                  {components.map((component) => (
                    <option key={component.id} value={component.id}>
                      {component.name ?? "Unnamed"}
                      {component.sku ? ` (${component.sku})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Location *</span>
                <select name="location_id" required>
                  <option value="">Select location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name ?? "Unnamed"}
                      {location.is_default ? " — default" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Reason</span>
                <select
                  name="reason"
                  value={movementType}
                  onChange={(event) => {
                    const nextType = event.target.value as MovementType;
                    const preset = movementPresets[nextType];
                    setMovementType(nextType);
                    setDeltaOnHand(preset.onHand);
                    setDeltaInProd(preset.inProd);
                  }}
                >
                  <option value="receipt">Receipt</option>
                  <option value="allocation">Allocation</option>
                  <option value="adjustment">Adjustment</option>
                  <option value="production">Production</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Delta on-hand</span>
                <input
                  name="delta_on_hand"
                  type="number"
                  step="0.01"
                  required
                  min="-999999"
                  value={deltaOnHand}
                  onChange={(event) => setDeltaOnHand(event.target.value)}
                />
              </label>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Delta in-prod</span>
                <input
                  name="delta_in_prod"
                  type="number"
                  step="0.01"
                  required
                  min="-999999"
                  value={deltaInProd}
                  onChange={(event) => setDeltaInProd(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Reference type</span>
                <input name="reference_type" type="text" placeholder="order" />
              </label>
            </div>
            <label className={styles.field}>
              <span>Reference ID</span>
              <input name="reference_id" type="text" placeholder="uuid" />
            </label>
            {state.error && <p className={styles.error}>{state.error}</p>}
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className={styles.btnSubmit}>
                Save Movement
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
```

- [ ] **Step 2: Rewrite `inventory/page.tsx`**

Replace the entire file with:

```tsx
import styles from "./inventory.module.css";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import MovementForm from "./movement-form";
import PageHeader from "../_ui/page-header";
import EmptyState from "../_ui/empty-state";
import StatusBadge from "../_ui/status-badge";
import HelpLink from "../_ui/help-link";
import ListPanel, { ListRow } from "../_ui/list-panel";

type InventoryRow = {
  id: string;
  on_hand: number;
  in_prod: number;
  reserved: number;
  component:
    | { name: string | null; sku: string | null; reorder_point?: number | null }
    | Array<{ name: string | null; sku: string | null; reorder_point?: number | null }>
    | null;
  location: { name: string | null } | Array<{ name: string | null }> | null;
};

type MovementRow = {
  id: string;
  delta_on_hand: number;
  delta_in_prod: number;
  reason: string | null;
  created_at: string;
  component: { name: string | null } | Array<{ name: string | null }> | null;
  location: { name: string | null } | Array<{ name: string | null }> | null;
};

function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

function formatSignedValue(value: number) {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${value}`;
}

function deltaClass(
  styles: Record<string, string>,
  value: number
): string {
  if (value === 0) return styles.deltaNeutral;
  return value > 0 ? styles.deltaPositive : styles.deltaNegative;
}

export default async function InventoryPage() {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;

  const { data, error } = await supabase
    .from("inventory_balance")
    .select(
      "id,on_hand,in_prod,reserved,component:component_id(name,sku,reorder_point),location:location_id(name)"
    )
    .eq("tenant_id", tenantId)
    .order("on_hand", { ascending: false });

  const { data: movements } = await supabase
    .from("inventory_movement")
    .select(
      "id,delta_on_hand,delta_in_prod,reason,created_at,component:component_id(name),location:location_id(name)"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(8);

  const { data: components } = await supabase
    .from("component")
    .select("id,name,sku")
    .eq("tenant_id", tenantId)
    .order("name");

  const { data: locations } = await supabase
    .from("location")
    .select("id,name,is_default")
    .eq("tenant_id", tenantId)
    .order("name");

  if (error) {
    return (
      <section className={styles.page}>
        <PageHeader
          eyebrow="Operations"
          title="Inventory"
          description="Record movements and monitor live component availability across locations."
        />
        <div className={styles.errorPanel}>
          <h2>Inventory data unavailable</h2>
          <p>Failed to load balances: {error.message}</p>
        </div>
      </section>
    );
  }

  const rows = (data ?? []) as InventoryRow[];
  const movementRows = (movements ?? []) as MovementRow[];
  const defaultLocationCount =
    (locations ?? []).filter((l) => l.is_default).length || 0;
  const totalOnHand = rows.reduce((sum, row) => sum + Number(row.on_hand ?? 0), 0);
  const totalInProd = rows.reduce((sum, row) => sum + Number(row.in_prod ?? 0), 0);
  const totalReserved = rows.reduce((sum, row) => sum + Number(row.reserved ?? 0), 0);
  const lowStockCount = rows.filter((row) => {
    const component = firstOf(row.component);
    return Number(row.on_hand ?? 0) < Number(component?.reorder_point ?? 0);
  }).length;

  const metrics = [
    {
      label: "On hand units",
      value: totalOnHand.toLocaleString(),
      detail: `${rows.length.toLocaleString()} balance rows`,
    },
    {
      label: "Reserved units",
      value: totalReserved.toLocaleString(),
      detail: `${lowStockCount.toLocaleString()} low stock alerts`,
    },
    {
      label: "In production",
      value: totalInProd.toLocaleString(),
      detail: `${defaultLocationCount.toLocaleString()} default location${defaultLocationCount === 1 ? "" : "s"}`,
    },
  ];

  return (
    <section className={styles.page}>
      <PageHeader
        eyebrow="Operations"
        title="Inventory"
        description="Record movements, monitor component availability, and inspect the latest ledger activity."
        actions={
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <MovementForm components={components ?? []} locations={locations ?? []} />
            <a className={styles.export} href="/app/inventory/export">
              Export CSV
            </a>
          </div>
        }
      />

      <HelpLink slug="inventory/adjustments" label="How do inventory adjustments work?" />

      {/* Metric strip */}
      <div className={styles.metricGrid}>
        {metrics.map((metric) => (
          <div key={metric.label} className={styles.metricCard}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </div>
        ))}
      </div>

      {/* Balance table */}
      {rows.length === 0 ? (
        <EmptyState
          title="No inventory balances yet"
          message="Receive stock or run a stocktake to establish your first component balances."
        />
      ) : (
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
              {rows.map((row) => {
                const component = firstOf(row.component);
                const location = firstOf(row.location);
                const lowStock =
                  Number(row.on_hand ?? 0) <
                  Number(component?.reorder_point ?? 0);
                return (
                  <tr key={row.id}>
                    <td>
                      <strong>{component?.name ?? "Unknown component"}</strong>
                      <span className={styles.sku}>
                        {component?.sku ?? "No SKU"}
                      </span>
                    </td>
                    <td>{location?.name ?? "Unassigned"}</td>
                    <td className={styles.alignRight}>
                      {row.on_hand}
                      {lowStock && (
                        <StatusBadge variant="warning">Below reorder</StatusBadge>
                      )}
                    </td>
                    <td className={styles.alignRight}>{row.in_prod}</td>
                    <td className={styles.alignRight}>{row.reserved}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent movements */}
      <ListPanel
        eyebrow="Latest ledger events"
        title="Recent movements"
        columns={["Component", "Location", "On hand Δ", "In prod Δ", "Reason", "Date"]}
        columnsTemplate="1.4fr 0.8fr 0.6fr 0.6fr 0.8fr 1fr"
      >
        {movementRows.length === 0 ? (
          <EmptyState
            title="No movement history yet"
            message="Receipts, allocations, stocktakes, and production completions will appear here."
          />
        ) : (
          movementRows.map((movement) => {
            const component = firstOf(movement.component);
            const location = firstOf(movement.location);
            return (
              <ListRow
                key={movement.id}
                columnsTemplate="1.4fr 0.8fr 0.6fr 0.6fr 0.8fr 1fr"
              >
                <strong>{component?.name ?? "Unknown"}</strong>
                <span>{location?.name ?? "Unassigned"}</span>
                <span className={deltaClass(styles, movement.delta_on_hand)}>
                  {formatSignedValue(movement.delta_on_hand)}
                </span>
                <span className={deltaClass(styles, movement.delta_in_prod)}>
                  {formatSignedValue(movement.delta_in_prod)}
                </span>
                <StatusBadge>{movement.reason ?? "movement"}</StatusBadge>
                <span className={styles.meta}>
                  {new Date(movement.created_at).toLocaleDateString("en-AU")}
                </span>
              </ListRow>
            );
          })
        )}
      </ListPanel>
    </section>
  );
}
```

- [ ] **Step 3: Rewrite `inventory.module.css`**

Replace the entire file with:

```css
.page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── Export button ── */

.export {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 18px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--stroke-strong);
  background: var(--bg-card);
  color: var(--ink-strong);
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  text-decoration: none;
  transition: background var(--dur-fast) var(--ease-out);
}

.export:hover {
  background: var(--surface-hover);
}

/* ── Metric strip ── */

.metricGrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.metricCard {
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
}

.metricCard span {
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--ink-faint);
}

.metricCard strong {
  font-size: clamp(1.25rem, 1.1vw + 1rem, 1.95rem);
  line-height: 1;
  color: var(--ink-strong);
}

.metricCard p {
  margin: 0;
  color: var(--ink-muted);
}

/* ── Balance table ── */

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
  margin-top: 2px;
}

/* ── Delta colours (used in recent movements ListRow) ── */

.deltaPositive {
  color: var(--ok);
  font-weight: var(--fw-semibold);
}

.deltaNegative {
  color: var(--danger);
  font-weight: var(--fw-semibold);
}

.deltaNeutral {
  color: var(--ink-muted);
}

/* ── Shared text styles ── */

.meta {
  font-size: var(--fs-sm);
  color: var(--ink-muted);
}

.error {
  margin: 0;
  color: var(--danger);
  font-size: var(--fs-sm);
}

.success {
  margin: 0;
  color: var(--ok);
  font-size: var(--fs-sm);
}

/* ── Error panel (full-page error state) ── */

.errorPanel {
  padding: 24px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--danger);
  background: var(--danger-dim);
}

/* ── Primary action button ── */

.primary {
  composes: primary from "../_ui/buttons.module.css";
}

/* ── Dialog ── */

.dialog {
  border: none;
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  color: var(--ink-strong);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
  padding: 0;
  max-width: 520px;
  width: 92vw;
}

.dialog::backdrop {
  background: rgba(0, 0, 0, 0.6);
}

.dialogInner {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dialogHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialogHeader h2 {
  font-size: 20px;
}

.dialogClose {
  border: none;
  background: none;
  color: var(--ink-muted);
  font-size: 24px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.dialogForm {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.fieldRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field span {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.field input,
.field select {
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-lg);
  min-height: 42px;
  padding: 0 12px;
  background: var(--surface-1);
  color: var(--ink-strong);
  font-size: 0.95rem;
  font-family: inherit;
}

.dialogActions {
  display: flex;
  gap: 10px;
  padding-top: 6px;
}

.btnCancel {
  composes: secondary from "../_ui/buttons.module.css";
  flex: 1;
}

.btnSubmit {
  composes: primary from "../_ui/buttons.module.css";
  flex: 1;
}

/* ── Responsive ── */

@media (max-width: 1120px) {
  .metricGrid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .fieldRow {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit
```

Expected: exits 0 with no output.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/inventory/movement-form.tsx \
        src/app/app/inventory/page.tsx \
        src/app/app/inventory/inventory.module.css
git commit -m "fix(inventory): single-column layout, movement form to dialog modal

- movement-form.tsx: dialog modal with useState/useRef pattern
- page.tsx: two-column layout removed, balance view tableCard/table,
  recent movements ListPanel with signed delta columns, summary removed
- inventory.module.css: stripped to essentials, added tableCard/table
  composes, dialog classes, delta colour tokens"
```
