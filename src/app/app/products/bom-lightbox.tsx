"use client";

import { useState, useRef, useEffect } from "react";
import { useActionState } from "react";
import {
  createBomWithComponents,
  createBomFromTemplate,
  fetchBomLines,
} from "./actions";
import { addComponentsToBom } from "@/app/app/bom/actions";
import styles from "./bom-lightbox.module.css";
import ComponentPicker, { type ComponentOption } from "./_components/component-picker";

type ActionState = { error?: string; success?: string };

type TemplateOption = { id: string; name: string; lineCount: number };
type SourceBomOption = { id: string; label: string };

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

  const [copySelection, setCopySelection] = useState<Record<string, number> | undefined>();
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyMode, setCopyMode] = useState(false);

  function openDialog() {
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    setOpen(false);
    dialogRef.current?.close();
  }

  useEffect(() => {
    if (templateState.success) closeDialog();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateState.success]);

  async function handlePickerSave(
    lines: { component_id: string; quantity: number }[]
  ): Promise<{ error?: string } | void> {
    const formData = new FormData();
    formData.set("lines", JSON.stringify(lines));

    if (bomId) {
      formData.set("bom_id", bomId);
      formData.set("variant_id", variantId);
      const result = await addComponentsToBom(undefined as never, formData);
      if (result.error) return { error: result.error };
    } else {
      formData.set("target_variant_id", variantId);
      const result = await createBomWithComponents(undefined as never, formData);
      if (result.error) return { error: result.error };
    }

    closeDialog();
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
            <div className={styles.pickerLayout}>
              {!bomId && (
                <div className={styles.startFromBar}>
                  <span className={styles.startFromLabel}>Start from:</span>
                  {templates.length > 0 ? (
                    <form action={templateAction} className={styles.startFromForm}>
                      <input type="hidden" name="target_variant_id" value={variantId} />
                      <select
                        name="template_id"
                        required
                        defaultValue=""
                        className={styles.startFromSelect}
                        onChange={(e) => { if (e.target.value) e.target.form?.requestSubmit(); }}
                      >
                        <option value="" disabled>Choose template…</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.lineCount} line{t.lineCount === 1 ? "" : "s"})
                          </option>
                        ))}
                      </select>
                    </form>
                  ) : (
                    <span className={styles.startFromEmpty}>
                      No templates —{" "}
                      <a href="/app/bom/templates" className={styles.startFromCreateLink}>
                        create one →
                      </a>
                    </span>
                  )}
                  {sourceBoms.length > 0 && (
                    <div className={styles.startFromForm}>
                      <select
                        defaultValue=""
                        className={styles.startFromSelect}
                        disabled={copyLoading}
                        onChange={async (e) => {
                          const bomId = e.target.value;
                          if (!bomId) return;
                          setCopyLoading(true);
                          const lines = await fetchBomLines(bomId);
                          const sel: Record<string, number> = {};
                          for (const line of lines) {
                            sel[line.component_id] = line.quantity;
                          }
                          setCopySelection(sel);
                          setCopyMode(true);
                          setCopyLoading(false);
                        }}
                      >
                        <option value="" disabled>
                          {copyLoading ? "Loading\u2026" : "Copy from variant\u2026"}
                        </option>
                        {sourceBoms.map((b) => (
                          <option key={b.id} value={b.id}>{b.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
              {templateState?.error && (
                <p className={styles.startFromError}>{templateState.error}</p>
              )}

              <ComponentPicker
                components={components}
                initialSelection={copySelection}
                saveLabel={copyMode ? "Copy BOM" : "Save BOM"}
                onSave={handlePickerSave}
              />
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
