"use client";

import type { InfraData } from "@/lib/dev-dashboard/types";
import styles from "./dev-dashboard.module.css";

function timeAgo(iso: string): string {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function gaugeFillClass(pct: number) {
  if (pct >= 90) return styles.gaugeFillDanger;
  if (pct >= 70) return styles.gaugeFillWarn;
  return "";
}

export default function InfraTab({ data }: { data: InfraData }) {
  return (
    <>
      <div className={styles.card}>
        <div className={styles.cardHeader}>System Resources</div>
        <div className={styles.gaugeRow}>
          {([["CPU", data.cpu], ["Memory", data.memory], ["Disk", data.disk]] as const).map(([label, pct]) => (
            <div key={label} className={styles.gauge}>
              <span className={styles.gaugeLabel}>{label}</span>
              <div className={styles.gaugeBar}>
                <div className={`${styles.gaugeFill} ${gaugeFillClass(pct)}`} style={{ width: `${pct}%` }} />
              </div>
              <span className={styles.gaugeValue}>{pct}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.cardGrid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>Connection Pool</div>
          <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--ink-strong)" }}>
            Active: <strong>{data.poolActive}</strong> · Max: <strong>{data.poolMax}</strong>
          </p>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>Service Status</div>
          <div className={styles.serviceRow}>
            {data.services.length === 0 ? (
              <span className={styles.notConfigured}>Not configured</span>
            ) : (
              data.services.map((s) => (
                <span key={s.name} className={styles.serviceDot}>
                  <span className={`${styles.dot} ${s.status === "ACTIVE_HEALTHY" ? styles.dotOk : s.status === "UNHEALTHY" ? styles.dotDanger : styles.dotWarn}`} />
                  {s.name}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>Recent Deployments</div>
        {data.deploys.length === 0 ? (
          <span className={styles.notConfigured}>No Vercel deployments found. Check VERCEL_API_TOKEN and VERCEL_PROJECT_ID.</span>
        ) : (
          <div className={styles.deployList}>
            {data.deploys.map((d) => (
              <div key={d.uid} className={styles.deployRow}>
                <span className={`${styles.deployStatus} ${d.state === "READY" ? styles.deployReady : styles.deployError}`}>●</span>
                <span className={styles.deployMsg}>{d.meta.githubCommitMessage || d.meta.githubCommitRef || d.uid.slice(0, 8)}</span>
                <span className={styles.deployTime}>{timeAgo(d.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.externalLinks}>
        <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className={styles.extLink}>Open Supabase Dashboard →</a>
        <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className={styles.extLink}>Open Vercel Dashboard →</a>
      </div>
    </>
  );
}
