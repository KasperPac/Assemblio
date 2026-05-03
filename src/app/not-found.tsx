import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.wrapper}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>404</p>
        <h1 className={styles.title}>Page not found</h1>
        <p className={styles.body}>
          The page you tried to reach does not exist on this Assemblio
          workspace.
        </p>
        <div className={styles.actions}>
          <Link href="/app" className={styles.primary}>
            Go to dashboard
          </Link>
          <Link href="/" className={styles.secondary}>
            Back to landing
          </Link>
        </div>
      </div>
    </main>
  );
}
