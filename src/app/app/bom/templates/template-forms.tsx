"use client";

import { useActionState } from "react";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  createTemplate,
  addTemplateLine,
  removeTemplateLine,
  deleteTemplate,
  setTemplateLines,
} from "./actions";
import ComponentPicker, {
  type ComponentOption,
} from "@/app/app/products/_components/component-picker";
import styles from "./templates.module.css";
import lightboxStyles from "@/app/app/products/bom-lightbox.module.css";

type ActionState = { error?: string; success?: string };

const initialState: ActionState = {};

export function CreateTemplateButton() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createTemplate, initialState);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open) d.showModal();
    else d.close();
  }, [open]);

  return (
    <>
      <button type="button" className={styles.addButton} onClick={() => setOpen(true)}>
        + New Template
      </button>
      <dialog ref={dialogRef} className={styles.dialog} onClose={() => setOpen(false)}>
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>New Template</h2>
            <button type="button" className={styles.dialogClose} onClick={() => setOpen(false)}>
              &times;
            </button>
          </div>
          <form action={formAction} className={styles.dialogForm}>
            <label className={styles.field}>
              <span>Name *</span>
              <input name="name" required placeholder="e.g. Standard Machine Build" />
            </label>
            <label className={styles.field}>
              <span>Description</span>
              <textarea name="description" rows={3} placeholder="What this template includes..." />
            </label>
            {state.error && <p className={styles.error}>{state.error}</p>}
            <div className={styles.dialogActions}>
              <button type="button" className={styles.btnCancel} onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className={styles.btnSubmit}>Create Template</button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}

export function AddLineForm({
  templateId,
  components,
}: {
  templateId: string;
  components: ComponentOption[];
}) {
  const [state, formAction] = useActionState(addTemplateLine, initialState);

  return (
    <form action={formAction} className={styles.addLineForm}>
      <input type="hidden" name="template_id" value={templateId} />
      <select name="component_id" required aria-label="Component">
        <option value="">Select component</option>
        {components.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}{c.sku ? ` (${c.sku})` : ""}
          </option>
        ))}
      </select>
      <input name="quantity" type="number" step="0.01" min="0" defaultValue="0" placeholder="Qty" aria-label="Quantity" />
      <button type="submit" className={styles.btnSmall}>Add</button>
      {state.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}

export function RemoveLineButton({ lineId }: { lineId: string }) {
  const [, formAction] = useActionState(removeTemplateLine, initialState);
  return (
    <form action={formAction} style={{ display: "inline" }}>
      <input type="hidden" name="line_id" value={lineId} />
      <button type="submit" className={styles.removeBtn}>&times;</button>
    </form>
  );
}

export function DeleteTemplateButton({ templateId }: { templateId: string }) {
  const [, formAction] = useActionState(deleteTemplate, initialState);
  return (
    <form action={formAction} style={{ display: "inline" }}>
      <input type="hidden" name="template_id" value={templateId} />
      <button type="submit" className={styles.deleteTplBtn}>Delete Template</button>
    </form>
  );
}

export function TemplateLightbox({
  templateId,
  templateName,
  existingLines,
  components,
}: {
  templateId: string;
  templateName: string;
  existingLines: { component_id: string; quantity: number }[];
  components: ComponentOption[];
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const initialSelection = useMemo(() => {
    const sel: Record<string, number> = {};
    for (const line of existingLines) {
      sel[line.component_id] = line.quantity;
    }
    return sel;
  }, [existingLines]);

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
      <button type="button" className={styles.btnSmall} onClick={openDialog}>
        Edit Components
      </button>

      <dialog ref={dialogRef} className={lightboxStyles.overlay} onClose={() => setOpen(false)}>
        <div className={lightboxStyles.backdrop} onClick={closeDialog} />
        <div className={lightboxStyles.panelWide}>
          <div className={lightboxStyles.panelHeader}>
            <div>
              <h2>Edit Template Components</h2>
              <p className={lightboxStyles.panelSub}>{templateName}</p>
            </div>
            <button type="button" className={lightboxStyles.closeBtn} onClick={closeDialog}>
              &times;
            </button>
          </div>

          {open && (
            <ComponentPicker
              components={components}
              initialSelection={initialSelection}
              saveLabel="Save Template"
              onSave={async (lines) => {
                const result = await setTemplateLines(templateId, lines);
                if (result.error) return { error: result.error };
                closeDialog();
              }}
            />
          )}
        </div>
      </dialog>
    </>
  );
}
