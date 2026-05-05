"use client";

import { useRef, useState, useTransition } from "react";
import { updateDeliveryReceipt } from "./actions";
import { computeVariance } from "./helpers";
import type { ReceiptStatus } from "./helpers";
import styles from "./goods-inwards.module.css";

type ReceiptLine = {
  id: string;
  component_id: string;
  quantity_delivered: number;
  quantity_expected: number | null;
  notes: string | null;
  component:
    | { name: string; sku: string | null }
    | Array<{ name: string; sku: string | null }>
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

const REASONS = [
  { value: "supplier_delivery", label: "Supplier delivery" },
  { value: "customer_return", label: "Customer return" },
  { value: "opening_stock", label: "Opening stock" },
  { value: "sample", label: "Sample" },
  { value: "adjustment", label: "Adjustment" },
  { value: "other", label: "Other" },
];

const STATUS_LABELS: Record<Receipt["status"], string> = {
  unmatched: "Unmatched",
  po_linked: "PO linked",
  discrepancy: "Discrepancy",
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

export default function ReceiptDetail({
  receipt,
  suppliers,
  locations,
}: {
  receipt: Receipt;
  suppliers: SupplierOption[];
  locations: LocationOption[];
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
                {resolveSupplier(receipt)} &middot;{" "}
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

      {/* Lines card */}
      <div className={styles.formCard}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Lines</h2>
        {receipt.delivery_receipt_line.length === 0 ? (
          <p className={styles.empty}>No lines recorded.</p>
        ) : (
        <table className={styles.linesTable}>
          <thead>
            <tr>
              <th>Component</th>
              <th>Expected</th>
              <th>Delivered</th>
              <th>Variance</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {receipt.delivery_receipt_line.map((line) => {
              const variance = computeVariance(
                line.quantity_delivered,
                line.quantity_expected
              );
              return (
                <tr key={line.id}>
                  <td>{resolveComponentName(line)}</td>
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
                        {variance > 0 ? `+${variance}` : String(variance)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
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
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}
