"use client";

import { useActionState } from "react";
import { setDefaultLocation } from "./actions";
import styles from "./locations.module.css";
import EmptyState from "../../_ui/empty-state";
import StatusBadge from "../../_ui/status-badge";

type Location = { id: string; name: string; is_default: boolean };

export function DefaultLocationPicker({ locations }: { locations: Location[] }) {
  const [state, formAction] = useActionState(setDefaultLocation, {});

  return (
    <div className={styles.list}>
      {state.error && (
        <p className={styles.actionError} role="alert">{state.error}</p>
      )}
      {locations.map((loc) => (
        <div
          key={loc.id}
          className={`${styles.row} ${loc.is_default ? styles.rowDefault : ""}`}
        >
          <div className={styles.rowInfo}>
            <span className={styles.name}>{loc.name}</span>
            {loc.is_default && (
              <StatusBadge variant="info">Default</StatusBadge>
            )}
          </div>
          {!loc.is_default && (
            <form action={formAction}>
              <input type="hidden" name="location_id" value={loc.id} />
              <button
                type="submit"
                className={styles.setDefaultButton}
                aria-label={`Set ${loc.name} as default`}
              >
                Set as default
              </button>
            </form>
          )}
        </div>
      ))}
      {locations.length === 0 && (
        <EmptyState
          title="No locations yet"
          message="Create locations in the Locations module before setting a default."
        />
      )}
    </div>
  );
}
