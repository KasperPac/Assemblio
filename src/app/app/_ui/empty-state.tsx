import type { ReactNode } from "react";
import styles from "./empty-state.module.css";

type Props = {
  title: string;
  message: string;
  action?: ReactNode;
};

export default function EmptyState({ title, message, action }: Props) {
  return (
    <div className={styles.state}>
      <p className={styles.title}>{title}</p>
      <p className={styles.message}>{message}</p>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
