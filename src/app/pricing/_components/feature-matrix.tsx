import React from "react";
import { TIERS, FEATURE_MODULES, type FeatureCell } from "../_data/tiers";
import styles from "./feature-matrix.module.css";

function Cell({ value }: { value: FeatureCell | undefined }) {
  if (value === true) {
    return <span className={styles.checkIcon} aria-label="Included">✓</span>;
  }
  if (value === false || value === undefined) {
    return <span className={styles.dashIcon} aria-label="Not included">—</span>;
  }
  return <span className={styles.cellText}>{value}</span>;
}

export default function FeatureMatrix() {
  return (
    <section className={styles.section}>
      <h2 id="feature-matrix-heading" className={styles.heading}>Compare all features</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-labelledby="feature-matrix-heading">
          <thead>
            <tr>
              <th className={styles.featureCol} scope="col">Feature</th>
              {TIERS.map((t) => (
                <th key={t.id} className={styles.tierCol} scope="col">
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURE_MODULES.map((mod) => (
              <React.Fragment key={mod.name}>
                <tr className={styles.moduleRow}>
                  <th colSpan={TIERS.length + 1} scope="colgroup" className={styles.moduleCell}>{mod.name}</th>
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
