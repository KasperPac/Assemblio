"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../product-detail.module.css";

// ---------------------------------------------------------------------------
// Types (mirrored from page.tsx — kept in sync manually)
// ---------------------------------------------------------------------------

export type DisplayBom = {
  id: string;
  version: number;
  status: string;
  is_active: boolean;
  updated_at: string | null;
  lineCount: number;
  matCost: number | null;
  hasMissingCosts: boolean;
};

export type VariantSummary = {
  id: string;
  title: string | null;
  sku: string | null;
  price: number | null;
  updated_at: string | null;
  displayBom: DisplayBom | null;
  margin: number | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(iso: string | null): string {
  if (!iso) return "unknown";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmtCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  summaries: VariantSummary[];
  avgMargin: number | null;
  worstVariant: VariantSummary | null;
};

// ---------------------------------------------------------------------------
// Client component
// ---------------------------------------------------------------------------

export function VariantCoverageTable({ summaries, avgMargin, worstVariant }: Props) {
  const router = useRouter();

  return (
    <div className={styles.tableCard}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Variant</th>
            <th>SKU</th>
            <th>BOM status</th>
            <th>Components</th>
            <th>Mat. cost</th>
            <th>Margin</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((v) => {
            const noBom = v.displayBom === null;
            const lowMargin = v.margin !== null && v.margin < 20;
            return (
              <tr
                key={v.id}
                className={noBom ? styles.rowNoBom : styles.row}
                onClick={() => router.push(`/app/products/variants/${v.id}`)}
                style={{ cursor: "pointer" }}
              >
                <td>
                  <Link
                    href={`/app/products/variants/${v.id}`}
                    className={styles.variantName}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {v.title ?? "Untitled variant"}
                  </Link>
                  <div className={styles.variantSub}>
                    {v.displayBom
                      ? `v${v.displayBom.version} ${v.displayBom.is_active ? "active" : "draft"} · updated ${timeAgo(v.displayBom.updated_at)}`
                      : "No BOM created yet"}
                  </div>
                </td>
                <td className={styles.meta}>{v.sku ?? "—"}</td>
                <td>
                  {v.displayBom === null ? (
                    <span className={styles.badgeGrey}>No BOM</span>
                  ) : v.displayBom.is_active ? (
                    <span className={styles.badgeGreen}>Active BOM</span>
                  ) : (
                    <span className={styles.badgeAmber}>Draft BOM</span>
                  )}
                </td>
                <td className={styles.meta}>
                  {v.displayBom ? v.displayBom.lineCount : "—"}
                </td>
                <td>
                  {v.displayBom?.matCost != null ? (
                    <span className={styles.costValue}>
                      {fmtCurrency(v.displayBom.matCost)}
                    </span>
                  ) : (
                    <span className={styles.meta}>—</span>
                  )}
                </td>
                <td>
                  {v.margin !== null ? (
                    <span className={lowMargin ? styles.marginLow : styles.marginOk}>
                      {fmtPct(v.margin)}
                      {lowMargin && (
                        <span className={styles.marginWarn}>⚠ low</span>
                      )}
                    </span>
                  ) : (
                    <span className={styles.meta}>—</span>
                  )}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  {v.displayBom ? (
                    <Link
                      href={`/app/products/variants/${v.id}`}
                      className={styles.btnSecondary}
                    >
                      Edit BOM
                    </Link>
                  ) : (
                    <Link
                      href={`/app/products/variants/${v.id}`}
                      className={styles.btnPrimary}
                    >
                      + Create BOM
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
          {summaries.length === 0 && (
            <tr>
              <td colSpan={7} className={styles.emptyRow}>
                No variants found for this product.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Footer */}
      {worstVariant !== null && (
        <div className={styles.tableFooter}>
          <span className={styles.footerStat}>
            Avg margin:{" "}
            <strong>{avgMargin !== null ? fmtPct(avgMargin) : "—"}</strong>
          </span>
          {worstVariant && (
            <span className={styles.footerStat}>
              Worst:{" "}
              <strong>
                {worstVariant.title ?? "Untitled"} (
                {fmtPct(worstVariant.margin!)})
              </strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
