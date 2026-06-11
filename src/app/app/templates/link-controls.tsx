"use client";

import { useRef, useState } from "react";
import { setTemplateLinked, publishTemplate } from "./actions";
import type { AffectedBom } from "./affected";
import styles from "./templates.module.css";

const TOOLTIP_COPY =
  "When dynamic linking is on, you can push template changes to every BOM created from this template. Each push rolls those BOMs to a new version.";

export function LinkControls({
  templateType,
  templateId,
  isLinked,
  hasUnpublished,
  affectedBoms,
}: {
  templateType: "component" | "labor";
  templateId: string;
  isLinked: boolean;
  hasUnpublished: boolean;
  affectedBoms: AffectedBom[];
}) {
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const dialogRef = useRef<HTMLDialogElement>(null);

  async function toggle() {
    setBusy(true);
    await setTemplateLinked(templateType, templateId, !isLinked);
    setBusy(false);
  }

  function openDialog() {
    setSelected(new Set(affectedBoms.map((b) => b.bomId))); // all pre-selected
    setMessage({});
    setDialogOpen(true);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    setDialogOpen(false);
    dialogRef.current?.close();
  }

  async function confirmPublish() {
    setBusy(true);
    const result = await publishTemplate(templateType, templateId, Array.from(selected));
    setBusy(false);
    if (result.error) {
      setMessage({ error: result.error });
      return;
    }
    closeDialog();
  }

  const showPublish = isLinked && hasUnpublished && affectedBoms.length > 0;

  return (
    <>
      <button type="button" className={styles.linkToggle} onClick={toggle} disabled={busy}>
        <span className={isLinked ? styles.knobOn : styles.knob} />
        Dynamic link
      </button>
      <span className={styles.infoWrap}>
        <button type="button" className={styles.infoIcon} aria-label="What is dynamic linking?">
          i
        </button>
        <span role="tooltip" className={styles.tooltip}>{TOOLTIP_COPY}</span>
      </span>

      {showPublish ? (
        <button type="button" className={styles.publishBtn} onClick={openDialog}>
          Push update to {affectedBoms.length} BOM{affectedBoms.length === 1 ? "" : "s"}
        </button>
      ) : null}

      <dialog ref={dialogRef} className={styles.dialog} onClose={() => setDialogOpen(false)}>
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>Push template update to BOMs</h2>
            <button type="button" className={styles.dialogClose} onClick={closeDialog}>&times;</button>
          </div>
          <p className={styles.dialogSub}>
            The selected BOMs will be rolled to a new version with the updated template lines.
            Manually added lines are kept; quantities on template lines are reset to the template.
          </p>
          {dialogOpen && (
            <div className={styles.publishList}>
              {affectedBoms.map((bom) => {
                const checked = selected.has(bom.bomId);
                return (
                  <label key={bom.bomId} className={styles.publishRow}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(bom.bomId)) next.delete(bom.bomId);
                          else next.add(bom.bomId);
                          return next;
                        })
                      }
                    />
                    <span className={styles.publishIdentity}>
                      <strong>{bom.variantTitle}</strong>
                      <span className={styles.publishMeta}>
                        {bom.variantSku ? `SKU ${bom.variantSku} · ` : ""}currently v{bom.version} ({bom.status})
                      </span>
                    </span>
                    <span className={styles.versionChip}>
                      v{bom.version} → v{bom.version + 1}{" "}
                      {bom.status === "active" ? "active" : "draft"}
                    </span>
                  </label>
                );
              })}
              <p className={styles.publishWarn}>
                Deselected BOMs keep their current version and stay linked — they&apos;ll be offered
                again on the next publish.
              </p>
              {message.error && <p className={styles.error}>{message.error}</p>}
              <div className={styles.dialogActions}>
                <button type="button" className={styles.btnCancel} onClick={closeDialog}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.btnSubmit}
                  onClick={confirmPublish}
                  disabled={busy}
                >
                  {busy ? "Updating…" : `Update ${selected.size} BOM${selected.size === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
