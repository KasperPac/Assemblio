"use client";

import { useState } from "react";
import Link from "next/link";
import type { ReceiptStatus } from "./helpers";
import styles from "./goods-inwards.module.css";

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
    <div className={styles.page}>
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
        <Link href="/app/goods-inwards/new" className={styles.primary}>
          New Receipt
        </Link>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>No receipts found.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Reference</th>
              <th>Lines</th>
              <th>Received</th>
              <th>Location</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
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
                  <span className={`${styles.badge} ${styles[`badge_${r.status}`]}`}>
                    {STATUS_LABELS[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
