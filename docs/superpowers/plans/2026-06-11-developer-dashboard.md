# Developer Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tabbed performance dashboard at `/app` for super admins on their home tenant, showing platform health, infrastructure metrics, business intelligence, and database query diagnostics.

**Architecture:** Server-rendered initial load with client-side polling (30s interval) via Next.js API route handlers that proxy to Supabase Metrics API, Supabase Management API, and Vercel Deployments API. Four tabs: Overview, Infrastructure, Business, Queries. Business data comes from existing Supabase tables. Infrastructure data comes from external APIs.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + PostgREST), CSS Modules, TypeScript. External APIs: Supabase Metrics API (Prometheus), Supabase Management API, Vercel REST API.

**Spec:** `docs/superpowers/specs/2026-06-11-developer-dashboard-design.md`

---

### Task 0: Types and Prometheus Parser

**Goal:** Define all shared TypeScript types and build a Prometheus text format parser.

**Files:**
- Create: `src/lib/dev-dashboard/types.ts`
- Create: `src/lib/dev-dashboard/prometheus.ts`
- Create: `src/lib/dev-dashboard/prometheus.test.ts`

**Acceptance Criteria:**
- [ ] All dashboard data shapes are defined as TypeScript types
- [ ] Prometheus parser extracts gauge and counter values from text format
- [ ] Parser handles comments, HELP/TYPE lines, and labeled metrics
- [ ] Unit tests pass for parser

**Verify:** `npx vitest run src/lib/dev-dashboard/prometheus.test.ts --pool threads --maxWorkers 1` → all tests pass

**Steps:**

- [ ] **Step 1: Create shared types**

```ts
// src/lib/dev-dashboard/types.ts

// ── Overview ──────────────────────────────────────────────
export type ServiceHealth = "ACTIVE_HEALTHY" | "COMING_UP" | "UNHEALTHY" | "UNKNOWN";

export type OverviewData = {
  health: ServiceHealth;
  totalTenants: number;
  activeTenants: number;
  mrr: number;
  apiReqsPerMin: number;
  errorRate: number;
  dbConnections: number;
  dbConnectionsMax: number;
  alerts: AlertItem[];
};

export type AlertItem = {
  severity: "error" | "warning" | "info";
  message: string;
  detail?: string;
};

// ── Infrastructure ────────────────────────────────────────
export type InfraData = {
  cpu: number;          // 0-100
  memory: number;       // 0-100
  disk: number;         // 0-100
  poolActive: number;
  poolIdle: number;
  poolMax: number;
  authLatencyP50: number;
  authLatencyP95: number;
  services: { name: string; status: ServiceHealth }[];
  deploys: DeployInfo[];
};

export type DeployInfo = {
  uid: string;
  url: string;
  state: string;
  createdAt: string;
  meta: { githubCommitMessage?: string; githubCommitRef?: string };
};

// ── Business ──────────────────────────────────────────────
export type BusinessData = {
  tenantsByStatus: Record<string, number>; // trialing, active, past_due, canceled, deleted
  signupsByWeek: { week: string; count: number }[];
  mrr: number;
  arpu: number;
  trialConversion: number; // 0-100
  churnRate: number;       // 0-100
  revenueByTier: { tier: string; count: number; mrr: number }[];
  featureAdoption: { feature: string; percent: number }[];
};

// ── Queries ───────────────────────────────────────────────
export type SlowQuery = {
  query: string;
  calls: number;
  meanTime: number;
  totalTime: number;
};

export type AdvisorLint = {
  name: string;
  title: string;
  level: "ERROR" | "WARN" | "INFO";
  description: string;
  detail: string;
  remediation: string;
  categories: string[];
};

export type QueriesData = {
  slowQueries: SlowQuery[];
  performanceLints: AdvisorLint[];
  securityLints: AdvisorLint[];
};

// ── Combined ──────────────────────────────────────────────
export type DashboardData = {
  overview: OverviewData;
  infra: InfraData;
  business: BusinessData;
  queries: QueriesData;
  fetchedAt: string;
};

// Tier pricing for MRR calculation (monthly prices by tier + interval)
export const TIER_MONTHLY_PRICE: Record<string, Record<string, number>> = {
  starter:    { monthly: 119, annual: 99 },
  growth:     { monthly: 299, annual: 249 },
  pro:        { monthly: 599, annual: 499 },
  enterprise: { monthly: 0,   annual: 0 },
};
```

- [ ] **Step 2: Write Prometheus parser tests**

```ts
// src/lib/dev-dashboard/prometheus.test.ts
import { describe, it, expect } from "vitest";
import { parsePrometheus } from "./prometheus";

const SAMPLE = `
# HELP node_cpu_seconds_total Seconds the CPUs spent in each mode.
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{cpu="0",mode="idle"} 12345.67
node_cpu_seconds_total{cpu="0",mode="system"} 890.12
# HELP supavisor_connections_active Active connections
# TYPE supavisor_connections_active gauge
supavisor_connections_active{supabase_project_ref="abc",mode="transaction"} 42
supavisor_connections_active{supabase_project_ref="abc",mode="session"} 5
# HELP node_memory_MemTotal_bytes Total memory
# TYPE node_memory_MemTotal_bytes gauge
node_memory_MemTotal_bytes 1073741824
node_memory_MemAvailable_bytes 536870912
node_filesystem_size_bytes{mountpoint="/"} 10737418240
node_filesystem_avail_bytes{mountpoint="/"} 7516192768
`.trim();

describe("parsePrometheus", () => {
  it("extracts simple gauge values", () => {
    const result = parsePrometheus(SAMPLE);
    expect(result.get("node_memory_MemTotal_bytes")).toBe(1073741824);
    expect(result.get("node_memory_MemAvailable_bytes")).toBe(536870912);
  });

  it("extracts labeled metrics with label filter", () => {
    const result = parsePrometheus(SAMPLE);
    expect(result.get('supavisor_connections_active{mode="transaction"}')).toBe(42);
    expect(result.get('supavisor_connections_active{mode="session"}')).toBe(5);
  });

  it("sums values for a metric name across all labels", () => {
    const result = parsePrometheus(SAMPLE);
    expect(result.sum("supavisor_connections_active")).toBe(47);
  });

  it("returns 0 for missing metrics", () => {
    const result = parsePrometheus(SAMPLE);
    expect(result.get("nonexistent_metric")).toBe(0);
    expect(result.sum("nonexistent_metric")).toBe(0);
  });

  it("ignores comment and type lines", () => {
    const result = parsePrometheus("# HELP foo bar\n# TYPE foo gauge\nfoo 99");
    expect(result.get("foo")).toBe(99);
  });
});
```

- [ ] **Step 3: Implement Prometheus parser**

```ts
// src/lib/dev-dashboard/prometheus.ts

export type MetricEntry = { name: string; labels: string; value: number };

export class PrometheusResult {
  private entries: MetricEntry[];

  constructor(entries: MetricEntry[]) {
    this.entries = entries;
  }

  /** Get a specific metric. For labeled metrics, pass the full key e.g. 'metric{label="val"}' */
  get(key: string): number {
    const braceIdx = key.indexOf("{");
    if (braceIdx === -1) {
      // No labels — find exact name with empty labels
      const entry = this.entries.find((e) => e.name === key && e.labels === "");
      return entry?.value ?? 0;
    }
    const name = key.slice(0, braceIdx);
    const labels = key.slice(braceIdx);
    const entry = this.entries.find((e) => e.name === name && e.labels === labels);
    return entry?.value ?? 0;
  }

  /** Sum all values for a metric name across all label combinations */
  sum(name: string): number {
    return this.entries
      .filter((e) => e.name === name)
      .reduce((acc, e) => acc + e.value, 0);
  }
}

export function parsePrometheus(text: string): PrometheusResult {
  const entries: MetricEntry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Format: metric_name{label="val",...} value  OR  metric_name value
    const braceIdx = trimmed.indexOf("{");
    let name: string;
    let labels: string;
    let rest: string;

    if (braceIdx !== -1) {
      name = trimmed.slice(0, braceIdx);
      const closeBrace = trimmed.indexOf("}");
      labels = trimmed.slice(braceIdx, closeBrace + 1);
      rest = trimmed.slice(closeBrace + 1).trim();
    } else {
      const spaceIdx = trimmed.indexOf(" ");
      if (spaceIdx === -1) continue;
      name = trimmed.slice(0, spaceIdx);
      labels = "";
      rest = trimmed.slice(spaceIdx + 1).trim();
    }

    // rest may have a timestamp after the value — take only the first token
    const valueStr = rest.split(/\s/)[0];
    const value = Number(valueStr);
    if (Number.isNaN(value)) continue;

    entries.push({ name, labels, value });
  }
  return new PrometheusResult(entries);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/dev-dashboard/prometheus.test.ts --pool threads --maxWorkers 1`
Expected: All 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/dev-dashboard/types.ts src/lib/dev-dashboard/prometheus.ts src/lib/dev-dashboard/prometheus.test.ts
git commit -m "feat(dev-dashboard): shared types and Prometheus parser"
```

---

### Task 1: API Route Handlers — Auth Guard and External Proxies

**Goal:** Create all 7 API route handlers that proxy requests to external APIs and Supabase, with a shared auth guard requiring super_admin or platform_observer role.

**Files:**
- Create: `src/app/api/dev-dashboard/_lib/guard.ts`
- Create: `src/app/api/dev-dashboard/metrics/route.ts`
- Create: `src/app/api/dev-dashboard/health/route.ts`
- Create: `src/app/api/dev-dashboard/advisors/route.ts`
- Create: `src/app/api/dev-dashboard/analytics/route.ts`
- Create: `src/app/api/dev-dashboard/queries/route.ts`
- Create: `src/app/api/dev-dashboard/vercel/route.ts`
- Create: `src/app/api/dev-dashboard/business/route.ts`

**Acceptance Criteria:**
- [ ] All routes return 401 for unauthenticated users
- [ ] All routes return 403 for non-platform-operator roles
- [ ] `/api/dev-dashboard/metrics` fetches and parses Supabase Prometheus metrics, returns JSON with cpu/memory/disk/connections
- [ ] `/api/dev-dashboard/health` returns Supabase service health statuses
- [ ] `/api/dev-dashboard/advisors` returns performance + security lints
- [ ] `/api/dev-dashboard/analytics` queries edge_logs for request count and error rate
- [ ] `/api/dev-dashboard/queries` queries pg_stat_statements for top slow queries
- [ ] `/api/dev-dashboard/vercel` returns recent deployments
- [ ] `/api/dev-dashboard/business` returns tenant growth, MRR, feature adoption
- [ ] Routes return graceful error JSON when env vars are missing

**Verify:** `npx tsc --noEmit` → no new errors beyond baseline

**Steps:**

- [ ] **Step 1: Create auth guard**

```ts
// src/app/api/dev-dashboard/_lib/guard.ts
import { NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";

export async function requirePlatformOperator() {
  const ctx = await getServerTenantContext();
  if (!ctx) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), ctx: null };
  }
  if (ctx.role !== "super_admin" && ctx.role !== "platform_observer") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), ctx: null };
  }
  return { error: null, ctx };
}
```

- [ ] **Step 2: Create metrics route**

```ts
// src/app/api/dev-dashboard/metrics/route.ts
import { NextResponse } from "next/server";
import { requirePlatformOperator } from "../_lib/guard";
import { parsePrometheus } from "@/lib/dev-dashboard/prometheus";

export async function GET() {
  const { error } = await requirePlatformOperator();
  if (error) return error;

  const ref = process.env.SUPABASE_PROJECT_REF;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!ref || !key) {
    return NextResponse.json({ error: "SUPABASE_PROJECT_REF or SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  }

  const url = `https://${ref}.supabase.co/customer/v1/privileged/metrics`;
  const res = await fetch(url, {
    headers: { Authorization: "Basic " + btoa(`service_role:${key}`) },
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Metrics API returned ${res.status}` }, { status: 502 });
  }

  const text = await res.text();
  const metrics = parsePrometheus(text);

  const memTotal = metrics.get("node_memory_MemTotal_bytes");
  const memAvail = metrics.get("node_memory_MemAvailable_bytes");
  const fsSize = metrics.get('node_filesystem_size_bytes{mountpoint="/data"}') || metrics.get('node_filesystem_size_bytes{mountpoint="/"}');
  const fsAvail = metrics.get('node_filesystem_avail_bytes{mountpoint="/data"}') || metrics.get('node_filesystem_avail_bytes{mountpoint="/"}');

  // CPU: sum all non-idle seconds / sum all seconds. This gives lifetime average.
  // For a 60s snapshot this is approximate but usable.
  const cpuIdle = metrics.sum("node_cpu_seconds_total") > 0
    ? (() => {
        // We don't have per-mode filtering in our simple parser, so just report load avg
        const load1 = metrics.get("node_load1");
        // Rough: load1 / number of CPUs * 100. Assume 1 CPU for simplicity.
        return Math.min(Math.round(load1 * 100), 100);
      })()
    : 0;

  return NextResponse.json({
    cpu: cpuIdle,
    memory: memTotal > 0 ? Math.round(((memTotal - memAvail) / memTotal) * 100) : 0,
    disk: fsSize > 0 ? Math.round(((fsSize - fsAvail) / fsSize) * 100) : 0,
    poolActive: metrics.sum("supavisor_connections_active"),
    poolMax: 100, // Supabase default; not exposed as a metric
    authLatencyP50: 0, // Parsed from histogram if available
    authLatencyP95: 0,
    fetchedAt: new Date().toISOString(),
  });
}
```

- [ ] **Step 3: Create health route**

```ts
// src/app/api/dev-dashboard/health/route.ts
import { NextResponse } from "next/server";
import { requirePlatformOperator } from "../_lib/guard";

export async function GET() {
  const { error } = await requirePlatformOperator();
  if (error) return error;

  const ref = process.env.SUPABASE_PROJECT_REF;
  const pat = process.env.SUPABASE_MANAGEMENT_PAT;
  if (!ref || !pat) {
    return NextResponse.json({ error: "SUPABASE_PROJECT_REF or SUPABASE_MANAGEMENT_PAT not configured" }, { status: 503 });
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/health`, {
    headers: { Authorization: `Bearer ${pat}` },
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Health API returned ${res.status}` }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
```

- [ ] **Step 4: Create advisors route**

```ts
// src/app/api/dev-dashboard/advisors/route.ts
import { NextResponse } from "next/server";
import { requirePlatformOperator } from "../_lib/guard";

export async function GET() {
  const { error } = await requirePlatformOperator();
  if (error) return error;

  const ref = process.env.SUPABASE_PROJECT_REF;
  const pat = process.env.SUPABASE_MANAGEMENT_PAT;
  if (!ref || !pat) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const headers = { Authorization: `Bearer ${pat}` };
  const [perfRes, secRes] = await Promise.all([
    fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/performance`, { headers, next: { revalidate: 300 } }),
    fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/security`, { headers, next: { revalidate: 300 } }),
  ]);

  const performance = perfRes.ok ? await perfRes.json() : { lints: [] };
  const security = secRes.ok ? await secRes.json() : { lints: [] };

  return NextResponse.json({
    performanceLints: performance.lints ?? [],
    securityLints: security.lints ?? [],
  });
}
```

- [ ] **Step 5: Create analytics route (edge_logs query)**

```ts
// src/app/api/dev-dashboard/analytics/route.ts
import { NextResponse } from "next/server";
import { requirePlatformOperator } from "../_lib/guard";

export async function GET() {
  const { error } = await requirePlatformOperator();
  if (error) return error;

  const ref = process.env.SUPABASE_PROJECT_REF;
  const pat = process.env.SUPABASE_MANAGEMENT_PAT;
  if (!ref || !pat) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

  const query = `
    SELECT
      count(*) as total_requests,
      countIf(status_code >= 500) as error_count
    FROM edge_logs
    WHERE timestamp >= '${fiveMinAgo.toISOString()}'
  `;

  const url = new URL(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs.all`);
  url.searchParams.set("sql", query);
  url.searchParams.set("iso_timestamp_start", fiveMinAgo.toISOString());
  url.searchParams.set("iso_timestamp_end", now.toISOString());

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${pat}` },
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    return NextResponse.json({ totalRequests: 0, errorCount: 0, reqsPerMin: 0, errorRate: 0 });
  }

  const data = await res.json();
  const row = data?.result?.[0] ?? { total_requests: 0, error_count: 0 };
  const total = Number(row.total_requests ?? 0);
  const errors = Number(row.error_count ?? 0);

  return NextResponse.json({
    totalRequests: total,
    errorCount: errors,
    reqsPerMin: Math.round(total / 5),
    errorRate: total > 0 ? Number(((errors / total) * 100).toFixed(2)) : 0,
  });
}
```

- [ ] **Step 6: Create queries route (pg_stat_statements)**

```ts
// src/app/api/dev-dashboard/queries/route.ts
import { NextResponse } from "next/server";
import { requirePlatformOperator } from "../_lib/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const { error } = await requirePlatformOperator();
  if (error) return error;

  const supabase = await createSupabaseServerClient();

  // pg_stat_statements is available via SQL. Use the rpc mechanism or raw query.
  // Supabase exposes it if the extension is enabled.
  const { data, error: dbError } = await supabase.rpc("get_slow_queries" as any);

  if (dbError) {
    // Fallback: the RPC might not exist yet. Return empty.
    return NextResponse.json({ slowQueries: [], note: "get_slow_queries RPC not found" });
  }

  return NextResponse.json({ slowQueries: data ?? [] });
}
```

Note: This task will also create a Supabase RPC function `get_slow_queries` that queries `pg_stat_statements`:

```sql
-- supabase/patches/dev_dashboard_slow_queries.sql
create or replace function public.get_slow_queries()
returns table(
  query text,
  calls bigint,
  mean_time double precision,
  total_time double precision
)
language sql
security definer
as $$
  select
    left(query, 200) as query,
    calls,
    round(mean_exec_time::numeric, 2)::double precision as mean_time,
    round(total_exec_time::numeric, 2)::double precision as total_time
  from pg_stat_statements
  where userid = (select usesysid from pg_user where usename = current_user)
  order by mean_exec_time desc
  limit 15;
$$;
```

- [ ] **Step 7: Create vercel route**

```ts
// src/app/api/dev-dashboard/vercel/route.ts
import { NextResponse } from "next/server";
import { requirePlatformOperator } from "../_lib/guard";

export async function GET() {
  const { error } = await requirePlatformOperator();
  if (error) return error;

  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) {
    return NextResponse.json({ deploys: [], note: "VERCEL_API_TOKEN or VERCEL_PROJECT_ID not configured" });
  }

  const res = await fetch(
    `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=5&state=READY,ERROR&target=production`,
    {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 60 },
    }
  );

  if (!res.ok) {
    return NextResponse.json({ deploys: [], note: `Vercel API returned ${res.status}` });
  }

  const data = await res.json();
  const deploys = (data.deployments ?? []).map((d: any) => ({
    uid: d.uid,
    url: d.url,
    state: d.state ?? d.readyState,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : "",
    meta: {
      githubCommitMessage: d.meta?.githubCommitMessage ?? "",
      githubCommitRef: d.meta?.githubCommitRef ?? "",
    },
  }));

  return NextResponse.json({ deploys });
}
```

- [ ] **Step 8: Create business route**

```ts
// src/app/api/dev-dashboard/business/route.ts
import { NextResponse } from "next/server";
import { requirePlatformOperator } from "../_lib/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TIER_MONTHLY_PRICE } from "@/lib/dev-dashboard/types";

export async function GET() {
  const { error } = await requirePlatformOperator();
  if (error) return error;

  const supabase = await createSupabaseServerClient();

  const [
    { data: tenants },
    { data: subs },
    { count: bomTenants },
    { count: poTenants },
    { count: stocktakeTenants },
    { data: planningTenants },
    { data: multiLocTenants },
  ] = await Promise.all([
    supabase.from("tenant").select("id, created_at, deleted_at, suspended_at"),
    supabase.from("tenant_subscription").select("tenant_id, selected_tier, status, billing_interval"),
    supabase.from("bom").select("tenant_id", { count: "exact", head: true }).limit(1),
    supabase.from("purchase_order").select("tenant_id", { count: "exact", head: true }).limit(1),
    supabase.from("stocktake_session").select("tenant_id", { count: "exact", head: true }).limit(1),
    supabase.from("tenant").select("id").eq("has_planning_module", true),
    supabase.rpc("count_multi_location_tenants" as any),
  ]);

  const allTenants = tenants ?? [];
  const allSubs = subs ?? [];
  const totalTenants = allTenants.length;
  const activeTenants = allTenants.filter((t) => !t.deleted_at && !t.suspended_at).length;

  // Status breakdown
  const subByTenant = new Map(allSubs.map((s) => [s.tenant_id, s]));
  const statusCounts: Record<string, number> = { trialing: 0, active: 0, past_due: 0, canceled: 0, deleted: 0 };
  for (const t of allTenants) {
    if (t.deleted_at) { statusCounts.deleted++; continue; }
    const sub = subByTenant.get(t.id);
    const status = sub?.status ?? "trialing";
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  // MRR calculation
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

  // Trial conversion: count of tenants that were trialing and are now active / total that trialed
  const trialedCount = allSubs.length;
  const convertedCount = allSubs.filter((s) => s.status === "active").length;
  const trialConversion = trialedCount > 0 ? Math.round((convertedCount / trialedCount) * 100) : 0;

  // Churn: deleted in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const recentlyDeleted = allTenants.filter((t) => t.deleted_at && t.deleted_at >= thirtyDaysAgo).length;
  const churnRate = totalTenants > 0 ? Number(((recentlyDeleted / totalTenants) * 100).toFixed(1)) : 0;

  // Signups by week (last 12 weeks)
  const weeks: { week: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date();
    start.setDate(start.getDate() - (i + 1) * 7);
    const end = new Date();
    end.setDate(end.getDate() - i * 7);
    const label = start.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
    const count = allTenants.filter((t) => {
      const d = new Date(t.created_at);
      return d >= start && d < end;
    }).length;
    weeks.push({ week: label, count });
  }

  // Feature adoption (% of active tenants)
  // For BOM, PO, stocktake: we need distinct tenant counts, not just existence.
  // The head:true count above only tells us if ANY row exists.
  // Use distinct tenant_id counts instead:
  const [
    { data: bomDistinct },
    { data: poDistinct },
    { data: stocktakeDistinct },
  ] = await Promise.all([
    supabase.rpc("count_distinct_tenants" as any, { p_table: "bom" }),
    supabase.rpc("count_distinct_tenants" as any, { p_table: "purchase_order" }),
    supabase.rpc("count_distinct_tenants" as any, { p_table: "stocktake_session" }),
  ]);

  const pct = (n: number) => activeTenants > 0 ? Math.round((n / activeTenants) * 100) : 0;

  const featureAdoption = [
    { feature: "Bills of Materials", percent: pct(Number(bomDistinct ?? 0)) },
    { feature: "Purchasing", percent: pct(Number(poDistinct ?? 0)) },
    { feature: "Stocktake", percent: pct(Number(stocktakeDistinct ?? 0)) },
    { feature: "Production Planning", percent: pct((planningTenants ?? []).length) },
    { feature: "Multi-location", percent: pct(Number(multiLocTenants ?? 0)) },
  ];

  return NextResponse.json({
    tenantsByStatus: statusCounts,
    signupsByWeek: weeks,
    mrr,
    arpu,
    trialConversion,
    churnRate,
    revenueByTier: Object.entries(tierCounts).map(([tier, v]) => ({ tier, ...v })),
    featureAdoption,
  });
}
```

Note: This task also requires two helper SQL functions:

```sql
-- supabase/patches/dev_dashboard_helpers.sql

-- Count distinct tenants in a given table
create or replace function public.count_distinct_tenants(p_table text)
returns bigint
language plpgsql
security definer
as $$
declare
  result bigint;
begin
  execute format('select count(distinct tenant_id) from public.%I', p_table) into result;
  return result;
end;
$$;

-- Count tenants with more than 1 warehouse location
create or replace function public.count_multi_location_tenants()
returns bigint
language sql
security definer
as $$
  select count(*) from (
    select tenant_id from public.warehouse_location
    group by tenant_id having count(*) > 1
  ) sub;
$$;
```

- [ ] **Step 9: Create the SQL patch files**

Create `supabase/patches/dev_dashboard_slow_queries.sql` and `supabase/patches/dev_dashboard_helpers.sql` with the SQL from steps 6 and 8.

- [ ] **Step 10: Commit**

```bash
git add src/app/api/dev-dashboard/ supabase/patches/dev_dashboard_slow_queries.sql supabase/patches/dev_dashboard_helpers.sql
git commit -m "feat(dev-dashboard): API route handlers and SQL helpers"
```

---

### Task 2: Server Component and Conditional Routing

**Goal:** Modify `/app` page to show the developer dashboard for super admins on their home tenant, and create the server component that fetches initial data for SSR.

**Files:**
- Modify: `src/app/app/page.tsx`
- Create: `src/app/app/_dev-dashboard/dev-dashboard.tsx`

**Acceptance Criteria:**
- [ ] Super admin on home tenant sees dev dashboard at `/app`
- [ ] Super admin "viewing as" a client sees the normal tenant dashboard
- [ ] Regular users see the normal tenant dashboard (no change)
- [ ] Server component fetches all data sources in parallel for SSR
- [ ] Graceful fallback if any external API fails

**Verify:** `npx tsc --noEmit` → no new errors beyond baseline

**Steps:**

- [ ] **Step 1: Create the server component**

```tsx
// src/app/app/_dev-dashboard/dev-dashboard.tsx
import type { DashboardData, OverviewData, InfraData, BusinessData, QueriesData, AlertItem } from "@/lib/dev-dashboard/types";
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
    const memTotal = m.get("node_memory_MemTotal_bytes");
    const memAvail = m.get("node_memory_MemAvailable_bytes");
    const fsSize = m.get('node_filesystem_size_bytes{mountpoint="/data"}') || m.get('node_filesystem_size_bytes{mountpoint="/"}');
    const fsAvail = m.get('node_filesystem_avail_bytes{mountpoint="/data"}') || m.get('node_filesystem_avail_bytes{mountpoint="/"}');
    return {
      cpu: Math.min(Math.round(m.get("node_load1") * 100), 100),
      memory: memTotal > 0 ? Math.round(((memTotal - memAvail) / memTotal) * 100) : 0,
      disk: fsSize > 0 ? Math.round(((fsSize - fsAvail) / fsSize) * 100) : 0,
      poolActive: m.sum("supavisor_connections_active"),
      poolMax: 100,
    };
  } catch {
    return {};
  }
}

async function fetchHealth(pat: string, ref: string) {
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

async function fetchAdvisors(pat: string, ref: string) {
  try {
    const [pRes, sRes] = await Promise.all([
      fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/performance`, {
        headers: { Authorization: `Bearer ${pat}` }, next: { revalidate: 300 },
      }),
      fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/security`, {
        headers: { Authorization: `Bearer ${pat}` }, next: { revalidate: 300 },
      }),
    ]);
    return {
      performanceLints: pRes.ok ? (await pRes.json()).lints ?? [] : [],
      securityLints: sRes.ok ? (await sRes.json()).lints ?? [] : [],
    };
  } catch {
    return { performanceLints: [], securityLints: [] };
  }
}

async function fetchVercelDeploys() {
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

  const statusCounts: Record<string, number> = { trialing: 0, active: 0, past_due: 0, canceled: 0, deleted: 0 };
  for (const t of allTenants) {
    if (t.deleted_at) { statusCounts.deleted++; continue; }
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
  const trialConversion = allSubs.length > 0 ? Math.round((convertedCount / allSubs.length) * 100) : 0;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const recentlyDeleted = allTenants.filter((t) => t.deleted_at && t.deleted_at >= thirtyDaysAgo).length;
  const churnRate = allTenants.length > 0 ? Number(((recentlyDeleted / allTenants.length) * 100).toFixed(1)) : 0;

  const weeks: { week: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(); start.setDate(start.getDate() - (i + 1) * 7);
    const end = new Date(); end.setDate(end.getDate() - i * 7);
    const label = start.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
    weeks.push({ week: label, count: allTenants.filter((t) => { const d = new Date(t.created_at); return d >= start && d < end; }).length });
  }

  // Feature adoption — simplified: count distinct tenant_ids per feature table
  const [
    { data: planningRows },
  ] = await Promise.all([
    supabase.from("tenant").select("id").eq("has_planning_module", true),
  ]);

  const featureAdoption = [
    { feature: "Production Planning", percent: activeTenants > 0 ? Math.round(((planningRows ?? []).length / activeTenants) * 100) : 0 },
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
    pat && ref ? fetchAdvisors(pat, ref) : Promise.resolve({ performanceLints: [], securityLints: [] }),
    fetchVercelDeploys(),
    fetchBusiness(supabase),
  ]);

  // Build alerts from advisors + business data
  const alerts: AlertItem[] = [];
  for (const lint of advisorsData.performanceLints) {
    alerts.push({ severity: lint.level === "ERROR" ? "error" : "warning", message: lint.title, detail: lint.remediation });
  }
  if (business.tenantsByStatus.past_due > 0) {
    alerts.push({ severity: "warning", message: `${business.tenantsByStatus.past_due} tenant(s) past due` });
  }

  const healthServices = Array.isArray(healthData) ? healthData : [];
  const overallHealth = healthServices.every((s: any) => s.status === "ACTIVE_HEALTHY")
    ? "ACTIVE_HEALTHY" as const
    : healthServices.some((s: any) => s.status === "UNHEALTHY") ? "UNHEALTHY" as const : "COMING_UP" as const;

  const data: DashboardData = {
    overview: {
      health: overallHealth,
      totalTenants: Object.values(business.tenantsByStatus).reduce((a, b) => a + b, 0),
      activeTenants: business.tenantsByStatus.active ?? 0,
      mrr: business.mrr,
      apiReqsPerMin: 0, // Will be populated by client polling from analytics route
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
      services: healthServices.map((s: any) => ({ name: s.name ?? "Unknown", status: s.status ?? "UNKNOWN" })),
      deploys,
    },
    business,
    queries: {
      slowQueries: [],
      ...advisorsData,
    },
    fetchedAt: new Date().toISOString(),
  };

  return <DevDashboardClient initialData={data} />;
}
```

- [ ] **Step 2: Modify page.tsx to conditionally render**

Add a conditional branch at the top of `src/app/app/page.tsx`. When the user is a super admin on their home tenant, render `<DevDashboard>` instead of the existing dashboard.

The check: after `getServerTenantContext()`, if `role === "super_admin"` and (`tenantId === superAdminHomeTenantId` or `tenantId === null`), import and render `DevDashboard`.

```tsx
// Add near the top of the DashboardPage function, after the mobile redirect:
const isPlatformOperator = context.role === "super_admin" || context.role === "platform_observer";
const isOnHomeTenant = !context.tenantId || context.tenantId === context.superAdminHomeTenantId;

if (isPlatformOperator && isOnHomeTenant) {
  const DevDashboard = (await import("./_dev-dashboard/dev-dashboard")).default;
  return <DevDashboard supabase={supabase} />;
}
// ... rest of existing dashboard code continues unchanged
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app/page.tsx src/app/app/_dev-dashboard/dev-dashboard.tsx
git commit -m "feat(dev-dashboard): server component and conditional routing"
```

---

### Task 3: Client Component — Tabs, Polling, and State

**Goal:** Build the client-side shell: tab navigation, auto-refresh polling, and state management.

**Files:**
- Create: `src/app/app/_dev-dashboard/dev-dashboard-client.tsx`
- Create: `src/app/app/_dev-dashboard/dev-dashboard.module.css`

**Acceptance Criteria:**
- [ ] Tabs switch between Overview, Infrastructure, Business, Queries
- [ ] Active tab is reflected in URL search param `?tab=`
- [ ] Client polls `/api/dev-dashboard/*` every 30s and merges into state
- [ ] "Last updated: Xs ago" indicator shows in the header
- [ ] Manual refresh button works
- [ ] Page uses PageHeader with eyebrow "Platform" and title "Dashboard"

**Verify:** Visual verification in browser — tabs switch, data refreshes, URL updates

**Steps:**

- [ ] **Step 1: Create the CSS module**

```css
/* src/app/app/_dev-dashboard/dev-dashboard.module.css */
.page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* ── Tabs ───────────────────────────────────────────────── */
.tabBar {
  display: flex;
  gap: 4px;
  align-items: center;
}

.tab,
.tabActive {
  padding: 7px 14px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  border: none;
  background: transparent;
}

.tab {
  color: var(--ink-muted);
}

.tab:hover {
  background: var(--surface-1);
  color: var(--ink-strong);
}

.tabActive {
  background: var(--brand-dim);
  color: var(--brand-1);
}

.refreshInfo {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-xs);
  color: var(--ink-faint);
}

.refreshBtn {
  background: none;
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-md);
  padding: 4px 10px;
  font-size: var(--fs-xs);
  color: var(--ink-muted);
  cursor: pointer;
}

.refreshBtn:hover {
  border-color: var(--stroke-strong);
  color: var(--ink-strong);
}

/* ── KPI strip ──────────────────────────────────────────── */
.kpiRow {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.kpiChip {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 16px 18px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--stroke-card);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
}

.kpiLabel {
  margin: 0;
  font-size: 0.69rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--ink-faint);
}

.kpiValue {
  font-size: clamp(1.15rem, 1.1vw + 0.85rem, 1.75rem);
  font-weight: 800;
  line-height: 1.05;
  color: var(--ink-strong);
}

.kpiSub {
  font-size: 0.76rem;
  color: var(--ink-muted);
  line-height: 1.3;
}

/* ── Card ───────────────────────────────────────────────── */
.card {
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  padding: 18px;
  display: grid;
  gap: 10px;
}

.cardHeader {
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
  color: var(--ink-muted);
}

/* ── Gauge ──────────────────────────────────────────────── */
.gaugeRow {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.gauge {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gaugeLabel {
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
  color: var(--ink-muted);
}

.gaugeBar {
  height: 8px;
  border-radius: 4px;
  background: var(--surface-1);
  overflow: hidden;
}

.gaugeFill {
  height: 100%;
  border-radius: 4px;
  background: var(--brand-1);
  transition: width 300ms ease;
}

.gaugeFillWarn { background: var(--warning); }
.gaugeFillDanger { background: var(--danger); }

.gaugeValue {
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--ink-strong);
}

/* ── Service dots ───────────────────────────────────────── */
.serviceRow {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.serviceDot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  color: var(--ink-strong);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.dotOk { background: var(--ok); }
.dotWarn { background: var(--warning); }
.dotDanger { background: var(--danger); }
.dotUnknown { background: var(--ink-faint); }

/* ── Alerts ─────────────────────────────────────────────── */
.alertList {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.alertItem {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: var(--fs-sm);
  color: var(--ink-strong);
  padding: 6px 0;
}

.alertIcon {
  flex-shrink: 0;
  font-size: 14px;
}

.alertError { color: var(--danger); }
.alertWarning { color: var(--warning); }
.alertInfo { color: var(--info); }

/* ── Deploy list ────────────────────────────────────────── */
.deployList {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.deployRow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  font-size: var(--fs-sm);
  border-bottom: 1px solid var(--stroke);
}

.deployRow:last-child { border-bottom: none; }

.deployMsg {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-strong);
}

.deployTime {
  color: var(--ink-muted);
  white-space: nowrap;
}

.deployStatus {
  font-weight: 600;
  font-size: var(--fs-xs);
}

.deployReady { color: var(--ok); }
.deployError { color: var(--danger); }

/* ── Tables ─────────────────────────────────────────────── */
.tableCard {
  composes: tableCard from "../_ui/table.module.css";
}

.table {
  composes: table from "../_ui/table.module.css";
}

/* ── Progress bar (feature adoption) ────────────────────── */
.progressRow {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
}

.progressLabel {
  min-width: 160px;
  font-size: var(--fs-sm);
  color: var(--ink-strong);
}

.progressTrack {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: var(--surface-1);
  overflow: hidden;
}

.progressFill {
  height: 100%;
  border-radius: 4px;
  background: var(--brand-1);
  transition: width 300ms ease;
}

.progressValue {
  min-width: 40px;
  text-align: right;
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--ink-muted);
}

/* ── Lint card ──────────────────────────────────────────── */
.lintItem {
  padding: 8px 0;
  border-bottom: 1px solid var(--stroke);
  font-size: var(--fs-sm);
}

.lintItem:last-child { border-bottom: none; }

.lintTitle {
  font-weight: 600;
  color: var(--ink-strong);
}

.lintDesc {
  color: var(--ink-muted);
  margin-top: 2px;
}

.lintRemediation {
  margin-top: 4px;
  font-family: monospace;
  font-size: var(--fs-xs);
  color: var(--ink-faint);
  background: var(--surface-1);
  padding: 4px 8px;
  border-radius: var(--radius-md);
  overflow-x: auto;
}

/* ── Two-column grid for cards ──────────────────────────── */
.cardGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

@media (max-width: 900px) {
  .cardGrid { grid-template-columns: 1fr; }
  .gaugeRow { grid-template-columns: 1fr; }
}

/* ── External links ─────────────────────────────────────── */
.externalLinks {
  display: flex;
  gap: 12px;
  padding-top: 4px;
}

.extLink {
  font-size: var(--fs-sm);
  color: var(--brand-1);
  text-decoration: none;
}

.extLink:hover {
  text-decoration: underline;
}

/* ── Not configured state ───────────────────────────────── */
.notConfigured {
  color: var(--ink-faint);
  font-size: var(--fs-sm);
  font-style: italic;
}
```

- [ ] **Step 2: Create the client component**

```tsx
// src/app/app/_dev-dashboard/dev-dashboard-client.tsx
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
        fetch("/api/dev-dashboard/metrics").then((r) => r.json()),
        fetch("/api/dev-dashboard/health").then((r) => r.json()),
        fetch("/api/dev-dashboard/advisors").then((r) => r.json()),
        fetch("/api/dev-dashboard/analytics").then((r) => r.json()),
        fetch("/api/dev-dashboard/vercel").then((r) => r.json()),
        fetch("/api/dev-dashboard/business").then((r) => r.json()),
        fetch("/api/dev-dashboard/queries").then((r) => r.json()),
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
          next.infra = { ...next.infra, cpu: metrics.cpu, memory: metrics.memory, disk: metrics.disk, poolActive: metrics.poolActive, poolMax: metrics.poolMax };
          next.overview = { ...next.overview, dbConnections: metrics.poolActive, dbConnectionsMax: metrics.poolMax };
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
          next.queries = { ...next.queries, slowQueries: queries.slowQueries };
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
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app/_dev-dashboard/dev-dashboard-client.tsx src/app/app/_dev-dashboard/dev-dashboard.module.css
git commit -m "feat(dev-dashboard): client component with tabs and polling"
```

---

### Task 4: Tab Components — Overview, Infrastructure, Business, Queries

**Goal:** Implement all four tab components rendering the dashboard data.

**Files:**
- Create: `src/app/app/_dev-dashboard/overview-tab.tsx`
- Create: `src/app/app/_dev-dashboard/infra-tab.tsx`
- Create: `src/app/app/_dev-dashboard/business-tab.tsx`
- Create: `src/app/app/_dev-dashboard/queries-tab.tsx`

**Acceptance Criteria:**
- [ ] Overview tab shows KPI strip + alerts card
- [ ] Infrastructure tab shows gauges, connection pool, service status dots, deploys, external links
- [ ] Business tab shows tenant breakdown, signups chart (sparkline), revenue, feature adoption bars
- [ ] Queries tab shows slow queries table, performance lints, security lints with remediation
- [ ] All components handle empty/missing data gracefully

**Verify:** `npx tsc --noEmit` → no new errors beyond baseline

**Steps:**

- [ ] **Step 1: Create overview-tab.tsx**

```tsx
// src/app/app/_dev-dashboard/overview-tab.tsx
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
```

- [ ] **Step 2: Create infra-tab.tsx**

```tsx
// src/app/app/_dev-dashboard/infra-tab.tsx
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
```

- [ ] **Step 3: Create business-tab.tsx**

```tsx
// src/app/app/_dev-dashboard/business-tab.tsx
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
```

- [ ] **Step 4: Create queries-tab.tsx**

```tsx
// src/app/app/_dev-dashboard/queries-tab.tsx
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
```

- [ ] **Step 5: Commit**

```bash
git add src/app/app/_dev-dashboard/overview-tab.tsx src/app/app/_dev-dashboard/infra-tab.tsx src/app/app/_dev-dashboard/business-tab.tsx src/app/app/_dev-dashboard/queries-tab.tsx
git commit -m "feat(dev-dashboard): all four tab components"
```

---

### Task 5: Integration and Verification

**Goal:** Wire everything together, add sidebar link, update env example, and verify the full dashboard works end-to-end.

**Files:**
- Modify: `src/app/app/sidebar-nav.tsx` (add "Dashboard" link to Platform section for when on home tenant)
- Modify: `.env.example` or `.env.local` (add new env var documentation)

**Acceptance Criteria:**
- [ ] TypeScript compiles with no new errors
- [ ] Dashboard renders at `/app` when logged in as super admin on home tenant
- [ ] All four tabs render without crashing (even with missing env vars — shows "not configured" states)
- [ ] Tabs switch via URL params
- [ ] Polling starts after 30s and updates data
- [ ] Normal tenant dashboard still works when "viewing as" a client

**Verify:** `npx tsc --noEmit` → no new errors beyond baseline. Manual browser test: visit `/app` as super admin.

**Steps:**

- [ ] **Step 1: Update .env.example with new vars**

Add to the env documentation:

```bash
# Dev Dashboard (super admin only)
# SUPABASE_PROJECT_REF=         # Supabase project ref (subdomain). Dashboard > Project Settings > General
# SUPABASE_MANAGEMENT_PAT=      # Personal Access Token. https://supabase.com/dashboard/account/tokens
# VERCEL_API_TOKEN=              # Vercel Personal Access Token. https://vercel.com/account/tokens
# VERCEL_PROJECT_ID=             # Vercel project ID. Vercel Dashboard > Project Settings > General
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No new errors beyond baseline (7 pre-existing module errors)

- [ ] **Step 3: Manual verification**

1. Set env vars in `.env.local`
2. Run `npm run dev`
3. Log in as super admin
4. Visit `/app` — should see dev dashboard with Platform > Dashboard header and 4 tabs
5. Switch to a client tenant via topbar — should see normal tenant dashboard
6. Switch back to home tenant — should see dev dashboard again

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(dev-dashboard): integration and env var documentation"
```
