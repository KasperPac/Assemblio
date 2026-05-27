import styles from "./suspended.module.css";

export default function SuspendedPage() {
  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.title}>Account suspended</h1>
        <p className={styles.body}>
          This account is currently suspended. Contact support for help restoring access.
        </p>
      </div>
    </div>
  );
}
