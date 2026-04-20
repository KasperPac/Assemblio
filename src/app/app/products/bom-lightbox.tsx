"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useFormState } from "react-dom";
import {
  createBomWithComponents,
  createBomFromTemplate,
  copyBomToDraft,
} from "./actions";
import { createTemplate } from "./template-actions";
import styles from "./bom-lightbox.module.css";

type ActionState = { error?: string; success?: string };

type TemplateOption = { id: string; name: string; lineCount: number };
type SourceBomOption = { id: string; label: string };
type ComponentOption = { id: string; name: string; sku: string | null; unit: string | null; group: string | null };

type Props = {
  variantId: string;
  variantLabel: string;
  templates: TemplateOption[];
  sourceBoms: SourceBomOption[];
  components: ComponentOption[];
  buttonClassName: string;
};

type LineState = Record<string, { selected: boolean; quantity: number }>;

const initial: ActionState = {};

export default function BomLightbox({
  variantId,
  variantLabel,
  templates,
  sourceBoms,
  components,
  buttonClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"options" | "picker" | "newTemplate">("options");
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [templateState, templateAction] = useFormState(createBomFromTemplate, initial);
  const [copyState, copyAction] = useFormState(copyBomToDraft, initial);
  const [newTplState, newTplAction] = useFormState(createTemplate, initial);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open) { setView("options"); d.showModal(); }
    else d.close();
  }, [open]);

  useEffect(() => {
    if (newTplState.success) setView("options");
  }, [newTplState.success]);

  return (
    <>
      <button type="button" className={buttonClassName} onClick={() => setOpen(true)}>
        Add / Modify BOM
      </button>

      <dialog ref={dialogRef} className={styles.overlay} onClose={() => setOpen(false)}>
        <div className={styles.backdrop} onClick={() => setOpen(false)} />
        <div className={view === "picker" ? styles.panelWide : styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>{view === "picker" ? "Select Components" : "BOM Builder"}</h2>
              <p className={styles.panelSub}>{variantLabel}</p>
            </div>
            <button type="button" className={styles.closeBtn} onClick={() => setOpen(false)}>
              &times;
            </button>
          </div>

          {view === "options" && (
            <div className={styles.grid}>
              <div className={styles.card} onClick={() => setView("picker")} role="button" tabIndex={0}>
                <div className={`${styles.icon} ${styles.iconBlue}`}>+</div>
                <h3>From Scratch</h3>
                <p>Pick components from the catalogue and set quantities.</p>
                <span className={styles.btnPrimary}>Select Components</span>
              </div>

              <form action={templateAction} className={styles.card}>
                <input type="hidden" name="target_variant_id" value={variantId} />
                <div className={`${styles.icon} ${styles.iconGreen}`}>&#9638;</div>
                <h3>From Template</h3>
                <p>Pre-populated with standard components &amp; labour.</p>
                {templates.length === 0 ? (
                  <span className={styles.muted}>No templates yet.</span>
                ) : (
                  <>
                    <select name="template_id" defaultValue="" required className={styles.select}>
                      <option value="">Select template</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} ({t.lineCount})</option>
                      ))}
                    </select>
                    <button type="submit" className={styles.btnPrimary}>Create from Template</button>
                  </>
                )}
                <button type="button" className={styles.link} onClick={() => setView("newTemplate")}>
                  + New Template
                </button>
                {templateState.error && <span className={styles.err}>{templateState.error}</span>}
                {templateState.success && <span className={styles.ok}>{templateState.success}</span>}
              </form>

              <form action={copyAction} className={styles.card}>
                <input type="hidden" name="target_variant_id" value={variantId} />
                <div className={`${styles.icon} ${styles.iconOrange}`}>&#8644;</div>
                <h3>Copy &amp; Modify</h3>
                <p>Duplicate from another variant and adjust.</p>
                {sourceBoms.length === 0 ? (
                  <span className={styles.muted}>No BOMs to copy.</span>
                ) : (
                  <>
                    <select name="source_bom_id" defaultValue="" required className={styles.select}>
                      <option value="">Select source BOM</option>
                      {sourceBoms.map((b) => (
                        <option key={b.id} value={b.id}>{b.label}</option>
                      ))}
                    </select>
                    <button type="submit" className={styles.btnSecondary}>Copy to Draft</button>
                  </>
                )}
                {copyState.error && <span className={styles.err}>{copyState.error}</span>}
                {copyState.success && <span className={styles.ok}>{copyState.success}</span>}
              </form>

              <div className={styles.card}>
                <div className={`${styles.icon} ${styles.iconPurple}`}>&#8613;</div>
                <h3>Import CSV</h3>
                <p>Upload a CSV with component SKUs and quantities.</p>
                <span className={styles.muted}>
                  CSV import is not available in this release. Use templates or
                  component selection instead.
                </span>
              </div>
            </div>
          )}

          {view === "picker" && (
            <ComponentPicker
              variantId={variantId}
              components={components}
              onBack={() => setView("options")}
              onDone={() => setOpen(false)}
            />
          )}

          {view === "newTemplate" && (
            <div className={styles.innerPanel}>
              <button type="button" className={styles.backBtn} onClick={() => setView("options")}>
                &larr; Back
              </button>
              <h3>Create New Template</h3>
              <form action={newTplAction} className={styles.tplForm}>
                <label className={styles.field}>
                  <span>Name *</span>
                  <input name="name" required placeholder="e.g. Standard Machine Build" />
                </label>
                <label className={styles.field}>
                  <span>Description</span>
                  <input name="description" placeholder="What this template includes..." />
                </label>
                {newTplState.error && <span className={styles.err}>{newTplState.error}</span>}
                <div className={styles.tplActions}>
                  <button type="button" className={styles.btnSecondary} onClick={() => setView("options")}>Cancel</button>
                  <button type="submit" className={styles.btnPrimary}>Create Template</button>
                </div>
              </form>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

function ComponentPicker({
  variantId,
  components,
  onBack,
  onDone,
}: {
  variantId: string;
  components: ComponentOption[];
  onBack: () => void;
  onDone: () => void;
}) {
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<LineState>({});
  const [notes, setNotes] = useState("");
  const [state, formAction] = useFormState(createBomWithComponents, initial);

  useEffect(() => {
    if (state.success) onDone();
  }, [state.success, onDone]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return components;
    return components.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.sku ?? "").toLowerCase().includes(q)
    );
  }, [components, search]);

  const groups = useMemo(() => {
    const map: Record<string, ComponentOption[]> = {};
    for (const c of filtered) {
      const g = c.group ?? "Other";
      if (!map[g]) map[g] = [];
      map[g].push(c);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const selectedCount = Object.values(lines).filter((l) => l.selected && l.quantity > 0).length;

  function toggle(id: string) {
    setLines((prev) => {
      const cur = prev[id] ?? { selected: false, quantity: 1 };
      return { ...prev, [id]: { ...cur, selected: !cur.selected, quantity: cur.selected ? cur.quantity : Math.max(cur.quantity, 1) } };
    });
  }

  function setQty(id: string, qty: number) {
    setLines((prev) => {
      const cur = prev[id] ?? { selected: true, quantity: 1 };
      return { ...prev, [id]: { ...cur, quantity: Math.max(0, qty) } };
    });
  }

  const serializedLines = JSON.stringify(
    Object.entries(lines)
      .filter(([, v]) => v.selected && v.quantity > 0)
      .map(([id, v]) => ({ component_id: id, quantity: v.quantity }))
  );

  return (
    <div className={styles.pickerWrap}>
      <div className={styles.pickerToolbar}>
        <button type="button" className={styles.backBtn} onClick={onBack}>&larr; Back</button>
        <input
          type="text"
          placeholder="Search components..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.searchInput}
        />
        <span className={styles.selectedCount}>{selectedCount} selected</span>
      </div>

      <div className={styles.pickerTable}>
        <div className={styles.pickerHeader}>
          <span></span>
          <span>Component</span>
          <span>SKU</span>
          <span>Unit</span>
          <span>Qty</span>
        </div>
        {groups.map(([groupName, items]) => (
          <div key={groupName}>
            <div className={styles.groupRow}>{groupName}</div>
            {items.map((c) => {
              const line = lines[c.id];
              const checked = line?.selected ?? false;
              return (
                <div
                  key={c.id}
                  className={`${styles.pickerRow} ${checked ? styles.pickerRowSelected : ""}`}
                >
                  <span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(c.id)}
                      className={styles.checkbox}
                    />
                  </span>
                  <span className={styles.compName} onClick={() => toggle(c.id)}>{c.name}</span>
                  <span className={styles.compSku}>{c.sku ?? "--"}</span>
                  <span className={styles.compUnit}>{c.unit ?? "ea"}</span>
                  <span>
                    {checked && (
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={line?.quantity ?? 1}
                        onChange={(e) => setQty(c.id, Number(e.target.value))}
                        className={styles.qtyInput}
                      />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className={styles.pickerEmpty}>No components match your search.</div>
        )}
      </div>

      <div className={styles.notesWrap}>
        <label className={styles.field}>
          <span>Notes (optional)</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes for this BOM version..."
            className={styles.notesInput}
          />
        </label>
      </div>

      <form action={formAction} className={styles.pickerFooter}>
        <input type="hidden" name="target_variant_id" value={variantId} />
        <input type="hidden" name="lines" value={serializedLines} />
        <input type="hidden" name="notes" value={notes} />
        {state.error && <span className={styles.err}>{state.error}</span>}
        <button type="button" className={styles.btnSecondary} onClick={onBack}>Cancel</button>
        <button type="submit" className={styles.btnPrimary} disabled={selectedCount === 0}>
          Create BOM ({selectedCount} items)
        </button>
      </form>
    </div>
  );
}
