"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import styles from "./idle-threshold-control.module.css";

const OPTIONS = [30, 60, 90, 180] as const;

interface Props {
  current: number;
}

export function IdleThresholdControl({ current }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function select(days: number) {
    const params = new URLSearchParams(sp.toString());
    params.set("idle", String(days));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className={styles.control}>
      <span className={styles.label}>Idle threshold:</span>
      {OPTIONS.map((d) => (
        <button
          key={d}
          type="button"
          className={`${styles.btn} ${current === d ? styles.active : ""}`}
          onClick={() => select(d)}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}
