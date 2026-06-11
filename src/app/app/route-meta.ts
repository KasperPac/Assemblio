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
    prefix: "/app/settings/profile",
    title: "Profile",
    subtitle: "Your display name and account security.",
    crumbs: ["Settings", "Profile"],
  },
  {
    prefix: "/app/settings/appearance",
    title: "Appearance",
    subtitle: "Visual theme for your workspace.",
    crumbs: ["Settings", "Appearance"],
  },
  {
    prefix: "/app/settings/company",
    title: "Company",
    subtitle: "Workspace name, logo, timezone, and currency.",
    crumbs: ["Settings", "Company"],
  },
  {
    prefix: "/app/settings/team",
    title: "Team",
    subtitle: "Members, roles, and invitations.",
    crumbs: ["Settings", "Team"],
  },
  {
    prefix: "/app/settings/integrations",
    title: "Integrations",
    subtitle: "Shopify and other connected services.",
    crumbs: ["Settings", "Integrations"],
  },
  {
    prefix: "/app/settings/locations",
    title: "Locations",
    subtitle: "Default warehouse location for the workspace.",
    crumbs: ["Settings", "Locations"],
  },
  {
    prefix: "/app/settings/invoices",
    title: "Invoices",
    subtitle: "Monthly subscription invoices.",
    crumbs: ["Settings", "Invoices"],
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
    subtitle: "Record deliveries and receipt stock into inventory.",
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
    prefix: "/app/templates",
    title: "Templates",
    subtitle: "Reusable component packs and labor routings for BOMs.",
    crumbs: ["Templates"],
  },
  {
    prefix: "/app/trash",
    title: "Trash",
    subtitle: "Review archived records and recover items before deletion.",
    crumbs: ["Trash"],
  },
  {
    prefix: "/app/warehouse/locations",
    title: "Locations",
    subtitle: "Manage warehouse locations, aisles, and bays.",
    crumbs: ["Warehouse", "Locations"],
  },
  {
    prefix: "/app/warehouse",
    title: "Warehouse",
    subtitle: "Manage physical warehouse structure and bin locations.",
    crumbs: ["Warehouse"],
  },
  {
    prefix: "/app/planning/upgrade",
    title: "Production Planning",
    subtitle: "Upgrade your workspace to access Production Planning.",
    crumbs: ["Planning"],
  },
  {
    prefix: "/app/planning/floor",
    title: "Floor Board",
    subtitle: "Live department queues and job status.",
    crumbs: ["Planning", "Floor Board"],
  },
  {
    prefix: "/app/planning/shopfloor",
    title: "Shop Floor",
    subtitle: "Operator queue for your department.",
    crumbs: ["Planning", "Shop Floor"],
  },
  {
    prefix: "/app/planning",
    title: "Production Planning",
    subtitle: "Schedule jobs and manage production across departments.",
    crumbs: ["Planning"],
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

export type DynamicCrumb = { label: string; href: string };

/**
 * Walk up the path and build a crumb trail from the parent route segments.
 * Detail routes (route-meta prefixes ending with "/") are skipped so that
 * /app/products/variants/abc only yields `Products`, not `Product Detail`.
 * The current page (last segment) is not included — that's the topbar title.
 */
export function getDynamicBreadcrumbs(pathname: string | null | undefined): DynamicCrumb[] {
  if (!pathname) return [];
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 2) return []; // "/app" or "/app/x" have no parent crumbs

  const crumbs: DynamicCrumb[] = [];
  const seen = new Set<string>();
  for (let i = segments.length - 1; i > 1; i--) {
    const parentPath = "/" + segments.slice(0, i).join("/");
    const match = ROUTES.find(
      (r) => parentPath.startsWith(r.prefix) && !r.prefix.endsWith("/"),
    );
    if (match && !seen.has(match.prefix)) {
      seen.add(match.prefix);
      crumbs.unshift({ label: match.title, href: match.prefix });
    }
  }
  return crumbs;
}
