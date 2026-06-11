
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
