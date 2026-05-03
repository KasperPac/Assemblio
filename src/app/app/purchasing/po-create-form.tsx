"use client";

import { useActionState } from "react";
import styles from "./purchasing.module.css";

type FormState = {
  error?: string;
  success?: string;
};

type SupplierOption = {
  id: string;
  name: string | null;
};

type Props = {
  suppliers: SupplierOption[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
};

const initialState: FormState = {};

export default function PurchaseOrderCreateForm({ suppliers, action }: Props) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form className={styles.formCard} action={formAction}>
      <div className={styles.formRow}>
        <label>
          Supplier
          <select name="supplier_id" required defaultValue="">
            <option value="">Select supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name ?? "Unnamed supplier"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue="open">
            <option value="open">Open</option>
            <option value="in_transit">In Transit</option>
            <option value="received">Received</option>
          </select>
        </label>
        <button className={styles.primary} type="submit">
          New PO
        </button>
      </div>
      {state.error ? <p className={styles.error}>{state.error}</p> : null}
      {state.success ? <p className={styles.success}>{state.success}</p> : null}
    </form>
  );
}
