"use client";

import { useFormState } from "react-dom";
import styles from "./stocktake.module.css";

type FormState = {
  error?: string;
  success?: string;
};

type Option = {
  id: string;
  label: string;
};

type Props = {
  sessions: Option[];
  components: Option[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
};

const initialState: FormState = {};

export default function StocktakeLineForm({ sessions, components, action }: Props) {
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form className={styles.formCard} action={formAction}>
      <div className={styles.formRowWide}>
        <label>
          Session
          <select name="session_id" required defaultValue="">
            <option value="">Select session</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.label}
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
          Counted
          <input name="counted" type="number" step="0.01" min="0" required />
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
