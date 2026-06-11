import type { DashboardData, InfraData, BusinessData, AlertItem } from "@/lib/dev-dashboard/types";
import { parsePrometheus } from "@/lib/dev-dashboard/prometheus";
import { TIER_MONTHLY_PRICE } from "@/lib/dev-dashboard/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import DevDashboardClient from "./dev-dashboard-client";

async function fetchMetrics(): Promise<Partial<InfraData>> {
  const ref = process.env.SUPABASE_PROJECT_REF;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!ref || !key) return {};

  try {
    const res = await fetch(`https://${ref}.supabase.co/customer/v1/privileged/metrics`, {
      headers: { Authorization: "Basic " + btoa(`service_role:${key}`) },
      next: { revalidate: 30 },
    });
    if (!res.ok) return {};
    const text = await res.text();
    const m = parsePrometheus(text);
    const memTotal = m.get("node_memory_MemTotal_bytes") ?? 0;
    const memAvail = m.get("node_memory_MemAvailable_bytes") ?? 0;
    const fsSize =
      m.get('node_filesystem_size_bytes{mountpoint="/data"}') ||
      m.get('node_filesystem_size_bytes{mountpoint="/"}') ||
      0;
    const fsAvail =
      m.get('node_filesystem_avail_bytes{mountpoint="/data"}') ||
      m.get('node_filesystem_avail_bytes{mountpoint="/"}') ||
      0;
    return {
      cpu: Math.min(Math.round((m.get("node_load1") ?? 0) * 100), 100),
      memory: memTotal > 0 ? Math.round(((memTotal - memAvail) / memTotal) * 100) : 0,
      disk: fsSize > 0 ? Math.round(((fsSize - fsAvail) / fsSize) * 100) : 0,
      poolActive: m.sum("supavisor_connections_active"),
      poolMax: 100,
    };
  } catch {
    return {};
  }
}

async function fetchHealth(pat: string, ref: string): Promise<unknown[]> {
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/health`, {
      headers: { Authorization: `Bearer ${pat}` },
      next: { revalidate: 60 },
    });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

async function fetchAdvisors(
  pat: string,
  ref: string
): Promise<{ performanceLints: unknown[]; securityLints: unknown[] }> {
  try {
    const [pRes, sRes] = await Promise.all([
      fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/performance`, {
        headers: { Authorization: `Bearer ${pat}` },
        next: { revalidate: 300 },
      }),
      fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/security`, {
        headers: { Authorization: `Bearer ${pat}` },
        next: { revalidate: 300 },
      }),
    ]);
    return {
      performanceLints: pRes.ok ? ((await pRes.json()).lints ?? []) : [],
      securityLints: sRes.ok ? ((await sRes.json()).lints ?? []) : [],
    };
  } catch {
    return { performanceLints: [], securityLints: [] };
  }
}

async function fetchVercelDeploys(): Promise<InfraData["deploys"]> {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return [];
  try {
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=5&target=production`,
      { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 60 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.deployments ?? []).map((d: any) => ({
      uid: d.uid,
      url: d.url,
      state: d.state ?? d.readyState,
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : "",
      meta: {
        githubCommitMessage: d.meta?.githubCommitMessage ?? "",
        githubCommitRef: d.meta?.githubCommitRef ?? "",
      },
    }));
  } catch {
    return [];
  }
}

async function fetchBusiness(supabase: SupabaseClient): Promise<BusinessData> {
  const [{ data: tenants }, { data: subs }] = await Promise.all([
    supabase.from("tenant").select("id, created_at, deleted_at, suspended_at"),
    supabase.from("tenant_subscription").select("tenant_id, selected_tier, status, billing_interval"),
  ]);

  const allTenants = tenants ?? [];
  const allSubs = subs ?? [];
  const activeTenants = allTenants.filter((t) => !t.deleted_at && !t.suspended_at).length;
  const subByTenant = new Map(allSubs.map((s) => [s.tenant_id, s]));

  const statusCounts: Record<string, number> = {
    trialing: 0,
    active: 0,
    past_due: 0,
    canceled: 0,
    deleted: 0,
  };
  for (const t of allTenants) {
    if (t.deleted_at) {
      statusCounts.deleted++;
      continue;
    }
    const status = subByTenant.get(t.id)?.status ?? "trialing";
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  let mrr = 0;
  const tierCounts: Record<string, { count: number; mrr: number }> = {};
  for (const sub of allSubs) {
    if (sub.status !== "active" && sub.status !== "trialing") continue;
    const interval = sub.billing_interval ?? "monthly";
    const price = TIER_MONTHLY_PRICE[sub.selected_tier]?.[interval] ?? 0;
    mrr += price;
    if (!tierCounts[sub.selected_tier]) tierCounts[sub.selected_tier] = { count: 0, mrr: 0 };
    tierCounts[sub.selected_tier].count++;
    tierCounts[sub.selected_tier].mrr += price;
  }

  const arpu = activeTenants > 0 ? Math.round(mrr / activeTenants) : 0;
  const convertedCount = allSubs.filter((s) => s.status === "active").length;
  const trialConversion =
    allSubs.length > 0 ? Math.round((convertedCount / allSubs.length) * 100) : 0;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const recentlyDeleted = allTenants.filter(
    (t) => t.deleted_at && t.deleted_at >= thirtyDaysAgo
  ).length;
  const churnRate =
    allTenants.length > 0
      ? Number(((recentlyDeleted / allTenants.length) * 100).toFixed(1))
      : 0;

  const weeks: { week: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date();
    start.setDate(start.getDate() - (i + 1) * 7);
    const end = new Date();
    end.setDate(end.getDate() - i * 7);
    const label = start.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
    weeks.push({
      week: label,
      count: allTenants.filter((t) => {
        const d = new Date(t.created_at);
        return d >= start && d < end;
      }).length,
    });
  }

  const [{ data: planningRows }] = await Promise.all([
    supabase.from("tenant").select("id").eq("has_planning_module", true),
  ]);

  const featureAdoption = [
    {
      feature: "Production Planning",
      percent:
        activeTenants > 0
          ? Math.round(((planningRows ?? []).length / activeTenants) * 100)
          : 0,
    },
  ];

  return {
    tenantsByStatus: statusCounts,
    signupsByWeek: weeks,
    mrr,
    arpu,
    trialConversion,
    churnRate,
    revenueByTier: Object.entries(tierCounts).map(([tier, v]) => ({ tier, ...v })),
    featureAdoption,
  };
}

type Props = {
  supabase: SupabaseClient;
};

export default async function DevDashboard({ supabase }: Props) {
  const ref = process.env.SUPABASE_PROJECT_REF ?? "";
  const pat = process.env.SUPABASE_MANAGEMENT_PAT ?? "";

  const [metricsData, healthData, advisorsData, deploys, business] = await Promise.all([
    fetchMetrics(),
    pat && ref ? fetchHealth(pat, ref) : Promise.resolve([]),
    pat && ref
      ? fetchAdvisors(pat, ref)
      : Promise.resolve({ performanceLints: [], securityLints: [] }),
    fetchVercelDeploys(),
    fetchBusiness(supabase),
  ]);

  const alerts: AlertItem[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const lint of advisorsData.performanceLints as any[]) {
    alerts.push({
      severity: lint.level === "ERROR" ? "error" : "warning",
      message: lint.title,
      detail: lint.remediation,
    });
  }
  if (business.tenantsByStatus.past_due > 0) {
    alerts.push({
      severity: "warning",
      message: `${business.tenantsByStatus.past_due} tenant(s) past due`,
    });
  }

  const healthServices = Array.isArray(healthData) ? healthData : [];
  const overallHealth = healthServices.every((s: unknown) => (s as { status: string }).status === "ACTIVE_HEALTHY")
    ? ("ACTIVE_HEALTHY" as const)
    : healthServices.some((s: unknown) => (s as { status: string }).status === "UNHEALTHY")
    ? ("UNHEALTHY" as const)
    : ("COMING_UP" as const);

  const data: DashboardData = {
    overview: {
      health: overallHealth,
      totalTenants: Object.values(business.tenantsByStatus).reduce((a, b) => a + b, 0),
      activeTenants: business.tenantsByStatus.active ?? 0,
      mrr: business.mrr,
      apiReqsPerMin: 0,
      errorRate: 0,
      dbConnections: metricsData.poolActive ?? 0,
      dbConnectionsMax: metricsData.poolMax ?? 100,
      alerts,
    },
    infra: {
      cpu: metricsData.cpu ?? 0,
      memory: metricsData.memory ?? 0,
      disk: metricsData.disk ?? 0,
      poolActive: metricsData.poolActive ?? 0,
      poolIdle: 0,
      poolMax: metricsData.poolMax ?? 100,
      authLatencyP50: metricsData.authLatencyP50 ?? 0,
      authLatencyP95: metricsData.authLatencyP95 ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      services: healthServices.map((s: any) => ({
        name: s.name ?? "Unknown",
        status: s.status ?? "UNKNOWN",
      })),
      deploys,
    },
    business,
    queries: {
      slowQueries: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      performanceLints: advisorsData.performanceLints as any[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      securityLints: advisorsData.securityLints as any[],
    },
    fetchedAt: new Date().toISOString(),
  };

  return <DevDashboardClient initialData={data} />;
}
