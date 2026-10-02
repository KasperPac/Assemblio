/** Every manual the help centre will carry, in display order (spec §2.1). */
export const ALL_MANUAL_SLUGS = [
  "getting-started",
  "products-and-boms",
  "components-and-templates",
  "inventory-and-warehouse",
  "stocktake",
  "orders-and-shopify",
  "purchasing-and-xero",
  "suppliers",
  "production-planning",
  "reports",
  "workspace-admin",
] as const;

export type ManualSlug = (typeof ALL_MANUAL_SLUGS)[number];

export type Manual = {
  slug: ManualSlug;
  title: string;
  /** One sentence, shown on the index card and as the meta description. */
  description: string;
  /** True for modules that need a plan feature (Production planning). */
  planGated?: boolean;
};

/**
 * Published manuals, in ALL_MANUAL_SLUGS order. A manual is added here in the
 * same change that adds its MDX file to src/content/help/.
 */
export const MANUALS: Manual[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    description: "Set up your workspace, invite your team, connect Shopify and add your first product.",
  },
  {
    slug: "purchasing-and-xero",
    title: "Purchasing & Xero",
    description: "Raise purchase orders, receive goods, enter supplier invoices and send bills to Xero.",
  },
];

export function findManual(slug: string): Manual | undefined {
  return MANUALS.find((m) => m.slug === slug);
}
