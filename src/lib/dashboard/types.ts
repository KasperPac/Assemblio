export const WIDGET_IDS = [
  "open-orders-queue",
  "on-time-fulfillment",
  "production-throughput",
  "purchasing-signals",
  "order-trend-chart",
  "inventory-value-snapshot",
  "low-stock-alerts",
  "inventory-turnover",
  "days-inventory-remaining",
  "top-products-demand",
  "bom-health",
  "quick-actions",
  "revenue-trend",
  "gross-margin",
  "avg-order-value",
  "gmroi",
  "sell-through-rate",
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];
export type WidgetSize = "stat" | "half" | "full";
export type WidgetCategory = "operations" | "inventory" | "finance" | "planning";

export type WidgetMeta = {
  id: WidgetId;
  label: string;
  description: string;
  category: WidgetCategory;
  size: WidgetSize;
  gated: boolean;
};

export const WIDGET_CATALOG: WidgetMeta[] = [
  { id: "open-orders-queue",        label: "Open orders queue",          description: "Count + mini-list of unfulfilled orders",              category: "operations", size: "half", gated: false },
  { id: "on-time-fulfillment",      label: "On-time fulfillment rate",   description: "% fulfilled on time, rolling 30 days",                 category: "operations", size: "stat", gated: false },
  { id: "production-throughput",    label: "Production throughput",      description: "Orders completed this week vs last week",              category: "operations", size: "stat", gated: false },
  { id: "purchasing-signals",       label: "Purchasing signals",         description: "Active POs + components near reorder point",           category: "operations", size: "half", gated: false },
  { id: "order-trend-chart",        label: "Order trend chart",          description: "6-month placed vs fulfilled line chart",               category: "operations", size: "full", gated: false },
  { id: "inventory-value-snapshot", label: "Inventory value snapshot",   description: "On-hand, in-production, reserved cost values",         category: "inventory",  size: "half", gated: false },
  { id: "low-stock-alerts",         label: "Low stock alerts",           description: "Components below reorder point with days-remaining",   category: "inventory",  size: "half", gated: false },
  { id: "inventory-turnover",       label: "Inventory turnover ratio",   description: "COGS ÷ avg inventory value, rolling 90 days",          category: "inventory",  size: "stat", gated: false },
  { id: "days-inventory-remaining", label: "Days of inventory remaining",description: "Top components: days until stockout at burn rate",     category: "inventory",  size: "half", gated: false },
  { id: "top-products-demand",      label: "Top products demand",        description: "Donut chart — top 5 products by order volume",         category: "inventory",  size: "half", gated: false },
  { id: "bom-health",               label: "BOM health",                 description: "Coverage %, missing BOMs, integrity issues",           category: "planning",   size: "half", gated: false },
  { id: "quick-actions",            label: "Quick actions",              description: "Shortcuts: Build BOMs, stocktake, components",         category: "planning",   size: "full", gated: false },
  { id: "revenue-trend",            label: "Revenue trend",              description: "Monthly revenue for last 6 months",                    category: "finance",    size: "full", gated: true  },
  { id: "gross-margin",             label: "Gross margin %",             description: "Sell price minus COGS across all orders this month",   category: "finance",    size: "stat", gated: true  },
  { id: "avg-order-value",          label: "Average order value",        description: "Mean sell value per order, this month vs last",        category: "finance",    size: "stat", gated: true  },
  { id: "gmroi",                    label: "GMROI",                      description: "Gross margin return per $1 of inventory held",         category: "finance",    size: "stat", gated: true  },
  { id: "sell-through-rate",        label: "Sell-through rate",          description: "% of received inventory sold in the period",           category: "planning",   size: "stat", gated: true  },
];

export const PRESET_WIDGETS: Record<"owner" | "ops", WidgetId[]> = {
  owner: [
    "revenue-trend",
    "gross-margin",
    "avg-order-value",
    "gmroi",
    "inventory-value-snapshot",
    "inventory-turnover",
    "open-orders-queue",
    "top-products-demand",
  ],
  ops: [
    "open-orders-queue",
    "production-throughput",
    "on-time-fulfillment",
    "purchasing-signals",
    "low-stock-alerts",
    "days-inventory-remaining",
    "bom-health",
    "order-trend-chart",
  ],
};
