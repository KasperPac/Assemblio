"use client";

import type { BusinessData } from "@/lib/dev-dashboard/types";
import styles from "./dev-dashboard.module.css";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}

export default function BusinessTab({ data }: { data: BusinessData }) {
  const maxSignup = Math.max(...data.signupsByWeek.map((w) => w.count), 1);

  return (
    <>
      {/* Tenant status breakdown */}
      <div className={styles.kpiRow}>
        {Object.entries(data.tenantsByStatus).map(([status, count]) => (
          <div key={status} className={styles.kpiChip}>
            <span className={styles.kpiLabel}>{status.replace("_", " ")}</span>
            <span className={styles.kpiValue}>{count}</span>
          </div>
        ))}
      </div>

      {/* Signup sparkline */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>Signups — Last 12 Weeks</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60 }}>
          {data.signupsByWeek.map((w, i) => (
            <div
              key={i}
              title={`${w.week}: ${w.count}`}
              style={{
                flex: 1,
                height: `${Math.max((w.count / maxSignup) * 100, 4)}%`,
                background: "var(--brand-1)",
                borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
                opacity: 0.7 + (i / data.signupsByWeek.length) * 0.3,
              }}
            />
          ))}
        </div>
      </div>

      {/* Revenue */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiChip}>
          <span className={styles.kpiLabel}>MRR</span>
          <span className={styles.kpiValue}>{formatCurrency(data.mrr)}</span>
        </div>
        <div className={styles.kpiChip}>
          <span className={styles.kpiLabel}>ARPU</span>
          <span className={styles.kpiValue}>{formatCurrency(data.arpu)}</span>
        </div>
        <div className={styles.kpiChip}>
          <span className={styles.kpiLabel}>Trial → Paid</span>
          <span className={styles.kpiValue}>{data.trialConversion}%</span>
        </div>
        <div className={styles.kpiChip}>
          <span className={styles.kpiLabel}>Churn</span>
          <span className={styles.kpiValue}>{data.churnRate}%</span>
        </div>
      </div>

      {/* Revenue by tier */}
      {data.revenueByTier.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>Revenue by Plan Tier</div>
          {data.revenueByTier.map((t) => (
            <div key={t.tier} className={styles.progressRow}>
              <span className={styles.progressLabel} style={{ textTransform: "capitalize" }}>{t.tier}</span>
              <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-muted)" }}>{t.count} tenants</span>
              <span style={{ fontSize: "var(--fs-sm)", fontWeight: 700, color: "var(--ink-strong)", marginLeft: "auto" }}>{formatCurrency(t.mrr)}/mo</span>
            </div>
          ))}
        </div>
      )}

      {/* Feature adoption */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>Feature Adoption</div>
        {data.featureAdoption.map((f) => (
          <div key={f.feature} className={styles.progressRow}>
            <span className={styles.progressLabel}>{f.feature}</span>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${f.percent}%` }} />
            </div>
            <span className={styles.progressValue}>{f.percent}%</span>
          </div>
        ))}
      </div>
    </>
  );
}
