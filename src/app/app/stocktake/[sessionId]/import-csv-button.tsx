"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import styles from "./page.module.css";

export function ImportCsvButton({ sessionId }: { sessionId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    await fetch(`/api/stocktake/${sessionId}/import`, { method: "POST", body: fd });
    router.refresh();
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <label className={styles.secondary} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", minHeight: "42px", padding: "0 18px" }}>
      Import CSV
      <input ref={inputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleChange} />
    </label>
  );
}
