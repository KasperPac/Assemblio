"use client";

import { useState, useTransition } from "react";
import { linkReceiptToPo } from "./actions";
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
  supplier_name_override: string | null;
  supplier_reference: string;
  purchase_order_id: string | null;
  status: ReceiptStatus;
  received_at: string;
  notes: string | null;
  stock_in_reason: string | null;
  created_at: string;
  supplier: { name: string } | Array<{ name: string }> | null;
  location: { name: string } | Array<{ name: string }> | null;
  delivery_receipt_line: ReceiptLine[];
};

type OpenPO = {
  id: string;
  supplier_id: string;
  supplier: { name: string } | Array<{ name: string }> | null;
};

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
  openPOs,
}: {
  receipt: Receipt;
  openPOs: OpenPO[];
}) {
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleLink(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPoId) return;
    setLinkError(null);
    const fd = new FormData();
    fd.set("receipt_id", receipt.id);
    fd.set("purchase_order_id", selectedPoId);
    startTransition(async () => {
      const result = await linkReceiptToPo(fd);
      if (result?.error) setLinkError(result.error);
    });
  }

  return (
    <div className={styles.page}>
      {/* Header card */}
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
          <span
            className={`${styles.badge} ${styles[`badge_${receipt.status}`]}`}
          >
            {STATUS_LABELS[receipt.status]}
          </span>
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

        {receipt.status === "unmatched" && (
          <div>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setShowLinkModal((v) => !v)}
            >
              {showLinkModal ? "Cancel" : "Link to PO"}
            </button>

            {showLinkModal && (
              <form
                onSubmit={handleLink}
                style={{
                  marginTop: 12,
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                {linkError && (
                  <span
                    style={{
                      color: "var(--danger)",
                      fontSize: "0.85rem",
                      width: "100%",
                    }}
                  >
                    {linkError}
                  </span>
                )}
                <select
                  value={selectedPoId}
                  onChange={(e) => setSelectedPoId(e.target.value)}
                  required
                >
                  <option value="">Select open PO&hellip;</option>
                  {openPOs.map((po) => {
                    const sup = po.supplier
                      ? Array.isArray(po.supplier)
                        ? po.supplier[0]
                        : po.supplier
                      : null;
                    return (
                      <option key={po.id} value={po.id}>
                        PO {po.id.slice(0, 8).toUpperCase()}
                        {sup ? ` — ${sup.name}` : ""}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={isPending || !selectedPoId}
                >
                  {isPending ? "Linking…" : "Confirm"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

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
                  <td>{line.notes ?? "—"}</td>
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
