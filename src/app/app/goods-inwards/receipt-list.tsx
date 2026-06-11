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
  purchase_order: { po_number: string | null } | Array<{ po_number: string | null }> | null;
  delivery_receipt_line: Array<{ id: string }>;
};

type DuePO = {
  id: string;
  po_number: string | null;
  expected_date: string;
  supplier_name: string;
  line_count: number;
};

type FilterTab = "all" | "unmatched" | "discrepancy" | "this_week" | "due_in";

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unmatched", label: "Unmatched" },
  { key: "discrepancy", label: "Discrepancy" },
  { key: "this_week", label: "This Week" },
  { key: "due_in", label: "Due In" },
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

function dueLabel(expectedDateStr: string): { text: string; color: string } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expected = new Date(expectedDateStr);
  expected.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (expected.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 0) {
    return {
      text: `⚠ ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} overdue`,
      color: "var(--danger)",
    };
  }
  if (diffDays === 0) {
    return { text: "Due today", color: "var(--warning)" };
  }
  if (diffDays <= 3) {
    return {
      text: `Due in ${diffDays} day${diffDays === 1 ? "" : "s"}`,
      color: "var(--warning)",
    };
  }
  return {
    text: `Due in ${diffDays} day${diffDays === 1 ? "" : "s"}`,
    color: "var(--ink-muted)",
  };
}

export default function ReceiptList({
  receipts,
  duePOs,
}: {
  receipts: Receipt[];
  duePOs: DuePO[];
}) {
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

      {activeFilter === "due_in" ? (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>PO</th>
                <th>Supplier</th>
                <th>Expected</th>
                <th>Due</th>
                <th>Lines</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {duePOs.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      title="No upcoming deliveries"
                      message="No open purchase orders are due within the next 14 days."
                    />
                  </td>
                </tr>
              ) : (
                duePOs.map((po) => {
                  const { text, color } = dueLabel(po.expected_date);
                  return (
                    <tr key={po.id}>
                      <td>
                        <Link
                          href={`/app/purchasing/${po.id}`}
                          className={styles.link}
                        >
                          {po.po_number ?? `PO-${po.id.slice(0, 8).toUpperCase()}`}
                        </Link>
                      </td>
                      <td>{po.supplier_name}</td>
                      <td>
                        {new Date(po.expected_date).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td>
                        <span
                          className={color !== "var(--ink-muted)" ? styles.dueUrgent : undefined}
                          style={{ color }}
                        >
                          {text}
                        </span>
                      </td>
                      <td>{po.line_count}</td>
                      <td>
                        <Link
                          href={`/app/goods-inwards/new?po=${po.id}`}
                          className={`${styles.secondary} ${styles.receiveBtnSm}`}
                        >
                          Receive →
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
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
                      <Link
                        href={`/app/goods-inwards/${r.id}`}
                        className={styles.link}
                      >
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
                      {r.purchase_order_id ? (
                        <Link
                          href={`/app/purchasing/${r.purchase_order_id}`}
                          className={styles.link}
                        >
                          {(() => {
                        const po = Array.isArray(r.purchase_order) ? r.purchase_order[0] : r.purchase_order;
                        return po?.po_number ?? `PO ${r.purchase_order_id!.slice(0, 8).toUpperCase()}`;
                      })()}
                        </Link>
                      ) : (
                        "—"
                      )}
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
      )}
    </>
  );
}
