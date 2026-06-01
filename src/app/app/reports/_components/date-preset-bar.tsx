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
  const activePreset = sp.get("preset");
  const isCustom = !!(currentFrom || currentTo) && !activePreset;

  function applyPreset(days: number) {
    const params = new URLSearchParams(sp.toString());
    if (days === -1) {
      // Custom: navigate to today→today with no preset so isCustom becomes true
      const today = fmtParam(new Date());
      params.set("from", today);
      params.set("to", today);
      params.delete("preset");
      router.push(`${pathname}?${params.toString()}`);
      return;
    }
    if (days === 365) {
      const now = new Date();
      params.set("from", `${now.getFullYear()}-01-01`);
      params.set("to", fmtParam(now));
      params.set("preset", "365");
      router.push(`${pathname}?${params.toString()}`);
      return;
    }
    if (days === 0) {
      const today = fmtParam(new Date());
      params.set("from", today);
      params.set("to", today);
      params.set("preset", "0");
    } else {
      const now = new Date();
      params.set("to", fmtParam(now));
      params.set(
        "from",
        fmtParam(new Date(now.getTime() - days * 24 * 60 * 60 * 1000))
      );
      params.set("preset", String(days));
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function applyCustomDate(key: "from" | "to", value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("preset");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className={styles.bar}>
      {!hideDateRange &&
        PRESETS.map((p) => {
          const active =
            p.days === -1
              ? isCustom
              : activePreset === String(p.days) || (!activePreset && !currentFrom && p.days === 30);
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
          <label>
            <span className={styles.srOnly}>From</span>
            <input
              type="date"
              className={styles.dateInput}
              value={currentFrom}
              onChange={(e) => applyCustomDate("from", e.target.value)}
            />
          </label>
          <span aria-hidden="true" style={{ color: "var(--ink-muted)", fontSize: 13 }}>→</span>
          <label>
            <span className={styles.srOnly}>To</span>
            <input
              type="date"
              className={styles.dateInput}
              value={currentTo}
              onChange={(e) => applyCustomDate("to", e.target.value)}
            />
          </label>
        </div>
      )}
      <div className={styles.exports}>
        <a
          href={csvHref}
          download
          className={styles.actionBtn}
        >
          Export CSV
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className={styles.actionBtn}
        >
          Print / PDF
        </button>
      </div>
    </div>
  );
}
