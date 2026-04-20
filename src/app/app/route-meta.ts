export type AppRouteMeta = {
  title: string;
  subtitle: string;
  crumbs: string[];
};

type RouteDefinition = {
  prefix: string;
  title: string;
  subtitle: string;
  crumbs: string[];
};

const ROUTES: RouteDefinition[] = [
  {
    prefix: "/app/settings/theme",
    title: "Theme",
    subtitle: "Change workspace color themes and interface mood.",
    crumbs: ["Settings", "Theme"],
  },
  {
    prefix: "/app/orders/",
    title: "Order Detail",
    subtitle: "Allocation, costing, and labor planning for a single order.",
    crumbs: ["Orders", "Detail"],
  },
  {
    prefix: "/app/products/variants/",
    title: "Variant Detail",
    subtitle: "Review BOM, routing, and labor operations for a variant.",
    crumbs: ["Products", "Variant"],
  },
  {
    prefix: "/app/products/",
    title: "Product Detail",
    subtitle: "Inspect variants, active BOMs, and product-level context.",
    crumbs: ["Products", "Detail"],
  },
  {
    prefix: "/app/components/",
    title: "Component Detail",
    subtitle: "Track inventory, movements, and BOM usage for a component.",
    crumbs: ["Components", "Detail"],
  },
  {
    prefix: "/app/bom/templates",
    title: "BOM Templates",
    subtitle: "Reusable component sets for faster BOM creation.",
    crumbs: ["BOM", "Templates"],
  },
  {
    prefix: "/app/activity-log",
    title: "Activity Log",
    subtitle: "Search and inspect system activity across the workspace.",
    crumbs: ["Activity Log"],
  },
  {
    prefix: "/app/actual-time",
    title: "Actual Time",
    subtitle: "Post labor actuals and compare them against job plans.",
    crumbs: ["Actual Time"],
  },
  {
    prefix: "/app/bom",
    title: "BOM Management",
    subtitle: "Versioned bills of materials and component line maintenance.",
    crumbs: ["BOM"],
  },
  {
    prefix: "/app/capacity",
    title: "Capacity Planner",
    subtitle: "See department loading and weekly scheduling pressure.",
    crumbs: ["Capacity"],
  },
  {
    prefix: "/app/components",
    title: "Components",
    subtitle: "Manage stocked units, reorder points, and core inventory items.",
    crumbs: ["Components"],
  },
  {
    prefix: "/app/costing",
    title: "Costing",
    subtitle: "Monitor planned and actual margin performance by job.",
    crumbs: ["Costing"],
  },
  {
    prefix: "/app/departments",
    title: "Departments",
    subtitle: "Maintain work centers, rate schedules, and planning anchors.",
    crumbs: ["Departments"],
  },
  {
    prefix: "/app/goods-inwards",
    title: "Goods Inwards",
    subtitle: "Receive purchase orders and monitor inbound stock flow.",
    crumbs: ["Goods Inwards"],
  },
  {
    prefix: "/app/help",
    title: "Help & Docs",
    subtitle: "Runbooks, commands, and workflow guidance for operators.",
    crumbs: ["Help"],
  },
  {
    prefix: "/app/inventory",
    title: "Inventory",
    subtitle: "Review balances, post movements, and audit stock position.",
    crumbs: ["Inventory"],
  },
  {
    prefix: "/app/orders",
    title: "Orders",
    subtitle: "Track imported orders and move them through allocation workflows.",
    crumbs: ["Orders"],
  },
  {
    prefix: "/app/products",
    title: "Products",
    subtitle: "Browse Shopify products, variants, and BOM readiness.",
    crumbs: ["Products"],
  },
  {
    prefix: "/app/purchasing",
    title: "Purchasing",
    subtitle: "Create purchase orders and manage supplier receipts.",
    crumbs: ["Purchasing"],
  },
  {
    prefix: "/app/reports",
    title: "Reports",
    subtitle: "Review financial rollups, integrity checks, and capacity signals.",
    crumbs: ["Reports"],
  },
  {
    prefix: "/app/settings",
    title: "Settings",
    subtitle: "Tenant configuration, store connections, and workspace defaults.",
    crumbs: ["Settings"],
  },
  {
    prefix: "/app/staff-costings",
    title: "Staff Costings",
    subtitle: "Legacy route redirecting into department cost setup.",
    crumbs: ["Staff Costings"],
  },
  {
    prefix: "/app/staffing",
    title: "Staffing",
    subtitle: "Manage labor model inputs and weekly staff availability.",
    crumbs: ["Staffing"],
  },
  {
    prefix: "/app/stocktake",
    title: "Stocktake",
    subtitle: "Run cycle counts and reconcile counted inventory.",
    crumbs: ["Stocktake"],
  },
  {
    prefix: "/app/suppliers",
    title: "Suppliers",
    subtitle: "Maintain supplier records used by purchasing workflows.",
    crumbs: ["Suppliers"],
  },
  {
    prefix: "/app/trash",
    title: "Trash",
    subtitle: "Review archived records and recover items before deletion.",
    crumbs: ["Trash"],
  },
  {
    prefix: "/app",
    title: "Overview",
    subtitle: "Inventory, demand, and workflow risk across the workspace.",
    crumbs: ["Overview"],
  },
];

export function getRouteMeta(pathname: string | null | undefined): AppRouteMeta {
  return ROUTES.find((candidate) => pathname?.startsWith(candidate.prefix)) ?? ROUTES[ROUTES.length - 1];
}
