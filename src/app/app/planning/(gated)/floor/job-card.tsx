"use client";

import styles from "./floor.module.css";

export type JobCardData = {
  id: string;
  orderLineId: string;
  orderNumber: string | null;
  orderDate: string | null;
  customerName: string | null;
  productTitle: string;
  operationName: string;
  status: "blocked" | "queued" | "active";
  blockedBy: number[];
  scheduledStart: string | null;
};

function formatOrderDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

type Props = {
  step: JobCardData;
  onClick: (stepId: string) => void;
};

export function JobCard({ step, onClick }: Props) {
  return (
    <div
      className={[
        styles.card,
        step.status === "active" ? styles.cardActive : "",
        step.status === "blocked" ? styles.cardBlocked : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onClick(step.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick(step.id)}
    >
      <div className={styles.cardTop}>
        <span className={styles.orderNum}>{step.orderNumber ?? "—"}</span>
        <span className={styles.statusPip} data-status={step.status} />
      </div>
      {step.orderDate && (
        <div className={styles.orderDate}>{formatOrderDate(step.orderDate)}</div>
      )}
      <div className={styles.cardOp}>{step.operationName}</div>
      <div className={styles.cardOp} style={{ opacity: 0.7 }}>{step.productTitle}</div>
      {step.customerName && (
        <div className={styles.cardCustomer}>{step.customerName}</div>
      )}
      {step.status === "blocked" && (
        <div className={styles.lockRow}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M9 5V4a3 3 0 1 0-6 0v1H2v6h8V5H9zm-4-1a1 1 0 1 1 2 0v1H5V4z" opacity=".6"/>
          </svg>
          {step.blockedBy.length > 0
            ? `Waiting: step${step.blockedBy.length > 1 ? "s" : ""} ${step.blockedBy.join(", ")}`
            : "Waiting on dependencies"}
        </div>
      )}
    </div>
  );
}
