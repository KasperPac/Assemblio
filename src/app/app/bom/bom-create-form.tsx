"use client";

import { useActionState } from "react";
import styles from "./bom.module.css";

type FormState = {
  error?: string;
  success?: string;
};

type VariantOption = {
  id: string;
  title: string | null;
  sku: string | null;
};

type Props = {
  variants: VariantOption[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
};

const initialState: FormState = {};

export default function BomCreateForm({ variants, action }: Props) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form className={styles.formCard} action={formAction}>
      <div className={styles.formRow}>
        <label>
          Variant
          <select name="variant_id" required defaultValue="">
            <option value="">Select variant</option>
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.title ?? "Untitled variant"}
                {variant.sku ? ` (${variant.sku})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Version
          <input name="version" type="number" min="1" placeholder="Auto" />
        </label>
        <label>
          Status
          <select name="status" defaultValue="draft">
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label className={styles.checkboxLabel}>
          <input name="is_active" type="checkbox" />
          Set as active BOM
        </label>
        <button className={styles.primary} type="submit">
          New BOM
        </button>
      </div>
      {state.error ? <p className={styles.error}>{state.error}</p> : null}
      {state.success ? <p className={styles.success}>{state.success}</p> : null}
    </form>
  );
}
