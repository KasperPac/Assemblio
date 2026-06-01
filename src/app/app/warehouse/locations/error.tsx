"use client";

import { useEffect } from "react";
import styles from "./page.module.css";

export default function LocationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={styles.errorState}>
      <p className={styles.errorMessage}>Failed to load locations: {error.message}</p>
      <button className={styles.btnRetry} onClick={reset}>
        Try again
      </button>
    </div>
  );
}
