"use client";

import { useActionState } from "react";
import { setDefaultLocation } from "./actions";
import styles from "./locations.module.css";

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
              <span className={styles.defaultBadge}>Default</span>
            )}
          </div>
          {!loc.is_default && (
            <form action={formAction}>
              <input type="hidden" name="location_id" value={loc.id} />
              <button type="submit" className={styles.setDefaultButton}>
                Set as default
              </button>
            </form>
          )}
        </div>
      ))}
      {locations.length === 0 && (
        <p className={styles.empty}>
          No locations yet.{" "}
          <a href="/app/warehouse/locations" className={styles.emptyLink}>
            Create locations →
          </a>
        </p>
      )}
    </div>
  );
}
