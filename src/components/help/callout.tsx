import type { ReactNode } from "react";
import styles from "./callout.module.css";

const ICONS = { tip: "💡", warning: "⚠️", info: "ℹ️" } as const;

type CalloutType = "tip" | "warning" | "info";

type Props = {
  type?: CalloutType;
  children: ReactNode;
};

export function Callout({ type = "tip", children }: Props) {
  return (
    <div className={`${styles.callout} ${styles[type]}`}>
      <span className={styles.icon} aria-hidden="true">{ICONS[type]}</span>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
