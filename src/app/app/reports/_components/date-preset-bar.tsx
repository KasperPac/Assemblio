"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { fmtParam } from "../_lib/date-range";
import styles from "./date-preset-bar.module.css";

const PRESETS = [
  { label: "Today", days: 0 },
  { label: "This week", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "This year", days: 365 },
  { label: "Custom", days: -1 },
] as const;

interface Props {
  csvHref: string;
  hideDateRange?: boolean;
}

export function DatePresetBar({ csvHref, hideDateRange }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const currentFrom = sp.get("from") ?? "";
  const currentTo = sp.get("to") ?? "";
  const isCustom = !!(currentFrom || currentTo);

  function applyPreset(days: number) {
    const params = new URLSearchParams(sp.toString());
    if (days === -1) {
      return;
    }
    if (days === 0) {
      const today = fmtParam(new Date());
      params.set("from", today);
      params.set("to", today);
    } else {
      const now = new Date();
      params.set("to", fmtParam(now));
      params.set(
        "from",
        fmtParam(new Date(now.getTime() - days * 24 * 60 * 60 * 1000))
      );
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function applyCustomDate(key: "from" | "to", value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className={styles.bar}>
      {!hideDateRange &&
        PRESETS.map((p) => {
          const active =
            p.days === -1
              ? isCustom
              : !isCustom && !currentFrom && p.days === 30;
          return (
            <button
              key={p.label}
              type="button"
              className={`${styles.preset} ${active ? styles.presetActive : ""}`}
              onClick={() => applyPreset(p.days)}
            >
              {p.label}
            </button>
          );
        })}
      {!hideDateRange && isCustom && (
        <div className={styles.customInputs}>
          <input
            type="date"
            className={styles.dateInput}
            value={currentFrom}
            onChange={(e) => applyCustomDate("from", e.target.value)}
          />
          <span style={{ color: "var(--ink-muted)", fontSize: 13 }}>→</span>
          <input
            type="date"
            className={styles.dateInput}
            value={currentTo}
            onChange={(e) => applyCustomDate("to", e.target.value)}
          />
        </div>
      )}
      <div className={styles.exports}>
        <a
          href={csvHref}
          download
          style={{
            border: "1px solid var(--stroke-strong)",
            borderRadius: 6,
            padding: "5px 10px",
            background: "var(--surface-raised)",
            color: "var(--ink-strong)",
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          Export CSV
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            border: "1px solid var(--stroke-strong)",
            borderRadius: 6,
            padding: "5px 10px",
            background: "var(--surface-raised)",
            color: "var(--ink-strong)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Print / PDF
        </button>
      </div>
    </div>
  );
}
