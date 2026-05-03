"use client";

import { useActionState } from "react";
import {
  copyBomToDraft,
  createBomFromTemplate,
  createDraftBomFromScratch,
} from "./actions";
import TemplateWizard from "./template-wizard";
import styles from "./variant-detail.module.css";

type BomActionState = {
  error?: string;
  success?: string;
};

type SourceBomOption = {
  id: string;
  label: string;
};

type TemplateOption = {
  id: string;
  name: string;
  description: string | null;
  lineCount: number;
};

type ComponentOption = {
  id: string;
  name: string;
  sku: string | null;
};

type Props = {
  targetVariantId: string;
  sourceBoms: SourceBomOption[];
  templates: TemplateOption[];
  components: ComponentOption[];
};

const initialState: BomActionState = {};

export default function BomSeedPanel({ targetVariantId, sourceBoms, templates, components }: Props) {
  const [createState, createAction] = useActionState(
    createDraftBomFromScratch,
    initialState
  );
  const [templateState, templateAction] = useActionState(
    createBomFromTemplate,
    initialState
  );
  const [copyState, copyAction] = useActionState(copyBomToDraft, initialState);

  return (
    <div className={styles.noBomGrid}>
      {/* 1. Create from Scratch */}
      <form action={createAction} className={styles.seedCard}>
        <input type="hidden" name="target_variant_id" value={targetVariantId} />
        <div className={`${styles.seedIcon} ${styles.seedIconScratch}`}>+</div>
        <h3>Create from Scratch</h3>
        <p>Start with an empty draft BOM and add components manually.</p>
        <button type="submit" className={styles.primaryButton}>
          Create Empty BOM
        </button>
        {createState.error && <p className={styles.error}>{createState.error}</p>}
        {createState.success && <p className={styles.success}>{createState.success}</p>}
      </form>

      {/* 2. Build from Template */}
      <form action={templateAction} className={styles.seedCard}>
        <input type="hidden" name="target_variant_id" value={targetVariantId} />
        <div className={`${styles.seedIcon} ${styles.seedIconTemplate}`}>&#9638;</div>
        <h3>Build from Template</h3>
        <p>Pre-populate with standard components and labour from a saved template.</p>
        {templates.length === 0 ? (
          <p className={styles.empty}>No templates available yet.</p>
        ) : (
          <>
            <select name="template_id" defaultValue="" required>
              <option value="">Select template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.lineCount} items)
                </option>
              ))}
            </select>
            <button type="submit" className={styles.primaryButton}>
              Create from Template
            </button>
          </>
        )}
        <TemplateWizard components={components} />
        {templateState.error && <p className={styles.error}>{templateState.error}</p>}
        {templateState.success && <p className={styles.success}>{templateState.success}</p>}
      </form>

      {/* 3. Copy & Modify */}
      <form action={copyAction} className={styles.seedCard}>
        <input type="hidden" name="target_variant_id" value={targetVariantId} />
        <div className={`${styles.seedIcon} ${styles.seedIconCopy}`}>&#8644;</div>
        <h3>Copy &amp; Modify</h3>
        <p>Duplicate a BOM from another product or variant and adjust quantities.</p>
        {sourceBoms.length === 0 ? (
          <p className={styles.empty}>No existing BOMs to copy from.</p>
        ) : (
          <>
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
          </>
        )}
        {copyState.error && <p className={styles.error}>{copyState.error}</p>}
        {copyState.success && <p className={styles.success}>{copyState.success}</p>}
      </form>

      {/* 4. Import from CSV */}
      <div className={styles.seedCard}>
        <div className={`${styles.seedIcon} ${styles.seedIconCsv}`}>&#8613;</div>
        <h3>Import from CSV</h3>
        <p>Upload a CSV file with component SKUs and quantities to build a BOM.</p>
        <p className={styles.empty}>
          CSV import is not available in this release. Use templates or copy an
          existing BOM instead.
        </p>
      </div>
    </div>
  );
}
