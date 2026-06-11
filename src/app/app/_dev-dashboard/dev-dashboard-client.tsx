"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import PageHeader from "../_ui/page-header";
import type { DashboardData } from "@/lib/dev-dashboard/types";
import OverviewTab from "./overview-tab";
import InfraTab from "./infra-tab";
import BusinessTab from "./business-tab";
import QueriesTab from "./queries-tab";
import styles from "./dev-dashboard.module.css";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "infra", label: "Infrastructure" },
  { key: "business", label: "Business" },
  { key: "queries", label: "Queries" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isValidTab(t: string | null): t is TabKey {
  return TABS.some((tab) => tab.key === t);
}

function timeAgo(iso: string): string {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  return `${Math.round(diff / 60)}m ago`;
}

async function fetchJsonIfOk(url: string) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

export default function DevDashboardClient({ initialData }: { initialData: DashboardData }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const activeTab: TabKey = isValidTab(tabParam) ? tabParam : "overview";

  const [data, setData] = useState<DashboardData>(initialData);
  const [lastUpdated, setLastUpdated] = useState(initialData.fetchedAt);
  const [, setTick] = useState(0); // forces re-render for timeAgo

  const setTab = (tab: TabKey) => {
    const params = new URLSearchParams(window.location.search);
    if (tab === "overview") params.delete("tab");
    else params.set("tab", tab);
    const qs = params.toString();
    router.replace(`/app${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const refresh = useCallback(async () => {
    try {
      const responses = await Promise.allSettled([
        fetchJsonIfOk("/api/dev-dashboard/metrics"),
        fetchJsonIfOk("/api/dev-dashboard/health"),
        fetchJsonIfOk("/api/dev-dashboard/advisors"),
        fetchJsonIfOk("/api/dev-dashboard/analytics"),
        fetchJsonIfOk("/api/dev-dashboard/vercel"),
        fetchJsonIfOk("/api/dev-dashboard/business"),
        fetchJsonIfOk("/api/dev-dashboard/queries"),
      ]);

      const get = (i: number) => responses[i].status === "fulfilled" ? responses[i].value : null;
      const metrics = get(0);
      const health = get(1);
      const advisors = get(2);
      const analytics = get(3);
      const vercel = get(4);
      const business = get(5);
      const queries = get(6);

      setData((prev) => {
        const next = { ...prev, fetchedAt: new Date().toISOString() };
        if (metrics) {
          next.infra = {
            ...next.infra,
            cpu: metrics.cpu ?? next.infra.cpu,
            memory: metrics.memory ?? next.infra.memory,
            disk: metrics.disk ?? next.infra.disk,
            poolActive: metrics.poolActive ?? next.infra.poolActive,
            poolMax: metrics.poolMax ?? next.infra.poolMax,
          };
          next.overview = {
            ...next.overview,
            dbConnections: metrics.poolActive ?? next.overview.dbConnections,
            dbConnectionsMax: metrics.poolMax ?? next.overview.dbConnectionsMax,
          };
        }
        if (health && Array.isArray(health)) {
          next.infra = { ...next.infra, services: health.map((s: any) => ({ name: s.name ?? "Unknown", status: s.status ?? "UNKNOWN" })) };
        }
        if (advisors) {
          next.queries = { ...next.queries, performanceLints: advisors.performanceLints ?? next.queries.performanceLints, securityLints: advisors.securityLints ?? next.queries.securityLints };
        }
        if (analytics) {
          next.overview = { ...next.overview, apiReqsPerMin: analytics.reqsPerMin ?? 0, errorRate: analytics.errorRate ?? 0 };
        }
        if (vercel?.deploys) {
          next.infra = { ...next.infra, deploys: vercel.deploys };
        }
        if (business?.tenantsByStatus) {
          next.business = business;
          next.overview = { ...next.overview, mrr: business.mrr, totalTenants: Object.values(business.tenantsByStatus as Record<string, number>).reduce((a: number, b: number) => a + b, 0) };
        }
        if (queries?.slowQueries) {
          next.queries = {
            ...next.queries,
            slowQueries: queries.slowQueries,
            slowQueriesNote: queries.note ?? queries.slowQueriesNote,
          };
        }
        return next;
      });
      setLastUpdated(new Date().toISOString());
    } catch {
      // Silent retry on next interval
    }
  }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Update "Xs ago" display every 5s
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className={styles.page}>
      <PageHeader eyebrow="Platform" title="Dashboard" />

      <div className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? styles.tabActive : styles.tab}
            onClick={() => setTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
        <div className={styles.refreshInfo}>
          <span>Updated {timeAgo(lastUpdated)}</span>
          <button className={styles.refreshBtn} onClick={refresh}>Refresh</button>
        </div>
      </div>

      {activeTab === "overview" && <OverviewTab data={data} />}
      {activeTab === "infra" && <InfraTab data={data.infra} />}
      {activeTab === "business" && <BusinessTab data={data.business} />}
      {activeTab === "queries" && <QueriesTab data={data.queries} />}
    </section>
  );
}
