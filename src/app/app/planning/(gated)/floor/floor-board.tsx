"use client";

import { useMemo, useState } from "react";
import styles from "./floor.module.css";
import { JobCard, type JobCardData } from "./job-card";

export type DepartmentColumn = {
  id: string;
  name: string;
  steps: JobCardData[];
};

export type DrawerStep = {
  id: string;
  orderNumber: string | null;
  productTitle: string;
  orderLineParts: {
    id: string;
    sequence: number;
    operationName: string;
    departmentName: string;
    status: string;
    actualStart: string | null;
    actualEnd: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
  }[];
};

type Props = {
  columns: DepartmentColumn[];
  drawerSteps: Record<string, DrawerStep>;
};

type ViewMode = "board" | "list";

const STATUS_ORDER: Record<JobCardData["status"], number> = {
  active: 0,
  queued: 1,
  blocked: 2,
};

function matchesQuery(step: JobCardData, q: string): boolean {
  if (!q) return true;
  const haystack = [
    step.orderNumber ?? "",
    step.productTitle,
    step.operationName,
    step.customerName ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function formatListDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function FloorBoard({ columns, drawerSteps }: Props) {
  const [openStep, setOpenStep] = useState<JobCardData | null>(null);
  const [query, setQuery] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("board");

  const drawer = openStep ? drawerSteps[openStep.orderLineId] : null;

  const products = useMemo(() => {
    const set = new Set<string>();
    for (const col of columns) {
      for (const s of col.steps) set.add(s.productTitle);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [columns]);

  const q = query.trim().toLowerCase();
  const filteredColumns = useMemo(
    () =>
      columns.map((col) => ({
        ...col,
        steps: col.steps.filter(
          (s) =>
            matchesQuery(s, q) &&
            (productFilter === "" || s.productTitle === productFilter)
        ),
      })),
    [columns, q, productFilter]
  );

  const flatSteps = useMemo(() => {
    const rows: Array<JobCardData & { departmentName: string }> = [];
    for (const col of filteredColumns) {
      for (const s of col.steps) rows.push({ ...s, departmentName: col.name });
    }
    rows.sort((a, b) => {
      const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (byStatus !== 0) return byStatus;
      const aDate = a.orderDate ? new Date(a.orderDate).getTime() : 0;
      const bDate = b.orderDate ? new Date(b.orderDate).getTime() : 0;
      return aDate - bDate;
    });
    return rows;
  }, [filteredColumns]);

  return (
    <>
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.search}
          placeholder="Search order, product, operation, customer"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search jobs"
        />
        <select
          className={styles.filter}
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          aria-label="Filter by product"
        >
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <div className={styles.viewToggle} role="tablist" aria-label="View mode">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "board"}
            className={viewMode === "board" ? styles.viewActive : styles.viewBtn}
            onClick={() => setViewMode("board")}
          >
            Board
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "list"}
            className={viewMode === "list" ? styles.viewActive : styles.viewBtn}
            onClick={() => setViewMode("list")}
          >
            List
          </button>
        </div>
      </div>

      {viewMode === "board" ? (
        <div className={styles.board}>
          {filteredColumns.map((col) => (
            <div key={col.id} className={styles.column}>
              <div className={styles.columnHeader}>
                <span className={styles.columnName}>{col.name}</span>
                <span className={styles.columnCount}>{col.steps.length}</span>
              </div>
              <div className={styles.columnBody}>
                {col.steps.length === 0 ? (
                  <div className={styles.emptyCol}>No active jobs</div>
                ) : (
                  [...col.steps]
                    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
                    .map((step) => (
                      <JobCard
                        key={step.id}
                        step={step}
                        onClick={(id) =>
                          setOpenStep(col.steps.find((s) => s.id === id) ?? null)
                        }
                      />
                    ))
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.listCard}>
          {flatSteps.length === 0 ? (
            <div className={styles.emptyList}>No jobs match your filters.</div>
          ) : (
            <table className={styles.listTable}>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Product</th>
                  <th>Operation</th>
                  <th>Department</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {flatSteps.map((s) => (
                  <tr
                    key={s.id}
                    className={styles.listRow}
                    onClick={() => setOpenStep(s)}
                  >
                    <td className={styles.listOrder}>{s.orderNumber ?? "—"}</td>
                    <td>{formatListDate(s.orderDate)}</td>
                    <td>{s.productTitle}</td>
                    <td>{s.operationName}</td>
                    <td>{s.departmentName}</td>
                    <td>
                      <span
                        className={styles.statusBadge}
                        data-status={s.status}
                      >
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {drawer && (
        <>
          <div
            className={styles.drawerOverlay}
            onClick={() => setOpenStep(null)}
          />
          <div className={styles.drawer}>
            <button
              className={styles.drawerClose}
              onClick={() => setOpenStep(null)}
            >
              ✕
            </button>
            <div className={styles.drawerTitle}>
              {drawer.orderNumber ?? "Order"} — {drawer.productTitle}
            </div>
            <div className={styles.timeline}>
              {drawer.orderLineParts.map((part) => (
                <div key={part.id} className={styles.timelineStep}>
                  <div
                    className={styles.timelineDot}
                    data-status={part.status}
                  >
                    {part.sequence}
                  </div>
                  <div className={styles.timelineContent}>
                    <div className={styles.timelineOp}>{part.operationName}</div>
                    <div className={styles.timelineDept}>{part.departmentName}</div>
                    {part.actualStart && (
                      <div className={styles.timelineTime}>
                        Started{" "}
                        {new Date(part.actualStart).toLocaleString()}
                        {part.actualEnd &&
                          ` → ${new Date(part.actualEnd).toLocaleString()}`}
                      </div>
                    )}
                    {!part.actualStart && part.scheduledStart && (
                      <div className={styles.timelineTime}>
                        Scheduled{" "}
                        {new Date(part.scheduledStart).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
