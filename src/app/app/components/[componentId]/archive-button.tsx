"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveComponent } from "../actions";
import styles from "./component-detail.module.css";

type Props = { componentId: string };

type DialogState =
  | { phase: "idle" }
  | { phase: "confirm" }
  | { phase: "conflicts"; error: string; conflicts: string[] };

export default function ArchiveButton({ componentId }: Props) {
  const [dialog, setDialog] = useState<DialogState>({ phase: "idle" });
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleArchiveClick() {
    setDialog({ phase: "confirm" });
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await archiveComponent(componentId);
      if ("success" in result && result.success) {
        router.push("/app/components");
      } else if ("error" in result) {
        setDialog({ phase: "conflicts", error: result.error, conflicts: result.conflicts });
      }
    });
  }

  function handleClose() {
    setDialog({ phase: "idle" });
  }

  return (
    <>
      <button
        type="button"
        className={styles.archiveButton}
        onClick={handleArchiveClick}
      >
        Archive
      </button>

      {dialog.phase === "confirm" && (
        <div
          className={styles.archiveOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-dialog-title"
        >
          <div className={styles.archiveDialog}>
            <h3 id="archive-dialog-title">Archive this component?</h3>
            <p>
              It will be hidden from all lists and workflows.
              This can be undone from Trash.
            </p>
            <div className={styles.archiveDialogActions}>
              <button type="button" className={styles.btnCancel} onClick={handleClose}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.archiveConfirmBtn}
                onClick={handleConfirm}
                disabled={isPending}
              >
                {isPending ? "Archiving…" : "Yes, archive"}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog.phase === "conflicts" && (
        <div
          className={styles.archiveOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-conflict-title"
        >
          <div className={styles.archiveDialog}>
            <h3 id="archive-conflict-title">Cannot archive</h3>
            <p>{dialog.error}</p>
            <ul className={styles.conflictList}>
              {dialog.conflicts.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className={styles.archiveDialogActions}>
              <button type="button" className={styles.btnCancel} onClick={handleClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
