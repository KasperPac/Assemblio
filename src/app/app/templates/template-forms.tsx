"use client";

import { useActionState } from "react";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  createTemplate,
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

export function RemoveLineButton({
  lineId,
  templateId,
  disabled,
}: {
  lineId: string;
  templateId: string;
  disabled?: boolean;
}) {
  const [, formAction] = useActionState(removeTemplateLine, initialState);
  return (
    <form action={formAction} className={styles.inlineForm}>
      <input type="hidden" name="line_id" value={lineId} />
      <input type="hidden" name="template_id" value={templateId} />
      <button type="submit" className={styles.removeBtn} disabled={disabled}>&times;</button>
    </form>
  );
}

export function DeleteTemplateButton({ templateId, usedByCount }: { templateId: string; usedByCount: number }) {
  const [, formAction] = useActionState(deleteTemplate, initialState);
  return (
    <form
      action={formAction}
      className={styles.inlineForm}
      onSubmit={(e) => {
        if (
          usedByCount > 0 &&
          !window.confirm(
            `Used by ${usedByCount} BOM${usedByCount === 1 ? "" : "s"} — they will keep their lines but lose the link. Delete template?`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="template_id" value={templateId} />
      <button type="submit" className={styles.deleteTplBtn}>Delete</button>
    </form>
  );
}

export function TemplatePickerLightbox({
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
      <button type="button" className={styles.addComponentsBtn} onClick={openDialog}>
        + Add components
      </button>

      <dialog ref={dialogRef} className={lightboxStyles.overlay} onClose={() => setOpen(false)}>
        <div className={lightboxStyles.backdrop} onClick={closeDialog} />
        <div className={lightboxStyles.panelWide}>
          <div className={lightboxStyles.panelHeader}>
            <div>
              <h2>Add components</h2>
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
              saveLabel="Save template"
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
