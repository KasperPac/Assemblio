"use client";

import { useActionState, useState } from "react";
import { createMovement } from "./actions";
import styles from "./inventory.module.css";

type SelectOption = {
  id: string;
  name: string | null;
  sku?: string | null;
  is_default?: boolean | null;
};

type Props = {
  components: SelectOption[];
  locations: SelectOption[];
};

const initialState = { error: "", success: "" };

const movementPresets = {
  receipt: { onHand: "0", inProd: "0" },
  allocation: { onHand: "0", inProd: "0" },
  adjustment: { onHand: "0", inProd: "0" },
  production: { onHand: "0", inProd: "0" },
} as const;

export default function MovementForm({ components, locations }: Props) {
  type MovementType = keyof typeof movementPresets;
  const [state, formAction] = useActionState(createMovement, initialState);
  const [movementType, setMovementType] = useState<MovementType>("receipt");
  const [deltaOnHand, setDeltaOnHand] = useState<string>(
    movementPresets.receipt.onHand
  );
  const [deltaInProd, setDeltaInProd] = useState<string>(
    movementPresets.receipt.inProd
  );

  return (
    <form className={styles.movementForm} action={formAction}>
      <div className={styles.formRow}>
        <label>
          Component
          <select name="component_id" required>
            <option value="">Select component</option>
            {components.map((component) => (
              <option key={component.id} value={component.id}>
                {component.name ?? "Unnamed"}
                {component.sku ? ` (${component.sku})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Location
          <select name="location_id" required>
            <option value="">Select location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name ?? "Unnamed"}
                {location.is_default ? " - default" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reason
          <select
            name="reason"
            value={movementType}
            onChange={(event) => {
              const nextType = event.target.value as MovementType;
              const preset = movementPresets[nextType];
              setMovementType(nextType);
              setDeltaOnHand(preset.onHand);
              setDeltaInProd(preset.inProd);
            }}
          >
            <option value="receipt">Receipt</option>
            <option value="allocation">Allocation</option>
            <option value="adjustment">Adjustment</option>
            <option value="production">Production</option>
          </select>
        </label>
      </div>
      <div className={styles.formRow}>
        <label>
          Delta on-hand
          <input
            name="delta_on_hand"
            type="number"
            step="0.01"
            required
            min="-999999"
            value={deltaOnHand}
            onChange={(event) => setDeltaOnHand(event.target.value)}
          />
        </label>
        <label>
          Delta in-prod
          <input
            name="delta_in_prod"
            type="number"
            step="0.01"
            required
            min="-999999"
            value={deltaInProd}
            onChange={(event) => setDeltaInProd(event.target.value)}
          />
        </label>
        <label>
          Reference type
          <input name="reference_type" type="text" placeholder="order" />
        </label>
        <label>
          Reference id
          <input name="reference_id" type="text" placeholder="uuid" />
        </label>
      </div>
      <div className={styles.formActions}>
        {state.error ? <p className={styles.error}>{state.error}</p> : null}
        {state.success ? <p className={styles.success}>{state.success}</p> : null}
        <button className={styles.primary} type="submit">
          Save movement
        </button>
      </div>
    </form>
  );
}
