"use client";

import { useRef, useState } from "react";
import { applyLaborTemplate } from "./actions";
import styles from "./apply-labor-template.module.css";

export type LaborTemplateOption = {
  id: string;
  name: string;
  mode: "basic" | "advanced";
  operationCount: number;
};

export default function ApplyLaborTemplate({
  productBomId,
  variantId,
  templates,
}: {
  productBomId: string;
  variantId: string;
  templates: LaborTemplateOption[];
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  if (templates.length === 0) return null;

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
      <button type="button" className={styles.applyBtn} onClick={openDialog}>
        Apply template
      </button>
      <dialog ref={dialogRef} className={styles.dialog} onClose={() => setOpen(false)}>
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>Apply Labor Template</h2>
            <button type="button" className={styles.dialogClose} onClick={closeDialog}>&times;</button>
          </div>
          <p className={styles.dialogSub}>
            Template operations are added to this BOM. Existing manual operations are kept;
            lines from a previously applied template are replaced.
          </p>
          {open && (
            <div className={styles.list}>
              {templates.map((t) => (
                <form key={t.id} action={applyLaborTemplate} className={styles.row}>
                  <input type="hidden" name="product_bom_id" value={productBomId} />
                  <input type="hidden" name="template_id" value={t.id} />
                  <input type="hidden" name="variant_id" value={variantId} />
                  <span className={styles.rowName}>{t.name}</span>
                  <span className={styles.modeBadge}>{t.mode === "basic" ? "Basic" : "Advanced"}</span>
                  <span className={styles.rowMeta}>
                    {t.operationCount} operation{t.operationCount === 1 ? "" : "s"}
                  </span>
                  <button type="submit" className={styles.rowApply}>Apply</button>
                </form>
              ))}
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
