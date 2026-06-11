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
import CopySourceBrowser from "./_components/copy-source-browser";

type ActionState = { error?: string; success?: string };

type TemplateOption = { id: string; name: string; lineCount: number };
type SiblingOption = { bomId: string; label: string };

type Props = {
  variantId: string;
  variantLabel: string;
  bomId?: string;
  templates: TemplateOption[];
  siblings?: SiblingOption[];
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
  siblings = [],
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
  const [browseOpen, setBrowseOpen] = useState(false);
  const [showAllSiblings, setShowAllSiblings] = useState(false);
  const [copySourceLabel, setCopySourceLabel] = useState<string | null>(null);

  const SIBLING_LIMIT = 6;
  const visibleSiblings = showAllSiblings ? siblings : siblings.slice(0, SIBLING_LIMIT);
  const hiddenCount = siblings.length - visibleSiblings.length;

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

  async function pickCopySource(sourceBomId: string, label: string) {
    setCopyLoading(true);
    const lines = await fetchBomLines(sourceBomId);
    const sel: Record<string, number> = {};
    for (const line of lines) {
      sel[line.component_id] = line.quantity;
    }
    setCopySelection(sel);
    setCopyMode(true);
    setCopySourceLabel(label);
    setBrowseOpen(false);
    setCopyLoading(false);
  }

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
                      <a href="/app/templates" className={styles.startFromCreateLink}>
                        create one →
                      </a>
                    </span>
                  )}
                  {copySourceLabel ? (
                    <span className={styles.copyIndicator}>
                      Copying from <strong>{copySourceLabel}</strong>{" "}
                      <button
                        type="button"
                        className={styles.startFromLink}
                        onClick={() => setCopySourceLabel(null)}
                      >
                        change
                      </button>
                    </span>
                  ) : (
                    <>
                      {siblings.length > 0 && (
                        <span className={styles.startFromLabel}>Copy from:</span>
                      )}
                      {visibleSiblings.map((s) => (
                        <button
                          key={s.bomId}
                          type="button"
                          className={styles.startFromBtn}
                          disabled={copyLoading}
                          onClick={() => pickCopySource(s.bomId, s.label)}
                        >
                          {s.label}
                        </button>
                      ))}
                      {hiddenCount > 0 && (
                        <button
                          type="button"
                          className={styles.startFromBtn}
                          onClick={() => setShowAllSiblings(true)}
                        >
                          +{hiddenCount} more
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.startFromLink}
                        onClick={() => setBrowseOpen((o) => !o)}
                      >
                        Browse all products…
                      </button>
                    </>
                  )}
                </div>
              )}
              {templateState?.error && (
                <p className={styles.startFromError}>{templateState.error}</p>
              )}
              {!bomId && browseOpen && !copySourceLabel && (
                <CopySourceBrowser onPick={pickCopySource} />
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
