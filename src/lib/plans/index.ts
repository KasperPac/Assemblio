export type PlanTier = "starter" | "growth" | "pro" | "enterprise";
export type BillingInterval = "monthly" | "annual";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export interface PlanLimits {
  locations: number; // Infinity for unlimited
  users: number;
}

export interface PlanFeatures {
  binManagement: boolean;
  advancedBom: boolean;
  costingModule: boolean;
  reports: boolean;
  capacityPlanning: boolean;
  financialProfitability: boolean;
  exportPdfCsv: boolean;
  apiAccess: boolean;
  multipleShopifyStores: boolean;
}

export interface PlanDefinition {
  name: string;
  limits: PlanLimits;
  features: PlanFeatures;
  stripePriceIds: { monthly: string; annual: string } | null;
}

export interface TenantSubscriptionRow {
  id: string;
  tenant_id: string;
  selected_tier: PlanTier;
  status: SubscriptionStatus;
  billing_interval: BillingInterval | null;
  trial_started_at: Date;
  trial_ends_at: Date;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: Date | null;
  created_at: Date;
  updated_at: Date;
}

function priceIds(monthlyEnv: string, annualEnv: string) {
  return {
    monthly: process.env[monthlyEnv] ?? "",
    annual: process.env[annualEnv] ?? "",
  };
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  starter: {
    name: "Starter",
    limits: { locations: 1, users: 3 },
    features: {
      binManagement: false,
      advancedBom: false,
      costingModule: false,
      reports: false,
      capacityPlanning: false,
      financialProfitability: false,
      exportPdfCsv: false,
      apiAccess: false,
      multipleShopifyStores: false,
    },
    stripePriceIds: priceIds("STRIPE_PRICE_STARTER_MONTHLY", "STRIPE_PRICE_STARTER_ANNUAL"),
  },
  growth: {
    name: "Growth",
    limits: { locations: 5, users: Infinity },
    features: {
      binManagement: true,
      advancedBom: true,
      costingModule: true,
      reports: true,
      capacityPlanning: false,
      financialProfitability: false,
      exportPdfCsv: false,
      apiAccess: false,
      multipleShopifyStores: false,
    },
    stripePriceIds: priceIds("STRIPE_PRICE_GROWTH_MONTHLY", "STRIPE_PRICE_GROWTH_ANNUAL"),
  },
  pro: {
    name: "Pro",
    limits: { locations: Infinity, users: Infinity },
    features: {
      binManagement: true,
      advancedBom: true,
      costingModule: true,
      reports: true,
      capacityPlanning: true,
      financialProfitability: true,
      exportPdfCsv: true,
      apiAccess: true,
      multipleShopifyStores: true,
    },
    stripePriceIds: priceIds("STRIPE_PRICE_PRO_MONTHLY", "STRIPE_PRICE_PRO_ANNUAL"),
  },
  enterprise: {
    name: "Enterprise",
    limits: { locations: Infinity, users: Infinity },
    features: {
      binManagement: true,
      advancedBom: true,
      costingModule: true,
      reports: true,
      capacityPlanning: true,
      financialProfitability: true,
      exportPdfCsv: true,
      apiAccess: true,
      multipleShopifyStores: true,
    },
    stripePriceIds: null,
  },
};

/** Length of the free trial every new workspace starts on. */
export const TRIAL_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function trialEndDate(from: Date): Date {
  return new Date(from.getTime() + TRIAL_DAYS * DAY_MS);
}

const THREE_DAYS_MS = 3 * DAY_MS;

export function effectiveTier(
  sub: Pick<TenantSubscriptionRow, "status" | "selected_tier" | "trial_ends_at">,
  now: Date = new Date()
): PlanTier {
  if (sub.status === "trialing" && now <= sub.trial_ends_at) return "pro";
  return sub.selected_tier;
}

export function paywallRequired(
  sub: Pick<TenantSubscriptionRow, "status" | "trial_ends_at">,
  now: Date = new Date()
): boolean {
  if (sub.status === "canceled") return true;
  if (sub.status === "trialing" && now > sub.trial_ends_at) return true;
  return false;
}

export function pastDueSoftLocked(
  sub: Pick<TenantSubscriptionRow, "status" | "updated_at">,
  now: Date = new Date()
): boolean {
  if (sub.status !== "past_due") return false;
  return now.getTime() - sub.updated_at.getTime() < THREE_DAYS_MS;
}
