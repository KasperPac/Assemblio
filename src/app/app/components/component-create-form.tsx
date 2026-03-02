"use client";

import { useFormState } from "react-dom";
import styles from "./components.module.css";

type FormState = {
  error?: string;
  success?: string;
};

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
};

const initialState: FormState = {};

export default function ComponentCreateForm({ action }: Props) {
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form className={styles.formCard} action={formAction}>
      <div className={styles.formRow}>
        <label>
          Name
          <input name="name" required />
        </label>
        <label>
          SKU
          <input name="sku" />
        </label>
        <label>
          Unit
          <input name="unit" placeholder="pcs" />
        </label>
        <label>
          Reorder Point
          <input name="reorder_point" type="number" step="0.01" min="0" defaultValue="0" />
        </label>
        <label>
          Cost / Unit
          <input name="cost_per_unit" type="number" step="0.01" min="0" defaultValue="0" />
        </label>
        <button className={styles.primary} type="submit">
          Add Component
        </button>
      </div>
      {state.error ? <p className={styles.error}>{state.error}</p> : null}
      {state.success ? <p className={styles.success}>{state.success}</p> : null}
    </form>
  );
}

