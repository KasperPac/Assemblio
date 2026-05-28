"use client";

import { useTransition } from "react";
import { exitViewAs } from "@/app/app/super-admin/actions";
import styles from "./view-as-banner.module.css";

export default function ViewAsBanner({ tenantName }: { tenantName: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className={styles.banner}>
      <span>
        Viewing as <strong>{tenantName}</strong>
      </span>
      <button
        onClick={() => startTransition(async () => { await exitViewAs(); })}
        disabled={pending}
        className={styles.exit}
      >
        {pending ? "Exiting…" : "Exit"}
      </button>
    </div>
  );
}
