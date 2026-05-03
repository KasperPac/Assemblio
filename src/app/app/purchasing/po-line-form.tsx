"use client";

import { useActionState } from "react";
import styles from "./purchasing.module.css";

type FormState = {
  error?: string;
  success?: string;
};

type Option = {
  id: string;
  label: string;
};

type Props = {
  purchaseOrders: Option[];
  components: Option[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
};

const initialState: FormState = {};

export default function PurchaseOrderLineForm({
  purchaseOrders,
  components,
  action,
}: Props) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form className={styles.formCard} action={formAction}>
      <div className={styles.formRowWide}>
        <label>
          Purchase Order
          <select name="purchase_order_id" required defaultValue="">
            <option value="">Select PO</option>
            {purchaseOrders.map((po) => (
              <option key={po.id} value={po.id}>
                {po.label}
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
          Quantity
          <input name="quantity" type="number" step="0.01" min="0.01" required />
        </label>
        <button className={styles.primary} type="submit">
          Add Line
        </button>
      </div>
      {state.error ? <p className={styles.error}>{state.error}</p> : null}
      {state.success ? <p className={styles.success}>{state.success}</p> : null}
    </form>
  );
}
