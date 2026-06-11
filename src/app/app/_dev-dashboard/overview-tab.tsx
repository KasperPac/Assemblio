"use client";

import type { DashboardData } from "@/lib/dev-dashboard/types";
import styles from "./dev-dashboard.module.css";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}

export default function OverviewTab({ data }: { data: DashboardData }) {
  const o = data.overview;
  const healthColor = o.health === "ACTIVE_HEALTHY" ? styles.dotOk : o.health === "UNHEALTHY" ? styles.dotDanger : styles.dotWarn;

  return (
    <>
      <div className={styles.kpiRow}>
        <div className={styles.kpiChip}>
          <span className={styles.kpiLabel}>Health</span>
          <span className={styles.kpiValue}><span className={`${styles.dot} ${healthColor}`} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 6 }} />{o.health === "ACTIVE_HEALTHY" ? "Healthy" : o.health}</span>
        </div>
        <div className={styles.kpiChip}>
          <span className={styles.kpiLabel}>Tenants</span>
          <span className={styles.kpiValue}>{o.totalTenants}</span>
          <span className={styles.kpiSub}>{o.activeTenants} active</span>
        </div>
        <div className={styles.kpiChip}>
          <span className={styles.kpiLabel}>MRR</span>
          <span className={styles.kpiValue}>{formatCurrency(o.mrr)}</span>
        </div>
        <div className={styles.kpiChip}>
          <span className={styles.kpiLabel}>API Reqs/min</span>
          <span className={styles.kpiValue}>{o.apiReqsPerMin.toLocaleString()}</span>
          <span className={styles.kpiSub}>last 5 min avg</span>
        </div>
        <div className={styles.kpiChip}>
          <span className={styles.kpiLabel}>Error Rate</span>
          <span className={styles.kpiValue}>{o.errorRate}%</span>
          <span className={styles.kpiSub}>{o.errorRate < 1 ? "Healthy" : o.errorRate < 5 ? "Elevated" : "Critical"}</span>
        </div>
        <div className={styles.kpiChip}>
          <span className={styles.kpiLabel}>DB Connections</span>
          <span className={styles.kpiValue}>{o.dbConnections}</span>
          <span className={styles.kpiSub}>of {o.dbConnectionsMax} max</span>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>Alerts & Advisors</div>
        {o.alerts.length === 0 ? (
          <p className={styles.notConfigured}>No alerts right now.</p>
        ) : (
          <div className={styles.alertList}>
            {o.alerts.map((alert, i) => (
              <div key={i} className={styles.alertItem}>
                <span className={`${styles.alertIcon} ${alert.severity === "error" ? styles.alertError : alert.severity === "warning" ? styles.alertWarning : styles.alertInfo}`}>
                  {alert.severity === "error" ? "●" : alert.severity === "warning" ? "▲" : "ℹ"}
                </span>
                <span>{alert.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
