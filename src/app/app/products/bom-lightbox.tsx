"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useActionState } from "react";
import {
  createBomWithComponents,
  createBomFromTemplate,
  copyBomToDraft,
} from "./actions";
import { addComponentsToBom } from "@/app/app/bom/actions";
import styles from "./bom-lightbox.module.css";

type ActionState = { error?: string; success?: string };

type TemplateOption = { id: string; name: string; lineCount: number };
type SourceBomOption = { id: string; label: string };
type ComponentOption = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  group: string | null;
  cost_per_unit: number | null;
};

type Props = {
  variantId: string;
  variantLabel: string;
  bomId?: string;
  templates: TemplateOption[];
  sourceBoms: SourceBomOption[];
  components: ComponentOption[];
  buttonLabel?: string;
  buttonClassName: string;
};

type Selection = Record<string, number>; // componentId → quantity

const initial: ActionState = {};

export default function BomLightbox({
  variantId,
  variantLabel,
  bomId,
  templates,
  sourceBoms,
  components,
  buttonLabel = "Add / Modify BOM",
  buttonClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [templateState, templateAction] = useActionState(createBomFromTemplate, initial);
  const [copyState, copyAction] = useActionState(copyBomToDraft, initial);

  function openDialog() {
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    setOpen(false);
    dialogRef.current?.close();
  }

  return (
    <>
      <button type="button" className={buttonClassName} onClick={openDialog}>
        {buttonLabel}
      </button>

      <dialog ref={dialogRef} className={styles.overlay} onClose={() => setOpen(false)}>
        <div className={styles.backdrop} onClick={closeDialog} />
        <div className={styles.panelWide}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Select Components</h2>
              <p className={styles.panelSub}>{variantLabel}</p>
            </div>
            <button type="button" className={styles.closeBtn} onClick={closeDialog}>
              &times;
            </button>
          </div>

          {open && (
            <ComponentPicker
              variantId={variantId}
              bomId={bomId}
              components={components}
              templates={templates}
              sourceBoms={sourceBoms}
              onDone={closeDialog}
              templateAction={templateAction}
              templateState={templateState}
              copyAction={copyAction}
              copyState={copyState}
            />
          )}
        </div>
      </dialog>
    </>
  );
}

type PickerProps = {
  variantId: string;
  bomId?: string;
  components: ComponentOption[];
  templates: TemplateOption[];
  sourceBoms: SourceBomOption[];
  onDone: () => void;
  templateAction: (formData: FormData) => void;
  templateState: ActionState;
  copyAction: (formData: FormData) => void;
  copyState: ActionState;
};

function ComponentPicker({
  variantId,
  bomId,
  components,
  templates,
  sourceBoms,
  onDone,
  templateAction,
  templateState,
  copyAction,
  copyState,
}: PickerProps) {
  const [selection, setSelection] = useState<Selection>({});
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (templateState.success) onDone();
  }, [templateState.success, onDone]);

  useEffect(() => {
    if (copyState.success) onDone();
  }, [copyState.success, onDone]);

  // Build category map: group name → count (all components, not filtered)
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
          (c.sku ?? "").toLowerCase().includes(q)
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
  }

  function setQty(id: string, qty: number) {
    setSelection((prev) => {
      if (qty <= 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: qty };
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

    const formData = new FormData();
    formData.set("lines", JSON.stringify(lines));

    if (bomId) {
      formData.set("bom_id", bomId);
      formData.set("variant_id", variantId);
      const result = await addComponentsToBom(undefined as never, formData);
      if (result.error) {
        setError(result.error);
        setSaving(false);
        return;
      }
    } else {
      formData.set("target_variant_id", variantId);
      const result = await createBomWithComponents(undefined as never, formData);
      if (result.error) {
        setError(result.error);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onDone();
  }

  const selectionCount = Object.keys(selection).length;

  return (
    <div className={styles.pickerLayout}>
      {!bomId && (templates.length > 0 || sourceBoms.length > 0) && (
        <div className={styles.startFromBar}>
          <span className={styles.startFromLabel}>Start from:</span>
          {templates.length > 0 && (
            <form action={templateAction} className={styles.startFromForm}>
              <input type="hidden" name="target_variant_id" value={variantId} />
              <select name="template_id" required className={styles.startFromSelect}>
                <option value="">Choose template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.lineCount} line{t.lineCount === 1 ? "" : "s"})
                  </option>
                ))}
              </select>
              <button type="submit" className={styles.startFromBtn}>Use template</button>
            </form>
          )}
          {sourceBoms.length > 0 && (
            <form action={copyAction} className={styles.startFromForm}>
              <input type="hidden" name="target_variant_id" value={variantId} />
              <select name="source_bom_id" required className={styles.startFromSelect}>
                <option value="">Copy from variant…</option>
                {sourceBoms.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
              <button type="submit" className={styles.startFromBtn}>Copy</button>
            </form>
          )}
        </div>
      )}
      {(templateState?.error || copyState?.error) && (
        <p className={styles.startFromError}>
          {templateState?.error ?? copyState?.error}
        </p>
      )}

      {/* Search bar — full width */}
      <div className={styles.searchRow}>
        <input
          type="search"
          placeholder="Search by name or SKU…"
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
                </div>
                <span className={styles.componentUnit}>{c.unit ?? "—"}</span>
                <span className={styles.componentCost}>
                  {c.cost_per_unit !== null
                    ? `$${c.cost_per_unit.toFixed(2)}`
                    : <span className={styles.noCost}>no cost</span>}
                </span>
                {isSelected && (
                  <div className={styles.stepper}>
                    <button
                      type="button"
                      onClick={() => setQty(c.id, (selection[c.id] ?? 1) - 1)}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      className={styles.stepperQty}
                      value={selection[c.id] ?? 1}
                      min={0}
                      onChange={(e) => setQty(c.id, Number(e.target.value))}
                    />
                    <button
                      type="button"
                      onClick={() => setQty(c.id, (selection[c.id] ?? 1) + 1)}
                    >
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
                      <td>{c.sku ?? "—"}</td>
                      <td>{c.unit ?? "—"}</td>
                      <td>{qty}</td>
                      <td>
                        {lineCost !== null ? `$${lineCost.toFixed(2)}` : "—"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.removeBtn}
                          aria-label={`Remove ${c.name}`}
                          onClick={() => toggleComponent(c.id)}
                        >
                          ✕
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
                ? "Cost incomplete — missing prices"
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
                ? "Saving…"
                : `Save BOM (${selectionCount} item${selectionCount !== 1 ? "s" : ""})`}
            </button>
          </div>
          {error && (
            <p className={styles.err}>{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
