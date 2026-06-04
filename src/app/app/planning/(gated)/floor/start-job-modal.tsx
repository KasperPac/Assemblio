"use client";

import { useState, useTransition } from "react";
import { startJob } from "./actions";
import styles from "./floor.module.css";

type Props = {
  orderLineId: string;
  orderNumber: string;
  productTitle: string;
  onClose: () => void;
};

export function StartJobModal({ orderLineId, orderNumber, productTitle, onClose }: Props) {
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await startJob(fd);
      onClose();
    });
  }

  return (
    <>
      <div className={styles.drawerOverlay} onClick={onClose} />
      <div className={styles.drawer}>
        <button type="button" aria-label="Close" className={styles.drawerClose} onClick={onClose}>✕</button>
        <div className={styles.drawerTitle}>Start Job</div>
        <div className={styles.drawerMeta}>
          <span>{orderNumber}</span>
          <span>{productTitle}</span>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input type="hidden" name="order_line_id" value={orderLineId} />
          <input type="hidden" name="mode" value={mode} />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setMode("auto")}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 12, border: "1px solid",
                borderColor: mode === "auto" ? "var(--brand-2)" : "color-mix(in srgb, var(--stroke) 60%, transparent)",
                background: mode === "auto" ? "color-mix(in srgb, var(--brand-2) 10%, transparent)" : "transparent",
                color: "var(--ink-strong)", cursor: "pointer", fontWeight: mode === "auto" ? 700 : 400,
              }}
            >
              Auto-schedule
            </button>
            <button
              type="button"
              onClick={() => setMode("manual")}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 12, border: "1px solid",
                borderColor: mode === "manual" ? "var(--brand-2)" : "color-mix(in srgb, var(--stroke) 60%, transparent)",
                background: mode === "manual" ? "color-mix(in srgb, var(--brand-2) 10%, transparent)" : "transparent",
                color: "var(--ink-strong)", cursor: "pointer", fontWeight: mode === "manual" ? 700 : 400,
              }}
            >
              Manual dates
            </button>
          </div>
          {mode === "auto" && (
            <p style={{ fontSize: "0.84rem", color: "var(--ink-muted)", margin: 0 }}>
              The system will schedule each step starting from now, respecting routing dependencies.
            </p>
          )}
          {mode === "manual" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: "0.82rem", color: "var(--ink-muted)" }}>
                Job start date
              </label>
              <input
                type="datetime-local"
                name="manual_start"
                required={mode === "manual"}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid color-mix(in srgb, var(--stroke) 60%, transparent)",
                  background: "var(--surface-1)",
                  color: "var(--ink-strong)",
                  fontSize: "0.88rem",
                }}
              />
              <p style={{ fontSize: "0.82rem", color: "var(--ink-muted)", margin: 0 }}>
                Subsequent steps will be scheduled from this start time.
              </p>
            </div>
          )}
          <button
            type="submit"
            disabled={pending}
            style={{
              minHeight: 42, padding: "0 24px", borderRadius: 999, border: "none",
              background: "linear-gradient(135deg, color-mix(in srgb, var(--brand-2) 72%, #142131), color-mix(in srgb, var(--brand-1) 88%, #0e1624))",
              color: "#f8fbff", fontWeight: 700, cursor: "pointer",
            }}
          >
            {pending ? "Starting…" : "Start Job"}
          </button>
        </form>
      </div>
    </>
  );
}
