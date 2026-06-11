"use client";

import type { QueriesData } from "@/lib/dev-dashboard/types";
import styles from "./dev-dashboard.module.css";

function msColor(ms: number): string {
  if (ms >= 300) return "var(--danger)";
  if (ms >= 100) return "var(--warning)";
  return "var(--ink-strong)";
}

export default function QueriesTab({ data }: { data: QueriesData }) {
  return (
    <>
      {/* Slow queries */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>Slow Queries (pg_stat_statements)</div>
        {data.slowQueries.length === 0 ? (
          <span className={styles.notConfigured}>No slow query data available. Ensure the get_slow_queries RPC is deployed.</span>
        ) : (
          <div className={styles.tableCard}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Query</th>
                  <th>Calls</th>
                  <th>Mean</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.slowQueries.map((q, i) => (
                  <tr key={i}>
                    <td style={{ maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: "var(--fs-xs)" }}>{q.query}</td>
                    <td>{q.calls.toLocaleString()}</td>
                    <td style={{ color: msColor(q.meanTime), fontWeight: 700 }}>{q.meanTime.toFixed(1)}ms</td>
                    <td>{(q.totalTime / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Performance advisor */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>Performance Advisor</div>
        {data.performanceLints.length === 0 ? (
          <span className={styles.notConfigured}>No performance issues detected.</span>
        ) : (
          data.performanceLints.map((lint, i) => (
            <div key={i} className={styles.lintItem}>
              <div className={styles.lintTitle} style={{ color: lint.level === "ERROR" ? "var(--danger)" : "var(--warning)" }}>
                {lint.level === "ERROR" ? "●" : "▲"} {lint.title}
              </div>
              <div className={styles.lintDesc}>{lint.description}</div>
              {lint.remediation && <div className={styles.lintRemediation}>{lint.remediation}</div>}
            </div>
          ))
        )}
      </div>

      {/* Security advisor */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>Security Advisor</div>
        {data.securityLints.length === 0 ? (
          <span style={{ color: "var(--ok)", fontSize: "var(--fs-sm)" }}>No security issues detected.</span>
        ) : (
          data.securityLints.map((lint, i) => (
            <div key={i} className={styles.lintItem}>
              <div className={styles.lintTitle} style={{ color: lint.level === "ERROR" ? "var(--danger)" : "var(--warning)" }}>
                {lint.level === "ERROR" ? "●" : "▲"} {lint.title}
              </div>
              <div className={styles.lintDesc}>{lint.description}</div>
              {lint.remediation && <div className={styles.lintRemediation}>{lint.remediation}</div>}
            </div>
          ))
        )}
      </div>
    </>
  );
}
