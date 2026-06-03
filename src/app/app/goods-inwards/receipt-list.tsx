"use client";

import { useState } from "react";
import Link from "next/link";
import type { ReceiptStatus } from "./helpers";
import styles from "./goods-inwards.module.css";
import EmptyState from "../_ui/empty-state";
import StatusBadge from "../_ui/status-badge";

type Receipt = {
  id: string;
  supplier_name_override: string | null;
  supplier_reference: string;
  purchase_order_id: string | null;
  status: ReceiptStatus;
  received_at: string;
  supplier: { name: string } | Array<{ name: string }> | null;
  location: { name: string } | Array<{ name: string }> | null;
  delivery_receipt_line: Array<{ id: string }>;
};

type FilterTab = "all" | "unmatched" | "discrepancy" | "this_week";

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unmatched", label: "Unmatched" },
  { key: "discrepancy", label: "Discrepancy" },
  { key: "this_week", label: "This Week" },
];

const STATUS_VARIANTS: Record<Receipt["status"], "warning" | "success" | "danger"> = {
  unmatched: "warning",
  po_linked: "success",
  discrepancy: "danger",
};

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

function isThisWeek(dateStr: string): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  return new Date(dateStr) >= cutoff;
}

export default function ReceiptList({ receipts }: { receipts: Receipt[] }) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  const filtered = receipts.filter((r) => {
    if (activeFilter === "unmatched") return r.status === "unmatched";
    if (activeFilter === "discrepancy") return r.status === "discrepancy";
    if (activeFilter === "this_week") return isThisWeek(r.received_at);
    return true;
  });

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={activeFilter === t.key ? styles.tabActive : styles.tab}
              onClick={() => setActiveFilter(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Reference</th>
              <th>Lines</th>
              <th>Received</th>
              <th>Location</th>
              <th>PO</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  {activeFilter === "unmatched" ? (
                    <EmptyState
                      title="No unmatched receipts"
                      message="All receipts are linked to a purchase order."
                    />
                  ) : activeFilter === "discrepancy" ? (
                    <EmptyState
                      title="No discrepancies"
                      message="All received quantities match their purchase orders."
                    />
                  ) : activeFilter === "this_week" ? (
                    <EmptyState
                      title="No receipts this week"
                      message="No deliveries have been recorded in the last 7 days."
                    />
                  ) : (
                    <EmptyState
                      title="No deliveries yet"
                      message="Record your first goods receipt using the New Receipt button."
                    />
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id}>
                  <td>{resolveSupplier(r)}</td>
                  <td>
                    <Link href={`/app/goods-inwards/${r.id}`} className={styles.link}>
                      {r.supplier_reference}
                    </Link>
                  </td>
                  <td>{r.delivery_receipt_line.length}</td>
                  <td>
                    {new Date(r.received_at).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td>{resolveLocation(r)}</td>
                  <td>
                    {r.purchase_order_id
                      ? `PO ${r.purchase_order_id.slice(0, 8).toUpperCase()}`
                      : "—"}
                  </td>
                  <td>
                    <StatusBadge variant={STATUS_VARIANTS[r.status]}>
                      {STATUS_LABELS[r.status]}
                    </StatusBadge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
