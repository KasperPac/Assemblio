"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import styles from "../../_ui/import-page.module.css";

type Step = "upload" | "preview" | "resolve" | "done";

type PreviewRow = {
  rowIndex: number;
  raw: Record<string, string>;
  error?: { message: string; type: "hard" | "soft"; field?: string };
};

type UnknownValue = {
  csvValue: string;
  suggestion: string | null;
  rowCount: number;
};

type KnownRecord = { id: string; name: string };

type Resolution =
  | { type: "use_existing"; id: string; displayName: string }
  | { type: "create_new"; name: string };

type Resolutions = {
  suppliers: Record<string, Resolution>;
  groups: Record<string, Resolution>;
};

type CreateExpanded = {
  section: "suppliers" | "groups";
  csvValue: string;
  draft: string;
};

const TEMPLATE_CSV = [
  "name,sku,unit,cost_per_unit,reorder_point,low_stock_level,supplier_name,location_name,group_name",
  "Safety Laser Scanner,CMP-001,ea,142.00,10,5,Omron,Warehouse A,Electronics",
].join("\n");

export default function ComponentsImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [unknowns, setUnknowns] = useState<{ suppliers: UnknownValue[]; groups: UnknownValue[] }>({
    suppliers: [],
    groups: [],
  });
  const [resolutions, setResolutions] = useState<Resolutions>({ suppliers: {}, groups: {} });
  const [allSuppliers, setAllSuppliers] = useState<KnownRecord[]>([]);
  const [allGroups, setAllGroups] = useState<KnownRecord[]>([]);
  const [createExpanded, setCreateExpanded] = useState<CreateExpanded | null>(null);

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
      const json = (await res.json()) as {
        rows?: PreviewRow[];
        unknowns?: { suppliers: UnknownValue[]; groups: UnknownValue[] };
        allSuppliers?: KnownRecord[];
        allGroups?: KnownRecord[];
        error?: string;
      };
      if (!res.ok) {
        setFileError(json.error ?? "Validation failed");
      } else {
        setRows(json.rows ?? []);
        setUnknowns(json.unknowns ?? { suppliers: [], groups: [] });
        setAllSuppliers(json.allSuppliers ?? []);
        setAllGroups(json.allGroups ?? []);
        setResolutions({ suppliers: {}, groups: {} });
        setCreateExpanded(null);
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
    // Strip client-only displayName before sending — server only needs type + id/name
    const serverResolutions = {
      suppliers: Object.fromEntries(
        Object.entries(resolutions.suppliers).map(([k, v]) =>
          v.type === "use_existing" ? [k, { type: "use_existing", id: v.id }] : [k, v]
        )
      ),
      groups: Object.fromEntries(
        Object.entries(resolutions.groups).map(([k, v]) =>
          v.type === "use_existing" ? [k, { type: "use_existing", id: v.id }] : [k, v]
        )
      ),
    };
    fd.append("resolutions", JSON.stringify(serverResolutions));
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
    setUnknowns({ suppliers: [], groups: [] });
    setResolutions({ suppliers: {}, groups: {} });
    setAllSuppliers([]);
    setAllGroups([]);
    setCreateExpanded(null);
    fileRef.current = null;
    setFileError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const hardErrorCount = rows.filter((r) => r.error?.type === "hard").length;
  const softMismatchCount = rows.filter((r) => r.error?.type === "soft").length;
  const hasHardErrors = hardErrorCount > 0;
  const hasSoftMismatches = softMismatchCount > 0;
  const resolvedCount =
    Object.keys(resolutions.suppliers).length + Object.keys(resolutions.groups).length;
  const totalUnknownCount = unknowns.suppliers.length + unknowns.groups.length;
  const allResolved = resolvedCount >= totalUnknownCount;

  const uploadDone = step !== "upload";
  const previewDone = step === "resolve" || step === "done";
  const resolveDone = step === "done";

  function resolveUnknown(
    section: "suppliers" | "groups",
    csvValue: string,
    resolution: Resolution
  ) {
    setResolutions((prev) => ({
      ...prev,
      [section]: { ...prev[section], [csvValue]: resolution },
    }));
  }

  function unresolveUnknown(section: "suppliers" | "groups", csvValue: string) {
    setResolutions((prev) => {
      const next = { ...prev[section] };
      delete next[csvValue];
      return { ...prev, [section]: next };
    });
  }

  function renderUnknownCard(
    section: "suppliers" | "groups",
    items: UnknownValue[],
    allRecords: KnownRecord[],
    label: string
  ) {
    const sectionResolutions = resolutions[section];
    const unresolvedCount = items.length - Object.keys(sectionResolutions).length;

    return (
      <div className={styles.resolveCard}>
        <h3 className={styles.resolveCardTitle}>
          {label} · {unresolvedCount} unresolved
        </h3>
        {items.map((u) => {
          const resolved = sectionResolutions[u.csvValue];
          const isExpanded =
            createExpanded?.section === section && createExpanded.csvValue === u.csvValue;
          const suggestionRecord = u.suggestion
            ? allRecords.find((r) => r.name === u.suggestion)
            : null;

          return (
            <div key={u.csvValue} className={styles.mismatchRow}>
              <div>
                <span className={styles.csvValueChip}>{u.csvValue}</span>
                <div className={styles.rowCount}>
                  affects {u.rowCount} row{u.rowCount !== 1 ? "s" : ""}
                </div>
              </div>
              <div className={styles.resolutionOptions}>
                {resolved ? (
                  <div className={styles.resolvedChip}>
                    ✓ Will use &ldquo;
                    {resolved.type === "use_existing" ? resolved.displayName : resolved.name}
                    &rdquo; for all {u.rowCount} row{u.rowCount !== 1 ? "s" : ""}
                    <button
                      className={styles.undoLink}
                      onClick={() => unresolveUnknown(section, u.csvValue)}
                    >
                      undo
                    </button>
                  </div>
                ) : (
                  <>
                    {u.suggestion && suggestionRecord && (
                      <>
                        <div className={styles.suggestionChip}>
                          <span className={styles.suggestionLabel}>Suggestion</span>
                          Did you mean &ldquo;{u.suggestion}&rdquo;?
                          <button
                            className={styles.useSuggestionBtn}
                            onClick={() =>
                              resolveUnknown(section, u.csvValue, {
                                type: "use_existing",
                                id: suggestionRecord.id,
                                displayName: u.suggestion!,
                              })
                            }
                          >
                            Use {u.suggestion}
                          </button>
                        </div>
                        <div className={styles.orDivider}>or</div>
                      </>
                    )}
                    {isExpanded ? (
                      <div className={styles.createExpanded}>
                        <input
                          className={styles.createInput}
                          value={createExpanded.draft}
                          onChange={(e) =>
                            setCreateExpanded((prev) =>
                              prev ? { ...prev, draft: e.target.value } : null
                            )
                          }
                          autoFocus
                        />
                        <button
                          className={styles.confirmCreateBtn}
                          disabled={!createExpanded.draft.trim()}
                          onClick={() => {
                            resolveUnknown(section, u.csvValue, {
                              type: "create_new",
                              name: createExpanded.draft.trim(),
                            });
                            setCreateExpanded(null);
                          }}
                        >
                          Create {section === "suppliers" ? "supplier" : "group"}
                        </button>
                        <button
                          className={styles.cancelCreateLink}
                          onClick={() => setCreateExpanded(null)}
                        >
                          cancel
                        </button>
                      </div>
                    ) : (
                      <div className={styles.optionGroup}>
                        <select
                          className={styles.existingSelect}
                          value=""
                          onChange={(e) => {
                            const selected = allRecords.find((r) => r.id === e.target.value);
                            if (selected) {
                              resolveUnknown(section, u.csvValue, {
                                type: "use_existing",
                                id: selected.id,
                                displayName: selected.name,
                              });
                            }
                          }}
                        >
                          <option value="">
                            Pick an existing {section === "suppliers" ? "supplier" : "group"}…
                          </option>
                          {allRecords.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <button
                          className={styles.createNewBtn}
                          onClick={() =>
                            setCreateExpanded({
                              section,
                              csvValue: u.csvValue,
                              draft: u.csvValue,
                            })
                          }
                        >
                          + Create new
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Link href="/app/components" className={styles.back}>
        ← Back to Components
      </Link>
      <h1 className={styles.title}>Import Components from CSV</h1>

      {/* Step indicator — 4 steps */}
      <div className={styles.stepBar}>
        <div className={`${styles.stepItem} ${!uploadDone ? styles.stepActive : styles.stepDone}`}>
          <span className={styles.stepNum}>{uploadDone ? "✓" : "1"}</span>
          Upload
        </div>
        <div className={styles.stepConnector} />
        <div
          className={`${styles.stepItem} ${
            step === "preview" ? styles.stepActive : previewDone ? styles.stepDone : ""
          }`}
        >
          <span className={styles.stepNum}>{previewDone ? "✓" : "2"}</span>
          Preview
        </div>
        <div className={styles.stepConnector} />
        <div
          className={`${styles.stepItem} ${
            step === "resolve" ? styles.stepActive : resolveDone ? styles.stepDone : ""
          }`}
        >
          <span className={styles.stepNum}>{resolveDone ? "✓" : "3"}</span>
          Resolve
        </div>
        <div className={styles.stepConnector} />
        <div className={`${styles.stepItem} ${step === "done" ? styles.stepActive : ""}`}>
          <span className={styles.stepNum}>4</span>
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
            <span className={styles.dropSub}>or click to browse — .csv only, max 5 MB</span>
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
          {hasHardErrors && (
            <p className={styles.errorBanner}>
              ⚠️ <strong>{hardErrorCount} error{hardErrorCount !== 1 ? "s" : ""}</strong> found —
              fix your CSV and re-upload to proceed.
            </p>
          )}
          {!hasHardErrors && hasSoftMismatches && (
            <p className={`${styles.errorBanner} ${styles.warningBanner}`}>
              ⚠️ <strong>{softMismatchCount} value{softMismatchCount !== 1 ? "s" : ""}</strong>{" "}
              need resolution before you can import — click &ldquo;Next: Resolve&rdquo; below.
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
                  <tr
                    key={`${row.rowIndex}-${idx}`}
                    className={
                      row.error?.type === "hard"
                        ? styles.rowError
                        : row.error?.type === "soft"
                        ? styles.rowWarning
                        : ""
                    }
                  >
                    <td>{row.rowIndex}</td>
                    <td>{row.raw["name"] || <em className={styles.missing}>—</em>}</td>
                    <td>{row.raw["sku"] || "—"}</td>
                    <td>{row.raw["unit"] || "—"}</td>
                    <td>{row.raw["cost_per_unit"] || "—"}</td>
                    <td>{row.raw["supplier_name"] || "—"}</td>
                    <td>
                      {row.error?.type === "hard" ? (
                        <span className={styles.errorLabel}>✗ {row.error.message}</span>
                      ) : row.error?.type === "soft" ? (
                        <span className={styles.warningLabel}>⚠ {row.error.message}</span>
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
            {rows.length} row{rows.length !== 1 ? "s" : ""} · {hardErrorCount} error
            {hardErrorCount !== 1 ? "s" : ""} · {softMismatchCount} needing resolution
          </p>

          <div className={styles.actions}>
            <button type="button" className={styles.secondaryBtn} onClick={resetToUpload}>
              Re-upload CSV
            </button>
            {!hasHardErrors && hasSoftMismatches && (
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setStep("resolve")}
              >
                Next: Resolve →
              </button>
            )}
            {!hasHardErrors && !hasSoftMismatches && (
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={loading}
                onClick={handleImport}
              >
                {loading ? "Importing…" : `Import ${rows.length} Components`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Resolve step */}
      {step === "resolve" && (
        <div className={styles.resolveSection}>
          <p className={styles.resolveIntro}>
            <strong className={styles.resolveIntroStrong}>
              {totalUnknownCount} value{totalUnknownCount !== 1 ? "s" : ""} from your CSV
              weren&rsquo;t recognised.
            </strong>{" "}
            Assign each one before importing — your choice applies to all rows with that value.
          </p>

          {unknowns.suppliers.length > 0 &&
            renderUnknownCard("suppliers", unknowns.suppliers, allSuppliers, "Suppliers")}

          {unknowns.groups.length > 0 &&
            renderUnknownCard("groups", unknowns.groups, allGroups, "Component Groups")}

          <div className={styles.resolveActions}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => setStep("preview")}
            >
              ← Back to preview
            </button>
            <div className={styles.actions}>
              <span className={styles.resolveProgress}>
                {resolvedCount} of {totalUnknownCount} resolved
              </span>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={!allResolved || loading}
                onClick={handleImport}
              >
                {loading ? "Importing…" : `Import ${rows.length} Components`}
              </button>
            </div>
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
