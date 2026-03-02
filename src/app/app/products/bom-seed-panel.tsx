"use client";

import { useFormState } from "react-dom";
import {
  copyBomToDraft,
  createDraftBomFromScratch,
} from "./actions";
import styles from "./variant-detail.module.css";

type BomActionState = {
  error?: string;
  success?: string;
};

type SourceBomOption = {
  id: string;
  label: string;
};

type Props = {
  targetVariantId: string;
  sourceBoms: SourceBomOption[];
};

const initialState: BomActionState = {};

export default function BomSeedPanel({ targetVariantId, sourceBoms }: Props) {
  const [createState, createAction] = useFormState(
    createDraftBomFromScratch,
    initialState
  );
  const [copyState, copyAction] = useFormState(copyBomToDraft, initialState);

  return (
    <div className={styles.noBomGrid}>
      <form action={createAction} className={styles.card}>
        <input type="hidden" name="target_variant_id" value={targetVariantId} />
        <h3>Create from scratch</h3>
        <p>Creates a new draft BOM for this variant.</p>
        <button type="submit" className={styles.primaryButton}>
          Create Draft BOM
        </button>
        {createState.error ? <p className={styles.error}>{createState.error}</p> : null}
        {createState.success ? (
          <p className={styles.success}>{createState.success}</p>
        ) : null}
      </form>

      <form action={copyAction} className={styles.card}>
        <input type="hidden" name="target_variant_id" value={targetVariantId} />
        <h3>Copy from existing variant</h3>
        <p>Copies any source BOM into a new draft for this variant.</p>
        <select name="source_bom_id" defaultValue="" required>
          <option value="">Select source BOM</option>
          {sourceBoms.map((bom) => (
            <option key={bom.id} value={bom.id}>
              {bom.label}
            </option>
          ))}
        </select>
        <button type="submit" className={styles.secondaryButton}>
          Copy to Draft
        </button>
        {copyState.error ? <p className={styles.error}>{copyState.error}</p> : null}
        {copyState.success ? <p className={styles.success}>{copyState.success}</p> : null}
      </form>
    </div>
  );
}
