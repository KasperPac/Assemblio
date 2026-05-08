"use client";

import { useState } from "react";
import { StartJobModal } from "./start-job-modal";

export type UnstartedLine = {
  id: string;
  quantity: number;
  orderNumber: string;
  productTitle: string;
};

type Props = {
  lines: UnstartedLine[];
};

type ActiveModal = {
  orderLineId: string;
  orderNumber: string;
  productTitle: string;
};

export function UnstartedPanel({ lines }: Props) {
  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);

  return (
    <>
      <div
        style={{
          border: "1px solid color-mix(in srgb, var(--stroke) 60%, transparent)",
          borderRadius: 18,
          padding: "14px 16px",
          background: "color-mix(in srgb, var(--surface-raised) 80%, transparent)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--ink-strong)" }}>
            {lines.length} order{lines.length !== 1 ? "s" : ""} waiting to start
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {lines.map((line) => (
            <div
              key={line.id}
              style={{
                border: "1px solid color-mix(in srgb, var(--stroke) 60%, transparent)",
                borderRadius: 12,
                padding: "10px 14px",
                background: "var(--bg-card)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                minWidth: 200,
                maxWidth: 260,
              }}
            >
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--ink-strong)" }}>
                {line.orderNumber}
              </span>
              <span style={{ fontSize: "0.8rem", color: "var(--ink-muted)" }}>
                {line.productTitle}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--ink-faint)" }}>
                Qty: {line.quantity}
              </span>
              <button
                onClick={() =>
                  setActiveModal({
                    orderLineId: line.id,
                    orderNumber: line.orderNumber,
                    productTitle: line.productTitle,
                  })
                }
                style={{
                  marginTop: 6,
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: "none",
                  background:
                    "linear-gradient(135deg, color-mix(in srgb, var(--brand-2) 72%, #142131), color-mix(in srgb, var(--brand-1) 88%, #0e1624))",
                  color: "#f8fbff",
                  fontWeight: 600,
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  alignSelf: "flex-start",
                }}
              >
                Start Job
              </button>
            </div>
          ))}
        </div>
      </div>

      {activeModal && (
        <StartJobModal
          orderLineId={activeModal.orderLineId}
          orderNumber={activeModal.orderNumber}
          productTitle={activeModal.productTitle}
          onClose={() => setActiveModal(null)}
        />
      )}
    </>
  );
}
