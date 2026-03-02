"use client";

import { useFormState } from "react-dom";
import styles from "./suppliers.module.css";

type FormState = {
  error?: string;
  success?: string;
};

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
};

const initialState: FormState = {};

export default function SupplierCreateForm({ action }: Props) {
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form className={styles.formCard} action={formAction}>
      <div className={styles.formRow}>
        <label>
          Supplier Name
          <input name="name" placeholder="Pacific Controls" required />
        </label>
        <button className={styles.primary} type="submit">
          Add Supplier
        </button>
      </div>
      {state.error ? <p className={styles.error}>{state.error}</p> : null}
      {state.success ? <p className={styles.success}>{state.success}</p> : null}
    </form>
  );
}
