"use client";

import { useFormState } from "react-dom";
import styles from "./stocktake.module.css";

type FormState = {
  error?: string;
  success?: string;
};

type LocationOption = {
  id: string;
  name: string | null;
  is_default?: boolean | null;
};

type Props = {
  locations: LocationOption[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
};

const initialState: FormState = {};

export default function StocktakeCreateForm({ locations, action }: Props) {
  const [state, formAction] = useFormState(action, initialState);
  const defaultLocation = locations.find((location) => location.is_default)?.id ?? "";

  return (
    <form className={styles.formCard} action={formAction}>
      <div className={styles.formRow}>
        <label>
          Location
          <select name="location_id" required defaultValue={defaultLocation}>
            {!defaultLocation ? <option value="">Select location</option> : null}
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name ?? "Unnamed"}
                {location.is_default ? " (Default)" : ""}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="status" value="open" />
        <label>
          Initial Status
          <input value="Open" readOnly />
        </label>
        <button className={styles.primary} type="submit">
          New Session
        </button>
      </div>
      {state.error ? <p className={styles.error}>{state.error}</p> : null}
      {state.success ? <p className={styles.success}>{state.success}</p> : null}
    </form>
  );
}
