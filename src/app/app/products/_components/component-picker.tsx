"use client";

import { useState, useMemo, useEffect } from "react";
import styles from "../bom-lightbox.module.css";
import { parseQtyInput } from "@/lib/bom/qty-input";

export type ComponentOption = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  group: string | null;
  cost_per_unit: number | null;
  description: string | null;
};

type Selection = Record<string, number>; // componentId -> quantity

type Props = {
  components: ComponentOption[];
  initialSelection?: Record<string, number>;
  saveLabel?: string;
  onSave: (
    lines: { component_id: string; quantity: number }[]
  ) => Promise<{ error?: string } | void>;
};

export default function ComponentPicker({
  components,
  initialSelection,
  saveLabel = "Save BOM",
  onSave,
}: Props) {
  const [selection, setSelection] = useState<Selection>(
    () => initialSelection ?? {}
  );
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset selection when initialSelection prop changes
  useEffect(() => {
    if (initialSelection) {
      setSelection(initialSelection);
      setQtyDrafts({});
    }
  }, [initialSelection]);

  // Build category map: group name -> count (all components, not filtered)
  const categories = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of components) {
      const g = c.group ?? "Uncategorised";
      map[g] = (map[g] ?? 0) + 1;
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [components]);

  // Filter by category then by search
  const filtered = useMemo(() => {
    let list = components;
    if (activeCategory !== null) {
      list = list.filter((c) => (c.group ?? "Uncategorised") === activeCategory);
    }
    const q = search.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.sku ?? "").toLowerCase().includes(q) ||
          (c.description ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [components, activeCategory, search]);

  const selectedComponents = useMemo(
    () => components.filter((c) => (selection[c.id] ?? 0) > 0),
    [components, selection]
  );

  const runningCost = useMemo(() => {
    if (selectedComponents.length === 0) return null;
    let total = 0;
    for (const c of selectedComponents) {
      if (c.cost_per_unit === null) return null;
      total += c.cost_per_unit * (selection[c.id] ?? 0);
    }
    return total;
  }, [selectedComponents, selection]);

  function toggleComponent(id: string) {
    setSelection((prev) => {
      if ((prev[id] ?? 0) > 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: 1 };
    });
    setQtyDrafts((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function handleQtyChange(id: string, raw: string) {
    setQtyDrafts((prev) => ({ ...prev, [id]: raw }));
    const parsed = parseQtyInput(raw);
    if (parsed !== null) {
      setSelection((prev) => ({ ...prev, [id]: parsed }));
    }
  }

  function handleQtyBlur(id: string) {
    setQtyDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function stepQty(id: string, delta: number) {
    setSelection((prev) => {
      const current = prev[id] ?? 1;
      const next = current + delta;
      if (next <= 0) return prev; // never auto-remove via stepper
      return { ...prev, [id]: next };
    });
    setQtyDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const lines = Object.entries(selection)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ component_id: id, quantity: qty }));

    if (lines.length === 0) {
      setError("Select at least one component.");
      setSaving(false);
      return;
    }

    const result = await onSave(lines);
    if (result?.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    setSaving(false);
  }

  const selectionCount = Object.keys(selection).length;

  return (
    <>
      {/* Search bar -- full width */}
      <div className={styles.searchRow}>
        <input
          type="search"
          placeholder="Search by name, SKU or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {/* Browse panel: sidebar + list */}
      <div className={styles.browsePanel}>
        <div className={styles.categorySidebar}>
          <button
            type="button"
            className={`${styles.catBtn} ${activeCategory === null ? styles.catBtnActive : ""}`}
            onClick={() => setActiveCategory(null)}
          >
            <span>All</span>
            <span className={styles.catCount}>{components.length}</span>
          </button>
          {categories.map(([name, count]) => (
            <button
              key={name}
              type="button"
              className={`${styles.catBtn} ${activeCategory === name ? styles.catBtnActive : ""}`}
              onClick={() => setActiveCategory(name)}
            >
              <span>{name}</span>
              <span className={styles.catCount}>{count}</span>
            </button>
          ))}
        </div>

        <div className={styles.componentList}>
          {filtered.map((c) => {
            const isSelected = (selection[c.id] ?? 0) > 0;
            return (
              <div
                key={c.id}
                className={`${styles.componentRow} ${isSelected ? styles.componentRowSelected : ""}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleComponent(c.id)}
                  className={styles.componentCheck}
                />
                <div className={styles.componentInfo} onClick={() => toggleComponent(c.id)}>
                  <span className={styles.componentName}>{c.name}</span>
                  {c.sku && <span className={styles.componentSku}>{c.sku}</span>}
                  {c.description && <span className={styles.componentDesc}>{c.description}</span>}
                </div>
                <span className={styles.componentUnit}>{c.unit ?? "\u2014"}</span>
                <span className={styles.componentCost}>
                  {c.cost_per_unit !== null
                    ? `$${c.cost_per_unit.toFixed(2)}`
                    : <span className={styles.noCost}>no cost</span>}
                </span>
                {isSelected && (
                  <div className={styles.stepper}>
                    <button type="button" onClick={() => stepQty(c.id, -1)}>
                      {"\u2212"}
                    </button>
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      className={styles.stepperQty}
                      value={qtyDrafts[c.id] ?? String(selection[c.id] ?? 1)}
                      onChange={(e) => handleQtyChange(c.id, e.target.value)}
                      onBlur={() => handleQtyBlur(c.id)}
                    />
                    <button type="button" onClick={() => stepQty(c.id, 1)}>
                      +
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className={styles.emptyList}>No components match your search.</p>
          )}
        </div>
      </div>

      {/* BOM preview table */}
      <div className={styles.previewPanel}>
        <div className={styles.previewHeader}>Selected components</div>
        {selectedComponents.length === 0 ? (
          <p className={styles.previewEmpty}>No components selected yet.</p>
        ) : (
          <div className={styles.previewTableWrap}>
            <table className={styles.previewTable}>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>SKU</th>
                  <th>Unit</th>
                  <th>Qty</th>
                  <th>Line cost</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {selectedComponents.map((c) => {
                  const qty = selection[c.id] ?? 0;
                  const lineCost =
                    c.cost_per_unit !== null ? c.cost_per_unit * qty : null;
                  return (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.sku ?? "\u2014"}</td>
                      <td>{c.unit ?? "\u2014"}</td>
                      <td>{qty}</td>
                      <td>
                        {lineCost !== null ? `$${lineCost.toFixed(2)}` : "\u2014"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.removeBtn}
                          aria-label={`Remove ${c.name}`}
                          onClick={() => toggleComponent(c.id)}
                        >
                          {"\u2715"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className={styles.previewFooter}>
          <span className={styles.costTotal}>
            {runningCost !== null
              ? `Material cost: $${runningCost.toFixed(2)}`
              : selectedComponents.length > 0
                ? "Cost incomplete \u2014 missing prices"
                : ""}
          </span>
          <div className={styles.footerActions}>
            <button
              type="button"
              disabled={saving || selectionCount === 0}
              onClick={handleSave}
              className={styles.btnPrimary}
            >
              {saving
                ? "Saving\u2026"
                : `${saveLabel} (${selectionCount} item${selectionCount !== 1 ? "s" : ""})`}
            </button>
          </div>
          {error && (
            <p className={styles.err}>{error}</p>
          )}
        </div>
      </div>
    </>
  );
}
