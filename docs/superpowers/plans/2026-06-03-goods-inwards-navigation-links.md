# Goods Inwards Navigation Deep-Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up three missing navigation deep-links — receipts on PO detail (F-03), PO ref + receipt date links on supplier tabs (F-04), and a View PO link on receipt detail (F-05).

**Architecture:** Pure presentation layer — no DB migrations, no new components, no server actions. Each task touches at most two files and builds independently. Order: F-05 (simplest, receipt detail only) → F-04 (supplier tabs, needs a minor server query change) → F-03 (PO detail, new query + new card).

**Tech Stack:** Next.js 15 App Router (server components), React, TypeScript, CSS Modules, Supabase JS client, `next/link`

**Spec:** `docs/superpowers/specs/2026-06-03-goods-inwards-navigation-links-design.md`

---

## File Map

| File | Change |
|------|--------|
| `src/app/app/goods-inwards/goods-inwards.module.css` | Add `.poLink` |
| `src/app/app/goods-inwards/receipt-detail.tsx` | Import Link; add Purchase Order field in view-mode formGrid |
| `src/app/app/suppliers/[supplierId]/page.tsx` | Add `id` to delivery_receipt select; update `PoRow` type |
| `src/app/app/suppliers/[supplierId]/supplier-tabs.tsx` | Import Link; update `PoRow` type; link PO ref + receipt date |
| `src/app/app/suppliers/[supplierId]/supplier-tabs.module.css` | Update `.poRef`; add `.receiptLink` |
| `src/app/app/purchasing/[id]/page.tsx` | Add receipt query; add `ReceiptRow` type + helpers; render Receipts card |
| `src/app/app/purchasing/purchasing.module.css` | Add `.link` for docket links in Receipts card |

---

## Task 1: F-05 — "Purchase Order" field on receipt detail (view mode)

**Files:**
- Modify: `src/app/app/goods-inwards/goods-inwards.module.css`
- Modify: `src/app/app/goods-inwards/receipt-detail.tsx`

This is a pure view-mode change. `purchase_order_id` is already in the `Receipt` type — no data change needed.

- [ ] **Step 1: Add `.poLink` to `goods-inwards.module.css`**

  Open `src/app/app/goods-inwards/goods-inwards.module.css`. Append these rules at the end of the file (after whatever the last rule is):

  ```css
  .poLink {
    font-size: var(--fs-sm);
    color: var(--brand-1);
    text-decoration: none;
  }
  .poLink:hover {
    text-decoration: underline;
  }
  ```

- [ ] **Step 2: Add `Link` import to `receipt-detail.tsx`**

  Open `src/app/app/goods-inwards/receipt-detail.tsx`. The current first line is:

  ```typescript
  "use client";
  ```

  After that, the imports begin with `import { useEffect, useRef, ... }`. Add the Link import as the second import (after the `"use client"` directive):

  ```typescript
  import Link from "next/link";
  ```

  The full top of the file should now read:

  ```typescript
  "use client";

  import Link from "next/link";
  import { useEffect, useRef, useState, useTransition } from "react";
  import { updateDeliveryReceipt, updateComponentCosts, linkReceiptToPo } from "./actions";
  ```

- [ ] **Step 3: Add the Purchase Order field in the view-mode formGrid**

  In the view-mode section (inside the `else` branch that renders the read-only `formCard`), find the `formGrid` block. It currently reads:

  ```tsx
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Location</label>
              <span>{resolveLocation(receipt)}</span>
            </div>
            {receipt.stock_in_reason && (
              <div className={styles.field}>
                <label>Reason</label>
                <span style={{ textTransform: "capitalize" }}>
                  {receipt.stock_in_reason.replace(/_/g, " ")}
                </span>
              </div>
            )}
            {receipt.notes && (
              <div className={styles.fieldFull}>
                <label>Notes</label>
                <span>{receipt.notes}</span>
              </div>
            )}
          </div>
  ```

  Replace it with:

  ```tsx
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Location</label>
              <span>{resolveLocation(receipt)}</span>
            </div>
            {receipt.purchase_order_id && (
              <div className={styles.field}>
                <label>Purchase Order</label>
                <Link
                  href={`/app/purchasing/${receipt.purchase_order_id}`}
                  className={styles.poLink}
                >
                  PO-{receipt.purchase_order_id.slice(0, 8).toUpperCase()} →
                </Link>
              </div>
            )}
            {receipt.stock_in_reason && (
              <div className={styles.field}>
                <label>Reason</label>
                <span style={{ textTransform: "capitalize" }}>
                  {receipt.stock_in_reason.replace(/_/g, " ")}
                </span>
              </div>
            )}
            {receipt.notes && (
              <div className={styles.fieldFull}>
                <label>Notes</label>
                <span>{receipt.notes}</span>
              </div>
            )}
          </div>
  ```

- [ ] **Step 4: TypeScript check**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [ ] **Step 5: Manual smoke test**

  ```
  1. Open any receipt with status 'po_linked' or 'discrepancy'
  2. Verify a "Purchase Order" row appears in the info card showing "PO-XXXXXXXX →"
  3. Click it — verify it navigates to /app/purchasing/{id}
  4. Open a receipt with status 'unmatched' — verify no "Purchase Order" row appears
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add src/app/app/goods-inwards/goods-inwards.module.css src/app/app/goods-inwards/receipt-detail.tsx
  git commit -m "feat(goods-inwards): add View PO link on receipt detail (F-05)"
  ```

---

## Task 2: F-04 — Link PO ref and receipt date in supplier tabs

**Files:**
- Modify: `src/app/app/suppliers/[supplierId]/page.tsx`
- Modify: `src/app/app/suppliers/[supplierId]/supplier-tabs.tsx`
- Modify: `src/app/app/suppliers/[supplierId]/supplier-tabs.module.css`

The supplier detail page queries `delivery_receipt(received_at)` but omits `id`. This task adds `id` to the query and uses it to make the received-date cell a navigable link. The PO ref cell becomes a link to the PO detail page.

- [ ] **Step 1: Add `id` to the delivery_receipt sub-select in `page.tsx`**

  Open `src/app/app/suppliers/[supplierId]/page.tsx`. Find the purchase_order query (around line 76–85). The relevant line is:

  ```typescript
        delivery_receipt(received_at)
  ```

  Replace it with:

  ```typescript
        delivery_receipt(id, received_at)
  ```

- [ ] **Step 2: Update the `PoRow` type in `page.tsx`**

  In the same file, find the `PoRow` type (around line 26–33):

  ```typescript
  type PoRow = {
    id: string;
    status: string;
    created_at: string;
    expected_date: string | null;
    purchase_order_line: Array<{ quantity: number; unit_cost: number | null }>;
    delivery_receipt: Array<{ received_at: string }>;
  };
  ```

  Replace with:

  ```typescript
  type PoRow = {
    id: string;
    status: string;
    created_at: string;
    expected_date: string | null;
    purchase_order_line: Array<{ quantity: number; unit_cost: number | null }>;
    delivery_receipt: Array<{ id: string; received_at: string }>;
  };
  ```

- [ ] **Step 3: TypeScript check (page.tsx)**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: one error — `supplier-tabs.tsx` still has the old `PoRow` type without `id`. That's fine; fix it in the next step.

- [ ] **Step 4: Update `PoRow` type in `supplier-tabs.tsx`**

  Open `src/app/app/suppliers/[supplierId]/supplier-tabs.tsx`. Find the `PoRow` type (around line 14–21):

  ```typescript
  type PoRow = {
    id: string;
    status: string;
    created_at: string;
    expected_date: string | null;
    purchase_order_line: Array<{ quantity: number; unit_cost: number | null }>;
    delivery_receipt: Array<{ received_at: string }>;
  };
  ```

  Replace with:

  ```typescript
  type PoRow = {
    id: string;
    status: string;
    created_at: string;
    expected_date: string | null;
    purchase_order_line: Array<{ quantity: number; unit_cost: number | null }>;
    delivery_receipt: Array<{ id: string; received_at: string }>;
  };
  ```

- [ ] **Step 5: Add `Link` import to `supplier-tabs.tsx`**

  The file starts with `"use client";` followed by the React import. Add `Link` after the React import:

  ```typescript
  "use client";

  import React, { useActionState, useEffect, useState } from "react";
  import Link from "next/link";
  ```

- [ ] **Step 6: Update `.poRef` in `supplier-tabs.module.css`**

  Open `src/app/app/suppliers/[supplierId]/supplier-tabs.module.css`. Find the `.poRef` rule (around line 388–392):

  ```css
  .poRef {
    font-family: monospace;
    font-size: 12px;
    color: var(--ink-muted);
  }
  ```

  Replace with:

  ```css
  .poRef {
    font-family: monospace;
    font-size: 12px;
    color: var(--brand-1);
    text-decoration: none;
  }
  .poRef:hover {
    text-decoration: underline;
  }
  ```

- [ ] **Step 7: Add `.receiptLink` to `supplier-tabs.module.css`**

  Immediately after the `.poRef:hover` rule added above, append:

  ```css
  .receiptLink {
    color: var(--brand-1);
    text-decoration: none;
    font-size: inherit;
  }
  .receiptLink:hover {
    text-decoration: underline;
  }
  ```

- [ ] **Step 8: Link the PO ref cell in `supplier-tabs.tsx`**

  In the `filteredPos.map(...)` block, find the PO Ref cell (around line 375–377):

  ```tsx
                  <div key={po.id} className={styles.poRow}>
                    <span className={styles.poRef}>{po.id.slice(0, 8).toUpperCase()}</span>
  ```

  Replace the `<span>` with a `<Link>`:

  ```tsx
                  <div key={po.id} className={styles.poRow}>
                    <Link href={`/app/purchasing/${po.id}`} className={styles.poRef}>
                      {po.id.slice(0, 8).toUpperCase()}
                    </Link>
  ```

- [ ] **Step 9: Link the Received date cell in `supplier-tabs.tsx`**

  In the same row, find the Received column `<span>` (around line 404–413). It currently reads:

  ```tsx
                    <span>
                      {latestReceipt
                        ? new Date(latestReceipt.received_at).toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                      {onTimePill}
                    </span>
  ```

  Replace with:

  ```tsx
                    <span>
                      {latestReceipt ? (
                        <Link
                          href={`/app/goods-inwards/${latestReceipt.id}`}
                          className={styles.receiptLink}
                        >
                          {new Date(latestReceipt.received_at).toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </Link>
                      ) : "—"}
                      {onTimePill}
                    </span>
  ```

- [ ] **Step 10: TypeScript check**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [ ] **Step 11: Manual smoke test**

  ```
  1. Open a supplier that has purchase orders
  2. Click the "Purchase Orders" tab
  3. Verify PO ref (e.g. "ABCD1234") is now a clickable blue link
  4. Click a PO ref — verify it navigates to /app/purchasing/{id}
  5. Find a PO row that has a received date (not "—")
  6. Verify the date is now a clickable blue link
  7. Click it — verify it navigates to /app/goods-inwards/{receipt_id}
  8. Verify the on-time/late pill still appears after the date link
  ```

- [ ] **Step 12: Commit**

  ```bash
  git add src/app/app/suppliers/[supplierId]/page.tsx src/app/app/suppliers/[supplierId]/supplier-tabs.tsx src/app/app/suppliers/[supplierId]/supplier-tabs.module.css
  git commit -m "feat(suppliers): link PO ref to detail page and receipt date to receipt detail (F-04)"
  ```

---

## Task 3: F-03 — Receipts card on PO detail page

**Files:**
- Modify: `src/app/app/purchasing/[id]/page.tsx`
- Modify: `src/app/app/purchasing/purchasing.module.css`

The PO detail page currently only queries the PO itself. This task adds a second query for linked delivery receipts and renders them in a card below Lines.

- [ ] **Step 1: Add `.link` to `purchasing.module.css`**

  Open `src/app/app/purchasing/purchasing.module.css`. Find the `.backLink` rule and insert the new `.link` rule immediately before it:

  ```css
  .link {
    color: var(--brand-1);
    text-decoration: none;
    font-weight: var(--fw-medium);
  }
  .link:hover {
    text-decoration: underline;
  }
  ```

- [ ] **Step 2: Add `ReceiptRow` type and `receiptStatusVariant` helper to `page.tsx`**

  Open `src/app/app/purchasing/[id]/page.tsx`. After the closing `};` of the `POLine` type (around line 21), add:

  ```typescript
  type ReceiptRow = {
    id: string;
    supplier_reference: string;
    received_at: string;
    status: string;
  };

  function receiptStatusVariant(
    status: string
  ): "default" | "success" | "warning" | "danger" | "info" {
    if (status === "po_linked") return "success";
    if (status === "discrepancy") return "warning";
    return "default";
  }

  function receiptStatusLabel(status: string): string {
    if (status === "po_linked") return "PO Linked";
    if (status === "discrepancy") return "Discrepancy";
    return "Unmatched";
  }
  ```

- [ ] **Step 3: Add the receipts query after the `notFound()` guard**

  In `page.tsx`, find the line:

  ```typescript
    if (error || !po) notFound();
  ```

  Immediately after it, add:

  ```typescript
    const { data: receipts } = await supabase
      .from("delivery_receipt")
      .select("id, supplier_reference, received_at, status")
      .eq("purchase_order_id", id)
      .eq("tenant_id", tenantId)
      .order("received_at", { ascending: false });

    const receiptRows = (receipts ?? []) as ReceiptRow[];
  ```

- [ ] **Step 4: Add the Receipts card to the JSX**

  In `page.tsx`, find the closing `</div>` of the Lines card (the one that ends the `{/* Lines card */}` section, around line 148) and insert the new Receipts card immediately after it — before the back-link `<div>`:

  ```tsx
        {/* Receipts card */}
        <div className={styles.formCard}>
          <h2>Receipts</h2>
          {receiptRows.length === 0 ? (
            <p className={styles.meta}>No deliveries recorded against this PO yet.</p>
          ) : (
            <table className={styles.linesTable}>
              <thead>
                <tr>
                  <th>Docket</th>
                  <th>Received</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {receiptRows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/app/goods-inwards/${r.id}`} className={styles.link}>
                        {r.supplier_reference}
                      </Link>
                    </td>
                    <td className={styles.meta}>
                      {new Date(r.received_at).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td>
                      <StatusBadge variant={receiptStatusVariant(r.status)}>
                        {receiptStatusLabel(r.status)}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
  ```

- [ ] **Step 5: TypeScript check**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [ ] **Step 6: Manual smoke test**

  ```
  1. Open a PO that has at least one linked delivery receipt
     (find one via Goods Inwards list — any receipt with status 'po_linked')
  2. Navigate to /app/purchasing/{po_id}
  3. Verify a "Receipts" card appears below the Lines card
  4. Verify the receipt row shows: docket ref as a blue link, received date, status badge
  5. Click the docket link — verify it navigates to the correct receipt detail page
  6. Navigate to a PO that has no receipts (a newly created open PO)
  7. Verify the Receipts card shows "No deliveries recorded against this PO yet."
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add src/app/app/purchasing/[id]/page.tsx src/app/app/purchasing/purchasing.module.css
  git commit -m "feat(purchasing): add Receipts card to PO detail page (F-03)"
  ```

---

## Self-Review Checklist

After all three tasks are committed:

- [ ] Receipt detail: PO-linked receipts show "Purchase Order" field with working link; unmatched receipts do not
- [ ] Supplier tabs: PO ref is a clickable link to `/app/purchasing/{id}`; received date is a clickable link to `/app/goods-inwards/{id}`; on-time/late pill still renders
- [ ] PO detail: Receipts card shows all linked receipts with docket links, received dates, status badges; empty state renders when no receipts
- [ ] `npx tsc --noEmit` passes with no errors
