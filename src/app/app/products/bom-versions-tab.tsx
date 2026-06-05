"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setBomActive } from "@/app/app/bom/actions";
import styles from "./bom-versions-tab.module.css";

// ── Types ──────────────────────────────────────────────────────────────────

type BomLine = {
  id: string;
  component_id: string;
  quantity: number;
  yield_pct: number;
  component: {
    name: string;
    sku: string | null;
    unit: string | null;
    cost_per_unit: number | null;
  } | null;
};

type Bom = {
  id: string;
  version: number;
  status: string;
  is_active: boolean;
  created_at: string;
  lines: BomLine[];
};

type Props = {
  boms: Bom[];
  variantId: string;
  sellPrice: number | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function lineCost(qty: number, yieldPct: number, costPerUnit: number | null): number | null {
  if (costPerUnit === null) return null;
  const y = yieldPct > 0 ? yieldPct : 1;
  return (costPerUnit * qty) / y;
}

function totalMaterialCost(lines: BomLine[]): number | null {
  let total: number | null = 0;
  for (const line of lines) {
    const cpu = line.component?.cost_per_unit ?? null;
    const cost = lineCost(line.quantity, line.yield_pct ?? 1, cpu);
    if (cost === null) {
      total = null;
    } else if (total !== null) {
      total += cost;
    }
  }
  return total;
}

function fmt(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusBadgeClass(bom: Bom): string {
  if (bom.is_active) return styles.badgeActive;
  if (bom.status === "archived") return styles.badgeArchived;
  return styles.badgeDraft;
}

function statusLabel(bom: Bom): string {
  if (bom.is_active) return "ACTIVE";
  return bom.status.toUpperCase();
}

function margin(cost: number | null, sell: number | null): number | null {
  if (cost === null || sell === null || sell <= 0) return null;
  return ((sell - cost) / sell) * 100;
}

// ── Single version panel ───────────────────────────────────────────────────

function SingleVersionView({
  bom,
  sellPrice,
  onActivate,
  isActivating,
}: {
  bom: Bom;
  sellPrice: number | null;
  onActivate: (bomId: string) => void;
  isActivating: boolean;
}) {
  const cost = totalMaterialCost(bom.lines);
  const gm = margin(cost, sellPrice);
  return (
    <>
      <div className={styles.singleHeader}>
        <span className={styles.singleTitle}>v{bom.version}</span>
        <span className={`${styles.badge} ${statusBadgeClass(bom)}`}>
          {statusLabel(bom)}
        </span>
        <span className={styles.singleMeta}>{fmtDate(bom.created_at)}</span>
        {!bom.is_active && bom.status !== "archived" ? (
          <button
            type="button"
            className={styles.makeActiveBtn}
            disabled={isActivating}
            onClick={() => onActivate(bom.id)}
          >
            Make active
          </button>
        ) : null}
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Component</th>
              <th>SKU</th>
              <th>Unit</th>
              <th>Qty</th>
              <th>Yield %</th>
              <th>Unit cost</th>
              <th>Line cost</th>
            </tr>
          </thead>
          <tbody>
            {bom.lines.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.emptyRow}>
                  {"No components in this version."}
                </td>
              </tr>
            ) : (
              bom.lines.map((line) => {
                const cpu = line.component?.cost_per_unit ?? null;
                const lc = lineCost(line.quantity, line.yield_pct ?? 1, cpu);
                return (
                  <tr key={line.id}>
                    <td>
                      {line.component_id ? (
                        <Link href={`/app/components/${line.component_id}`} className={styles.componentLink}>
                          {line.component?.name ?? "Unknown"}
                        </Link>
                      ) : (
                        line.component?.name ?? "Unknown"
                      )}
                    </td>
                    <td className={styles.dimText}>{line.component?.sku ?? "—"}</td>
                    <td className={styles.dimText}>{line.component?.unit ?? "—"}</td>
                    <td>{line.quantity}</td>
                    <td className={styles.dimText}>
                      {Math.round((line.yield_pct ?? 1) * 100)}%
                    </td>
                    <td className={styles.dimText}>{fmt(cpu)}</td>
                    <td>{fmt(lc)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        <div className={styles.footerCell}>
          <span className={styles.footerLabel}>Material cost</span>
          <span className={styles.footerValue}>{fmt(cost)}</span>
        </div>
        {sellPrice !== null ? (
          <div className={styles.footerCell}>
            <span className={styles.footerLabel}>Sell price</span>
            <span className={styles.footerValue}>${sellPrice.toFixed(2)}</span>
          </div>
        ) : null}
        <div className={styles.footerCell}>
          <span className={styles.footerLabel}>Gross margin</span>
          <span className={styles.footerValue}>{gm !== null ? `${gm.toFixed(1)}%` : "—"}</span>
        </div>
      </div>
    </>
  );
}

// ── Comparison view ────────────────────────────────────────────────────────

type DiffKind = "unchanged" | "changed" | "added" | "removed";

type DiffRow = {
  componentId: string;
  name: string;
  kind: DiffKind;
  left: { qty: number; yieldPct: number; cpu: number | null } | null;
  right: { qty: number; yieldPct: number; cpu: number | null } | null;
};

function buildDiff(left: Bom, right: Bom): DiffRow[] {
  const leftMap = new Map(left.lines.map((l) => [l.component_id, l]));
  const rightMap = new Map(right.lines.map((l) => [l.component_id, l]));

  const allIds = new Set([...leftMap.keys(), ...rightMap.keys()]);
  const rows: DiffRow[] = [];

  for (const id of allIds) {
    const l = leftMap.get(id);
    const r = rightMap.get(id);

    if (l && r) {
      const sameQty = l.quantity === r.quantity;
      const sameYield = Math.abs((l.yield_pct ?? 1) - (r.yield_pct ?? 1)) < 0.0001;
      const kind: DiffKind = sameQty && sameYield ? "unchanged" : "changed";
      rows.push({
        componentId: id,
        name: l.component?.name ?? r.component?.name ?? "Unknown",
        kind,
        left: { qty: l.quantity, yieldPct: l.yield_pct ?? 1, cpu: l.component?.cost_per_unit ?? null },
        right: { qty: r.quantity, yieldPct: r.yield_pct ?? 1, cpu: r.component?.cost_per_unit ?? null },
      });
    } else if (!l && r) {
      rows.push({
        componentId: id,
        name: r.component?.name ?? "Unknown",
        kind: "added",
        left: null,
        right: { qty: r.quantity, yieldPct: r.yield_pct ?? 1, cpu: r.component?.cost_per_unit ?? null },
      });
    } else if (l && !r) {
      rows.push({
        componentId: id,
        name: l.component?.name ?? "Unknown",
        kind: "removed",
        left: { qty: l.quantity, yieldPct: l.yield_pct ?? 1, cpu: l.component?.cost_per_unit ?? null },
        right: null,
      });
    }
  }

  // Sort: unchanged last so diffs are prominent
  const order: Record<DiffKind, number> = { changed: 0, added: 1, removed: 2, unchanged: 3 };
  rows.sort((a, b) => order[a.kind] - order[b.kind]);

  return rows;
}

function cellCostStr(side: { qty: number; yieldPct: number; cpu: number | null } | null): string {
  if (!side) return "—";
  return fmt(lineCost(side.qty, side.yieldPct, side.cpu));
}

function ComparisonView({
  left,
  right,
  sellPrice,
  isActivating,
  onActivate,
}: {
  left: Bom;
  right: Bom;
  sellPrice: number | null;
  isActivating: boolean;
  onActivate: (bomId: string) => void;
}) {
  const rows = buildDiff(left, right);
  const leftCost = totalMaterialCost(left.lines);
  const rightCost = totalMaterialCost(right.lines);

  const delta =
    leftCost !== null && rightCost !== null ? rightCost - leftCost : null;

  const leftMargin = margin(leftCost, sellPrice);
  const rightMargin = margin(rightCost, sellPrice);

  const cellClass = (kind: DiffKind, side: "left" | "right") => {
    const base =
      side === "left"
        ? `${styles.compCell} ${styles.compCellLeft}`
        : styles.compCell;
    if (kind === "unchanged") return `${base} ${styles.diffUnchanged}`;
    if (kind === "changed") return `${base} ${styles.diffChanged}`;
    if (kind === "added" && side === "right") return `${base} ${styles.diffAdded}`;
    if (kind === "removed" && side === "left") return `${base} ${styles.diffRemoved}`;
    return base;
  };

  return (
    <>
      {/* Column headers */}
      <div className={styles.compHeader}>
        <div className={styles.compHeaderCell}>
          <span className={styles.compHeaderTitle}>v{left.version}</span>
          <span className={`${styles.badge} ${statusBadgeClass(left)}`}>
            {statusLabel(left)}
          </span>
          <span className={styles.compHeaderCost}>{fmt(leftCost)}</span>
        </div>
        <div className={styles.compHeaderCell}>
          <span className={styles.compHeaderTitle}>v{right.version}</span>
          <span className={`${styles.badge} ${statusBadgeClass(right)}`}>
            {statusLabel(right)}
          </span>
          <span className={styles.compHeaderCost}>{fmt(rightCost)}</span>
          {!right.is_active ? (
            <button
              type="button"
              className={styles.makeActiveBtn}
              disabled={isActivating}
              onClick={() => onActivate(right.id)}
            >
              Make this the active version
            </button>
          ) : null}
        </div>
      </div>

      {/* Component column label row */}
      <div className={styles.compGrid}>
        <div className={`${styles.compColHeader} ${styles.compCellLeft}`}>
          <span>Component</span>
          <span>Qty</span>
          <span>Line cost</span>
        </div>
        <div className={styles.compColHeader}>
          <span>Component</span>
          <span>Qty</span>
          <span>Line cost</span>
        </div>

        {rows.length === 0 ? (
          <>
            <div className={`${styles.compCell} ${styles.compCellLeft} ${styles.emptyRow}`}>
              No components.
            </div>
            <div className={`${styles.compCell} ${styles.emptyRow}`}>No components.</div>
          </>
        ) : (
          rows.map((row) => (
            <div key={row.componentId} className={styles.compRow}>
              {/* Left cell */}
              <div className={cellClass(row.kind, "left")}>
                {row.left ? (
                  <>
                    {/* Col 1: name + sub-lines */}
                    <span className={styles.compCellName}>
                      {row.name}
                      {row.kind === "removed" ? (
                        <span className={styles.removedLabel}>Removed in v{right.version}</span>
                      ) : null}
                    </span>
                    {/* Col 2: qty */}
                    <span className={styles.compCellQty}>{row.left.qty}</span>
                    {/* Col 3: line cost */}
                    <span className={styles.compCellLineCost}>{cellCostStr(row.left)}</span>
                    {/* Sub-line: yield % (col 1 only) when < 100% */}
                    {Math.round(row.left.yieldPct * 100) < 100 ? (
                      <span className={styles.compCellSubLine}>
                        {Math.round(row.left.yieldPct * 100)}% yield
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className={styles.compCellAbsent}>Not included</span>
                )}
              </div>

              {/* Right cell */}
              <div className={cellClass(row.kind, "right")}>
                {row.right ? (
                  <>
                    {/* Col 1: name + sub-lines */}
                    <span className={styles.compCellName}>
                      {row.name}
                      {row.kind === "added" ? (
                        <span className={styles.newLabel}>New in v{right.version}</span>
                      ) : null}
                    </span>
                    {/* Col 2: qty (warning color if changed) */}
                    <span
                      className={
                        row.kind === "changed" ? styles.compCellSub : styles.compCellQty
                      }
                    >
                      {row.right.qty}
                    </span>
                    {/* Col 3: line cost (warning color if changed) */}
                    <span
                      className={
                        row.kind === "changed" ? styles.compCellSub : styles.compCellLineCost
                      }
                    >
                      {cellCostStr(row.right)}
                    </span>
                    {/* Sub-line: "was X qty / Y% yield" for changed rows */}
                    {row.kind === "changed" && row.left ? (
                      <span className={`${styles.compCellSubLine} ${styles.compCellSub}`}>
                        was {row.left.qty} qty
                        {Math.round(row.left.yieldPct * 100) < 100
                          ? ` / ${Math.round(row.left.yieldPct * 100)}% yield`
                          : ""}
                      </span>
                    ) : Math.round(row.right.yieldPct * 100) < 100 ? (
                      <span className={styles.compCellSubLine}>
                        {Math.round(row.right.yieldPct * 100)}% yield
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className={styles.compCellAbsent}>Not included</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Comparison footer */}
      <div className={styles.compFooter}>
        {/* Left footer */}
        <div className={styles.compFooterCell}>
          <span className={styles.footerLabel}>Material cost</span>
          <span className={styles.footerValue}>{fmt(leftCost)}</span>
          <span className={styles.footerLabel} style={{ marginTop: 6 }}>Sell price</span>
          <span className={styles.footerSub}>
            {sellPrice !== null ? `$${sellPrice.toFixed(2)}` : "—"}
          </span>
          <span className={styles.footerLabel} style={{ marginTop: 6 }}>Gross margin</span>
          <span className={styles.footerSub}>
            {leftMargin !== null ? `${leftMargin.toFixed(1)}%` : "—"}
          </span>
        </div>
        {/* Right footer */}
        <div className={styles.compFooterCell}>
          <span className={styles.footerLabel}>Material cost</span>
          <span className={styles.footerValue}>{fmt(rightCost)}</span>
          {delta !== null ? (
            <span
              className={
                delta > 0
                  ? styles.footerDeltaPos
                  : delta < 0
                    ? styles.footerDeltaNeg
                    : styles.footerSub
              }
            >
              {delta > 0 ? `+${fmt(delta)}` : delta < 0 ? fmt(delta) : "No change"}
            </span>
          ) : null}
          <span className={styles.footerLabel} style={{ marginTop: 6 }}>Sell price</span>
          <span className={styles.footerSub}>
            {sellPrice !== null ? `$${sellPrice.toFixed(2)}` : "—"}
          </span>
          <span className={styles.footerLabel} style={{ marginTop: 6 }}>Gross margin</span>
          {delta !== null && delta > 0 && rightMargin !== null ? (
            <span className={styles.footerWarning}>
              {rightMargin.toFixed(1)}% (drops if activated)
            </span>
          ) : (
            <span className={styles.footerSub}>
              {rightMargin !== null ? `${rightMargin.toFixed(1)}%` : "—"}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

// ── Root component ─────────────────────────────────────────────────────────

export default function BomVersionsTab({ boms, sellPrice }: Props) {
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<[string | null, string | null]>([null, null]);

  function handleVersionClick(bomId: string) {
    setSelected(([a, b]) => {
      if (a === bomId) {
        // deselect first → shift second up
        return [b, null];
      }
      if (b === bomId) {
        // deselect second
        return [a, null];
      }
      if (a === null) {
        return [bomId, null];
      }
      // replace second slot (allow comparison)
      return [a, bomId];
    });
  }

  function handleActivate(bomId: string) {
    const formData = new FormData();
    formData.set("bom_id", bomId);
    startTransition(async () => {
      await setBomActive(formData);
    });
  }

  // Resolve selected boms
  const bomMap = new Map(boms.map((b) => [b.id, b]));
  const leftBom = selected[0] ? (bomMap.get(selected[0]) ?? null) : null;
  const rightBom = selected[1] ? (bomMap.get(selected[1]) ?? null) : null;

  const isComparison = leftBom !== null && rightBom !== null;

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>Version history</span>
        </div>

        <div className={styles.versionList}>
          {boms.length === 0 ? (
            <div className={styles.sidebarEmpty}>
              No BOM versions yet.
            </div>
          ) : (
            boms.map((bom) => {
              const cost = totalMaterialCost(bom.lines);
              const isSelected = selected[0] === bom.id || selected[1] === bom.id;

              let itemClass = styles.versionItem;
              if (bom.is_active) itemClass += ` ${styles.versionItemActive}`;
              else if (isSelected) itemClass += ` ${styles.versionItemSelected}`;
              if (bom.status === "archived") itemClass += ` ${styles.versionItemArchived}`;

              return (
                <div
                  key={bom.id}
                  className={itemClass}
                  onClick={() => handleVersionClick(bom.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleVersionClick(bom.id);
                  }}
                  aria-pressed={isSelected}
                >
                  <div className={styles.versionRow}>
                    <span className={styles.versionLabel}>v{bom.version}</span>
                    <span className={`${styles.badge} ${statusBadgeClass(bom)}`}>
                      {statusLabel(bom)}
                    </span>
                  </div>
                  <div className={styles.versionDate}>{fmtDate(bom.created_at)}</div>
                  <div className={styles.versionCost}>{fmt(cost)}</div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main panel */}
      <div className={styles.main}>
        {boms.length === 0 ? (
          <div className={styles.emptyState}>
            No BOM versions exist for this variant yet.
          </div>
        ) : isComparison ? (
          <ComparisonView
            left={leftBom!}
            right={rightBom!}
            sellPrice={sellPrice}
            isActivating={isPending}
            onActivate={handleActivate}
          />
        ) : leftBom ? (
          <SingleVersionView
            bom={leftBom}
            sellPrice={sellPrice}
            onActivate={handleActivate}
            isActivating={isPending}
          />
        ) : (
          <div className={styles.emptyState}>
            Select a version to view its components.
            {boms.length >= 2 ? " Select two to compare." : ""}
          </div>
        )}
      </div>
    </div>
  );
}

