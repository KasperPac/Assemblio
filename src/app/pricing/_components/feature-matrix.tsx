import React from "react";
import { TIERS, FEATURE_MODULES, type FeatureCell } from "../_data/tiers";
import styles from "./feature-matrix.module.css";

function Cell({ value }: { value: FeatureCell }) {
  if (value === true) {
    return <span className={styles.checkIcon} aria-label="Included">✓</span>;
  }
  if (value === false) {
    return <span className={styles.dashIcon} aria-label="Not included">—</span>;
  }
  return <span className={styles.cellText}>{value}</span>;
}

export default function FeatureMatrix() {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Compare all features</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.featureCol}>Feature</th>
              {TIERS.map((t) => (
                <th key={t.id} className={styles.tierCol}>
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURE_MODULES.map((mod) => (
              <React.Fragment key={mod.name}>
                <tr className={styles.moduleRow}>
                  <td colSpan={TIERS.length + 1}>{mod.name}</td>
                </tr>
                {mod.features.map((row) => (
                  <tr key={row.name} className={styles.featureRow}>
                    <td className={styles.featureName}>{row.name}</td>
                    {TIERS.map((t) => (
                      <td key={t.id} className={styles.cell}>
                        <Cell value={row[t.id]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
