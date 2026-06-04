"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useState, useMemo, useCallback } from "react";
import { saveLineCountClient, submitForReview, applyOpeningStock } from "./actions";
import styles from "./page.module.css";
import type { BinRef } from "./bin-utils";

type CompData = {
  id: string;
  name: string | null;
  sku: string | null;
  cost_per_unit: number;
  bin_sub_location: BinRef;
  bin_aisle: BinRef;
  bin_bay: BinRef;
};

export type SheetLine = {
  id: string;
  expected_on_hand: number;
  counted: number | null;
  component: CompData | CompData[] | null;
};

export type BinGroup = {
  key: string;
  subLocation: string | null;
  aisle: string | null;
  bay: string | null;
  lines: SheetLine[];
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  binGroups: BinGroup[];
  sessionId: string;
  isInitial: boolean;
  showBlind: boolean;
  isAdmin: boolean;
  isCounting: boolean;
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 }).format(n);
}

export function CountingSheet({ binGroups, sessionId, isInitial, showBlind, isAdmin, isCounting }: Props) {
  const [counts, setCounts] = useState<Map<string, number | null>>(() => {
    const m = new Map<string, number | null>();
    for (const g of binGroups) for (const l of g.lines) m.set(l.id, l.counted);
    return m;
  });

  const [saveStatus, setSaveStatus] = useState<Map<string, SaveStatus>>(new Map());

  const expectedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of binGroups) for (const l of g.lines) m.set(l.id, Number(l.expected_on_hand));
    return m;
  }, [binGroups]);

  const totalLines = useMemo(() => binGroups.reduce((s, g) => s + g.lines.length, 0), [binGroups]);
  const countedCount = useMemo(() => [...counts.values()].filter(v => v !== null).length, [counts]);
  const varianceCount = useMemo(() =>
    [...counts.entries()].filter(([id, c]) => c !== null && c !== (expectedMap.get(id) ?? 0)).length,
    [counts, expectedMap]
  );

  const netVariance = useMemo(() => {
    if (isInitial || showBlind || !isAdmin) return null;
    let total = 0;
    for (const g of binGroups) {
      for (const l of g.lines) {
        const counted = counts.get(l.id) ?? null;
        if (counted === null) continue;
        const comp = Array.isArray(l.component) ? l.component[0] : l.component;
        const costPerUnit = Number(comp?.cost_per_unit ?? 0);
        total += (counted - Number(l.expected_on_hand)) * costPerUnit;
      }
    }
    return total;
  }, [binGroups, counts, isInitial, showBlind, isAdmin]);

  const numDataCols = 1
    + (showBlind ? 0 : 1)
    + 1
    + (isInitial || showBlind ? 0 : 1)
    + (isInitial || showBlind || !isAdmin ? 0 : 1);
  const indicatorCol = isCounting ? " 0.3fr" : "";
  const gridCols = `2fr${" 0.7fr".repeat(numDataCols - 1)}${indicatorCol}`;
  const gridStyle: CSSProperties = { gridTemplateColumns: gridCols };

  const handleChange = useCallback((lineId: string, value: string) => {
    setCounts(prev => new Map(prev).set(lineId, value === "" ? null : Number(value)));
  }, []);

  const handleBlur = useCallback(async (lineId: string) => {
    const counted = counts.get(lineId) ?? null;
    setSaveStatus(prev => new Map(prev).set(lineId, "saving"));
    const result = await saveLineCountClient({ lineId, sessionId, counted });
    setSaveStatus(prev => new Map(prev).set(lineId, result.ok ? "saved" : "error"));
    if (result.ok) {
      setTimeout(() => setSaveStatus(prev => {
        const next = new Map(prev); next.delete(lineId); return next;
      }), 2000);
    }
  }, [counts, sessionId]);

  return (
    <>
      <div className={styles.countingSection}>
        {binGroups.map((group) => {
          const groupLabel = group.subLocation === null
            ? "No location set"
            : [group.subLocation, group.aisle ?? null, group.bay ? `Bay ${group.bay}` : null]
                .filter(Boolean).join(" · ");

          return (
            <div key={group.key} className={styles.bayGroup}>
              <div className={styles.bayHeader}>
                <span>{groupLabel} <span className={styles.bayCount}>· {group.lines.length} items</span></span>
                <Link
                  href={`/app/stocktake/${sessionId}/print${
                    group.subLocation
                      ? `?sublocation=${encodeURIComponent(group.subLocation)}${group.aisle ? `&aisle=${encodeURIComponent(group.aisle)}` : ""}${group.bay ? `&bay=${encodeURIComponent(group.bay)}` : ""}`
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
                  {isCounting && <span />}
                </div>

                {group.lines.map((line) => {
                  const comp = Array.isArray(line.component) ? line.component[0] : line.component;
                  const counted = counts.get(line.id) ?? null;
                  const expected = expectedMap.get(line.id) ?? 0;
                  const variance = counted !== null ? counted - expected : null;
                  const costPerUnit = Number(comp?.cost_per_unit ?? 0);
                  const varValue = variance !== null ? variance * costPerUnit : null;
                  const status = saveStatus.get(line.id) ?? "idle";

                  return (
                    <div key={line.id} className={styles.lineRow} style={gridStyle}>
                      <div className={styles.compCell}>
                        {comp?.id ? (
                          <Link href={`/app/components/${comp.id}`} className={styles.componentLink}>
                            {comp.name ?? "Unknown"}
                          </Link>
                        ) : (
                          <span className={styles.compName}>{comp?.name ?? "Unknown"}</span>
                        )}
                        <span className={styles.compSku}>{comp?.sku ?? ""}</span>
                      </div>

                      {!showBlind && (
                        <span className={`${styles.numCol} ${styles.muted}`}>
                          {isInitial ? "—" : expected.toFixed(0)}
                        </span>
                      )}

                      <span className={styles.numCol}>
                        {isCounting ? (
                          <input
                            className={styles.countInput}
                            type="number"
                            min="0"
                            step="1"
                            value={counted ?? ""}
                            placeholder="0"
                            onChange={e => handleChange(line.id, e.target.value)}
                            onBlur={() => handleBlur(line.id)}
                          />
                        ) : (
                          <span className={counted !== null ? styles.countedVal : styles.muted}>
                            {counted !== null ? counted.toFixed(0) : "—"}
                          </span>
                        )}
                      </span>

                      {!isInitial && !showBlind && (
                        <span className={`${styles.numCol} ${variance === null ? styles.muted : variance > 0 ? styles.positive : variance < 0 ? styles.negative : styles.muted}`}>
                          {variance === null ? "—" : variance > 0 ? `+${variance}` : variance === 0 ? "—" : String(variance)}
                        </span>
                      )}

                      {!isInitial && !showBlind && isAdmin && (
                        <span className={`${styles.numCol} ${varValue === null || varValue === 0 ? styles.muted : varValue > 0 ? styles.positive : styles.negative}`}>
                          {varValue === null || varValue === 0 ? "—" : formatCurrency(varValue)}
                        </span>
                      )}

                      {isCounting && (
                        <span className={`${styles.saveIndicator} ${status === "saved" ? styles.savedOk : status === "error" ? styles.savedErr : ""}`}>
                          {status === "saving" ? "…" : status === "saved" ? "✓" : status === "error" ? "!" : ""}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {isCounting && (
        <div className={styles.summaryBar}>
          <div className={styles.summaryItem}>
            <span>Counted</span>
            <strong>{countedCount} / {totalLines}</strong>
          </div>
          {!isInitial && (
            <div className={styles.summaryItem}>
              <span>Variances</span>
              <strong className={styles.warnVal}>{varianceCount} lines</strong>
            </div>
          )}
          {netVariance !== null && (
            <div className={styles.summaryItem}>
              <span>Net variance</span>
              <strong className={netVariance >= 0 ? styles.positiveVal : styles.negativeVal}>
                {formatCurrency(netVariance)}
              </strong>
            </div>
          )}
          <div className={styles.summaryActions}>
            {!isInitial ? (
              <form action={submitForReview}>
                <input type="hidden" name="session_id" value={sessionId} />
                <button type="submit" className={styles.primary} disabled={countedCount < totalLines}>
                  Submit for review →
                </button>
              </form>
            ) : (
              <form action={applyOpeningStock}>
                <input type="hidden" name="session_id" value={sessionId} />
                <button type="submit" className={styles.primary} disabled={countedCount < totalLines}>
                  Apply opening stock →
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
