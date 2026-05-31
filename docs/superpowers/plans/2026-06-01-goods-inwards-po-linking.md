# Goods Inwards PO Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the fully-implemented `linkReceiptToPo` and `createDeliveryReceipt` server actions to UI, enabling PO-linked receipt creation (F-02) and post-hoc PO linking from existing unmatched receipts (F-01).

**Architecture:** Server page components fetch available POs (status `open` or `in_transit`) and pass them as `AvailablePO[]` props to client components. The receipt form gains a PO banner at the top — selecting a PO auto-fills supplier, replaces lines with PO lines, and hides stock-in reason. The receipt detail gains an amber warning banner when `receipt.status === 'unmatched'` containing a PO picker and submit form.

**Tech Stack:** Next.js 15 App Router, Supabase JS client, React 18 `useTransition`, TypeScript, CSS Modules (`goods-inwards.module.css`)

**Spec:** `docs/superpowers/specs/2026-06-01-goods-inwards-po-linking-design.md`

---

### Task 1: `new/page.tsx` — Fetch available POs and pass to form

**Files:**
- Modify: `src/app/app/goods-inwards/new/page.tsx`

- [ ] **Step 1: Add the PO query to the existing `Promise.all`**

  Replace the current `Promise.all` (lines 10–23) with this version that adds a 5th query:

  ```typescript
  const [
    suppliersResult,
    componentsResult,
    locationsResult,
    supplierComponentResult,
    posResult,
  ] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("tenant_id", tenantId).order("name"),
    supabase
      .from("component")
      .select("id, name, sku, unit, cost_per_unit, group:group_id(name)")
      .eq("tenant_id", tenantId)
      .order("name"),
    supabase.from("location").select("id, name, is_default").eq("tenant_id", tenantId).order("name"),
    supabase
      .from("supplier_component")
      .select("supplier_id, component_id")
      .eq("tenant_id", tenantId),
    supabase
      .from("purchase_order")
      .select(
        "id, supplier_id, suppliers(name), purchase_order_line(id, component_id, quantity, quantity_received)"
      )
      .in("status", ["open", "in_transit"])
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
  ]);
  ```

- [ ] **Step 2: Add `posResult.error` to the error guard**

  Replace the error check (lines 25–32) with:

  ```typescript
  if (
    suppliersResult.error ||
    componentsResult.error ||
    locationsResult.error ||
    supplierComponentResult.error ||
    posResult.error
  ) {
    throw new Error("Failed to load form data");
  }
  ```

- [ ] **Step 3: Map raw PO rows to a typed `AvailablePO[]`**

  Add this block after the `supplierComponentMap` construction (after line 56, before the `return`):

  ```typescript
  const availablePOs = (posResult.data ?? []).map((po) => {
    const rawSupplier = Array.isArray(po.suppliers) ? po.suppliers[0] : po.suppliers;
    return {
      id: po.id as string,
      supplier_id: po.supplier_id as string | null,
      supplier_name: (rawSupplier as { name: string } | null)?.name ?? null,
      lines: ((po.purchase_order_line ?? []) as Array<{
        id: string;
        component_id: string;
        quantity: number;
        quantity_received: number;
      }>).map((l) => ({
        id: l.id,
        component_id: l.component_id,
        quantity: l.quantity,
        quantity_received: l.quantity_received ?? 0,
      })),
    };
  });
  ```

- [ ] **Step 4: Pass `availablePOs` to `<ReceiptForm>`**

  Update the return JSX (currently lines 58–65):

  ```tsx
  return (
    <ReceiptForm
      suppliers={suppliersResult.data ?? []}
      components={components}
      locations={locations}
      supplierComponentMap={supplierComponentMap}
      availablePOs={availablePOs}
    />
  );
  ```

- [ ] **Step 5: Verify the build compiles**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: TypeScript will complain that `ReceiptForm` doesn't accept `availablePOs` yet (Task 2 adds that). The error should be only about the unknown prop — no other errors. Proceed.

- [ ] **Step 6: Commit**

  ```bash
  git add src/app/app/goods-inwards/new/page.tsx
  git commit -m "feat(goods-inwards): fetch available POs in new receipt page"
  ```

---

### Task 2: `receipt-form.tsx` — PO banner, state, and form wiring

**Files:**
- Modify: `src/app/app/goods-inwards/receipt-form.tsx`

This is the largest task. Make changes in the order shown — each step builds on the previous.

- [ ] **Step 1: Add `POLine`, `AvailablePO`, and extend `LineState` types**

  Replace the existing type block at the top of the file (lines 9–20) with:

  ```typescript
  type Supplier = { id: string; name: string };
  type Component = PickerComponent;
  type Location = { id: string; name: string; is_default: boolean };

  type POLine = {
    id: string;
    component_id: string;
    quantity: number;
    quantity_received: number;
  };

  type AvailablePO = {
    id: string;
    supplier_id: string | null;
    supplier_name: string | null;
    lines: POLine[];
  };

  type LineState = {
    key: string;
    component_id: string;
    quantity_delivered: string;
    cost_per_unit: string;
    notes: string;
    extractedName?: string;
    quantity_expected?: number | null;
    purchase_order_line_id?: string | null;
  };
  ```

- [ ] **Step 2: Add `availablePOs` to the component props**

  Replace the props type (lines 50–54) with:

  ```typescript
  {
    suppliers: Supplier[];
    components: Component[];
    locations: Location[];
    supplierComponentMap: Record<string, string[]>;
    availablePOs: AvailablePO[];
  }
  ```

  And update the destructuring on line 45:

  ```typescript
  export default function ReceiptForm({
    suppliers,
    components,
    locations,
    supplierComponentMap,
    availablePOs,
  }: {
    suppliers: Supplier[];
    components: Component[];
    locations: Location[];
    supplierComponentMap: Record<string, string[]>;
    availablePOs: AvailablePO[];
  }) {
  ```

- [ ] **Step 3: Add `selectedPoId` state and `handlePoSelect` function**

  Add these after the existing state declarations (after line 65, before the `preferredIds` useMemo):

  ```typescript
  const [selectedPoId, setSelectedPoId] = useState<string>("");

  function handlePoSelect(poId: string) {
    setSelectedPoId(poId);
    if (!poId) {
      // Cleared — reset supplier and lines
      setSupplierId("");
      setShowSupplierOverride(false);
      setLines([blankLine()]);
      return;
    }
    const po = availablePOs.find((p) => p.id === poId);
    if (!po) return;
    // Auto-fill supplier from PO
    setSupplierId(po.supplier_id ?? "");
    setShowSupplierOverride(false);
    // Pre-populate lines from remaining PO quantities
    const poLines = po.lines.map((l) => {
      const remaining = l.quantity - l.quantity_received;
      return {
        key: crypto.randomUUID(),
        component_id: l.component_id,
        quantity_delivered: String(Math.max(0, remaining)),
        cost_per_unit: "",
        notes: "",
        quantity_expected: Math.max(0, remaining),
        purchase_order_line_id: l.id,
      };
    });
    setLines(poLines.length > 0 ? poLines : [blankLine()]);
  }
  ```

- [ ] **Step 4: Update `handleSubmit` to pass PO fields**

  Replace the existing `handleSubmit` function (lines 153–183) with:

  ```typescript
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const filledLines = lines.filter((l) => l.component_id && l.quantity_delivered);
    if (filledLines.length === 0) {
      setError("At least one complete line is required.");
      return;
    }

    if (!formRef.current) return;
    const fd = new FormData(formRef.current);

    if (showSupplierOverride) fd.set("supplier_id", "");

    // When a PO is selected, ensure supplier_id and purchase_order_id are set
    // (supplier select is disabled so it won't appear in FormData)
    if (selectedPoId) {
      fd.set("purchase_order_id", selectedPoId);
      fd.set("supplier_id", supplierId);
    }

    fd.set(
      "lines",
      JSON.stringify(
        filledLines.map((l) => ({
          component_id: l.component_id,
          purchase_order_line_id: l.purchase_order_line_id ?? null,
          quantity_delivered: parseFloat(l.quantity_delivered),
          quantity_expected: l.quantity_expected ?? null,
          cost_per_unit: l.cost_per_unit ? parseFloat(l.cost_per_unit) : null,
          notes: l.notes || null,
        }))
      )
    );

    startTransition(async () => {
      const result = await createDeliveryReceipt(fd);
      if (result?.error) setError(result.error);
    });
  }
  ```

- [ ] **Step 5: Add the PO banner JSX — insert before the PDF parse card**

  Add this block inside the `<form>`, immediately after `{error && ...}` and before the PDF parse `<div className={styles.formCard}>`:

  ```tsx
  {/* PO linking banner */}
  {availablePOs.length > 0 && (
    <div
      className={styles.formCard}
      style={{
        background: "var(--bg-subtle, #f8fafc)",
        borderColor: "var(--brand-1, #3b82f6)",
        borderWidth: "1.5px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="po_select" style={{ fontWeight: 700, fontSize: "0.9rem" }}>
          Link to Purchase Order{" "}
          <span style={{ fontWeight: 400, color: "var(--ink-muted)" }}>(optional)</span>
        </label>
        <select
          id="po_select"
          value={selectedPoId}
          onChange={(e) => handlePoSelect(e.target.value)}
          style={{ maxWidth: 420 }}
        >
          <option value="">Select a PO to pre-fill this receipt…</option>
          {availablePOs.map((po) => (
            <option key={po.id} value={po.id}>
              PO-{po.id.slice(0, 8).toUpperCase()} &middot; {po.supplier_name ?? "Unknown supplier"} &middot;{" "}
              {po.lines.length} line{po.lines.length !== 1 ? "s" : ""}
            </option>
          ))}
        </select>
        {selectedPoId ? (
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--ok, green)" }}>
            ✓ Supplier and lines pre-filled from PO — adjust delivered quantities below.
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--ink-muted)" }}>
            Fills supplier, lines &amp; quantities automatically.
          </p>
        )}
      </div>
    </div>
  )}
  ```

- [ ] **Step 6: Disable the supplier `<select>` when a PO is selected**

  In the "Delivery details" card, find the supplier `<select>` (around line 231) and add `disabled={!!selectedPoId}`:

  ```tsx
  <select
    id="supplier_id"
    name="supplier_id"
    value={showSupplierOverride ? "__other__" : supplierId}
    onChange={(e) => handleSupplierChange(e.target.value)}
    disabled={!!selectedPoId}
  >
  ```

- [ ] **Step 7: Conditionally hide `stock_in_reason` when PO is selected**

  Find the stock_in_reason field block (around line 299–307) and wrap it:

  ```tsx
  {!selectedPoId && (
    <div className={styles.field}>
      <label htmlFor="stock_in_reason">Reason</label>
      <select id="stock_in_reason" name="stock_in_reason" required>
        <option value="">Select reason…</option>
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
    </div>
  )}
  ```

- [ ] **Step 8: Update the lines table to show the Expected column and lock PO lines**

  Replace the entire `<table className={styles.linesTable}>` block (lines 318–437) with:

  ```tsx
  <table className={styles.linesTable}>
    <thead>
      <tr>
        <th>Component</th>
        {selectedPoId && <th>Expected</th>}
        <th>Qty delivered</th>
        <th>Cost / unit (optional)</th>
        <th>Note</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {lines.map((line) => (
        <tr key={line.key}>
          <td>
            {line.extractedName && (
              <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: 4 }}>
                From PDF: {line.extractedName}
              </div>
            )}
            {line.purchase_order_line_id ? (
              // PO-sourced line: component is locked
              <span style={{ fontSize: "0.9rem" }}>
                {(() => {
                  const c = components.find((c) => c.id === line.component_id);
                  return c ? componentLabel(c) : line.component_id;
                })()}
              </span>
            ) : (
              // Free line: editable component select + picker
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <select
                  value={line.component_id}
                  onChange={(e) => updateLine(line.key, { component_id: e.target.value })}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <option value="">Select component…</option>
                  {preferredIds && preferredCount > 0 ? (
                    <>
                      <optgroup label={`From ${supplierName ?? "supplier"}`}>
                        {sortedComponents
                          .filter((c) => preferredIds.has(c.id))
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {componentLabel(c)}
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Other components">
                        {sortedComponents
                          .filter((c) => !preferredIds.has(c.id))
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {componentLabel(c)}
                            </option>
                          ))}
                      </optgroup>
                    </>
                  ) : (
                    sortedComponents.map((c) => (
                      <option key={c.id} value={c.id}>
                        {componentLabel(c)}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setPickerLineKey(line.key)}
                  style={{ padding: "4px 10px", whiteSpace: "nowrap" }}
                  title="Browse all components"
                >
                  Browse…
                </button>
              </div>
            )}
          </td>
          {selectedPoId && (
            <td style={{ color: "var(--ink-muted)" }}>
              {line.quantity_expected != null ? line.quantity_expected : "—"}
            </td>
          )}
          <td>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={line.quantity_delivered}
              onChange={(e) => updateLine(line.key, { quantity_delivered: e.target.value })}
              style={{ width: 90 }}
            />
          </td>
          <td>
            <input
              type="number"
              min="0"
              step="0.01"
              value={line.cost_per_unit}
              onChange={(e) => updateLine(line.key, { cost_per_unit: e.target.value })}
              placeholder="—"
              style={{ width: 100 }}
            />
          </td>
          <td>
            <input
              type="text"
              placeholder="Note…"
              value={line.notes}
              onChange={(e) => updateLine(line.key, { notes: e.target.value })}
              style={{ width: 140 }}
            />
          </td>
          <td>
            <button
              type="button"
              onClick={() => removeLine(line.key)}
              className={styles.secondary}
              style={{ padding: "4px 10px" }}
              disabled={lines.length === 1}
            >
              ✕
            </button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
  ```

- [ ] **Step 9: Verify build compiles cleanly**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: no errors (Task 1's `availablePOs` prop now matches, Task 3/4 not yet done so detail page errors are expected if they reference the type — but that file is unchanged so far).

- [ ] **Step 10: Manual smoke test — new receipt form**

  ```
  1. Open http://localhost:3000/app/goods-inwards/new
  2. Confirm PO banner appears at the top (if open POs exist)
  3. Select a PO — verify supplier auto-fills (greyed out) and lines populate with expected quantities
  4. Verify stock-in reason field disappears
  5. Adjust a delivered quantity, add a cost, save
  6. Verify the saved receipt has status 'po_linked' or 'discrepancy' (not 'unmatched')
  7. Clear the PO selection — verify lines reset and supplier unlocks
  ```

- [ ] **Step 11: Commit**

  ```bash
  git add src/app/app/goods-inwards/receipt-form.tsx
  git commit -m "feat(goods-inwards): PO banner in new receipt form — auto-fills supplier and lines (F-02)"
  ```

---

### Task 3: `[id]/page.tsx` — Fetch available POs for receipt detail

**Files:**
- Modify: `src/app/app/goods-inwards/[id]/page.tsx`

- [ ] **Step 1: Add PO query to the existing `Promise.all`**

  Replace the current `Promise.all` (lines 16–43) with:

  ```typescript
  const [{ data: receipt }, { data: suppliers }, { data: locations }, { data: rawPos }] =
    await Promise.all([
      supabase
        .from("delivery_receipt")
        .select(
          `id, supplier_id, supplier_name_override, supplier_reference, purchase_order_id,
           status, received_at, notes, stock_in_reason, created_at,
           supplier:supplier_id(name),
           location:location_id(id, name),
           delivery_receipt_line(
             id, component_id, quantity_delivered, quantity_expected, notes, cost_per_unit,
             component:component_id(name, sku)
           )`
        )
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single(),
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name"),
      supabase
        .from("location")
        .select("id, name, is_default")
        .eq("tenant_id", tenantId)
        .order("name"),
      supabase
        .from("purchase_order")
        .select(
          "id, supplier_id, suppliers(name), purchase_order_line(id, component_id, quantity, quantity_received)"
        )
        .in("status", ["open", "in_transit"])
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),
    ]);
  ```

- [ ] **Step 2: Map POs and filter by receipt's supplier; pass to `<ReceiptDetail>`**

  Replace the return block (lines 45–53) with:

  ```typescript
  if (!receipt) notFound();

  const receiptSupplierId = receipt.supplier_id as string | null;
  const availablePOs = (rawPos ?? [])
    .filter((po) => !receiptSupplierId || po.supplier_id === receiptSupplierId)
    .map((po) => {
      const rawSupplier = Array.isArray(po.suppliers) ? po.suppliers[0] : po.suppliers;
      return {
        id: po.id as string,
        supplier_id: po.supplier_id as string | null,
        supplier_name: (rawSupplier as { name: string } | null)?.name ?? null,
        lines: ((po.purchase_order_line ?? []) as Array<{
          id: string;
          component_id: string;
          quantity: number;
          quantity_received: number;
        }>).map((l) => ({
          id: l.id,
          component_id: l.component_id,
          quantity: l.quantity,
          quantity_received: l.quantity_received ?? 0,
        })),
      };
    });

  return (
    <ReceiptDetail
      receipt={receipt}
      suppliers={suppliers ?? []}
      locations={locations ?? []}
      availablePOs={availablePOs}
    />
  );
  ```

- [ ] **Step 3: Verify build**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: TypeScript will error that `ReceiptDetail` doesn't accept `availablePOs` yet — that's resolved in Task 4. No other errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/app/goods-inwards/[id]/page.tsx
  git commit -m "feat(goods-inwards): fetch available POs in receipt detail page"
  ```

---

### Task 4: `receipt-detail.tsx` — Amber Link-to-PO banner

**Files:**
- Modify: `src/app/app/goods-inwards/receipt-detail.tsx`

- [ ] **Step 1: Import `linkReceiptToPo` from actions**

  Replace the existing import on line 4:

  ```typescript
  import { updateDeliveryReceipt, updateComponentCosts, linkReceiptToPo } from "./actions";
  ```

- [ ] **Step 2: Add `AvailablePO` type and extend the component props**

  Add the `AvailablePO` type after the existing `LocationOption` type (after line 39):

  ```typescript
  type AvailablePO = {
    id: string;
    supplier_id: string | null;
    supplier_name: string | null;
    lines: Array<{
      id: string;
      component_id: string;
      quantity: number;
      quantity_received: number;
    }>;
  };
  ```

  Update the component props type (lines 81–84):

  ```typescript
  {
    receipt: Receipt;
    suppliers: SupplierOption[];
    locations: LocationOption[];
    availablePOs: AvailablePO[];
  }
  ```

  Update the destructuring (line 77):

  ```typescript
  export default function ReceiptDetail({
    receipt,
    suppliers,
    locations,
    availablePOs,
  }: {
    receipt: Receipt;
    suppliers: SupplierOption[];
    locations: LocationOption[];
    availablePOs: AvailablePO[];
  }) {
  ```

- [ ] **Step 3: Add link banner state and handler**

  Add these after the existing `[isPending, startTransition]` declaration (after line 97):

  ```typescript
  const linkFormRef = useRef<HTMLFormElement>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isLinkPending, startLinkTransition] = useTransition();

  function handleLinkPo(e: React.FormEvent) {
    e.preventDefault();
    setLinkError(null);
    if (!linkFormRef.current) return;
    const fd = new FormData(linkFormRef.current);
    fd.set("receipt_id", receipt.id);
    startLinkTransition(async () => {
      const result = await linkReceiptToPo(fd);
      if (result?.error) setLinkError(result.error);
    });
  }
  ```

- [ ] **Step 4: Add the amber banner JSX between the header card and lines card**

  Find the comment `{/* Lines card */}` (around line 329) and insert this block immediately before it:

  ```tsx
  {/* Link-to-PO banner — only when unmatched */}
  {receipt.status === "unmatched" && (
    <div
      style={{
        background: "var(--warn-bg, #fffbeb)",
        border: "1.5px solid var(--warn, #f59e0b)",
        borderRadius: 8,
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <p style={{ margin: 0, fontWeight: 700, color: "var(--warn-ink, #92400e)", fontSize: "0.9rem" }}>
        ⚠ This receipt isn&apos;t linked to a PO
      </p>
      <form ref={linkFormRef} onSubmit={handleLinkPo}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            name="purchase_order_id"
            required
            style={{ flex: 1, maxWidth: 380 }}
          >
            <option value="">Select a purchase order…</option>
            {availablePOs.length === 0 ? (
              <option value="" disabled>
                No open POs for this supplier
              </option>
            ) : (
              availablePOs.map((po) => (
                <option key={po.id} value={po.id}>
                  PO-{po.id.slice(0, 8).toUpperCase()} &middot; {po.supplier_name ?? "Unknown"} &middot;{" "}
                  {po.lines.length} line{po.lines.length !== 1 ? "s" : ""}
                </option>
              ))
            )}
          </select>
          <button
            type="submit"
            className={styles.primary}
            disabled={isLinkPending || availablePOs.length === 0}
          >
            {isLinkPending ? "Linking…" : "Link PO"}
          </button>
        </div>
        {availablePOs.length > 0 && (
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--warn-ink, #92400e)" }}>
            Showing open and in-transit POs for {resolveSupplier(receipt)}
          </p>
        )}
      </form>
      {linkError && (
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--error, red)" }}>
          {linkError}
        </p>
      )}
    </div>
  )}
  ```

- [ ] **Step 5: Verify clean build**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: no errors.

- [ ] **Step 6: Manual smoke test — receipt detail link banner**

  ```
  1. Open any existing receipt with status 'unmatched'
  2. Verify the amber "This receipt isn't linked to a PO" banner appears
  3. Confirm the PO dropdown shows only open/in-transit POs for the receipt's supplier
  4. Select a PO and click "Link PO"
  5. Verify page reloads and:
     - Banner is gone
     - Status badge shows "PO linked" or "Discrepancy"
     - Lines table now shows quantity_expected values populated
  6. Open a receipt with status 'po_linked' or 'discrepancy' — banner must NOT appear
  7. Test error path: if linkReceiptToPo returns an error (e.g. select a PO with no matching lines),
     verify error message appears in the banner
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add src/app/app/goods-inwards/receipt-detail.tsx
  git commit -m "feat(goods-inwards): amber link-to-PO banner on unmatched receipts (F-01)"
  ```

---

## Self-Review Checklist

Run through after all tasks are committed:

- [ ] Create a receipt with a PO selected — confirm it saves with `status = 'po_linked'` or `'discrepancy'`, not `'unmatched'`
- [ ] Verify that after PO selection in the form, the `purchase_order_id` field in the saved `delivery_receipt` row is set (check Supabase dashboard or query)
- [ ] Verify `quantity_expected` on each `delivery_receipt_line` row is populated from the PO line remaining quantity
- [ ] Link an existing unmatched receipt to a PO — check the PO's `quantity_received` has been updated on its lines
- [ ] Verify a PO auto-closes (status → `'received'`) when all its lines are fully received via the link action
- [ ] `npx tsc --noEmit` passes with no errors
