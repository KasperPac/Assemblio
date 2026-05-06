"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import styles from "./page.module.css";

export function ImportCsvButton({ sessionId }: { sessionId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("Importing…");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/stocktake/${sessionId}/import`, { method: "POST", body: fd });
      if (res.ok) {
        const json = await res.json() as { updated: number };
        setStatus(`Imported ${json.updated} line${json.updated === 1 ? "" : "s"}`);
      } else {
        const json = await res.json() as { error?: string };
        setStatus(`Error: ${json.error ?? "Import failed"}`);
      }
    } catch {
      setStatus("Error: Network failure");
    }
    router.refresh();
    if (inputRef.current) inputRef.current.value = "";
    setTimeout(() => setStatus(null), 4000);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
      <label className={styles.secondary} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", minHeight: "42px", padding: "0 18px" }}>
        Import CSV
        <input ref={inputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleChange} />
      </label>
      {status && (
        <span style={{ fontSize: "0.76rem", color: status.startsWith("Error") ? "var(--danger)" : "var(--ok)", paddingLeft: "4px" }}>
          {status}
        </span>
      )}
    </div>
  );
}
