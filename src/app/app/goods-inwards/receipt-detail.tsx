"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { updateDeliveryReceipt, updateComponentCosts, linkReceiptToPo } from "./actions";
import { computeVariance } from "./helpers";
import type { ReceiptStatus } from "./helpers";
import ComponentThumbnail from "../_ui/component-thumbnail";
import styles from "./goods-inwards.module.css";

type ReceiptLine = {
  id: string;
  component_id: string;
  quantity_delivered: number;
  quantity_expected: number | null;
  cost_per_unit: number | null;
  notes: string | null;
  batch_number: string | null;
  component:
    | { name: string; sku: string | null; image_url: string | null }
    | Array<{ name: string; sku: string | null; image_url: string | null }>
    | null;
};

type Receipt = {
  id: string;
  supplier_id: string | null;
  supplier_name_override: string | null;
  supplier_reference: string;
  purchase_order_id: string | null;
  status: ReceiptStatus;
  received_at: string;
  notes: string | null;
  stock_in_reason: string | null;
  created_at: string;
  supplier: { name: string } | Array<{ name: string }> | null;
  location: { id: string; name: string } | Array<{ id: string; name: string }> | null;
  delivery_receipt_line: ReceiptLine[];
};

type SupplierOption = { id: string; name: string };
type LocationOption = { id: string; name: string; is_default: boolean };
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

const REASONS = [
  { value: "supplier_delivery", label: "Supplier delivery" },
  { value: "customer_return", label: "Customer return" },
  { value: "opening_stock", label: "Opening stock" },
  { value: "sample", label: "Sample" },
  { value: "adjustment", label: "Adjustment" },
  { value: "other", label: "Other" },
];

const STATUS_LABELS: Record<Receipt["status"], string> = {
  unmatched: "· Unmatched",
  po_linked: "✓ PO linked",
  discrepancy: "⚠ Discrepancy",
};

function resolveSupplier(r: Receipt): string {
  if (r.supplier) {
    const s = Array.isArray(r.supplier) ? r.supplier[0] : r.supplier;
    if (s?.name) return s.name;
  }
  return r.supplier_name_override ?? "—";
}

function resolveLocation(r: Receipt): string {
  if (!r.location) return "—";
  const l = Array.isArray(r.location) ? r.location[0] : r.location;
  return l?.name ?? "—";
}

function resolveComponentName(line: ReceiptLine): string {
  if (!line.component) return "Unknown";
  const c = Array.isArray(line.component) ? line.component[0] : line.component;
  if (!c) return "Unknown";
  return c.sku ? `${c.name} (${c.sku})` : c.name;
}

function resolveComponentImage(
  line: ReceiptLine
): { imageUrl: string | null; name: string } {
  if (!line.component) return { imageUrl: null, name: "" };
  const c = Array.isArray(line.component) ? line.component[0] : line.component;
  if (!c) return { imageUrl: null, name: "" };
  return { imageUrl: c.image_url, name: c.name };
}


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
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showSupplierOverride, setShowSupplierOverride] = useState(
    !receipt.supplier_id && !!receipt.supplier_name_override
  );
  const [lineNotes, setLineNotes] = useState<Record<string, string>>(
    Object.fromEntries(
      receipt.delivery_receipt_line.map((l) => [l.id, l.notes ?? ""])
    )
  );
  const editFormRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

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

  const linesWithCost = receipt.delivery_receipt_line.filter(
    (l): l is ReceiptLine & { cost_per_unit: number } => l.cost_per_unit !== null
  );
  const totalValue = linesWithCost.reduce(
    (sum, l) => sum + l.quantity_delivered * l.cost_per_unit,
    0
  );
  const [costChecked, setCostChecked] = useState<Record<string, boolean>>(
    () => Object.fromEntries(linesWithCost.map((l) => [l.id, true]))
  );
  const [costUpdatePending, startCostTransition] = useTransition();
  const [costUpdateSuccess, setCostUpdateSuccess] = useState(false);

  function handleCostUpdate() {
    const selected = linesWithCost
      .filter((l) => costChecked[l.id])
      .map((l) => ({ component_id: l.component_id, cost_per_unit: l.cost_per_unit }));
    startCostTransition(async () => {
      if (selected.length > 0) await updateComponentCosts(selected);
      setCostUpdateSuccess(true);
    });
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);
    const fd = new FormData(editFormRef.current!);
    fd.set("receipt_id", receipt.id);
    fd.set("line_notes", JSON.stringify(lineNotes));
    startTransition(async () => {
      const result = await updateDeliveryReceipt(fd);
      if (result?.error) setEditError(result.error);
    });
  }

  const currentLocationId = receipt.location
    ? Array.isArray(receipt.location)
      ? receipt.location[0]?.id
      : receipt.location.id
    : "";

  return (
    <div className={styles.page}>
      {/* Header card */}
      {isEditing ? (
        <form ref={editFormRef} onSubmit={handleEdit} className={styles.formCard}>
          {editError && <div className={styles.errorNotice}>{editError}</div>}

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label htmlFor="edit_supplier_id">Supplier</label>
              <select
                id="edit_supplier_id"
                name="supplier_id"
                defaultValue={receipt.supplier_id ?? (receipt.supplier_name_override ? "__other__" : "")}
                onChange={(e) => setShowSupplierOverride(e.target.value === "__other__")}
              >
                <option value="">Select supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                <option value="__other__">Other / not in system</option>
              </select>
            </div>

            {showSupplierOverride && (
              <div className={styles.field}>
                <label htmlFor="edit_supplier_name_override">Supplier name</label>
                <input
                  id="edit_supplier_name_override"
                  name="supplier_name_override"
                  type="text"
                  defaultValue={receipt.supplier_name_override ?? ""}
                  required
                />
              </div>
            )}

            <div className={styles.field}>
              <label htmlFor="edit_supplier_reference">Docket / reference</label>
              <input
                id="edit_supplier_reference"
                name="supplier_reference"
                type="text"
                defaultValue={receipt.supplier_reference}
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="edit_received_at">Date received</label>
              <input
                id="edit_received_at"
                name="received_at"
                type="date"
                defaultValue={receipt.received_at.slice(0, 10)}
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="edit_location_id">Location</label>
              <select
                id="edit_location_id"
                name="location_id"
                defaultValue={currentLocationId}
                required
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            {!receipt.purchase_order_id && (
              <div className={styles.field}>
                <label htmlFor="edit_stock_in_reason">Reason</label>
                <select
                  id="edit_stock_in_reason"
                  name="stock_in_reason"
                  defaultValue={receipt.stock_in_reason ?? ""}
                >
                  <option value="">Select reason…</option>
                  {REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div className={styles.fieldFull}>
              <label htmlFor="edit_notes">Notes</label>
              <textarea
                id="edit_notes"
                name="notes"
                rows={2}
                defaultValue={receipt.notes ?? ""}
              />
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => { setIsEditing(false); setEditError(null); }}
            >
              Cancel
            </button>
            <button type="submit" className={styles.primary} disabled={isPending}>
              {isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.formCard}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                {receipt.supplier_reference}
              </h2>
              <p
                style={{
                  margin: "4px 0 0",
                  color: "var(--ink-muted)",
                  fontSize: "0.85rem",
                }}
              >
                {receipt.supplier_id ? (
                  <Link
                    href={`/app/suppliers/${receipt.supplier_id}`}
                    className={styles.link}
                  >
                    {resolveSupplier(receipt)}
                  </Link>
                ) : (
                  resolveSupplier(receipt)
                )}{" "}
                &middot;{" "}
                {new Date(receipt.received_at).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span
                className={`${styles.badge} ${styles[`badge_${receipt.status}`]}`}
              >
                {STATUS_LABELS[receipt.status]}
              </span>
              <a
                href={`/app/goods-inwards/${receipt.id}/print`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.secondary}
              >
                Print GRN
              </a>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setIsEditing(true)}
              >
                Edit
              </button>
            </div>
          </div>

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

        </div>
      )}

      {/* Link-to-PO banner — only when unmatched */}
      {receipt.status === "unmatched" && (
        <div
          style={{
            background: "var(--warning-dim)",
            border: "1.5px solid var(--warning)",
            borderRadius: 8,
            padding: "12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700, color: "var(--ink-strong)", fontSize: "0.9rem" }}>
            ⚠ This receipt isn&apos;t linked to a PO
          </p>
          <form ref={linkFormRef} onSubmit={handleLinkPo}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                name="purchase_order_id"
                aria-label="Purchase order"
                required
                disabled={availablePOs.length === 0}
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
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--ink-muted)" }}>
                Showing open and in-transit POs for {resolveSupplier(receipt)}
              </p>
            )}
          </form>
          {linkError && (
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--danger)" }}>
              {linkError}
            </p>
          )}
        </div>
      )}

      {/* Lines card */}
      <div className={styles.formCard}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Lines</h2>
        {receipt.delivery_receipt_line.length === 0 ? (
          <p className={styles.empty}>No lines recorded.</p>
        ) : (
        <table className={styles.linesTable}>
          <thead>
            <tr>
              <th style={{ width: 40 }} aria-label="Image" />
              <th>Component</th>
              <th>Expected</th>
              <th>Delivered</th>
              <th>Variance</th>
              <th>Cost / unit</th>
              <th>Note</th>
              <th>Batch #</th>
            </tr>
          </thead>
          <tbody>
            {receipt.delivery_receipt_line.map((line) => {
              const variance = computeVariance(
                line.quantity_delivered,
                line.quantity_expected
              );
              const { imageUrl, name: componentName } = resolveComponentImage(line);
              return (
                <tr key={line.id}>
                  <td style={{ width: 40, paddingRight: 0, verticalAlign: "middle" }}>
                    <ComponentThumbnail imageUrl={imageUrl} name={componentName} />
                  </td>
                  <td>
                    <Link
                      href={`/app/components/${line.component_id}`}
                      className={styles.link}
                    >
                      {resolveComponentName(line)}
                    </Link>
                  </td>
                  <td>{line.quantity_expected ?? "—"}</td>
                  <td>{line.quantity_delivered}</td>
                  <td>
                    {variance !== null ? (
                      <span
                        className={`${styles.variance} ${
                          variance < 0
                            ? styles.varianceShort
                            : variance > 0
                            ? styles.varianceOver
                            : ""
                        }`}
                      >
                        {variance < 0
                          ? `${variance} Short`
                          : variance > 0
                          ? `+${variance} Over`
                          : "0"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{line.cost_per_unit != null ? `$${line.cost_per_unit.toFixed(2)}` : "—"}</td>
                  <td>
                    {isEditing ? (
                      <input
                        type="text"
                        value={lineNotes[line.id] ?? ""}
                        onChange={(e) =>
                          setLineNotes((prev) => ({
                            ...prev,
                            [line.id]: e.target.value,
                          }))
                        }
                        placeholder="Note…"
                        style={{ width: 160 }}
                      />
                    ) : (
                      line.notes ?? "—"
                    )}
                  </td>
                  <td>{line.batch_number ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
        {linesWithCost.length > 0 && (
          <p style={{ margin: "4px 0 0", textAlign: "right", fontSize: "0.85rem" }}>
            <span style={{ color: "var(--ink-muted)" }}>Total received value: </span>
            <strong>
              ${totalValue.toLocaleString("en-AU", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </strong>
          </p>
        )}
      </div>

      {linesWithCost.length > 0 && (
        <div className={styles.formCard}>
          <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
            Update component costs
          </h2>
          <p style={{ margin: "4px 0 0", color: "var(--ink-muted)", fontSize: "0.85rem" }}>
            Select which components to update with the costs captured on this receipt.
          </p>
          <table className={styles.linesTable}>
            <thead>
              <tr>
                <th></th>
                <th>Component</th>
                <th>Receipt cost</th>
              </tr>
            </thead>
            <tbody>
              {linesWithCost.map((l) => (
                <tr key={l.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={costChecked[l.id] ?? true}
                      onChange={(e) =>
                        setCostChecked((prev) => ({ ...prev, [l.id]: e.target.checked }))
                      }
                    />
                  </td>
                  <td>{resolveComponentName(l)}</td>
                  <td>${l.cost_per_unit.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              disabled={costUpdatePending || !linesWithCost.some((l) => costChecked[l.id])}
              onClick={handleCostUpdate}
            >
              {costUpdatePending ? "Updating…" : "Update selected"}
            </button>
          </div>
          {costUpdateSuccess && (
            <p style={{ margin: "4px 0 0", color: "var(--ok)", fontSize: "0.85rem" }}>
              ✓ Component costs updated.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
