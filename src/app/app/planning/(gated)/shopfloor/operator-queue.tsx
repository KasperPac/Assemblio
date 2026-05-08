"use client";

import { useState, useTransition, useEffect } from "react";
import { startStep, completeStep } from "../floor/actions";
import styles from "./shopfloor.module.css";

type StepItem = {
  id: string;
  orderNumber: string | null;
  productTitle: string;
  operationName: string;
  status: "active" | "queued" | "blocked";
  blockedBy: number[];
};

type Department = { id: string; name: string };

type Props = {
  departments: Department[];
  stepsByDept: Record<string, StepItem[]>;
};

const MANAGER_PIN = "1234";

export function OperatorQueue({ departments, stepsByDept }: Props) {
  const [deptId, setDeptId] = useState<string | null>(null);
  const [managerMode, setManagerMode] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const saved = localStorage.getItem("shopfloor_dept");
    if (saved) setDeptId(saved);
  }, []);

  function selectDept(id: string) {
    localStorage.setItem("shopfloor_dept", id);
    setDeptId(id);
  }

  function handleManagerPin() {
    const pin = window.prompt("Enter manager PIN:");
    if (pin === MANAGER_PIN) setManagerMode(true);
    else window.alert("Incorrect PIN.");
  }

  function handleStart(stepId: string) {
    startTransition(() => startStep(stepId));
  }

  function handleComplete(stepId: string) {
    startTransition(() => completeStep(stepId));
  }

  const dept = departments.find((d) => d.id === deptId);
  const steps = deptId ? (stepsByDept[deptId] ?? []) : [];

  if (!deptId) {
    return (
      <div className={styles.deptPicker}>
        <h2>Select your department</h2>
        {departments.map((d) => (
          <button key={d.id} className={styles.deptBtn} onClick={() => selectDept(d.id)}>
            {d.name}
          </button>
        ))}
      </div>
    );
  }

  const sorted = [...steps].sort((a, b) => {
    const order = { active: 0, queued: 1, blocked: 2 };
    return order[a.status] - order[b.status];
  });

  return (
    <div className={styles.shell}>
      <div className={styles.topbar}>
        <span className={styles.deptLabel}>{dept?.name}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={styles.managerBtn} onClick={() => setDeptId(null)}>
            Change dept
          </button>
          {!managerMode && (
            <button className={styles.managerBtn} onClick={handleManagerPin}>
              Manager
            </button>
          )}
        </div>
      </div>

      <div className={styles.queue}>
        {sorted.length === 0 && (
          <p style={{ color: "var(--ink-faint)", textAlign: "center", marginTop: 40 }}>
            No jobs in queue.
          </p>
        )}
        {sorted.map((step) => (
          <div
            key={step.id}
            className={[
              styles.card,
              step.status === "active" ? styles.cardActive : "",
              step.status === "blocked" ? styles.cardBlocked : "",
            ].filter(Boolean).join(" ")}
          >
            <div className={styles.cardTop}>
              <span className={styles.orderNum}>{step.orderNumber ?? "—"}</span>
              <span className={styles.statusBadge} data-status={step.status}>
                {step.status}
              </span>
            </div>
            <div className={styles.cardOp}>{step.operationName}</div>
            <div className={styles.cardProduct}>{step.productTitle}</div>
            {step.status === "blocked" && (
              <div className={styles.lockNote}>
                Waiting on step{step.blockedBy.length > 1 ? "s" : ""} {step.blockedBy.join(", ")}
              </div>
            )}
            <div className={styles.actions}>
              {step.status === "queued" && (
                <button
                  className={styles.btnStart}
                  onClick={() => handleStart(step.id)}
                  disabled={pending}
                >
                  Start
                </button>
              )}
              {(step.status === "active" || managerMode) && (
                <button
                  className={styles.btnComplete}
                  onClick={() => handleComplete(step.id)}
                  disabled={pending}
                >
                  Complete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
