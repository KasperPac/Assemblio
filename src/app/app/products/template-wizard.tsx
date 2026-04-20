"use client";

import { useFormState } from "react-dom";
import { useState, useEffect, useRef } from "react";
import { createTemplate, addTemplateLine, removeTemplateLine } from "./template-actions";
import styles from "./variant-detail.module.css";

type ActionState = { error?: string; success?: string };
type ComponentOption = { id: string; name: string; sku: string | null };

const initialState: ActionState = {};

type WizardStep = "list" | "create" | "edit";

export default function TemplateWizard({
  components,
}: {
  components: ComponentOption[];
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("create");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open) {
      setStep("create");
      d.showModal();
    } else {
      d.close();
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={styles.wizardLink}
        onClick={() => setOpen(true)}
      >
        Manage Templates
      </button>

      <dialog
        ref={dialogRef}
        className={styles.wizardDialog}
        onClose={() => setOpen(false)}
      >
        <div className={styles.wizardInner}>
          <div className={styles.wizardHeader}>
            <h2>BOM Templates</h2>
            <button
              type="button"
              className={styles.wizardClose}
              onClick={() => setOpen(false)}
            >
              &times;
            </button>
          </div>
          <p className={styles.wizardSubtitle}>
            Create reusable templates with standard components and labour lines.
          </p>
          <CreateForm onDone={() => setOpen(false)} />
        </div>
      </dialog>
    </>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [state, formAction] = useFormState(createTemplate, initialState);

  return (
    <form action={formAction} className={styles.wizardForm}>
      <label className={styles.wizardField}>
        <span>Template Name *</span>
        <input name="name" required placeholder="e.g. Standard Machine Build" />
      </label>
      <label className={styles.wizardField}>
        <span>Description</span>
        <textarea name="description" rows={2} placeholder="What this template includes..." />
      </label>
      {state.error && <p className={styles.error}>{state.error}</p>}
      {state.success && <p className={styles.success}>{state.success}</p>}
      <div className={styles.wizardActions}>
        <button type="button" className={styles.secondaryButton} onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className={styles.primaryButton}>
          Create Template
        </button>
      </div>
      {state.success && (
        <p className={styles.wizardHint}>
          Template created. Add components to it from the BOM Templates page, then come back here to use it.
        </p>
      )}
    </form>
  );
}
