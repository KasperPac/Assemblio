"use client";

import { useState } from "react";
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

export function FloorBoard({ columns, drawerSteps }: Props) {
  const [openStep, setOpenStep] = useState<JobCardData | null>(null);
  const drawer = openStep ? drawerSteps[openStep.orderLineId] : null;

  return (
    <>
      <div className={styles.board}>
        {columns.map((col) => (
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
                  .sort((a, b) => {
                    const order = { active: 0, queued: 1, blocked: 2 };
                    return order[a.status] - order[b.status];
                  })
                  .map((step) => (
                    <JobCard
                      key={step.id}
                      step={step}
                      onClick={(id) => setOpenStep(col.steps.find((s) => s.id === id) ?? null)}
                    />
                  ))
              )}
            </div>
          </div>
        ))}
      </div>

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
