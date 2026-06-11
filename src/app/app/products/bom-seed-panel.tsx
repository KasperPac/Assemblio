"use client";

import BomLightbox from "./bom-lightbox";
import styles from "./variant-detail.module.css";

type TemplateOption = {
  id: string;
  name: string;
  description: string | null;
  lineCount: number;
};

type SourceBomOption = {
  id: string;
  label: string;
};

type ComponentOption = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  group: string | null;
  cost_per_unit: number | null;
  description: string | null;
};

type Props = {
  targetVariantId: string;
  variantLabel: string;
  sourceBoms: SourceBomOption[];
  templates: TemplateOption[];
  components: ComponentOption[];
};

export default function BomSeedPanel({
  targetVariantId,
  variantLabel,
  sourceBoms,
  templates,
  components,
}: Props) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>+</div>
      <h3 className={styles.emptyHeading}>No bill of materials yet</h3>
      <p className={styles.emptyDescription}>
        Add components to define what goes into making this variant.
      </p>
      <BomLightbox
        variantId={targetVariantId}
        variantLabel={variantLabel}
        components={components}
        templates={templates}
        sourceBoms={sourceBoms}
        buttonLabel="+ Add Components"
        buttonClassName={styles.primaryButton}
      />
      <p className={styles.emptySecondary}>
        or{" "}
        <BomLightbox
          variantId={targetVariantId}
          variantLabel={variantLabel}
          components={components}
          templates={templates}
          sourceBoms={sourceBoms}
          buttonLabel="start from a template"
          buttonClassName={styles.linkButton}
        />
        {" · "}
        <BomLightbox
          variantId={targetVariantId}
          variantLabel={variantLabel}
          components={components}
          templates={templates}
          sourceBoms={sourceBoms}
          buttonLabel="copy another variant's BOM"
          buttonClassName={styles.linkButton}
        />
      </p>
    </div>
  );
}
