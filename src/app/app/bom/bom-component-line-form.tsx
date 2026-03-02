"use client";

import { useFormState } from "react-dom";
import styles from "./bom.module.css";

type FormState = {
  error?: string;
  success?: string;
};

type Option = {
  id: string;
  label: string;
};

type Props = {
  boms: Option[];
  components: Option[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
};

const initialState: FormState = {};

export default function BomComponentLineForm({ boms, components, action }: Props) {
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form className={styles.formCard} action={formAction}>
      <div className={styles.formRowWide}>
        <label>
          BOM
          <select name="product_bom_id" required defaultValue="">
            <option value="">Select BOM</option>
            {boms.map((bom) => (
              <option key={bom.id} value={bom.id}>
                {bom.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Component
          <select name="component_id" required defaultValue="">
            <option value="">Select component</option>
            {components.map((component) => (
              <option key={component.id} value={component.id}>
                {component.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Qty / unit
          <input name="quantity" type="number" step="0.01" min="0.01" required />
        </label>
        <button className={styles.primary} type="submit">
          Add BOM Line
        </button>
      </div>
      {state.error ? <p className={styles.error}>{state.error}</p> : null}
      {state.success ? <p className={styles.success}>{state.success}</p> : null}
    </form>
  );
}
