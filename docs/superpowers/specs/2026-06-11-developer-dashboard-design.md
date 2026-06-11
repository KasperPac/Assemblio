# Developer Dashboard — Design Spec

## Overview

A platform performance dashboard for super admins, replacing the tenant dashboard at `/app` when the user is on their home tenant (not "viewing as" a client). Covers both operational health (Supabase infrastructure, API performance, slow queries) and business intelligence (tenant growth, revenue, feature adoption).

## Routing & Access

### Condition

When a super admin visits `/app` and is on their home tenant (`tenant_id === super_admin_home_tenant_id`), they see the developer dashboard instead of the normal tenant dashboard.

When `tenant_id` is `null`, the existing layout already redirects platform operators to `/app/super-admin`, so no special handling is needed there.

When viewing as a client tenant (`tenant_id !== super_admin_home_tenant_id`), they see the normal tenant dashboard — no change from today.

### Implementation

Modify `src/app/app/page.tsx` to check the condition and render the dev dashboard component tree when matched. No new route needed — the existing `/app` page gains a conditional branch.

`platform_observer` role also gets the dev dashboard (read-only, same as their current super-admin access pattern).

## Tab Structure

Four tabs: **Overview** (default), **Infrastructure**, **Business**, **Queries**.

Tabs are URL-driven via `?tab=overview|infra|business|queries` search param (default: `overview`). This allows direct-linking to specific tabs.

### Overview Tab

The "glance" tab — key metrics from all domains plus an alerts feed.

**KPI strip** (horizontal row of metric chips):
- Health status dot (green/yellow/red from Supabase Health API)
- Total tenants count
- MRR (calculated from `tenant_subscription`)
- API requests/min (from Supabase edge_logs analytics)
- Error rate (5xx percentage from edge_logs)
- Active DB connections (from Supabase Metrics API — `supavisor_connections_active`)

**Alerts & Advisors card** (below KPI strip):
- Performance advisor warnings (unindexed FKs, bloated tables) from Supabase Performance Advisor API
- Slow queries above a threshold (mean_time > 200ms from `pg_stat_statements`)
- Tenant issues (past-due subscriptions, expired trials)
- Latest deployment info (from Vercel Deployments API)

### Infrastructure Tab

Supabase project health and Vercel deployment status.

**System Resources card** (from Supabase Metrics API, Prometheus format):
- CPU usage gauge (from `node_cpu_seconds_total`)
- Memory usage gauge (from `node_memory_*` metrics)
- Disk usage gauge (from `node_filesystem_*` metrics)

**Connection Pool card** (from Supavisor metrics):
- Active / idle / max connections
- Checkout latency p50 / p95

**Auth Service card** (from GoTrue metrics):
- Request latency p50 / p95
- Open DB connections
- Status codes distribution

**Service Status card** (from Supabase Health API):
- Status dot per service: Database, Auth, Storage, Realtime, PostgREST

**Recent Deployments card** (from Vercel Deployments API):
- Last 5 deployments with commit message, time ago, status
- Link to Vercel deployment page

**External links**: "Open Supabase Dashboard" and "Open Vercel Dashboard" at bottom of tab.

### Business Tab

Tenant analytics, revenue, and feature adoption — all from existing Supabase tables.

**Tenant Growth card** (from `tenant` + `tenant_subscription` tables):
- Breakdown chips: total, active, trialing, past_due, churned (deleted)
- Signup trend chart (last 12 weeks, from `tenant.created_at`)

**Revenue card** (from `tenant_subscription` table):
- MRR (sum of active subscription prices)
- ARPU (MRR / active tenant count)
- Trial-to-paid conversion rate
- Churn rate (deleted in last 30 days / total at start of period)
- Revenue by plan tier breakdown

**Feature Adoption card** (derived from existing tables):
- % of tenants with at least 1 BOM → `bom` table
- % of tenants with Shopify integration → `tenant.shopify_domain` or presence of shopify_order_id in orders
- % of tenants using purchasing → `purchase_order` table
- % of tenants with planning module → `tenant.has_planning_module`
- % of tenants that have done a stocktake → `stocktake_session` table
- % of tenants using multi-location → count of locations > 1 per tenant from `warehouse_location`

Each feature shows a horizontal progress bar with percentage.

### Queries Tab

Database performance diagnostics.

**Slow Queries table** (from `pg_stat_statements` via Supabase PostgREST or direct SQL):
- Top 15 queries by mean execution time
- Columns: query (truncated), calls, mean_time, total_time
- Color-code: red if mean > 300ms, yellow if > 100ms, default otherwise

**Performance Advisor card** (from `GET /v1/projects/{ref}/advisors/performance`):
- List of lints with severity (ERROR/WARN), description, and remediation SQL
- Expandable remediation — click to see the `CREATE INDEX` or other fix

**Security Advisor card** (from `GET /v1/projects/{ref}/advisors/security`):
- Same format as performance advisor
- Severity-colored warnings with descriptions

## Data Fetching Architecture

### First Paint (SSR)

The page server-renders with fresh data on each visit. The server component:
1. Checks the super admin condition
2. Fetches all data sources in parallel (Supabase Metrics API, Management API, Supabase DB queries, Vercel API)
3. Passes data as props to the client component

### Client Polling (Auto-refresh)

A client component wraps the dashboard and polls every 30 seconds:
- Calls Next.js API route handlers at `/api/dev-dashboard/[source]`
- API routes proxy requests to external APIs with server-side secrets
- Client merges fresh data into state
- "Last updated: Xs ago" indicator in the top-right corner of the page
- Manual refresh button available

### API Routes

```
GET /api/dev-dashboard/metrics     → proxies to Supabase Metrics API (Prometheus)
GET /api/dev-dashboard/health      → proxies to Supabase Health API
GET /api/dev-dashboard/advisors    → proxies to Supabase Performance + Security Advisors
GET /api/dev-dashboard/analytics   → queries Supabase edge_logs via Analytics endpoint
GET /api/dev-dashboard/queries     → queries pg_stat_statements via Supabase
GET /api/dev-dashboard/vercel      → proxies to Vercel Deployments API
GET /api/dev-dashboard/business    → queries tenant, subscription, feature adoption tables
```

All API routes:
- Require authenticated super_admin or platform_observer role (check via `getServerTenantContext()`)
- Return JSON
- Cache responses for 30s to prevent hammering external APIs on concurrent requests

### Environment Variables

```
SUPABASE_PROJECT_REF=<project-ref>           # e.g. "abcdefghijklmnop"
SUPABASE_SERVICE_ROLE_KEY=<sb_secret_...>    # for Metrics API (Basic Auth)
SUPABASE_MANAGEMENT_PAT=<sbp_...>            # Personal Access Token for Management API
VERCEL_API_TOKEN=<...>                        # Vercel Personal Access Token
VERCEL_PROJECT_ID=<prj_...>                   # Vercel project ID
```

The `SUPABASE_SERVICE_ROLE_KEY` likely already exists in the project. The others are new.

**Setup guidance** (to be documented in README or .env.example):
- **Supabase Management PAT**: Create at https://supabase.com/dashboard/account/tokens — carries full account access, no granular scopes available.
- **Supabase Project Ref**: Found in Supabase Dashboard > Project Settings > General. The subdomain portion of your project URL.
- **Vercel API Token**: Create at https://vercel.com/account/tokens — scoped to the team.
- **Vercel Project ID**: Found in Vercel Dashboard > Project Settings > General.

## UI Implementation

### Component Structure

```
src/app/app/
  page.tsx                          # Modified: conditional branch for dev dashboard
  _dev-dashboard/
    dev-dashboard.tsx               # Server component: fetches initial data, renders shell
    dev-dashboard-client.tsx        # Client component: tabs, polling, state management
    overview-tab.tsx                # Overview tab content
    infra-tab.tsx                   # Infrastructure tab content
    business-tab.tsx                # Business tab content
    queries-tab.tsx                 # Queries tab content
    dev-dashboard.module.css        # Styles
    types.ts                        # Shared types for dashboard data

src/app/api/dev-dashboard/
    metrics/route.ts                # Supabase Metrics API proxy
    health/route.ts                 # Supabase Health API proxy
    advisors/route.ts               # Performance + Security advisors proxy
    analytics/route.ts              # edge_logs analytics query
    queries/route.ts                # pg_stat_statements query
    vercel/route.ts                 # Vercel deployments proxy
    business/route.ts               # Tenant/revenue/adoption queries
```

### Design System Compliance

- Page uses the standard `.page` layout with `PageHeader` (eyebrow: "Platform", title: "Dashboard")
- Tabs are a horizontal bar below PageHeader (similar to super-admin tenant filter tabs)
- Each tab's content uses `formCard` pattern for card sections
- KPI chips use the same pattern as the existing tenant dashboard's `.kpiRow`
- All tokens from the design system: `--bg-card`, `--stroke-card`, `--ink-strong`, `--ink-muted`, `--ok`, `--warning`, `--danger`
- Progress bars for feature adoption use `--brand-1` fill on `--surface-1` background
- Tables compose from `_ui/table.module.css`

### Prometheus Parsing

The Supabase Metrics API returns Prometheus exposition format (plain text). The metrics API route needs a lightweight parser to extract gauge/counter values. This is a simple line-by-line parser — no external dependency needed.

## Scope Boundaries

### In scope
- All four tabs as described above
- SSR + client polling architecture
- 7 API route handlers
- Prometheus metrics parser
- Feature adoption calculation queries
- External dashboard links

### Out of scope (future enhancements)
- Vercel Drains for web analytics / Speed Insights (would add pageview and web vitals data)
- Time-series storage for historical trends (currently shows point-in-time snapshots)
- Alerting / notifications (email or Slack when metrics cross thresholds)
- Per-tenant drill-down from the business tab (they can use the existing super-admin tenant detail page)
- Customizable metric thresholds
- Export / reporting

## Error Handling

- If an external API call fails (Supabase Metrics, Vercel, etc.), the corresponding card shows a "Could not load" state with a retry button — other cards continue to render.
- If env vars are missing, the affected cards show a "Not configured" message with a link to setup instructions.
- API routes return 401 for non-super-admin callers.
- Client polling silently retries on transient failures; shows a "Connection lost" indicator if 3 consecutive polls fail.
