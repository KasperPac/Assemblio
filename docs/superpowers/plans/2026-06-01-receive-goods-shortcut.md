# "Receive Goods" Shortcut from PO Detail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Receive Goods →" CTA to a new PO detail page so purchasing users can start a goods receipt directly from a PO, with supplier and lines pre-filled in the form.

**Architecture:** A new server component at `purchasing/[id]/page.tsx` renders PO details and a "Receive Goods →" link. That link navigates to `/app/goods-inwards/new?po={id}`. The new receipt page reads the `po` searchParam and passes it to `ReceiptForm`, which lazily initialises its state from the matching `AvailablePO` entry. No server actions or DB changes required.

**Tech Stack:** Next.js 15 App Router (server components, `searchParams` as Promise), React 18 `useState` lazy initializer, TypeScript, CSS Modules (`purchasing.module.css`)

**Spec:** `docs/superpowers/specs/2026-06-01-receive-goods-shortcut-design.md`

---

## File Structure

| File | Role |
|------|------|
| `src/app/app/purchasing/page.tsx` | Modified — PO number becomes a `<Link>` to detail |
| `src/app/app/purchasing/[id]/page.tsx` | **New** — PO detail server component |
| `src/app/app/goods-inwards/new/page.tsx` | Modified — read `searchParams.po`, pass as `initialPoId` |
| `src/app/app/goods-inwards/receipt-form.tsx` | Modified — accept `initialPoId`, lazy-init state |

---

### Task 1: Make PO number a link in the purchasing list

**Files:**
- Modify: `src/app/app/purchasing/page.tsx`

Context: The purchasing list renders PO rows at lines 117–144. Each row has a `<strong>PO-{row.id.slice(0,6)}</strong>` in the first column. This step turns that into a `<Link>` to the detail page.

- [ ] **Step 1: Add the Link import**

  At the top of `src/app/app/purchasing/page.tsx`, add `Link` to the imports. The current first line imports styles — add after it:

  ```typescript
  import Link from "next/link";
  import styles from "./purchasing.module.css";
  import { redirect } from "next/navigation";
  // ... rest of existing imports unchanged
  ```

- [ ] **Step 2: Replace the PO number strong tag with a Link**

  In the list rows section (the `.map((row) => ...)` block), find:

  ```tsx
  <strong>PO-{row.id.slice(0, 6)}</strong>
  ```

  Replace with:

  ```tsx
  <Link href={`/app/purchasing/${row.id}`} style={{ fontWeight: 700, color: "var(--brand-1)", textDecoration: "none" }}>
    PO-{row.id.slice(0, 6)}
  </Link>
  ```

- [ ] **Step 3: Verify build**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/app/purchasing/page.tsx
  git commit -m "feat(purchasing): make PO numbers clickable links to detail page"
  ```

---

### Task 2: Create the PO detail page

**Files:**
- Create: `src/app/app/purchasing/[id]/page.tsx`

Context: There is no PO detail page today. This is a pure server component. It fetches the PO with its lines and supplier, renders a header card with a "Receive Goods →" CTA (only for open/in_transit POs), and a lines table showing ordered/received/outstanding quantities. It reuses `purchasing.module.css` from the parent directory.

- [ ] **Step 1: Create the file with the full implementation**

  Create `src/app/app/purchasing/[id]/page.tsx`:

  ```typescript
  import { notFound, redirect } from "next/navigation";
  import Link from "next/link";
  import { getServerTenantContext } from "@/lib/tenant/context";
  import PageHeader from "../../_ui/page-header";
  import StatusBadge from "../../_ui/status-badge";
  import styles from "../purchasing.module.css";

  type Props = {
    params: Promise<{ id: string }>;
  };

  type POLine = {
    id: string;
    quantity: number;
    quantity_received: number;
    component:
      | { name: string; sku: string | null }
      | Array<{ name: string; sku: string | null }>
      | null;
  };

  function getStatusVariant(status: string): "default" | "success" | "warning" | "danger" | "info" {
    if (status === "received") return "success";
    if (status === "cancelled" || status === "archived") return "danger";
    if (status === "in_transit") return "info";
    return "warning";
  }

  export default async function PurchaseOrderDetailPage({ params }: Props) {
    const { id } = await params;

    const ctx = await getServerTenantContext();
    if (!ctx) redirect("/auth/login");
    const { supabase, tenantId } = ctx;

    const { data: po, error } = await supabase
      .from("purchase_order")
      .select(
        `id, status, created_at,
         suppliers(name),
         purchase_order_line(id, quantity, quantity_received,
           component:component_id(name, sku))`
      )
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !po) notFound();

    const rawSupplier = Array.isArray(po.suppliers) ? po.suppliers[0] : po.suppliers;
    const supplierName = (rawSupplier as { name: string } | null)?.name ?? "Unknown supplier";
    const canReceive = po.status === "open" || po.status === "in_transit";
    const lines = (po.purchase_order_line ?? []) as POLine[];

    return (
      <div className={styles.page}>
        <PageHeader
          breadcrumbs={[
            { label: "Purchase Orders", href: "/app/purchasing" },
            { label: `PO-${id.slice(0, 8).toUpperCase()}` },
          ]}
          title={`PO-${id.slice(0, 8).toUpperCase()}`}
          actions={
            canReceive ? (
              <Link
                href={`/app/goods-inwards/new?po=${id}`}
                className={styles.primary}
              >
                Receive Goods →
              </Link>
            ) : undefined
          }
        />

        {/* Info card */}
        <div className={styles.formCard}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <p className={styles.meta} style={{ marginBottom: 4 }}>Supplier</p>
              <strong>{supplierName}</strong>
            </div>
            <div>
              <p className={styles.meta} style={{ marginBottom: 4 }}>Status</p>
              <StatusBadge variant={getStatusVariant(po.status)}>
                {po.status.replace(/_/g, " ")}
              </StatusBadge>
            </div>
            <div>
              <p className={styles.meta} style={{ marginBottom: 4 }}>Created</p>
              <span>
                {new Date(po.created_at).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Lines card */}
        <div className={styles.formCard}>
          <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Lines</h2>
          {lines.length === 0 ? (
            <p className={styles.meta}>No lines on this PO.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--stroke)" }}>
                  <th style={{ textAlign: "left", padding: "6px 0", fontWeight: 600 }}>Component</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>Ordered</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>Received</th>
                  <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 600 }}>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const comp = Array.isArray(line.component)
                    ? line.component[0]
                    : line.component;
                  const compName = comp
                    ? comp.sku
                      ? `${comp.name} (${comp.sku})`
                      : comp.name
                    : "Unknown component";
                  const outstanding = line.quantity - line.quantity_received;
                  const fullyReceived = outstanding <= 0;
                  return (
                    <tr
                      key={line.id}
                      style={{
                        borderBottom: "1px solid var(--stroke-faint, var(--stroke))",
                        opacity: fullyReceived ? 0.45 : 1,
                      }}
                    >
                      <td style={{ padding: "8px 0" }}>{compName}</td>
                      <td style={{ textAlign: "right", padding: "8px", color: "var(--ink-muted)" }}>
                        {line.quantity}
                      </td>
                      <td style={{ textAlign: "right", padding: "8px", color: "var(--ink-muted)" }}>
                        {line.quantity_received}
                      </td>
                      <td style={{ textAlign: "right", padding: "8px 0" }}>
                        {fullyReceived ? (
                          <span style={{ color: "var(--ink-faint, var(--ink-muted))" }}>—</span>
                        ) : (
                          outstanding
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <Link
            href="/app/purchasing"
            style={{ color: "var(--brand-1)", textDecoration: "none", fontWeight: 500, fontSize: "0.9rem" }}
          >
            ← Back to purchase orders
          </Link>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify build**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors. If TypeScript complains about `po.status` not having `replace`, cast `po.status as string`.

- [ ] **Step 3: Manual smoke test**

  ```
  1. Open http://localhost:3000/app/purchasing
  2. Click any PO number — should navigate to /app/purchasing/{id}
  3. Verify supplier name, status badge, created date appear
  4. Verify lines table shows component names, ordered/received/outstanding
  5. For an open or in_transit PO: verify "Receive Goods →" button appears in the header
  6. For a received/cancelled PO: verify the button does NOT appear
  7. Click "← Back to purchase orders" — verify navigation back
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/app/purchasing/[id]/page.tsx
  git commit -m "feat(purchasing): add PO detail page with Receive Goods CTA"
  ```

---

### Task 3: Pass `initialPoId` from the new receipt page

**Files:**
- Modify: `src/app/app/goods-inwards/new/page.tsx`

Context: `NewReceiptPage` currently ignores `searchParams`. When the user clicks "Receive Goods →" from a PO detail, the URL becomes `/app/goods-inwards/new?po={id}`. This task makes the page read that param and pass it to `ReceiptForm`. In Next.js 15 App Router, `searchParams` is a `Promise`.

- [ ] **Step 1: Add the Props type and searchParams to the function signature**

  Replace the current opening of the function (lines 5–8):

  ```typescript
  export default async function NewReceiptPage() {
    const ctx = await getServerTenantContext();
  ```

  With:

  ```typescript
  type Props = {
    searchParams: Promise<{ po?: string }>;
  };

  export default async function NewReceiptPage({ searchParams }: Props) {
    const { po: initialPoId } = await searchParams;
    const ctx = await getServerTenantContext();
  ```

- [ ] **Step 2: Pass `initialPoId` to `<ReceiptForm>`**

  Replace the return block (currently the last lines of the file):

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

  With:

  ```tsx
  return (
    <ReceiptForm
      suppliers={suppliersResult.data ?? []}
      components={components}
      locations={locations}
      supplierComponentMap={supplierComponentMap}
      availablePOs={availablePOs}
      initialPoId={initialPoId}
    />
  );
  ```

- [ ] **Step 3: Verify build**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: TypeScript will error that `ReceiptForm` doesn't accept `initialPoId` yet — that's fixed in Task 4. Only that error is expected. No other errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/app/goods-inwards/new/page.tsx
  git commit -m "feat(goods-inwards): read ?po= param and pass initialPoId to receipt form"
  ```

---

### Task 4: Lazy-initialise receipt form state from `initialPoId`

**Files:**
- Modify: `src/app/app/goods-inwards/receipt-form.tsx`

Context: `ReceiptForm` currently initialises `supplierId`, `lines`, and `selectedPoId` to empty/blank regardless of any URL param. This task adds an `initialPoId` prop and uses it to derive the initial state synchronously (no `useEffect`, no flash). The existing `handlePoSelect` function is unchanged — it still handles user-driven changes.

The current state declarations (lines 74–85) are:
```typescript
const defaultLocation = locations.find((l) => l.is_default) ?? locations[0];

const [supplierId, setSupplierId] = useState<string>("");
const [showSupplierOverride, setShowSupplierOverride] = useState(false);
const [locationId, setLocationId] = useState(defaultLocation?.id ?? "");
const [lines, setLines] = useState<LineState[]>([blankLine()]);
const [error, setError] = useState<string | null>(null);
const [isPending, startTransition] = useTransition();
const [pickerLineKey, setPickerLineKey] = useState<string | null>(null);
const formRef = useRef<HTMLFormElement>(null);

const [selectedPoId, setSelectedPoId] = useState<string>("");
```

- [ ] **Step 1: Add `initialPoId` to the props type and destructuring**

  Replace the component signature (currently lines 61–73):

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

  With:

  ```typescript
  export default function ReceiptForm({
    suppliers,
    components,
    locations,
    supplierComponentMap,
    availablePOs,
    initialPoId,
  }: {
    suppliers: Supplier[];
    components: Component[];
    locations: Location[];
    supplierComponentMap: Record<string, string[]>;
    availablePOs: AvailablePO[];
    initialPoId?: string;
  }) {
  ```

- [ ] **Step 2: Compute `initialPo` and update the three state declarations**

  Replace the state block (lines 74–85) with:

  ```typescript
  const defaultLocation = locations.find((l) => l.is_default) ?? locations[0];

  // Derive initial PO selection from ?po= URL param (null if not found or already received)
  const initialPo = initialPoId
    ? (availablePOs.find((p) => p.id === initialPoId) ?? null)
    : null;

  const [supplierId, setSupplierId] = useState<string>(initialPo?.supplier_id ?? "");
  const [showSupplierOverride, setShowSupplierOverride] = useState(false);
  const [locationId, setLocationId] = useState(defaultLocation?.id ?? "");
  const [lines, setLines] = useState<LineState[]>(() => {
    if (!initialPo) return [blankLine()];
    const poLines = initialPo.lines
      .filter((l) => l.quantity - l.quantity_received > 0)
      .map((l) => {
        const remaining = l.quantity - l.quantity_received;
        return {
          key: crypto.randomUUID(),
          component_id: l.component_id,
          quantity_delivered: String(remaining),
          cost_per_unit: "",
          notes: "",
          quantity_expected: remaining,
          purchase_order_line_id: l.id,
        };
      });
    return poLines.length > 0 ? poLines : [blankLine()];
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pickerLineKey, setPickerLineKey] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [selectedPoId, setSelectedPoId] = useState<string>(initialPo?.id ?? "");
  ```

- [ ] **Step 3: Verify clean build**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors (the Task 3 TS error about `initialPoId` is now resolved).

- [ ] **Step 4: Manual end-to-end smoke test**

  ```
  1. Open http://localhost:3000/app/purchasing
  2. Click a PO number to go to its detail page
  3. Confirm the PO's lines, supplier, and status are shown
  4. If the PO is open or in_transit: click "Receive Goods →"
  5. Verify the receipt form loads with:
     - The PO banner showing the selected PO (dropdown shows correct PO)
     - Supplier field auto-filled and locked (greyed out)
     - Lines pre-populated from the PO (expected quantities shown)
     - Stock-in reason field hidden
  6. Adjust a delivered quantity and submit the receipt
  7. Verify the saved receipt has status 'po_linked' or 'discrepancy'
  8. Test fallback: navigate directly to /app/goods-inwards/new?po=nonexistent-id
     — form should load normally with no pre-selection and an empty PO banner dropdown
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/app/goods-inwards/receipt-form.tsx
  git commit -m "feat(goods-inwards): pre-select PO from ?po= URL param on new receipt form"
  ```

---

## Self-Review Checklist

After all tasks are committed:

- [ ] Click a PO number in the purchasing list — lands on `/app/purchasing/{id}`
- [ ] "Receive Goods →" appears for open/in_transit POs, absent for received/cancelled
- [ ] Clicking "Receive Goods →" navigates to the receipt form with the PO pre-selected
- [ ] Supplier is auto-filled, lines are pre-populated, stock-in reason is hidden
- [ ] Submitting saves a `po_linked` or `discrepancy` receipt (not `unmatched`)
- [ ] Navigating to `/goods-inwards/new?po=bad-id` loads the form normally (no crash)
- [ ] `npx tsc --noEmit` passes with no errors
