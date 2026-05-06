import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import StatusBadge from "../../_ui/status-badge";
import styles from "./page.module.css";
import {
  saveLineCount,
  submitForReview,
  saveVarianceReason,
  approveAndApply,
  sendBackForRecount,
  applyOpeningStock,
} from "./actions";
import { ImportCsvButton } from "./import-csv-button";

type Props = {
  params: Promise<{ sessionId: string }>;
  searchParams?: Promise<{ error?: string; apply_error?: string }>;
};

type BinRef = { name: string } | Array<{ name: string }> | null;

type LineRow = {
  id: string;
  expected_on_hand: number;
  counted: number | null;
  notes: string | null;
  variance_reason_id: string | null;
  component: {
    id: string;
    name: string | null;
    sku: string | null;
    cost_per_unit: number;
    bin_sub_location: BinRef;
    bin_aisle: BinRef;
    bin_bay: BinRef;
  } | Array<{
    id: string;
    name: string | null;
    sku: string | null;
    cost_per_unit: number;
    bin_sub_location: BinRef;
    bin_aisle: BinRef;
    bin_bay: BinRef;
  }> | null;
};

type BinGroup = {
  key: string;
  subLocation: string | null;
  row: string | null;
  bay: string | null;
  lines: LineRow[];
};

function binName(ref: BinRef): string | null {
  if (!ref) return null;
  const obj = Array.isArray(ref) ? ref[0] : ref;
  return obj?.name ?? null;
}

function binKey(l: LineRow): string {
  const c = Array.isArray(l.component) ? l.component[0] : l.component;
  if (!c) return "__none";
  return [
    binName(c.bin_sub_location) ?? "",
    binName(c.bin_aisle) ?? "",
    binName(c.bin_bay) ?? "",
  ].join("|");
}

function groupByBin(lines: LineRow[]): BinGroup[] {
  const map = new Map<string, BinGroup>();
  for (const l of lines) {
    const c = Array.isArray(l.component) ? l.component[0] : l.component;
    const key = binKey(l);
    if (!map.has(key)) {
      map.set(key, {
        key,
        subLocation: c ? binName(c.bin_sub_location) : null,
        row: c ? binName(c.bin_aisle) : null,
        bay: c ? binName(c.bin_bay) : null,
        lines: [],
      });
    }
    (map.get(key)!.lines as LineRow[]).push(l);
  }
  return [...map.values()].sort((a, b) => {
    if (a.subLocation === null && b.subLocation !== null) return 1;
    if (a.subLocation !== null && b.subLocation === null) return -1;
    const sl = (a.subLocation ?? "").localeCompare(b.subLocation ?? "");
    if (sl !== 0) return sl;
    const r = (a.row ?? "").localeCompare(b.row ?? "");
    if (r !== 0) return r;
    return (a.bay ?? "").localeCompare(b.bay ?? "");
  });
}

function statusVariant(s: string) {
  if (s === "completed") return "success" as const;
  if (s === "approved" || s === "reconciliation") return "warning" as const;
  if (s === "counting") return "warning" as const;
  return "info" as const;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 }).format(n);
}

export default async function SessionDetailPage({ params, searchParams }: Props) {
  const { sessionId } = await params;
  const sp = (await searchParams) ?? {};

  const context = await getServerTenantContext();
  if (!context) return null;
  const { supabase, tenantId } = context;

  const [{ data: sessionData }, { data: linesData }, { data: reasons }, { data: profileData }] = await Promise.all([
    supabase
      .from("stocktake_session")
      .select("id,reference_number,session_type,status,created_at,blind_count,notes,location:location_id(name)")
      .eq("tenant_id", tenantId)
      .eq("id", sessionId)
      .maybeSingle(),
    supabase
      .from("stocktake_line")
      .select(`id,expected_on_hand,counted,notes,variance_reason_id,component:component_id(
  id,name,sku,cost_per_unit,
  bin_sub_location:bin_sub_location_id(name),
  bin_aisle:bin_aisle_id(name),
  bin_bay:bin_bay_id(name)
)`)
      .eq("tenant_id", tenantId)
      .eq("session_id", sessionId),
    supabase
      .from("stocktake_variance_reason")
      .select("id,name")
      .eq("tenant_id", tenantId)
      .order("sort_order"),
    supabase.from("profiles").select("role").single(),
  ]);

  if (!sessionData) notFound();

  const session = sessionData as {
    id: string;
    reference_number: string | null;
    session_type: string;
    status: string;
    created_at: string;
    blind_count: boolean;
    notes: string | null;
    location: { name: string | null } | Array<{ name: string | null }> | null;
  };

  const lines = (linesData ?? []) as LineRow[];
  const reasonsList = (reasons ?? []) as { id: string; name: string }[];
  const role = (profileData as { role?: string } | null)?.role ?? "member";
  const locationName = (Array.isArray(session.location) ? session.location[0] : session.location)?.name ?? "Unknown";
  const isInitial = session.session_type === "initial";
  const isCounting = session.status === "counting" || session.status === "open";
  const isReconciliation = session.status === "reconciliation";
  const isCompleted = session.status === "completed";
  const isAdmin = role === "admin" || role === "super_admin";

  const countedLines = lines.filter((l) => l.counted !== null);
  const varianceLines = lines.filter((l) => {
    if (l.counted === null) return false;
    return Number(l.counted) !== Number(l.expected_on_hand);
  });
  const netVariance = lines.reduce((acc, l) => {
    if (l.counted === null) return acc;
    const c = Array.isArray(l.component) ? l.component[0] : l.component;
    const costPerUnit = Number(c?.cost_per_unit ?? 0);
    const variance = Number(l.counted) - Number(l.expected_on_hand);
    return acc + variance * costPerUnit;
  }, 0);

  const binGroups = groupByBin(lines);
  const showBlind = isCounting && session.blind_count && !isReconciliation;

  const numDataCols = 1  // component name always
    + (showBlind ? 0 : 1)  // Expected
    + 1  // Counted
    + (isInitial || showBlind ? 0 : 1)  // Variance
    + (isInitial || showBlind || !isAdmin ? 0 : 1);  // Value
  const saveColFr = isCounting ? " 0.5fr" : "";
  const gridCols = `2fr${" 0.7fr".repeat(numDataCols - 1)}${saveColFr}`;
  const gridStyle: CSSProperties = { gridTemplateColumns: gridCols };

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <Link href="/app/stocktake" className={styles.back}>← Stocktake</Link>
      </div>

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{session.reference_number ?? sessionId.slice(0, 8)}</h1>
            <StatusBadge variant={statusVariant(session.status)}>{session.status}</StatusBadge>
            {isInitial && <span className={styles.typeBadge}>Initial count</span>}
            {session.blind_count && isCounting && <span className={styles.blindBadge}>Blind count</span>}
          </div>
          <p className={styles.headerMeta}>
            {locationName} · {new Date(session.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
            {isCounting && ` · ${countedLines.length} / ${lines.length} counted`}
          </p>
          {session.notes && <p className={styles.headerNotes}>{session.notes}</p>}
        </div>

        <div className={styles.headerActions}>
          {!isCompleted && (
            <Link href={`/app/stocktake/${sessionId}/print`} className={styles.secondary} target="_blank">
              Print sheet
            </Link>
          )}
          {(isCounting || isReconciliation) && (
            <a href={`/api/stocktake/${sessionId}/export`} className={styles.secondary}>
              Export CSV
            </a>
          )}
          {isCounting && (
            <ImportCsvButton sessionId={sessionId} />
          )}
          {isCounting && !isInitial && (
            <form action={submitForReview}>
              <input type="hidden" name="session_id" value={sessionId} />
              <button type="submit" className={styles.primary} disabled={countedLines.length < lines.length}>
                Submit for review →
              </button>
            </form>
          )}
          {isCounting && isInitial && (
            <form action={applyOpeningStock}>
              <input type="hidden" name="session_id" value={sessionId} />
              <button type="submit" className={styles.primary} disabled={countedLines.length < lines.length}>
                Apply opening stock →
              </button>
            </form>
          )}
          {isReconciliation && isAdmin && (
            <>
              <form action={sendBackForRecount}>
                <input type="hidden" name="session_id" value={sessionId} />
                <button type="submit" className={styles.danger}>↩ Send back for recount</button>
              </form>
              <form action={approveAndApply}>
                <input type="hidden" name="session_id" value={sessionId} />
                <button type="submit" className={styles.primary}>Approve & apply →</button>
              </form>
            </>
          )}
        </div>
      </div>

      {sp.error === "uncounted_lines" && (
        <p className={styles.errorMsg}>All lines must be counted before submitting for review.</p>
      )}
      {sp.error === "missing_reasons" && (
        <p className={styles.errorMsg}>All variance lines must have a reason set before approving.</p>
      )}
      {sp.apply_error && (
        <p className={styles.errorMsg}>Apply failed: {sp.apply_error.replace(/_/g, " ")}</p>
      )}

      {/* COUNTING VIEW */}
      {(isCounting || isCompleted) && (
        <div className={styles.countingSection}>
          {binGroups.map((group) => {
            const groupLabel = group.subLocation === null
              ? "No location set"
              : [group.subLocation, group.row ? `Row ${group.row}` : null, group.bay ? `Bay ${group.bay}` : null]
                  .filter(Boolean)
                  .join(" · ");

            return (
              <div key={group.key} className={styles.bayGroup}>
                <div className={styles.bayHeader}>
                  <span>{groupLabel} <span className={styles.bayCount}>· {group.lines.length} items</span></span>
                  <Link
                    href={`/app/stocktake/${sessionId}/print${
                      group.subLocation
                        ? `?sublocation=${encodeURIComponent(group.subLocation)}${group.row ? `&row=${encodeURIComponent(group.row)}` : ""}${group.bay ? `&bay=${encodeURIComponent(group.bay)}` : ""}`
                        : ""
                    }`}
                    target="_blank"
                    className={styles.printLink}
                  >
                    Print
                  </Link>
                </div>
                <div className={styles.bayTable}>
                  <div className={styles.bayTableHeader} style={gridStyle}>
                    <span>Component</span>
                    {!showBlind && <span className={styles.numCol}>Expected</span>}
                    <span className={styles.numCol}>{isInitial ? "On-hand count" : "Counted"}</span>
                    {!isInitial && !showBlind && <span className={styles.numCol}>Variance</span>}
                    {!isInitial && !showBlind && isAdmin && <span className={styles.numCol}>Value</span>}
                  </div>
                  {group.lines.map((line) => {
                    const comp = Array.isArray(line.component) ? line.component[0] : line.component;
                    const variance = line.counted !== null ? Number(line.counted) - Number(line.expected_on_hand) : null;
                    const costPerUnit = Number(comp?.cost_per_unit ?? 0);
                    const varValue = variance !== null ? variance * costPerUnit : null;
                    const hasCounted = line.counted !== null;
                    return (
                      <form key={line.id} action={saveLineCount} className={styles.lineRow} style={gridStyle}>
                        <input type="hidden" name="line_id" value={line.id} />
                        <input type="hidden" name="session_id" value={sessionId} />
                        <div className={styles.compCell}>
                          <span className={styles.compName}>{comp?.name ?? "Unknown"}</span>
                          <span className={styles.compSku}>{comp?.sku ?? ""}</span>
                        </div>
                        {!showBlind && (
                          <span className={`${styles.numCol} ${styles.muted}`}>
                            {isInitial ? "—" : Number(line.expected_on_hand).toFixed(0)}
                          </span>
                        )}
                        <span className={styles.numCol}>
                          {isCounting ? (
                            <input
                              className={styles.countInput}
                              type="number"
                              name="counted"
                              min="0"
                              step="1"
                              defaultValue={line.counted ?? ""}
                              placeholder="0"
                            />
                          ) : (
                            <span className={hasCounted ? styles.countedVal : styles.muted}>
                              {hasCounted ? Number(line.counted).toFixed(0) : "—"}
                            </span>
                          )}
                        </span>
                        {!isInitial && !showBlind && (
                          <span className={`${styles.numCol} ${variance === null ? styles.muted : variance > 0 ? styles.positive : variance < 0 ? styles.negative : styles.muted}`}>
                            {variance === null ? "—" : variance > 0 ? `+${variance}` : variance === 0 ? "—" : String(variance)}
                          </span>
                        )}
                        {!isInitial && !showBlind && isAdmin && (
                          <span className={`${styles.numCol} ${varValue === null ? styles.muted : varValue > 0 ? styles.positive : varValue < 0 ? styles.negative : styles.muted}`}>
                            {varValue === null ? "—" : varValue === 0 ? "—" : formatCurrency(varValue)}
                          </span>
                        )}
                        {isCounting && <button type="submit" className={styles.saveLineBtn}>Save</button>}
                      </form>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* RECONCILIATION VIEW */}
      {isReconciliation && (
        <div className={styles.reconciliationSection}>
          <div className={styles.summaryCards}>
            <div className={styles.card}>
              <span>Lines with variance</span>
              <strong className={styles.warnVal}>{varianceLines.length} / {lines.length}</strong>
            </div>
            <div className={styles.card}>
              <span>Stock gains</span>
              <strong className={styles.positiveVal}>
                {formatCurrency(lines.reduce((acc, l) => {
                  if (l.counted === null) return acc;
                  const c = Array.isArray(l.component) ? l.component[0] : l.component;
                  const v = (Number(l.counted) - Number(l.expected_on_hand)) * Number(c?.cost_per_unit ?? 0);
                  return acc + (v > 0 ? v : 0);
                }, 0))}
              </strong>
            </div>
            <div className={styles.card}>
              <span>Stock losses</span>
              <strong className={styles.negativeVal}>
                {formatCurrency(lines.reduce((acc, l) => {
                  if (l.counted === null) return acc;
                  const c = Array.isArray(l.component) ? l.component[0] : l.component;
                  const v = (Number(l.counted) - Number(l.expected_on_hand)) * Number(c?.cost_per_unit ?? 0);
                  return acc + (v < 0 ? v : 0);
                }, 0))}
              </strong>
            </div>
            <div className={styles.card}>
              <span>Net adjustment</span>
              <strong className={netVariance >= 0 ? styles.positiveVal : styles.negativeVal}>
                {formatCurrency(netVariance)}
              </strong>
            </div>
          </div>

          <div className={styles.varianceTable}>
            <div className={styles.varianceHeader}>
              <span>Lines with variance — sorted by $ impact</span>
            </div>
            <div className={styles.varianceColHeader}>
              <span>Component</span>
              <span className={styles.numCol}>Expected</span>
              <span className={styles.numCol}>Counted</span>
              <span className={styles.numCol}>Variance</span>
              <span className={styles.numCol}>Var %</span>
              {isAdmin && <span className={styles.numCol}>Value</span>}
            </div>
            {varianceLines
              .slice()
              .sort((a, b) => {
                const ca = Array.isArray(a.component) ? a.component[0] : a.component;
                const cb = Array.isArray(b.component) ? b.component[0] : b.component;
                const va = Math.abs((Number(a.counted) - Number(a.expected_on_hand)) * Number(ca?.cost_per_unit ?? 0));
                const vb = Math.abs((Number(b.counted) - Number(b.expected_on_hand)) * Number(cb?.cost_per_unit ?? 0));
                return vb - va;
              })
              .map((line) => {
                const comp = Array.isArray(line.component) ? line.component[0] : line.component;
                const variance = Number(line.counted) - Number(line.expected_on_hand);
                const varPct = line.expected_on_hand !== 0
                  ? ((variance / Number(line.expected_on_hand)) * 100).toFixed(1)
                  : "—";
                const value = variance * Number(comp?.cost_per_unit ?? 0);
                const missingReason = !line.variance_reason_id;
                return (
                  <div key={line.id} className={`${styles.varianceLine} ${variance < 0 ? styles.lossLine : styles.gainLine}`}>
                    <div className={styles.varianceLineData}>
                      <div className={styles.compCell}>
                        <span className={styles.compName}>{comp?.name ?? "Unknown"}</span>
                        <span className={styles.compSku}>{comp?.sku ?? ""}</span>
                      </div>
                      <span className={`${styles.numCol} ${styles.muted}`}>{Number(line.expected_on_hand).toFixed(0)}</span>
                      <span className={styles.numCol}>{Number(line.counted).toFixed(0)}</span>
                      <span className={`${styles.numCol} ${variance > 0 ? styles.positive : styles.negative}`}>
                        {variance > 0 ? `+${variance}` : variance}
                      </span>
                      <span className={`${styles.numCol} ${variance > 0 ? styles.positive : styles.negative}`}>
                        {varPct === "—" ? "—" : `${variance > 0 ? "+" : ""}${varPct}%`}
                      </span>
                      {isAdmin && (
                        <span className={`${styles.numCol} ${value > 0 ? styles.positive : styles.negative}`}>
                          {formatCurrency(value)}
                        </span>
                      )}
                    </div>
                    <form action={saveVarianceReason} className={styles.reasonRow}>
                      <input type="hidden" name="line_id" value={line.id} />
                      <input type="hidden" name="session_id" value={sessionId} />
                      <select
                        name="variance_reason_id"
                        className={`${styles.reasonSelect} ${missingReason ? styles.reasonRequired : ""}`}
                        defaultValue={line.variance_reason_id ?? ""}
                      >
                        <option value="">Select reason…</option>
                        {reasonsList.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                      <input
                        name="notes"
                        className={styles.reasonNotes}
                        defaultValue={line.notes ?? ""}
                        placeholder="Optional comment…"
                      />
                      <button type="submit" className={styles.saveLineBtn}>Save</button>
                    </form>
                  </div>
                );
              })}

            {varianceLines.length === 0 && (
              <p className={styles.noVariance}>No variance lines — all counts matched expected.</p>
            )}

            <div className={styles.zeroVarianceSummary}>
              {lines.length - varianceLines.length} lines matched exactly — no action needed.
            </div>
          </div>
        </div>
      )}

      {/* Summary bar — counting view only */}
      {isCounting && (
        <div className={styles.summaryBar}>
          <div className={styles.summaryItem}>
            <span>Counted</span>
            <strong>{countedLines.length} / {lines.length}</strong>
          </div>
          {!isInitial && (
            <>
              <div className={styles.summaryItem}>
                <span>Variances</span>
                <strong className={styles.warnVal}>{varianceLines.length} lines</strong>
              </div>
              {isAdmin && (
                <div className={styles.summaryItem}>
                  <span>Net variance</span>
                  <strong className={netVariance >= 0 ? styles.positiveVal : styles.negativeVal}>
                    {formatCurrency(netVariance)}
                  </strong>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
