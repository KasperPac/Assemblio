"use client";

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  deleteBomDraft,
  removeBomComponentLine,
  setBomActive,
  setBomArchived,
  updateBomComponentQuantity,
  updateBomComponentYieldPct,
} from "@/app/app/bom/actions";
import { duplicateBomAsDraft } from "@/app/app/products/actions";
import BomLightbox from "./bom-lightbox";
import styles from "./bom-editor.module.css";

type ComponentLine = {
  id: string;
  component_id: string;
  quantity: number;
  yield_pct: number;
  component: {
    name: string;
    sku: string | null;
    unit: string | null;
    cost_per_unit: number | null;
  };
};

type BomData = {
  id: string;
  version: number;
  status: string;
  is_active: boolean;
  created_at: string;
  lines: ComponentLine[];
};

type ComponentOption = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  group: string | null;
  cost_per_unit: number | null;
};

type TemplateOption = { id: string; name: string; lineCount: number };
type SourceBomOption = { id: string; label: string };

type Props = {
  bom: BomData;
  variantId: string;
  variantLabel: string;
  sellPrice: number | null;
  labourCost: number | null;
  allComponents: ComponentOption[];
  templates: TemplateOption[];
  sourceBoms: SourceBomOption[];
};

function lineCost(qty: number, yieldPct: number, costPerUnit: number | null): number | null {
  if (costPerUnit === null) return null;
  return (costPerUnit * qty) / yieldPct;
}

function fmt(cost: number | null): string {
  return cost !== null ? `$${cost.toFixed(2)}` : "—";
}

export default function BomEditor({
  bom,
  variantId,
  variantLabel,
  sellPrice,
  labourCost,
  allComponents,
  templates,
  sourceBoms,
}: Props) {
  const [localState, setLocalState] = useState(
    () => new Map(bom.lines.map((line) => [line.id, { quantity: line.quantity, yieldPct: line.yield_pct }]))
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [duplicateState, duplicateAction, isDuplicating] = useActionState(duplicateBomAsDraft, {});
  const [, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const updateLocal = useCallback((lineId: string, patch: { quantity?: number; yieldPct?: number }) => {
    setLocalState((prev) => {
      const next = new Map(prev);
      const existing = next.get(lineId);
      if (existing) next.set(lineId, { ...existing, ...patch });
      return next;
    });
  }, []);

  let materialCost: number | null = 0;
  let hasMissingCosts = false;
  for (const line of bom.lines) {
    const local = localState.get(line.id) ?? { quantity: line.quantity, yieldPct: line.yield_pct };
    const cost = lineCost(local.quantity, local.yieldPct, line.component.cost_per_unit);
    if (cost === null) {
      hasMissingCosts = true;
      materialCost = null;
    } else if (materialCost !== null) {
      materialCost += cost;
    }
  }

  const totalCost =
    materialCost !== null && labourCost !== null
      ? materialCost + labourCost
      : materialCost !== null
        ? materialCost
        : labourCost !== null
          ? labourCost
          : null;

  const grossMargin =
    totalCost !== null && sellPrice !== null && sellPrice > 0
      ? ((sellPrice - totalCost) / sellPrice) * 100
      : null;

  const readOnly = bom.is_active;
  const statusLabel = bom.is_active ? "ACTIVE" : bom.status.toUpperCase();
  const statusCls = bom.is_active ? styles.badgeActive : styles.badgeDraft;

  const handleSwitchToRouting = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("tab", "routing");
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={`${styles.badge} ${statusCls}`}>{statusLabel}</span>
          <span className={styles.versionInfo}>
            v{bom.version} · {new Date(bom.created_at).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
        <div className={styles.toolbarRight}>
          {!readOnly && (
            <BomLightbox
              variantId={variantId}
              variantLabel={variantLabel}
              bomId={bom.id}
              components={allComponents}
              templates={templates}
              sourceBoms={sourceBoms}
              buttonLabel="+ Add component"
              buttonClassName={styles.btnSecondary}
            />
          )}
          <div className={styles.menuWrap} ref={menuRef}>
            <button
              type="button"
              className={styles.menuButton}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Open BOM actions"
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              ⋯
            </button>
            {menuOpen ? (
              <div className={styles.menu} role="menu">
                <form action={duplicateAction} onSubmit={() => setMenuOpen(false)}>
                  <input type="hidden" name="variant_id" value={variantId} />
                  <input type="hidden" name="source_bom_id" value={bom.id} />
                  <button type="submit" className={styles.menuItem} role="menuitem" disabled={isDuplicating}>
                    Duplicate to new draft
                  </button>
                </form>
                {!readOnly && (
                  <form action={setBomArchived} onSubmit={() => setMenuOpen(false)}>
                    <input type="hidden" name="bom_id" value={bom.id} />
                    <button type="submit" className={styles.menuItem} role="menuitem">
                      Archive
                    </button>
                  </form>
                )}
                {!readOnly && (
                  <form action={deleteBomDraft} onSubmit={() => setMenuOpen(false)}>
                    <input type="hidden" name="bom_id" value={bom.id} />
                    <input type="hidden" name="variant_id" value={variantId} />
                    <button type="submit" className={`${styles.menuItem} ${styles.menuItemDanger}`} role="menuitem">
                      Delete draft
                    </button>
                  </form>
                )}
              </div>
            ) : null}
          </div>
          {!readOnly && (
            <form action={setBomActive}>
              <input type="hidden" name="bom_id" value={bom.id} />
              <button type="submit" className={styles.btnPrimary}>
                Set Active
              </button>
            </form>
          )}
        </div>
      </div>
      {readOnly && (
        <div className={styles.readOnlyBanner}>
          <span className={styles.readOnlyBannerText}>
            This BOM is active — changes require a new draft version.
          </span>
          <form action={duplicateAction}>
            <input type="hidden" name="variant_id" value={variantId} />
            <input type="hidden" name="source_bom_id" value={bom.id} />
            <button type="submit" className={styles.btnPrimary} disabled={isDuplicating}>
              {isDuplicating ? "Creating…" : "Create new draft"}
            </button>
          </form>
        </div>
      )}
      {duplicateState.error ? <p className={styles.menuError}>{duplicateState.error}</p> : null}

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
              {!readOnly && <th></th>}
            </tr>
          </thead>
          <tbody>
            {bom.lines.map((line) => {
              const local = localState.get(line.id) ?? { quantity: line.quantity, yieldPct: line.yield_pct };
              const cost = lineCost(local.quantity, local.yieldPct, line.component.cost_per_unit);
              const scrapCost =
                !readOnly && local.yieldPct < 1 && line.component.cost_per_unit !== null
                  ? (line.component.cost_per_unit * local.quantity * (1 - local.yieldPct)) / local.yieldPct
                  : null;

              const submitQty = (qty: number) => {
                const formData = new FormData();
                formData.set("line_id", line.id);
                formData.set("variant_id", variantId);
                formData.set("quantity", String(qty));
                startTransition(async () => {
                  await updateBomComponentQuantity(formData);
                });
              };

              const submitYield = (pct: number) => {
                const formData = new FormData();
                formData.set("line_id", line.id);
                formData.set("variant_id", variantId);
                formData.set("yield_pct", String(pct));
                startTransition(async () => {
                  await updateBomComponentYieldPct(formData);
                });
              };

              return (
                <tr key={line.id}>
                  <td>
                    <span>{line.component.name}</span>
                    {line.component.cost_per_unit === null ? (
                      <span className={styles.noCostBadge}>no cost</span>
                    ) : null}
                  </td>
                  <td className={styles.dimText}>{line.component.sku ?? "—"}</td>
                  <td className={styles.dimText}>{line.component.unit ?? "—"}</td>
                  <td>
                    {readOnly ? (
                      <span className={styles.readOnlyQty}>{line.quantity}</span>
                    ) : (
                      <div className={styles.stepper}>
                        <button
                          type="button"
                          onClick={() => {
                            const newQty = Math.max(1, local.quantity - 1);
                            updateLocal(line.id, { quantity: newQty });
                            submitQty(newQty);
                          }}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={local.quantity}
                          className={styles.stepperInput}
                          onChange={(event) => updateLocal(line.id, { quantity: Math.max(1, Number(event.target.value)) })}
                          onBlur={(event) => submitQty(Number(event.target.value))}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newQty = local.quantity + 1;
                            updateLocal(line.id, { quantity: newQty });
                            submitQty(newQty);
                          }}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </td>
                  <td>
                    {readOnly ? (
                      <span className={styles.dimText}>{Math.round(line.yield_pct * 100)}%</span>
                    ) : (
                      <>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          value={Math.round(local.yieldPct * 100)}
                          className={`${styles.yieldInput} ${local.yieldPct < 1 ? styles.yieldLow : ""}`}
                          onChange={(event) =>
                            updateLocal(line.id, { yieldPct: Number(event.target.value) / 100 })
                          }
                          onBlur={(event) => submitYield(Number(event.target.value))}
                        />
                        {scrapCost !== null ? (
                          <div className={styles.scrapNote}>+{fmt(scrapCost)} scrap</div>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className={styles.dimText}>{fmt(line.component.cost_per_unit)}</td>
                  <td>{fmt(cost)}</td>
                  {!readOnly && (
                    <td>
                      <form action={removeBomComponentLine}>
                        <input type="hidden" name="line_id" value={line.id} />
                        <input type="hidden" name="variant_id" value={variantId} />
                        <button type="submit" className={styles.removeBtn}>
                          ✕
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              );
            })}
            {bom.lines.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 7 : 8} className={styles.emptyRow}>
                  {readOnly
                    ? "No components in this BOM."
                    : "No components yet — click + Add component above."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className={styles.rollup}>
        <div className={styles.rollupCell}>
          <span className={styles.rollupLabel}>Materials</span>
          <span className={styles.rollupValue}>{fmt(materialCost)}</span>
          {materialCost !== null ? <span className={styles.rollupSub}>incl. scrap</span> : null}
        </div>
        <div className={styles.rollupCell}>
          <span className={styles.rollupLabel}>Labour</span>
          <span className={styles.rollupValue}>{labourCost !== null ? fmt(labourCost) : "—"}</span>
          {labourCost === null ? (
            <button type="button" className={styles.routingLink} onClick={handleSwitchToRouting}>
              Add routing →
            </button>
          ) : null}
        </div>
        <div className={styles.rollupCell}>
          <span className={styles.rollupLabel}>Total BOM cost</span>
          <span className={styles.rollupValue}>{fmt(totalCost)}</span>
        </div>
        <div className={styles.rollupCell}>
          <span className={styles.rollupLabel}>Sell price</span>
          <span className={styles.rollupValue}>
            {sellPrice !== null ? `$${sellPrice.toFixed(2)}` : "—"}
          </span>
          {sellPrice !== null ? <span className={styles.rollupSub}>from Shopify</span> : null}
        </div>
        <div className={styles.rollupCell}>
          <span className={styles.rollupLabel}>Gross margin</span>
          <span className={`${styles.rollupValue} ${grossMargin !== null && grossMargin < 20 ? styles.marginLow : ""}`}>
            {grossMargin !== null ? `${grossMargin.toFixed(1)}%` : "—"}
          </span>
          {hasMissingCosts ? (
            <span className={styles.rollupWarning}>⚠ estimate — missing costs</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
