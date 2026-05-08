"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        border: "1px solid var(--stroke-strong)",
        borderRadius: 6,
        padding: "6px 12px",
        background: "var(--surface-raised)",
        color: "var(--ink-strong)",
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      Print / PDF
    </button>
  );
}
