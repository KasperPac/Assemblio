export type HelpCategory =
  | "getting-started"
  | "inventory"
  | "bom"
  | "orders"
  | "purchasing"
  | "production"
  | "stocktake"
  | "reports";

export type HelpArticle = {
  slug: string;
  category: HelpCategory;
  title: string;
  description: string;
};

export const CATEGORY_META: Record<HelpCategory, { label: string; icon: string; description: string }> = {
  "getting-started": { label: "Getting Started", icon: "🚀", description: "New to Manuva? Start here." },
  "inventory":       { label: "Inventory",        icon: "📦", description: "Adjustments, movements, and locations." },
  "bom":             { label: "BOMs & Components", icon: "🔧", description: "Bills of materials, versions, and allocation." },
  "orders":          { label: "Orders",            icon: "📋", description: "Fulfilment, sync, and order statuses." },
  "purchasing":      { label: "Purchasing",        icon: "🛒", description: "Purchase orders, receiving, and suppliers." },
  "production":      { label: "Production",        icon: "🏭", description: "Planning, shopfloor, and capacity." },
  "stocktake":       { label: "Stocktake",         icon: "🔢", description: "Count sessions, CSV import, and discrepancies." },
  "reports":         { label: "Reports",           icon: "📊", description: "Stock on hand, valuation, and dead stock." },
};

export const HELP_ARTICLES: HelpArticle[] = [
  // Getting Started
  { slug: "getting-started/first-bom",             category: "getting-started", title: "Set up your first BOM",           description: "Create a bill of materials from scratch and link it to a product." },
  { slug: "getting-started/connect-shopify",        category: "getting-started", title: "Connect your Shopify store",      description: "Authorise Manuva to sync orders and products from your Shopify store." },
  { slug: "getting-started/first-stocktake",        category: "getting-started", title: "Run your first stocktake",        description: "Count physical stock and reconcile it against the system." },
  { slug: "getting-started/create-purchase-order",  category: "getting-started", title: "Create a purchase order",         description: "Raise a PO to a supplier and track it through to goods receipt." },
  // Inventory
  { slug: "inventory/adjustments",  category: "inventory", title: "Recording an inventory adjustment", description: "Correct on-hand quantities when physical counts differ from the system." },
  { slug: "inventory/movements",    category: "inventory", title: "Inventory movements log",           description: "Understand how every stock change is tracked and audited." },
  { slug: "inventory/locations",    category: "inventory", title: "Bin locations and warehouse",       description: "Organise stock across warehouses, zones, and bin locations." },
  // BOMs
  { slug: "bom/creating-a-bom", category: "bom", title: "Creating a bill of materials",  description: "Define the components, quantities, and assembly steps for a product." },
  { slug: "bom/components",     category: "bom", title: "Components vs products",         description: "Understand the difference between raw materials, sub-assemblies, and finished goods." },
  { slug: "bom/versions",       category: "bom", title: "BOM versions",                   description: "Manage design changes by creating new BOM versions without losing history." },
  { slug: "bom/allocation",     category: "bom", title: "How allocation works",           description: "Learn how Manuva reserves stock against open orders." },
  // Orders
  { slug: "orders/fulfilment",     category: "orders", title: "Order fulfilment flow",     description: "Track an order from import through production to shipment." },
  { slug: "orders/shopify-sync",   category: "orders", title: "Shopify order sync",        description: "How orders are imported from Shopify and kept in sync." },
  { slug: "orders/order-statuses", category: "orders", title: "Order statuses explained",  description: "What each order and line status means and when it changes." },
  // Purchasing
  { slug: "purchasing/purchase-orders", category: "purchasing", title: "Creating a purchase order",  description: "Raise a PO, set quantities and prices, and send it to a supplier." },
  { slug: "purchasing/goods-inwards",   category: "purchasing", title: "Receiving goods inwards",    description: "Record stock receipt against a purchase order." },
  { slug: "purchasing/suppliers",       category: "purchasing", title: "Managing suppliers",          description: "Add suppliers, set lead times, and link them to components." },
  // Production
  { slug: "production/planning-overview", category: "production", title: "Planning module overview",    description: "Understand how production orders, capacity, and scheduling work together." },
  { slug: "production/shopfloor",         category: "production", title: "Shopfloor view",              description: "How operators use the shopfloor queue to work through production tasks." },
  { slug: "production/capacity",          category: "production", title: "Departments and capacity",    description: "Set up departments, assign staff, and manage production capacity." },
  // Stocktake
  { slug: "stocktake/running-a-stocktake",     category: "stocktake", title: "Running a stocktake",            description: "Start a count session, enter quantities, and commit the results." },
  { slug: "stocktake/csv-import",              category: "stocktake", title: "Importing counts via CSV",        description: "Upload a spreadsheet of counts instead of entering them one by one." },
  { slug: "stocktake/resolving-discrepancies", category: "stocktake", title: "Resolving discrepancies",         description: "What to do when counted quantities don't match the system." },
  // Reports
  { slug: "reports/stock-on-hand", category: "reports", title: "Stock on hand report",   description: "See current stock levels, values, and low-stock alerts across all locations." },
  { slug: "reports/valuation",     category: "reports", title: "Inventory valuation",    description: "Understand how inventory value is calculated and reported." },
  { slug: "reports/dead-stock",    category: "reports", title: "Dead stock report",      description: "Identify components that haven't moved in a configurable time window." },
];

/** Look up one article by slug. Returns undefined if not found. */
export function findArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}

/** All articles in a given category, in registry order. */
export function articlesByCategory(category: HelpCategory): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.category === category);
}

/** Module categories in display order (excludes getting-started). */
export const MODULE_CATEGORIES: HelpCategory[] = [
  "inventory", "bom", "orders", "purchasing", "production", "stocktake", "reports",
];
