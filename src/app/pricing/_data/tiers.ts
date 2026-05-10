export type BillingPeriod = "annual" | "monthly";

export type TierLimit = {
  locations: string;
  users: string;
};

export type FeatureCell =
  | true          // included, standard checkmark
  | false         // not included, dash
  | string;       // included with a note (e.g. "Basic", "< 4hr response")

export type FeatureRow = {
  name: string;
} & Record<Tier["id"], FeatureCell>;

export type FeatureModule = {
  name: string;
  features: FeatureRow[];
};

export type Tier = {
  id: "starter" | "growth" | "pro" | "enterprise";
  name: string;
  tagline: string;
  annualMonthly: number | null;   // per-month price when billed annually
  monthlyMonthly: number | null;  // per-month price when billed monthly
  annualYearly: number | null;    // total upfront charge for annual billing
  cta: string;
  featured: boolean;
  limits: TierLimit;
};

export const TIERS: Tier[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Small brands getting started with manufacturing ops",
    annualMonthly: 99,
    monthlyMonthly: 119,
    annualYearly: 1188,
    cta: "Start free trial",
    featured: false,
    limits: { locations: "1 location", users: "3 users" },
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "Scaling brands with multi-location and deeper workflows",
    annualMonthly: 249,
    monthlyMonthly: 299,
    annualYearly: 2988,
    cta: "Start free trial",
    featured: true,
    limits: { locations: "5 locations", users: "Unlimited users" },
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Professional manufacturers needing capacity, costing & API",
    annualMonthly: 499,
    monthlyMonthly: 599,
    annualYearly: 5988,
    cta: "Start free trial",
    featured: false,
    limits: { locations: "Unlimited locations", users: "Unlimited users" },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Large operations, custom requirements, dedicated support",
    annualMonthly: null,
    monthlyMonthly: null,
    annualYearly: null,
    cta: "Contact sales",
    featured: false,
    limits: { locations: "Unlimited", users: "Unlimited" },
  },
];

export const FEATURE_MODULES: FeatureModule[] = [
  {
    name: "Plan Limits",
    features: [
      { name: "Warehouse locations",  starter: "1",          growth: "5",          pro: "Unlimited", enterprise: "Unlimited" },
      { name: "Team members",         starter: "3",          growth: "Unlimited",  pro: "Unlimited", enterprise: "Unlimited" },
      { name: "SKUs / components",    starter: "Unlimited",  growth: "Unlimited",  pro: "Unlimited", enterprise: "Unlimited" },
    ],
  },
  {
    name: "Shopify Integration",
    features: [
      { name: "Product + variant sync",           starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Order sync + allocation",           starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Webhook-driven real-time sync",     starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Multiple Shopify stores",           starter: false, growth: false, pro: true,  enterprise: true  },
    ],
  },
  {
    name: "Inventory Management",
    features: [
      { name: "Component inventory + balances",   starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Inventory movements ledger",       starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Stocktake",                        starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Activity log",                     starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Low stock alerts",                 starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Bin / aisle locations",            starter: false, growth: true,  pro: true,  enterprise: true  },
    ],
  },
  {
    name: "BOM & Manufacturing",
    features: [
      { name: "BOM builder",                      starter: "Basic", growth: true,  pro: true,  enterprise: true  },
      { name: "Production orders",                starter: true,    growth: true,  pro: true,  enterprise: true  },
      { name: "Component allocation engine",      starter: true,    growth: true,  pro: true,  enterprise: true  },
      { name: "Yield % per BOM line",             starter: false,   growth: true,  pro: true,  enterprise: true  },
      { name: "BOM versioning + draft/publish",   starter: false,   growth: true,  pro: true,  enterprise: true  },
      { name: "BOM version comparison",           starter: false,   growth: true,  pro: true,  enterprise: true  },
      { name: "BOM templates",                    starter: false,   growth: true,  pro: true,  enterprise: true  },
    ],
  },
  {
    name: "Purchasing",
    features: [
      { name: "Purchase orders",                  starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Supplier management",              starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Goods inwards / receiving",        starter: true,  growth: true,  pro: true,  enterprise: true  },
    ],
  },
  {
    name: "Costing & Finance",
    features: [
      { name: "Cost per unit (BOM rollup)",           starter: false, growth: true,  pro: true,  enterprise: true  },
      { name: "Margin tracking per product",          starter: false, growth: true,  pro: true,  enterprise: true  },
      { name: "Inventory valuation",                  starter: false, growth: true,  pro: true,  enterprise: true  },
      { name: "Financial profitability dashboard",    starter: false, growth: false, pro: true,  enterprise: true  },
    ],
  },
  {
    name: "Reports",
    features: [
      { name: "Dashboard overview",                             starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Inventory reports (stock on hand, movements)",   starter: false, growth: true,  pro: true,  enterprise: true  },
      { name: "Purchasing reports (PO summary, spend by supplier)", starter: false, growth: true, pro: true, enterprise: true },
      { name: "Date range filtering",                           starter: false, growth: true,  pro: true,  enterprise: true  },
      { name: "PDF + CSV export",                               starter: false, growth: false, pro: true,  enterprise: true  },
    ],
  },
  {
    name: "Capacity & Staffing",
    features: [
      { name: "Departments + staffing levels",        starter: false, growth: false, pro: true,  enterprise: true  },
      { name: "Capacity planning",                    starter: false, growth: false, pro: true,  enterprise: true  },
      { name: "Actual vs planned time tracking",      starter: false, growth: false, pro: true,  enterprise: true  },
    ],
  },
  {
    name: "Platform & Support",
    features: [
      { name: "API access",                           starter: false, growth: false, pro: true,  enterprise: true  },
      { name: "Email support",                        starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Priority support (< 4hr response)",   starter: false, growth: false, pro: true,  enterprise: true  },
      { name: "Dedicated account manager",            starter: false, growth: false, pro: false, enterprise: true  },
      { name: "Custom onboarding + training",         starter: false, growth: false, pro: false, enterprise: true  },
      { name: "SSO / advanced security",              starter: false, growth: false, pro: false, enterprise: true  },
      { name: "SLA + uptime guarantee",               starter: false, growth: false, pro: false, enterprise: true  },
      { name: "Custom integrations",                  starter: false, growth: false, pro: false, enterprise: true  },
    ],
  },
];
