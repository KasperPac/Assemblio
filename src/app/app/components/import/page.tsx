"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import styles from "../../_ui/import-page.module.css";

type Step = "upload" | "preview" | "done";

type PreviewRow = {
  rowIndex: number;
  raw: Record<string, string>;
  error?: string;
};

const TEMPLATE_CSV = [
  "name,sku,unit,cost_per_unit,reorder_point,low_stock_level,supplier_name,location_name,group_name",
  "Safety Laser Scanner,CMP-001,ea,142.00,10,5,Omron,Warehouse A,Electronics",
].join("\n");

export default function ComponentsImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const fileRef = useRef<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "components-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    fileRef.current = file;
    setFileError(null);
    setLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dry_run", "true");
    try {
      const res = await fetch("/api/import/components", { method: "POST", body: fd });
      const json = (await res.json()) as { rows?: PreviewRow[]; error?: string };
      if (!res.ok) {
        setFileError(json.error ?? "Validation failed");
      } else {
        setRows(json.rows ?? []);
        setStep("preview");
      }
    } catch {
      setFileError("Network error — please try again.");
    }
    setLoading(false);
  }

  async function handleImport() {
    if (!fileRef.current) return;
    setLoading(true);
    const fd = new FormData();
    fd.append("file", fileRef.current);
    fd.append("dry_run", "false");
    try {
      const res = await fetch("/api/import/components", { method: "POST", body: fd });
      const json = (await res.json()) as { imported?: number; error?: string };
      if (!res.ok) {
        setFileError(json.error ?? "Import failed");
        setStep("upload");
      } else {
        setImportedCount(json.imported ?? 0);
        setStep("done");
      }
    } catch {
      setFileError("Network error — please try again.");
      setStep("upload");
    }
    setLoading(false);
  }

  function resetToUpload() {
    setStep("upload");
    setRows([]);
    fileRef.current = null;
    setFileError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const errorCount = rows.filter((r) => r.error).length;
  const hasErrors = errorCount > 0;
  const uploadDone = step !== "upload";
  const previewDone = step === "done";

  return (
    <div className={styles.page}>
      <Link href="/app/components" className={styles.back}>
        ← Back to Components
      </Link>
      <h1 className={styles.title}>Import Components from CSV</h1>

      {/* Step indicator */}
      <div className={styles.stepBar}>
        <div className={`${styles.stepItem} ${!uploadDone ? styles.stepActive : styles.stepDone}`}>
          <span className={styles.stepNum}>{uploadDone ? "✓" : "1"}</span>
          Upload
        </div>
        <div className={styles.stepConnector} />
        <div className={`${styles.stepItem} ${step === "preview" ? styles.stepActive : previewDone ? styles.stepDone : ""}`}>
          <span className={styles.stepNum}>{previewDone ? "✓" : "2"}</span>
          Preview
        </div>
        <div className={styles.stepConnector} />
        <div className={`${styles.stepItem} ${step === "done" ? styles.stepActive : ""}`}>
          <span className={styles.stepNum}>3</span>
          Done
        </div>
      </div>

      {/* Upload step */}
      {step === "upload" && (
        <div className={styles.section}>
          <label className={styles.dropZone}>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className={styles.hiddenInput}
              onChange={handleFileChange}
              disabled={loading}
            />
            <span className={styles.dropIcon}>📂</span>
            <span className={styles.dropTitle}>
              {loading ? "Validating…" : "Drop your CSV here"}
            </span>
            <span className={styles.dropSub}>
              or click to browse — .csv only, max 5 MB
            </span>
          </label>

          {fileError && <p className={styles.errorBanner}>{fileError}</p>}

          <div className={styles.templateBox}>
            <strong>CSV format:</strong>{" "}
            <code>
              name, sku, unit, cost_per_unit, reorder_point, low_stock_level, supplier_name,
              location_name, group_name
            </code>
            <button type="button" className={styles.templateLink} onClick={downloadTemplate}>
              ↓ Download template
            </button>
          </div>
        </div>
      )}

      {/* Preview step */}
      {step === "preview" && (
        <div className={styles.section}>
          {hasErrors && (
            <p className={styles.errorBanner}>
              ⚠️ <strong>{errorCount} error{errorCount !== 1 ? "s" : ""}</strong> found — fix
              your CSV and re-upload to proceed.
            </p>
          )}

          <div className={styles.tableWrap}>
            <table className={styles.previewTable}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>SKU</th>
                  <th>Unit</th>
                  <th>Cost/unit</th>
                  <th>Supplier</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={`${row.rowIndex}-${idx}`} className={row.error ? styles.rowError : ""}>
                    <td>{row.rowIndex}</td>
                    <td>{row.raw["name"] || <em className={styles.missing}>—</em>}</td>
                    <td>{row.raw["sku"] || "—"}</td>
                    <td>{row.raw["unit"] || "—"}</td>
                    <td>{row.raw["cost_per_unit"] || "—"}</td>
                    <td>{row.raw["supplier_name"] || "—"}</td>
                    <td>
                      {row.error ? (
                        <span className={styles.errorLabel}>✗ {row.error}</span>
                      ) : (
                        <span className={styles.okLabel}>✓ OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={styles.previewMeta}>
            {rows.length} row{rows.length !== 1 ? "s" : ""} · {errorCount} error
            {errorCount !== 1 ? "s" : ""}
          </p>

          <div className={styles.actions}>
            <button type="button" className={styles.secondaryBtn} onClick={resetToUpload}>
              Re-upload CSV
            </button>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={hasErrors || loading}
              onClick={handleImport}
            >
              {loading ? "Importing…" : `Import ${rows.length} Components`}
            </button>
          </div>
        </div>
      )}

      {/* Done step */}
      {step === "done" && (
        <div className={styles.doneSection}>
          <span className={styles.doneIcon}>✅</span>
          <p className={styles.doneMsg}>{importedCount} components imported successfully.</p>
          <div className={styles.actions}>
            <Link href="/app/components" className={styles.primaryBtn}>
              View Components
            </Link>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                resetToUpload();
                setImportedCount(0);
              }}
            >
              Import another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
