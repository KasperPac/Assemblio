import type { ReactNode } from "react";
import styles from "./steps.module.css";

export function Steps({ children }: { children: ReactNode }) {
  return <ol className={styles.steps}>{children}</ol>;
}

export function Step({ children }: { children: ReactNode }) {
  return <li className={styles.step}>{children}</li>;
}
