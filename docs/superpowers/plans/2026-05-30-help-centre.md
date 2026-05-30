# Help Centre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing developer runbook at `/app/help` with a proper user-facing help centre — a hub page with a getting-started strip and module category grid, 26 individual article pages, and contextual `<HelpLink>` components on 7 key app pages.

**Architecture:** Plain TSX pages, no new dependencies. Shared `_ui/` components (`ArticleLayout`, `Steps`, `Callout`, `RelatedArticles`) provide consistent structure. A typed `_registry.ts` is the article index — used by both the hub page and `<HelpLink>`. Article content lives in individual `page.tsx` files under categorised sub-routes.

**Tech Stack:** Next.js 15 App Router, TypeScript, CSS Modules, Vitest, Manuva design tokens (`--brand-1`, `--surface-1`, `--stroke`, `--ink-strong`, `--ink-muted`, `--radius-md`, `--radius-lg`).

---

## File map

**Create:**
- `src/app/app/help/_registry.ts`
- `src/app/app/help/_registry.test.ts`
- `src/app/app/help/_ui/steps.tsx`
- `src/app/app/help/_ui/steps.module.css`
- `src/app/app/help/_ui/steps.test.tsx`
- `src/app/app/help/_ui/callout.tsx`
- `src/app/app/help/_ui/callout.module.css`
- `src/app/app/help/_ui/callout.test.tsx`
- `src/app/app/help/_ui/related-articles.tsx`
- `src/app/app/help/_ui/related-articles.module.css`
- `src/app/app/help/_ui/related-articles.test.tsx`
- `src/app/app/help/_ui/article-layout.tsx`
- `src/app/app/help/_ui/article-layout.module.css`
- `src/app/app/help/_ui/article-layout.test.tsx`
- `src/app/app/_ui/help-link.tsx`
- `src/app/app/_ui/help-link.module.css`
- `src/app/app/_ui/help-link.test.tsx`
- 26 article `page.tsx` files (see Tasks 6–13)

**Modify:**
- `src/app/app/help/page.tsx` — replace developer runbook with hub page
- `src/app/app/help/help.module.css` — replace with hub page styles
- 7 app pages to add `<HelpLink>` (see Task 14)

---

### Task 1: Article registry

**Files:**
- Create: `src/app/app/help/_registry.ts`
- Create: `src/app/app/help/_registry.test.ts`

- [ ] **Step 1: Create the registry**

```ts
// src/app/app/help/_registry.ts

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
```

- [ ] **Step 2: Write the registry test**

```ts
// src/app/app/help/_registry.test.ts
import { describe, it, expect } from "vitest";
import { HELP_ARTICLES, findArticle, articlesByCategory, CATEGORY_META, MODULE_CATEGORIES } from "./_registry";

describe("HELP_ARTICLES", () => {
  it("has no duplicate slugs", () => {
    const slugs = HELP_ARTICLES.map((a) => a.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it("every slug matches category/article-name pattern", () => {
    for (const article of HELP_ARTICLES) {
      expect(article.slug).toMatch(/^[a-z-]+\/[a-z-]+$/);
    }
  });

  it("every slug starts with its category", () => {
    for (const article of HELP_ARTICLES) {
      expect(article.slug.startsWith(article.category)).toBe(true);
    }
  });

  it("every article has non-empty title and description", () => {
    for (const article of HELP_ARTICLES) {
      expect(article.title.length).toBeGreaterThan(0);
      expect(article.description.length).toBeGreaterThan(0);
    }
  });

  it("all categories have metadata in CATEGORY_META", () => {
    for (const article of HELP_ARTICLES) {
      expect(CATEGORY_META[article.category]).toBeDefined();
    }
  });
});

describe("findArticle", () => {
  it("returns the article for a known slug", () => {
    const article = findArticle("inventory/adjustments");
    expect(article?.title).toBe("Recording an inventory adjustment");
  });

  it("returns undefined for an unknown slug", () => {
    expect(findArticle("does/not-exist")).toBeUndefined();
  });
});

describe("articlesByCategory", () => {
  it("returns only articles matching the category", () => {
    const articles = articlesByCategory("inventory");
    expect(articles.every((a) => a.category === "inventory")).toBe(true);
    expect(articles.length).toBe(3);
  });
});

describe("MODULE_CATEGORIES", () => {
  it("does not include getting-started", () => {
    expect(MODULE_CATEGORIES).not.toContain("getting-started");
  });

  it("has 7 entries", () => {
    expect(MODULE_CATEGORIES).toHaveLength(7);
  });
});
```

- [ ] **Step 3: Run the test**

```bash
npx vitest run src/app/app/help/_registry.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/help/_registry.ts src/app/app/help/_registry.test.ts
git commit -m "feat(help): article registry with 26 articles across 8 categories"
```

---

### Task 2: Steps and Callout components

**Files:**
- Create: `src/app/app/help/_ui/steps.tsx`
- Create: `src/app/app/help/_ui/steps.module.css`
- Create: `src/app/app/help/_ui/steps.test.tsx`
- Create: `src/app/app/help/_ui/callout.tsx`
- Create: `src/app/app/help/_ui/callout.module.css`
- Create: `src/app/app/help/_ui/callout.test.tsx`

- [ ] **Step 1: Create Steps component**

```tsx
// src/app/app/help/_ui/steps.tsx
import type { ReactNode } from "react";
import styles from "./steps.module.css";

export function Steps({ children }: { children: ReactNode }) {
  return <ol className={styles.steps}>{children}</ol>;
}

export function Step({ children }: { children: ReactNode }) {
  return <li className={styles.step}>{children}</li>;
}
```

- [ ] **Step 2: Create Steps CSS**

```css
/* src/app/app/help/_ui/steps.module.css */
.steps {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  counter-reset: step;
}

.step {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  counter-increment: step;
  font-size: 0.9rem;
  color: var(--ink-strong);
  line-height: 1.6;
}

.step::before {
  content: counter(step);
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--brand-1);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}
```

- [ ] **Step 3: Write Steps test**

```tsx
// src/app/app/help/_ui/steps.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Steps, Step } from "./steps";

describe("Steps", () => {
  it("renders an ordered list", () => {
    const html = renderToStaticMarkup(
      <Steps>
        <Step>First action</Step>
        <Step>Second action</Step>
      </Steps>
    );
    expect(html).toContain("<ol");
    expect(html).toContain("<li");
  });

  it("renders each step's content", () => {
    const html = renderToStaticMarkup(
      <Steps>
        <Step>Open Inventory</Step>
        <Step>Click Log movement</Step>
      </Steps>
    );
    expect(html).toContain("Open Inventory");
    expect(html).toContain("Click Log movement");
  });

  it("renders inline markup inside steps", () => {
    const html = renderToStaticMarkup(
      <Steps>
        <Step>Click <strong>Submit</strong></Step>
      </Steps>
    );
    expect(html).toContain("<strong>Submit</strong>");
  });
});
```

- [ ] **Step 4: Run Steps test**

```bash
npx vitest run src/app/app/help/_ui/steps.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Create Callout component**

```tsx
// src/app/app/help/_ui/callout.tsx
import type { ReactNode } from "react";
import styles from "./callout.module.css";

const ICONS = { tip: "💡", warning: "⚠️", info: "ℹ️" } as const;

type CalloutType = "tip" | "warning" | "info";

type Props = {
  type?: CalloutType;
  children: ReactNode;
};

export function Callout({ type = "tip", children }: Props) {
  return (
    <div className={`${styles.callout} ${styles[type]}`}>
      <span className={styles.icon} aria-hidden="true">{ICONS[type]}</span>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 6: Create Callout CSS**

```css
/* src/app/app/help/_ui/callout.module.css */
.callout {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  line-height: 1.6;
  border-left: 3px solid transparent;
}

.icon {
  font-size: 1rem;
  flex-shrink: 0;
  margin-top: 1px;
}

.content {
  color: var(--ink-strong);
}

.tip {
  background: #f0fdf4;
  border-left-color: #16a34a;
}

.warning {
  background: #fffbeb;
  border-left-color: #d97706;
}

.info {
  background: #eff6ff;
  border-left-color: var(--brand-1);
}
```

- [ ] **Step 7: Write Callout test**

```tsx
// src/app/app/help/_ui/callout.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Callout } from "./callout";

describe("Callout", () => {
  it("renders tip content", () => {
    const html = renderToStaticMarkup(<Callout type="tip">Always reconcile after a stocktake.</Callout>);
    expect(html).toContain("Always reconcile after a stocktake.");
    expect(html).toContain("💡");
  });

  it("renders warning content", () => {
    const html = renderToStaticMarkup(<Callout type="warning">This action is irreversible.</Callout>);
    expect(html).toContain("This action is irreversible.");
    expect(html).toContain("⚠️");
  });

  it("renders info content", () => {
    const html = renderToStaticMarkup(<Callout type="info">Orders sync every few minutes.</Callout>);
    expect(html).toContain("Orders sync every few minutes.");
    expect(html).toContain("ℹ️");
  });

  it("defaults to tip when type is omitted", () => {
    const html = renderToStaticMarkup(<Callout>Default tip</Callout>);
    expect(html).toContain("💡");
    expect(html).toContain("Default tip");
  });
});
```

- [ ] **Step 8: Run Callout test**

```bash
npx vitest run src/app/app/help/_ui/callout.test.tsx
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/app/app/help/_ui/
git commit -m "feat(help): Steps and Callout UI components"
```

---

### Task 3: RelatedArticles and ArticleLayout components

**Files:**
- Create: `src/app/app/help/_ui/related-articles.tsx`
- Create: `src/app/app/help/_ui/related-articles.module.css`
- Create: `src/app/app/help/_ui/related-articles.test.tsx`
- Create: `src/app/app/help/_ui/article-layout.tsx`
- Create: `src/app/app/help/_ui/article-layout.module.css`
- Create: `src/app/app/help/_ui/article-layout.test.tsx`

- [ ] **Step 1: Create RelatedArticles component**

```tsx
// src/app/app/help/_ui/related-articles.tsx
import Link from "next/link";
import { findArticle } from "../_registry";
import styles from "./related-articles.module.css";

type Props = { slugs: string[] };

export function RelatedArticles({ slugs }: Props) {
  const articles = slugs.map((s) => findArticle(s)).filter(Boolean) as NonNullable<ReturnType<typeof findArticle>>[];
  if (!articles.length) return null;

  return (
    <div className={styles.related}>
      <p className={styles.heading}>Related articles</p>
      <ul className={styles.list}>
        {articles.map((article) => (
          <li key={article.slug}>
            <Link href={`/app/help/${article.slug}`} className={styles.link}>
              {article.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Create RelatedArticles CSS**

```css
/* src/app/app/help/_ui/related-articles.module.css */
.related {
  padding-top: 24px;
  border-top: 1px solid var(--stroke);
  margin-top: 32px;
}

.heading {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
  margin: 0 0 10px;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.link {
  font-size: 0.875rem;
  color: var(--brand-1);
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}
```

- [ ] **Step 3: Write RelatedArticles test**

```tsx
// src/app/app/help/_ui/related-articles.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RelatedArticles } from "./related-articles";

describe("RelatedArticles", () => {
  it("renders links for known slugs", () => {
    const html = renderToStaticMarkup(
      <RelatedArticles slugs={["inventory/adjustments", "stocktake/running-a-stocktake"]} />
    );
    expect(html).toContain("Recording an inventory adjustment");
    expect(html).toContain("Running a stocktake");
    expect(html).toContain('href="/app/help/inventory/adjustments"');
  });

  it("silently skips unknown slugs", () => {
    const html = renderToStaticMarkup(
      <RelatedArticles slugs={["inventory/adjustments", "does/not-exist"]} />
    );
    expect(html).toContain("Recording an inventory adjustment");
    expect(html).not.toContain("does/not-exist");
  });

  it("renders nothing when all slugs are unknown", () => {
    const html = renderToStaticMarkup(<RelatedArticles slugs={["does/not-exist"]} />);
    expect(html).toBe("");
  });

  it("renders nothing for empty slugs array", () => {
    const html = renderToStaticMarkup(<RelatedArticles slugs={[]} />);
    expect(html).toBe("");
  });
});
```

- [ ] **Step 4: Run RelatedArticles test**

```bash
npx vitest run src/app/app/help/_ui/related-articles.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Create ArticleLayout component**

```tsx
// src/app/app/help/_ui/article-layout.tsx
import type { ReactNode } from "react";
import PageHeader from "../../_ui/page-header";
import { RelatedArticles } from "./related-articles";
import { CATEGORY_META, type HelpCategory } from "../_registry";
import styles from "./article-layout.module.css";

type Props = {
  title: string;
  description: string;
  category: HelpCategory;
  relatedSlugs?: string[];
  children: ReactNode;
};

export default function ArticleLayout({ title, description, category, relatedSlugs, children }: Props) {
  const cat = CATEGORY_META[category];
  return (
    <div className={styles.page}>
      <PageHeader
        breadcrumbs={[
          { label: "Help", href: "/app/help" },
          { label: cat.label },
          { label: title },
        ]}
        title={title}
        description={description}
      />
      <div className={styles.body}>{children}</div>
      {relatedSlugs?.length ? <RelatedArticles slugs={relatedSlugs} /> : null}
    </div>
  );
}
```

- [ ] **Step 6: Create ArticleLayout CSS**

```css
/* src/app/app/help/_ui/article-layout.module.css */
.page {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-width: 720px;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-top: 8px;
  font-size: 0.9rem;
  color: var(--ink-strong);
  line-height: 1.7;
}
```

- [ ] **Step 7: Write ArticleLayout test**

```tsx
// src/app/app/help/_ui/article-layout.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ArticleLayout from "./article-layout";

describe("ArticleLayout", () => {
  it("renders the title", () => {
    const html = renderToStaticMarkup(
      <ArticleLayout title="Recording an inventory adjustment" description="Fix stock counts." category="inventory">
        <p>Content here</p>
      </ArticleLayout>
    );
    expect(html).toContain("Recording an inventory adjustment");
  });

  it("renders the description", () => {
    const html = renderToStaticMarkup(
      <ArticleLayout title="Title" description="Fix stock counts." category="inventory">
        <p>Body</p>
      </ArticleLayout>
    );
    expect(html).toContain("Fix stock counts.");
  });

  it("renders children", () => {
    const html = renderToStaticMarkup(
      <ArticleLayout title="Title" description="Desc" category="inventory">
        <p>Article body text</p>
      </ArticleLayout>
    );
    expect(html).toContain("Article body text");
  });

  it("renders a Help breadcrumb link", () => {
    const html = renderToStaticMarkup(
      <ArticleLayout title="Title" description="Desc" category="inventory">
        <p>Body</p>
      </ArticleLayout>
    );
    expect(html).toContain('href="/app/help"');
    expect(html).toContain("Help");
  });

  it("renders RelatedArticles when relatedSlugs provided", () => {
    const html = renderToStaticMarkup(
      <ArticleLayout title="Title" description="Desc" category="inventory" relatedSlugs={["inventory/movements"]}>
        <p>Body</p>
      </ArticleLayout>
    );
    expect(html).toContain("Inventory movements log");
  });

  it("omits RelatedArticles when no relatedSlugs", () => {
    const html = renderToStaticMarkup(
      <ArticleLayout title="Title" description="Desc" category="inventory">
        <p>Body</p>
      </ArticleLayout>
    );
    expect(html).not.toContain("Related articles");
  });
});
```

- [ ] **Step 8: Run ArticleLayout test**

```bash
npx vitest run src/app/app/help/_ui/article-layout.test.tsx
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/app/app/help/_ui/
git commit -m "feat(help): RelatedArticles and ArticleLayout components"
```

---

### Task 4: HelpLink component

**Files:**
- Create: `src/app/app/_ui/help-link.tsx`
- Create: `src/app/app/_ui/help-link.module.css`
- Create: `src/app/app/_ui/help-link.test.tsx`

- [ ] **Step 1: Create HelpLink component**

```tsx
// src/app/app/_ui/help-link.tsx
import Link from "next/link";
import styles from "./help-link.module.css";

type Props = {
  slug: string;
  label?: string;
};

export default function HelpLink({ slug, label }: Props) {
  const href = `/app/help/${slug}`;
  return (
    <Link href={href} className={styles.link} title={label ?? "Help"}>
      <span className={styles.icon} aria-hidden="true">ⓘ</span>
      {label ? <span>{label}</span> : null}
    </Link>
  );
}
```

- [ ] **Step 2: Create HelpLink CSS**

```css
/* src/app/app/_ui/help-link.module.css */
.link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
  color: var(--ink-muted);
  text-decoration: none;
  transition: color 0.15s;
}

.link:hover {
  color: var(--brand-1);
}

.icon {
  font-size: 0.9rem;
  line-height: 1;
}
```

- [ ] **Step 3: Write HelpLink test**

```tsx
// src/app/app/_ui/help-link.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import HelpLink from "./help-link";

describe("HelpLink", () => {
  it("builds the correct href from slug", () => {
    const html = renderToStaticMarkup(<HelpLink slug="inventory/adjustments" />);
    expect(html).toContain('href="/app/help/inventory/adjustments"');
  });

  it("renders the info icon", () => {
    const html = renderToStaticMarkup(<HelpLink slug="inventory/adjustments" />);
    expect(html).toContain("ⓘ");
  });

  it("renders a label when provided", () => {
    const html = renderToStaticMarkup(<HelpLink slug="inventory/adjustments" label="How do adjustments work?" />);
    expect(html).toContain("How do adjustments work?");
  });

  it("renders no label text when label is omitted", () => {
    const html = renderToStaticMarkup(<HelpLink slug="inventory/adjustments" />);
    expect(html).not.toContain("How do");
  });
});
```

- [ ] **Step 4: Run HelpLink test**

```bash
npx vitest run src/app/app/_ui/help-link.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/_ui/help-link.tsx src/app/app/_ui/help-link.module.css src/app/app/_ui/help-link.test.tsx
git commit -m "feat(help): HelpLink contextual help component"
```

---

### Task 5: Hub page

**Files:**
- Modify: `src/app/app/help/page.tsx`
- Modify: `src/app/app/help/help.module.css`

- [ ] **Step 1: Replace help.module.css**

```css
/* src/app/app/help/help.module.css */
.page {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* Getting Started strip */
.gettingStarted {
  background: var(--surface-1);
  border: 1px solid var(--stroke);
  border-radius: var(--radius-lg);
  padding: 20px 24px;
}

.gsLabel {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--brand-1);
  margin: 0 0 12px;
}

.gsGrid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.gsCard {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--stroke);
  border-radius: var(--radius-md);
  text-decoration: none;
  transition: border-color 0.15s;
}

.gsCard:hover {
  border-color: var(--brand-1);
}

.gsCardTitle {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ink-strong);
}

.gsCardDesc {
  font-size: 0.8rem;
  color: var(--ink-muted);
  line-height: 1.5;
}

/* Category jump grid */
.categoryGrid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.categoryCard {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--surface-1);
  border: 1px solid var(--stroke);
  border-radius: var(--radius-md);
  text-decoration: none;
  transition: border-color 0.15s;
}

.categoryCard:hover {
  border-color: var(--brand-1);
}

.categoryIcon {
  font-size: 1.2rem;
}

.categoryLabel {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ink-strong);
}

/* Article sections */
.sections {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.section {
  scroll-margin-top: 80px;
}

.sectionHeader {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--stroke);
}

.sectionIcon {
  font-size: 1.1rem;
}

.sectionTitle {
  font-size: 1rem;
  font-weight: 700;
  color: var(--ink-strong);
  margin: 0;
}

.articleList {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.articleLink {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  text-decoration: none;
  transition: background 0.1s;
}

.articleLink:hover {
  background: var(--surface-1);
}

.articleTitle {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--brand-1);
}

.articleDesc {
  font-size: 0.8rem;
  color: var(--ink-muted);
  line-height: 1.5;
}

@media (max-width: 900px) {
  .gsGrid { grid-template-columns: 1fr; }
  .categoryGrid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 600px) {
  .categoryGrid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Replace page.tsx**

```tsx
// src/app/app/help/page.tsx
import Link from "next/link";
import PageHeader from "../_ui/page-header";
import { HELP_ARTICLES, CATEGORY_META, MODULE_CATEGORIES, articlesByCategory } from "./_registry";
import styles from "./help.module.css";

const gettingStarted = HELP_ARTICLES.filter((a) => a.category === "getting-started");

export default function HelpPage() {
  return (
    <div className={styles.page}>
      <PageHeader
        title="Help & Guides"
        description="Guides, procedures, and reference for every module."
      />

      {/* Getting Started strip */}
      <div className={styles.gettingStarted}>
        <p className={styles.gsLabel}>🚀 Get started</p>
        <div className={styles.gsGrid}>
          {gettingStarted.map((article) => (
            <Link key={article.slug} href={`/app/help/${article.slug}`} className={styles.gsCard}>
              <span className={styles.gsCardTitle}>{article.title}</span>
              <span className={styles.gsCardDesc}>{article.description}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Module category jump links */}
      <div className={styles.categoryGrid}>
        {MODULE_CATEGORIES.map((cat) => {
          const meta = CATEGORY_META[cat];
          return (
            <a key={cat} href={`#${cat}`} className={styles.categoryCard}>
              <span className={styles.categoryIcon}>{meta.icon}</span>
              <span className={styles.categoryLabel}>{meta.label}</span>
            </a>
          );
        })}
      </div>

      {/* Article sections */}
      <div className={styles.sections}>
        {MODULE_CATEGORIES.map((cat) => {
          const meta = CATEGORY_META[cat];
          const articles = articlesByCategory(cat);
          return (
            <section key={cat} id={cat} className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionIcon}>{meta.icon}</span>
                <h2 className={styles.sectionTitle}>{meta.label}</h2>
              </div>
              <div className={styles.articleList}>
                {articles.map((article) => (
                  <Link key={article.slug} href={`/app/help/${article.slug}`} className={styles.articleLink}>
                    <span className={styles.articleTitle}>{article.title}</span>
                    <span className={styles.articleDesc}>{article.description}</span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/help/page.tsx src/app/app/help/help.module.css
git commit -m "feat(help): hub page with getting-started strip and module category grid"
```

---

### Task 6: Getting Started articles

**Files:**
- Create: `src/app/app/help/getting-started/first-bom/page.tsx`
- Create: `src/app/app/help/getting-started/connect-shopify/page.tsx`
- Create: `src/app/app/help/getting-started/first-stocktake/page.tsx`
- Create: `src/app/app/help/getting-started/create-purchase-order/page.tsx`

- [ ] **Step 1: Create first-bom article**

```tsx
// src/app/app/help/getting-started/first-bom/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function FirstBomPage() {
  return (
    <ArticleLayout
      title="Set up your first BOM"
      description="Create a bill of materials from scratch and link it to a product."
      category="getting-started"
      relatedSlugs={["bom/creating-a-bom", "bom/components", "bom/allocation"]}
    >
      <p>
        A bill of materials (BOM) defines exactly which components — and how many of each — are
        required to make one unit of a finished product. Once a BOM is active, Manuva uses it to
        calculate stock requirements and allocate inventory against orders.
      </p>

      <Steps>
        <Step>Open <strong>BOMs</strong> in the sidebar.</Step>
        <Step>Click <strong>New BOM</strong> in the top-right corner.</Step>
        <Step>Search for and select the product this BOM is for. Each product can have one active BOM at a time.</Step>
        <Step>
          Add component rows. For each row: search for the component by name or code, then enter
          the quantity required per unit of finished product.
        </Step>
        <Step>Click <strong>Add component</strong> to add more rows as needed.</Step>
        <Step>Click <strong>Save</strong>. The BOM is saved as version 1 and set as active automatically.</Step>
      </Steps>

      <Callout type="tip">
        If a component doesn&apos;t exist yet, go to <strong>Inventory → Components</strong> and create it
        first, then return here to add it to the BOM.
      </Callout>

      <Callout type="info">
        You can have multiple BOM versions for the same product — useful when a design changes but
        you need to keep the history. Only the active version is used for new production orders.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 2: Create connect-shopify article**

```tsx
// src/app/app/help/getting-started/connect-shopify/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function ConnectShopifyPage() {
  return (
    <ArticleLayout
      title="Connect your Shopify store"
      description="Authorise Manuva to sync orders and products from your Shopify store."
      category="getting-started"
      relatedSlugs={["orders/shopify-sync", "orders/order-statuses"]}
    >
      <p>
        Connecting your Shopify store lets Manuva import orders automatically and match them to
        your products and BOMs. Once connected, new orders appear in Manuva within minutes of
        being placed in Shopify.
      </p>

      <Steps>
        <Step>Open <strong>Settings</strong> in the sidebar, then go to <strong>Integrations</strong>.</Step>
        <Step>Click <strong>Connect</strong> next to the Shopify section.</Step>
        <Step>Enter your store URL in the format <code>your-store.myshopify.com</code> and click <strong>Connect</strong>.</Step>
        <Step>You will be redirected to Shopify to review and approve the permissions. Click <strong>Install app</strong>.</Step>
        <Step>You are returned to Manuva. The store now shows as Connected.</Step>
        <Step>Click <strong>Sync now</strong> to import your existing orders and products immediately.</Step>
      </Steps>

      <Callout type="info">
        The initial sync imports orders from the last 60 days. Older orders can be imported on
        request. After the first sync, new orders are imported automatically every few minutes.
      </Callout>

      <Callout type="tip">
        Make sure your Shopify product SKUs match the component or product codes in Manuva.
        Manuva uses SKUs to match order line items to the correct BOM.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 3: Create first-stocktake article**

```tsx
// src/app/app/help/getting-started/first-stocktake/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function FirstStocktakePage() {
  return (
    <ArticleLayout
      title="Run your first stocktake"
      description="Count physical stock and reconcile it against the system."
      category="getting-started"
      relatedSlugs={["stocktake/running-a-stocktake", "stocktake/csv-import", "stocktake/resolving-discrepancies"]}
    >
      <p>
        A stocktake session lets you count physical stock and compare it to what Manuva expects.
        Any differences are shown as discrepancies, which you review before committing the
        adjusted quantities.
      </p>

      <Steps>
        <Step>Open <strong>Stocktake</strong> in the sidebar and click <strong>New session</strong>.</Step>
        <Step>Give the session a name (e.g. &quot;Monthly count — June 2026&quot;) and select the locations to count. Leave blank to count all locations.</Step>
        <Step>Work through the component list, entering the physical quantity you counted for each item.</Step>
        <Step>Optionally, import counts from a CSV file instead of entering them manually — see <em>Importing counts via CSV</em>.</Step>
        <Step>Click <strong>Submit</strong> to see the discrepancy report. Components where your count differs from the system are highlighted.</Step>
        <Step>Review each discrepancy. If you&apos;re confident in your count, click <strong>Commit</strong> to apply the adjustments.</Step>
      </Steps>

      <Callout type="warning">
        Committing a stocktake is permanent. The adjusted quantities replace the system values and
        appear in the movements log as stocktake adjustments. Review carefully before committing.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 4: Create create-purchase-order article**

```tsx
// src/app/app/help/getting-started/create-purchase-order/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function CreatePurchaseOrderPage() {
  return (
    <ArticleLayout
      title="Create a purchase order"
      description="Raise a PO to a supplier and track it through to goods receipt."
      category="getting-started"
      relatedSlugs={["purchasing/purchase-orders", "purchasing/goods-inwards", "purchasing/suppliers"]}
    >
      <p>
        Purchase orders track what you&apos;re ordering from suppliers, at what price, and when you
        expect delivery. When stock arrives, you receive it against the PO so inventory levels
        update automatically.
      </p>

      <Steps>
        <Step>Open <strong>Purchasing</strong> in the sidebar and click <strong>New purchase order</strong>.</Step>
        <Step>Select the supplier. If the supplier doesn&apos;t exist yet, go to <strong>Suppliers</strong> and create them first.</Step>
        <Step>Add line items: search for a component, enter the quantity and unit price for each.</Step>
        <Step>Set the <strong>expected delivery date</strong>.</Step>
        <Step>Click <strong>Save</strong> to save as a draft, or <strong>Mark as sent</strong> if you&apos;ve already placed the order with the supplier.</Step>
        <Step>When goods arrive, open the PO and click <strong>Receive goods</strong> to record the receipt — see <em>Receiving goods inwards</em>.</Step>
      </Steps>

      <Callout type="tip">
        Check the <strong>Dashboard → Purchasing signals</strong> widget to see which components are
        running low and need reordering. This is the fastest way to decide what to include on a PO.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/app/help/getting-started/
git commit -m "feat(help): Getting Started articles (4)"
```

---

### Task 7: Inventory articles

**Files:**
- Create: `src/app/app/help/inventory/adjustments/page.tsx`
- Create: `src/app/app/help/inventory/movements/page.tsx`
- Create: `src/app/app/help/inventory/locations/page.tsx`

- [ ] **Step 1: Create adjustments article**

```tsx
// src/app/app/help/inventory/adjustments/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function AdjustmentsPage() {
  return (
    <ArticleLayout
      title="Recording an inventory adjustment"
      description="Correct on-hand quantities when physical counts differ from the system."
      category="inventory"
      relatedSlugs={["inventory/movements", "stocktake/running-a-stocktake"]}
    >
      <p>
        Use an inventory adjustment when you need to correct a component&apos;s on-hand quantity
        outside of a stocktake — for example, to account for damaged stock, a data entry error,
        or stock received without a purchase order.
      </p>

      <Steps>
        <Step>Open <strong>Inventory</strong> in the sidebar.</Step>
        <Step>Find the component you want to adjust. Use the search bar or scroll the list.</Step>
        <Step>Click the component row to open its detail view, then click <strong>Log movement</strong>.</Step>
        <Step>
          Select a <strong>reason code</strong>:
          <ul style={{ marginTop: 6, paddingLeft: 20, lineHeight: 2 }}>
            <li><strong>Received</strong> — stock that arrived outside a PO</li>
            <li><strong>Consumed</strong> — used in production without a formal order</li>
            <li><strong>Damaged</strong> — stock written off</li>
            <li><strong>Correction</strong> — fixing a data entry error</li>
            <li><strong>Transfer</strong> — moving stock between locations</li>
          </ul>
        </Step>
        <Step>Enter the quantity delta. Use a <strong>positive number</strong> to add stock, a <strong>negative number</strong> to remove it.</Step>
        <Step>Optionally, add a note explaining the reason.</Step>
        <Step>Click <strong>Submit</strong>. The adjustment appears immediately in the movements log.</Step>
      </Steps>

      <Callout type="tip">
        For large-scale corrections after a physical count, use a <strong>Stocktake session</strong>
        instead — it gives you a full discrepancy report before any adjustments are committed.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 2: Create movements article**

```tsx
// src/app/app/help/inventory/movements/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function MovementsPage() {
  return (
    <ArticleLayout
      title="Inventory movements log"
      description="Understand how every stock change is tracked and audited."
      category="inventory"
      relatedSlugs={["inventory/adjustments", "stocktake/running-a-stocktake"]}
    >
      <p>
        Every time stock levels change — through an adjustment, a goods receipt, a production
        completion, or a stocktake commit — Manuva records a movement. The movements log is a
        complete, tamper-proof audit trail.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Viewing movements</h3>
      <p>
        Open <strong>Inventory</strong>, select a component, and scroll to <strong>Recent movements</strong>.
        Each entry shows:
      </p>
      <ul style={{ paddingLeft: 20, lineHeight: 2, margin: 0 }}>
        <li><strong>Date and time</strong> of the change</li>
        <li><strong>Type</strong> — adjustment, receipt, production, stocktake</li>
        <li><strong>Quantity delta</strong> — how much was added or removed</li>
        <li><strong>Reason</strong> — the reason code selected</li>
        <li><strong>Recorded by</strong> — the user who made the change</li>
      </ul>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Filtering and export</h3>
      <p>
        Use the date range filter to narrow the list. Click <strong>Export</strong> to download
        movements as a CSV for use in spreadsheets or accounting software.
      </p>

      <Callout type="info">
        Movements cannot be deleted or edited after they are recorded. To correct an error, record
        a new adjustment with a negative delta and add a note explaining the correction.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 3: Create locations article**

```tsx
// src/app/app/help/inventory/locations/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function LocationsPage() {
  return (
    <ArticleLayout
      title="Bin locations and warehouse"
      description="Organise stock across warehouses, zones, and bin locations."
      category="inventory"
      relatedSlugs={["inventory/adjustments", "stocktake/running-a-stocktake"]}
    >
      <p>
        Manuva supports a three-level location hierarchy: <strong>Warehouse → Zone → Bin</strong>.
        You can track exactly where each component is stored and record movements between locations.
      </p>

      <Steps>
        <Step>Open <strong>Warehouse</strong> in the sidebar.</Step>
        <Step>Click <strong>New location</strong> and create your top-level warehouse (e.g. &quot;Main Warehouse&quot;).</Step>
        <Step>Add zones within the warehouse (e.g. &quot;Shelf A&quot;, &quot;Freezer&quot;, &quot;Dispatch Bay&quot;).</Step>
        <Step>Add bins within zones (e.g. &quot;A-01&quot;, &quot;A-02&quot;). Bins are the smallest unit of location.</Step>
        <Step>Assign a default bin to each component from the component detail page. Stock movements default to this bin.</Step>
      </Steps>

      <Callout type="tip">
        You can print barcode labels for bins directly from the Warehouse page. Scanning a bin
        barcode on the stocktake screen automatically selects the correct location.
      </Callout>

      <Callout type="info">
        Location tracking is optional. If you don&apos;t set up bins, stock is tracked at the
        warehouse level only — which works fine for smaller operations.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/app/help/inventory/
git commit -m "feat(help): Inventory articles (3)"
```

---

### Task 8: BOM articles

**Files:**
- Create: `src/app/app/help/bom/creating-a-bom/page.tsx`
- Create: `src/app/app/help/bom/components/page.tsx`
- Create: `src/app/app/help/bom/versions/page.tsx`
- Create: `src/app/app/help/bom/allocation/page.tsx`

- [ ] **Step 1: Create creating-a-bom article**

```tsx
// src/app/app/help/bom/creating-a-bom/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function CreatingABomPage() {
  return (
    <ArticleLayout
      title="Creating a bill of materials"
      description="Define the components, quantities, and assembly steps for a product."
      category="bom"
      relatedSlugs={["bom/components", "bom/versions", "bom/allocation"]}
    >
      <p>
        A BOM lists every component needed to produce one unit of a finished product, along with
        the quantity of each. Manuva uses this to calculate material requirements, allocate stock
        to orders, and flag shortages before production starts.
      </p>

      <Steps>
        <Step>Open <strong>BOMs</strong> in the sidebar and click <strong>New BOM</strong>.</Step>
        <Step>Search for and select the <strong>product</strong> this BOM is for.</Step>
        <Step>Click <strong>Add component</strong>. Search for the component by name or code and enter the quantity per unit.</Step>
        <Step>Repeat for each component. There is no limit to the number of components.</Step>
        <Step>Click <strong>Save</strong>. The BOM is saved as version 1 and activated automatically.</Step>
      </Steps>

      <Callout type="info">
        Components can themselves be finished sub-assemblies with their own BOMs. Manuva supports
        nested BOMs for multi-stage manufacturing.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 2: Create components article**

```tsx
// src/app/app/help/bom/components/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function ComponentsPage() {
  return (
    <ArticleLayout
      title="Components vs products"
      description="Understand the difference between raw materials, sub-assemblies, and finished goods."
      category="bom"
      relatedSlugs={["bom/creating-a-bom", "inventory/adjustments"]}
    >
      <p>
        Manuva distinguishes between two types of items in your inventory:
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Components</h3>
      <p>
        Components are raw materials or sub-assemblies that go <em>into</em> a product. They are
        tracked by quantity in Inventory. Examples: aluminium sheet, M6 bolts, a printed circuit
        board, a painted chassis.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Products</h3>
      <p>
        Products are finished goods that you sell. They are linked to your Shopify catalogue via
        SKU. A product has a BOM that defines which components are consumed to make it.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Sub-assemblies</h3>
      <p>
        A sub-assembly is a component that is itself made from other components. It has its own
        BOM and can appear as a line item in a parent BOM. Manuva resolves nested BOMs automatically
        when calculating total material requirements.
      </p>

      <Callout type="tip">
        If you&apos;re unsure whether something should be a component or a product, ask: &quot;Do I
        sell this directly to a customer?&quot; If yes, it&apos;s a product. If it goes into something
        else first, it&apos;s a component.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 3: Create versions article**

```tsx
// src/app/app/help/bom/versions/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function VersionsPage() {
  return (
    <ArticleLayout
      title="BOM versions"
      description="Manage design changes by creating new BOM versions without losing history."
      category="bom"
      relatedSlugs={["bom/creating-a-bom", "bom/allocation"]}
    >
      <p>
        Every time you edit a BOM, Manuva creates a new version rather than overwriting the
        existing one. This gives you a complete history of how a product&apos;s recipe has changed
        over time.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Active version</h3>
      <p>
        Only one version is active at a time. The active version is used when allocating stock to
        new orders and when creating production orders. Previous versions are preserved for
        reference and can be reactivated if needed.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Creating a new version</h3>
      <p>
        Open a BOM and click <strong>Edit</strong>. Make your changes and click <strong>Save as new version</strong>.
        The new version is saved and set as active. The previous version is retained.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Comparing versions</h3>
      <p>
        In the BOM versions tab, select two versions to see a side-by-side diff showing which
        components were added, removed, or had their quantities changed.
      </p>

      <Callout type="info">
        Orders that were created against an older BOM version retain their original material
        requirements. Activating a new version only affects orders created after the change.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 4: Create allocation article**

```tsx
// src/app/app/help/bom/allocation/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function AllocationPage() {
  return (
    <ArticleLayout
      title="How allocation works"
      description="Learn how Manuva reserves stock against open orders."
      category="bom"
      relatedSlugs={["orders/fulfilment", "inventory/adjustments", "bom/creating-a-bom"]}
    >
      <p>
        Allocation is how Manuva reserves component stock for confirmed orders. Once stock is
        allocated, it cannot be used by other orders — this prevents over-promising on available
        inventory.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>How it works</h3>
      <p>
        When an order is confirmed, Manuva looks at its line items, finds the active BOM for
        each product, and calculates the total components required. It then allocates that quantity
        from on-hand stock.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Allocated vs available</h3>
      <p>
        On the Inventory page, each component shows three figures:
      </p>
      <ul style={{ paddingLeft: 20, lineHeight: 2, margin: 0 }}>
        <li><strong>On hand</strong> — total physical stock</li>
        <li><strong>Allocated</strong> — reserved for confirmed orders</li>
        <li><strong>Available</strong> — on hand minus allocated (what you can actually use)</li>
      </ul>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Insufficient stock</h3>
      <p>
        If there isn&apos;t enough available stock to fully allocate an order, the order moves to
        <strong> Awaiting Stock</strong> status. The allocation is partial — as much as possible is
        reserved, and the shortfall is flagged on the order.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Releasing allocation</h3>
      <p>
        Allocated stock is released back to available when an order is cancelled or marked as
        shipped. It is also released if the order&apos;s BOM changes and less stock is required.
      </p>

      <Callout type="tip">
        The Dashboard <strong>Low stock alerts</strong> widget flags components where available
        stock is below the reorder point — accounting for allocation, not just on-hand totals.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 5: Verify TypeScript and commit**

```bash
npx tsc --noEmit
git add src/app/app/help/bom/
git commit -m "feat(help): BOM & Components articles (4)"
```

---

### Task 9: Orders articles

**Files:**
- Create: `src/app/app/help/orders/fulfilment/page.tsx`
- Create: `src/app/app/help/orders/shopify-sync/page.tsx`
- Create: `src/app/app/help/orders/order-statuses/page.tsx`

- [ ] **Step 1: Create fulfilment article**

```tsx
// src/app/app/help/orders/fulfilment/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function FulfilmentPage() {
  return (
    <ArticleLayout
      title="Order fulfilment flow"
      description="Track an order from import through production to shipment."
      category="orders"
      relatedSlugs={["orders/order-statuses", "bom/allocation", "orders/shopify-sync"]}
    >
      <p>
        Orders in Manuva follow a lifecycle from import to shipment. Understanding this flow helps
        you know what action is needed at each stage.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>1. Import</h3>
      <p>
        Orders arrive from Shopify automatically (or are created manually). Each line item is
        matched to a product by SKU. Unmatched lines are flagged and must be resolved before
        the order can proceed.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>2. Allocation</h3>
      <p>
        Once confirmed, Manuva allocates the required components from stock. If stock is
        insufficient, the order enters <strong>Awaiting Stock</strong> status until more arrives.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>3. Production</h3>
      <p>
        Create a production order from the order detail page to schedule manufacturing. The
        Planning module assigns it to departments and tracks progress through the shopfloor.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>4. Shipment</h3>
      <p>
        When production is complete, mark the order as <strong>Shipped</strong> from the order
        detail page. Allocated stock is released and the order is closed.
      </p>

      <Callout type="info">
        Shipment status is not synced back to Shopify automatically. Use your Shopify admin or
        fulfilment service to update the customer-facing status.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 2: Create shopify-sync article**

```tsx
// src/app/app/help/orders/shopify-sync/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function ShopifySyncPage() {
  return (
    <ArticleLayout
      title="Shopify order sync"
      description="How orders are imported from Shopify and kept in sync."
      category="orders"
      relatedSlugs={["getting-started/connect-shopify", "orders/order-statuses"]}
    >
      <p>
        Manuva polls your Shopify store regularly and imports new or updated orders automatically.
        Here&apos;s what you need to know about how the sync works.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>What syncs</h3>
      <ul style={{ paddingLeft: 20, lineHeight: 2, margin: 0 }}>
        <li>New orders are imported within a few minutes of being placed</li>
        <li>Cancelled orders in Shopify are updated to Cancelled in Manuva</li>
        <li>Line item SKUs are matched to products; unmatched lines are flagged</li>
      </ul>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>What does not sync back</h3>
      <p>
        Manuva does not write back to Shopify. Order statuses, fulfilment status, and inventory
        levels in Shopify are managed separately. Manuva is your production and inventory system;
        Shopify is your sales channel.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Manual sync</h3>
      <p>
        If you need orders to appear immediately, go to <strong>Settings → Integrations</strong>
        and click <strong>Sync now</strong>. This triggers an immediate full sync.
      </p>

      <Callout type="tip">
        If an order line shows &quot;Unmatched SKU&quot;, go to the product in Manuva and make sure its
        SKU matches exactly what is in Shopify — including capitalisation.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 3: Create order-statuses article**

```tsx
// src/app/app/help/orders/order-statuses/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function OrderStatusesPage() {
  return (
    <ArticleLayout
      title="Order statuses explained"
      description="What each order and line status means and when it changes."
      category="orders"
      relatedSlugs={["orders/fulfilment", "bom/allocation"]}
    >
      <p>
        Every order has an overall status, and each line item has its own status. These update
        automatically as the order moves through the fulfilment flow.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Order statuses</h3>
      <ul style={{ paddingLeft: 20, lineHeight: 2.2, margin: 0 }}>
        <li><strong>Pending</strong> — imported but not yet confirmed or processed</li>
        <li><strong>Awaiting Stock</strong> — confirmed but insufficient components available</li>
        <li><strong>In Production</strong> — production order created and in progress</li>
        <li><strong>Ready to Ship</strong> — production complete, awaiting dispatch</li>
        <li><strong>Shipped</strong> — dispatched, allocation released</li>
        <li><strong>Cancelled</strong> — cancelled, all allocation released</li>
      </ul>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Line item statuses</h3>
      <ul style={{ paddingLeft: 20, lineHeight: 2.2, margin: 0 }}>
        <li><strong>Unmatched</strong> — SKU not found in Manuva; requires manual resolution</li>
        <li><strong>Allocated</strong> — components fully reserved</li>
        <li><strong>Short</strong> — allocated partially; awaiting more stock</li>
        <li><strong>In Production</strong> — production in progress for this line</li>
        <li><strong>Complete</strong> — production finished</li>
      </ul>

      <Callout type="info">
        The overall order status is derived from its line item statuses. An order only reaches
        <strong> Ready to Ship</strong> when all lines are Complete.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 4: Verify TypeScript and commit**

```bash
npx tsc --noEmit
git add src/app/app/help/orders/
git commit -m "feat(help): Orders articles (3)"
```

---

### Task 10: Purchasing articles

**Files:**
- Create: `src/app/app/help/purchasing/purchase-orders/page.tsx`
- Create: `src/app/app/help/purchasing/goods-inwards/page.tsx`
- Create: `src/app/app/help/purchasing/suppliers/page.tsx`

- [ ] **Step 1: Create purchase-orders article**

```tsx
// src/app/app/help/purchasing/purchase-orders/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function PurchaseOrdersPage() {
  return (
    <ArticleLayout
      title="Creating a purchase order"
      description="Raise a PO, set quantities and prices, and send it to a supplier."
      category="purchasing"
      relatedSlugs={["purchasing/goods-inwards", "purchasing/suppliers"]}
    >
      <Steps>
        <Step>Open <strong>Purchasing</strong> in the sidebar and click <strong>New purchase order</strong>.</Step>
        <Step>Select the <strong>supplier</strong>. Only suppliers you have already created appear in this list.</Step>
        <Step>Click <strong>Add line item</strong>. Search for a component, enter the <strong>quantity</strong> and <strong>unit price</strong>.</Step>
        <Step>Add more line items as needed.</Step>
        <Step>Set the <strong>expected delivery date</strong>. This is used by the purchasing signals dashboard widget.</Step>
        <Step>Click <strong>Save as draft</strong> to save without committing, or <strong>Mark as sent</strong> if the order has already been placed with the supplier.</Step>
      </Steps>

      <Callout type="tip">
        You can generate a PO directly from the <strong>Dashboard → Purchasing signals</strong> widget,
        which pre-fills components that are below their reorder point.
      </Callout>

      <Callout type="info">
        Manuva does not send the PO to the supplier automatically. You need to export it as a PDF
        or communicate with the supplier directly.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 2: Create goods-inwards article**

```tsx
// src/app/app/help/purchasing/goods-inwards/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function GoodsInwardsPage() {
  return (
    <ArticleLayout
      title="Receiving goods inwards"
      description="Record stock receipt against a purchase order."
      category="purchasing"
      relatedSlugs={["purchasing/purchase-orders", "inventory/movements"]}
    >
      <p>
        When stock arrives from a supplier, record it in Goods Inwards to update your inventory
        levels and mark the PO as received (fully or partially).
      </p>

      <Steps>
        <Step>Open <strong>Goods Inwards</strong> in the sidebar. You will see all open purchase orders.</Step>
        <Step>Find the relevant PO and click <strong>Receive goods</strong>.</Step>
        <Step>For each line item, enter the <strong>quantity received</strong>. This can be less than ordered for partial deliveries.</Step>
        <Step>Click <strong>Confirm receipt</strong>. Inventory levels update immediately.</Step>
      </Steps>

      <Callout type="info">
        If you receive less than the ordered quantity, the PO remains open and shows as partially
        received. Receive the remainder when the rest of the order arrives.
      </Callout>

      <Callout type="warning">
        Receipt is recorded immediately and cannot be undone. If you entered the wrong quantity,
        record a manual inventory adjustment to correct the difference.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 3: Create suppliers article**

```tsx
// src/app/app/help/purchasing/suppliers/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function SuppliersPage() {
  return (
    <ArticleLayout
      title="Managing suppliers"
      description="Add suppliers, set lead times, and link them to components."
      category="purchasing"
      relatedSlugs={["purchasing/purchase-orders"]}
    >
      <Steps>
        <Step>Open <strong>Suppliers</strong> in the sidebar and click <strong>New supplier</strong>.</Step>
        <Step>Enter the supplier name, contact email, and phone number.</Step>
        <Step>Set the <strong>default lead time</strong> in days. This is the number of days between placing an order and expected delivery.</Step>
        <Step>Click <strong>Save</strong>.</Step>
        <Step>
          To link components to this supplier, open a component from <strong>Inventory</strong>,
          go to the <strong>Suppliers</strong> tab, and add the supplier with the agreed unit price
          and lead time.
        </Step>
      </Steps>

      <Callout type="tip">
        Setting accurate lead times is important — the <strong>Purchasing signals</strong> widget
        uses them to warn you when to reorder based on current stock and demand.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 4: Verify TypeScript and commit**

```bash
npx tsc --noEmit
git add src/app/app/help/purchasing/
git commit -m "feat(help): Purchasing articles (3)"
```

---

### Task 11: Production articles

**Files:**
- Create: `src/app/app/help/production/planning-overview/page.tsx`
- Create: `src/app/app/help/production/shopfloor/page.tsx`
- Create: `src/app/app/help/production/capacity/page.tsx`

- [ ] **Step 1: Create planning-overview article**

```tsx
// src/app/app/help/production/planning-overview/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function PlanningOverviewPage() {
  return (
    <ArticleLayout
      title="Planning module overview"
      description="Understand how production orders, capacity, and scheduling work together."
      category="production"
      relatedSlugs={["production/shopfloor", "production/capacity", "orders/fulfilment"]}
    >
      <p>
        The Planning module gives you a visual timeline of all open production orders scheduled
        across your departments. It shows what&apos;s being made, when, and whether you have the
        capacity to deliver on time.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Production orders</h3>
      <p>
        A production order is created from a sales order when you&apos;re ready to start manufacturing.
        It inherits the BOM, quantities, and target ship date from the sales order.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>The planning board</h3>
      <p>
        The planning board shows production orders on a Gantt-style timeline. Each order is a
        block that can be dragged to change its scheduled start date. Overlapping blocks indicate
        capacity conflicts.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Capacity</h3>
      <p>
        Capacity is defined per department (see <em>Departments and capacity</em>). The planning
        board shows a capacity bar for each department so you can see at a glance whether you are
        over- or under-scheduled.
      </p>

      <Callout type="info">
        The Planning module is a premium feature. If you don&apos;t see it in the sidebar,
        contact support or visit the Billing page to upgrade your plan.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 2: Create shopfloor article**

```tsx
// src/app/app/help/production/shopfloor/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function ShopfloorPage() {
  return (
    <ArticleLayout
      title="Shopfloor view"
      description="How operators use the shopfloor queue to work through production tasks."
      category="production"
      relatedSlugs={["production/planning-overview", "production/capacity"]}
    >
      <p>
        The Shopfloor view is a simplified interface designed for use on a tablet or workstation
        on the factory floor. Operators see only the tasks assigned to them, in priority order.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>For operators</h3>
      <ul style={{ paddingLeft: 20, lineHeight: 2, margin: 0 }}>
        <li>The queue shows tasks assigned to your department in scheduled order</li>
        <li>Tap a task to see the full instructions and component list</li>
        <li>Tap <strong>Start</strong> to record the actual start time</li>
        <li>Tap <strong>Complete</strong> when finished — the task moves off the queue</li>
      </ul>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>For supervisors</h3>
      <p>
        Supervisors see all tasks across all departments on the planning board, with real-time
        status (Not started, In progress, Complete) shown as colour indicators.
      </p>

      <Callout type="tip">
        Actual start and completion times are recorded automatically and compared to the schedule.
        This data feeds into the <strong>On-time fulfilment</strong> report over time.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 3: Create capacity article**

```tsx
// src/app/app/help/production/capacity/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function CapacityPage() {
  return (
    <ArticleLayout
      title="Departments and capacity"
      description="Set up departments, assign staff, and manage production capacity."
      category="production"
      relatedSlugs={["production/planning-overview", "production/shopfloor"]}
    >
      <p>
        Departments represent work centres or teams in your factory. Each department has a weekly
        capacity in hours, which the planning module uses to schedule and balance production orders.
      </p>

      <Steps>
        <Step>Open <strong>Settings → Departments</strong> and click <strong>New department</strong>.</Step>
        <Step>Give the department a name (e.g. &quot;Assembly&quot;, &quot;Packing&quot;, &quot;QC&quot;).</Step>
        <Step>Set the <strong>weekly capacity in hours</strong> — the total available production hours per week.</Step>
        <Step>Save the department.</Step>
        <Step>
          Assign staff to departments from <strong>Settings → Staff</strong>. Staff hours contribute
          to departmental capacity.
        </Step>
        <Step>
          In your BOMs, assign each production step to a department so the planner knows which
          department is responsible.
        </Step>
      </Steps>

      <Callout type="info">
        If you don&apos;t assign production steps to departments, the planning module will schedule
        all steps against the default department. Setting up departments is optional but recommended
        for accurate capacity planning.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 4: Verify TypeScript and commit**

```bash
npx tsc --noEmit
git add src/app/app/help/production/
git commit -m "feat(help): Production articles (3)"
```

---

### Task 12: Stocktake articles

**Files:**
- Create: `src/app/app/help/stocktake/running-a-stocktake/page.tsx`
- Create: `src/app/app/help/stocktake/csv-import/page.tsx`
- Create: `src/app/app/help/stocktake/resolving-discrepancies/page.tsx`

- [ ] **Step 1: Create running-a-stocktake article**

```tsx
// src/app/app/help/stocktake/running-a-stocktake/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function RunningAStocktakePage() {
  return (
    <ArticleLayout
      title="Running a stocktake"
      description="Start a count session, enter quantities, and commit the results."
      category="stocktake"
      relatedSlugs={["stocktake/csv-import", "stocktake/resolving-discrepancies", "inventory/adjustments"]}
    >
      <Steps>
        <Step>Open <strong>Stocktake</strong> in the sidebar and click <strong>New session</strong>.</Step>
        <Step>Give the session a descriptive name (e.g. &quot;End of month — June 2026&quot;).</Step>
        <Step>Select the <strong>locations</strong> to count. Leave all locations selected to count everything, or narrow to a single zone or bin.</Step>
        <Step>Work through the component list. For each component, enter the <strong>physical quantity you counted</strong>.</Step>
        <Step>Click <strong>Submit</strong> to generate the discrepancy report.</Step>
        <Step>Review discrepancies — see <em>Resolving discrepancies</em> if you need to recount.</Step>
        <Step>When you are satisfied the counts are correct, click <strong>Commit</strong> to apply the adjustments.</Step>
      </Steps>

      <Callout type="warning">
        Committing a stocktake is <strong>permanent and irreversible</strong>. The committed
        quantities replace the current on-hand figures and are recorded as stocktake adjustments
        in the movements log. Double-check your counts before committing.
      </Callout>

      <Callout type="tip">
        You can save a session as a draft and return to it later — counts are not committed until
        you explicitly click Commit.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 2: Create csv-import article**

```tsx
// src/app/app/help/stocktake/csv-import/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function CsvImportPage() {
  return (
    <ArticleLayout
      title="Importing counts via CSV"
      description="Upload a spreadsheet of counts instead of entering them one by one."
      category="stocktake"
      relatedSlugs={["stocktake/running-a-stocktake", "stocktake/resolving-discrepancies"]}
    >
      <p>
        If you count stock using a spreadsheet or a barcode scanner that outputs CSV, you can
        import the counts directly into a stocktake session instead of typing them manually.
      </p>

      <Steps>
        <Step>Start or open a stocktake session.</Step>
        <Step>Click <strong>Import CSV</strong>.</Step>
        <Step>Download the <strong>CSV template</strong> if you don&apos;t already have one in the correct format.</Step>
        <Step>Fill in the template: one row per component, with the component code and counted quantity.</Step>
        <Step>Upload the completed CSV file.</Step>
        <Step>Manuva imports the counts and pre-fills the session. Review for any unrecognised component codes.</Step>
        <Step>Continue as normal — submit to see discrepancies, then commit when ready.</Step>
      </Steps>

      <Callout type="info">
        The CSV template uses <strong>component codes</strong> (not names) to identify items.
        Make sure your scanner or spreadsheet outputs the same codes used in Manuva.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 3: Create resolving-discrepancies article**

```tsx
// src/app/app/help/stocktake/resolving-discrepancies/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function ResolvingDiscrepanciesPage() {
  return (
    <ArticleLayout
      title="Resolving discrepancies"
      description="What to do when counted quantities don't match the system."
      category="stocktake"
      relatedSlugs={["stocktake/running-a-stocktake", "inventory/adjustments"]}
    >
      <p>
        After submitting a stocktake session, Manuva shows a <strong>discrepancy report</strong>
        listing all components where your counted quantity differs from the system&apos;s expected
        quantity. This is normal — stocktakes exist precisely to find and correct these differences.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Reviewing discrepancies</h3>
      <p>
        Each row shows the <strong>system quantity</strong>, your <strong>counted quantity</strong>,
        and the <strong>difference</strong>. Large unexpected differences are worth recounting
        physically before committing.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Editing a count</h3>
      <p>
        To correct a counted quantity before committing, click the count value in the discrepancy
        report and update it. Changes are saved immediately to the session.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Committing</h3>
      <p>
        Once you are satisfied that the counts are accurate, click <strong>Commit</strong>. Each
        discrepancy becomes an inventory adjustment in the movements log, tagged as a stocktake
        adjustment for auditability.
      </p>

      <Callout type="warning">
        Once committed, discrepancies cannot be reversed. If you discover an error after
        committing, record a manual adjustment to correct the specific component.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 4: Verify TypeScript and commit**

```bash
npx tsc --noEmit
git add src/app/app/help/stocktake/
git commit -m "feat(help): Stocktake articles (3)"
```

---

### Task 13: Reports articles

**Files:**
- Create: `src/app/app/help/reports/stock-on-hand/page.tsx`
- Create: `src/app/app/help/reports/valuation/page.tsx`
- Create: `src/app/app/help/reports/dead-stock/page.tsx`

- [ ] **Step 1: Create stock-on-hand article**

```tsx
// src/app/app/help/reports/stock-on-hand/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function StockOnHandPage() {
  return (
    <ArticleLayout
      title="Stock on hand report"
      description="See current stock levels, values, and low-stock alerts across all locations."
      category="reports"
      relatedSlugs={["reports/valuation", "inventory/adjustments", "bom/allocation"]}
    >
      <p>
        The Stock on hand report gives you a snapshot of current inventory levels across all
        components and locations. It is the fastest way to see what you have, what is allocated,
        and what is actually available.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Columns</h3>
      <ul style={{ paddingLeft: 20, lineHeight: 2, margin: 0 }}>
        <li><strong>On hand</strong> — total physical quantity in stock</li>
        <li><strong>Allocated</strong> — reserved for confirmed orders</li>
        <li><strong>Available</strong> — on hand minus allocated</li>
        <li><strong>Reorder point</strong> — the threshold below which a purchasing signal is raised</li>
        <li><strong>Value</strong> — on-hand quantity × unit cost</li>
      </ul>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Filtering</h3>
      <p>
        Filter by location, category, or low-stock status. Sort by <strong>Available ascending</strong>
        to see the components closest to running out at the top.
      </p>

      <Callout type="tip">
        Export the report as CSV for use in spreadsheets, accounting software, or for sharing with
        your team. Click <strong>Export</strong> in the top-right corner.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 2: Create valuation article**

```tsx
// src/app/app/help/reports/valuation/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function ValuationPage() {
  return (
    <ArticleLayout
      title="Inventory valuation"
      description="Understand how inventory value is calculated and reported."
      category="reports"
      relatedSlugs={["reports/stock-on-hand", "purchasing/purchase-orders"]}
    >
      <p>
        The Inventory valuation report shows the total monetary value of your current stock,
        broken down by component, category, and supplier. It is useful for financial reporting,
        balance sheets, and insurance purposes.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>How value is calculated</h3>
      <p>
        Value is calculated as <strong>on-hand quantity × unit cost</strong>. Unit cost is taken
        from the most recent purchase order line for that component. If no PO exists, the unit
        cost falls back to the value set on the component record.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Filtering</h3>
      <p>
        Filter by category or supplier to drill into specific parts of your inventory. The total
        at the top of the page updates to reflect the filtered set.
      </p>

      <Callout type="info">
        Manuva uses a weighted-average cost method. If you need FIFO or specific lot costing,
        contact support to discuss options.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 3: Create dead-stock article**

```tsx
// src/app/app/help/reports/dead-stock/page.tsx
import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function DeadStockPage() {
  return (
    <ArticleLayout
      title="Dead stock report"
      description="Identify components that haven't moved in a configurable time window."
      category="reports"
      relatedSlugs={["reports/stock-on-hand", "inventory/movements"]}
    >
      <p>
        Dead stock is inventory that has had no movements — no receipts, no consumption, no
        adjustments — in a defined number of days. Holding dead stock ties up capital and
        warehouse space unnecessarily.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>Using the report</h3>
      <p>
        Open <strong>Reports → Dead stock</strong>. Set the <strong>days with no movement</strong>
        threshold (default: 90 days). The report lists all components that have not moved in that
        window, along with their on-hand quantity and value.
      </p>

      <h3 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "8px 0 4px" }}>What to do with dead stock</h3>
      <ul style={{ paddingLeft: 20, lineHeight: 2, margin: 0 }}>
        <li>Reduce or pause reorder quantities for slow-moving items</li>
        <li>Investigate whether the component is still used in any active BOM</li>
        <li>Write off genuinely obsolete stock with a Damaged adjustment</li>
        <li>Return to supplier if terms allow</li>
      </ul>

      <Callout type="tip">
        Run the dead stock report before a stocktake — it helps you prioritise which bins to
        audit carefully and which stock may be worth writing off before the count.
      </Callout>
    </ArticleLayout>
  );
}
```

- [ ] **Step 4: Verify TypeScript and commit**

```bash
npx tsc --noEmit
git add src/app/app/help/reports/
git commit -m "feat(help): Reports articles (3)"
```

---

### Task 14: Contextual HelpLink placement

**Files (modify):**
- `src/app/app/inventory/page.tsx`
- `src/app/app/bom/page.tsx` (or BOM detail page)
- `src/app/app/orders/page.tsx` (or order detail page)
- `src/app/app/goods-inwards/page.tsx`
- `src/app/app/stocktake/page.tsx`
- `src/app/app/purchasing/page.tsx`
- `src/app/app/planning/(gated)/page.tsx`

In each file below, import `HelpLink` and add it near the relevant UI element. The exact placement depends on the surrounding JSX — find the nearest `PageHeader` or action button and add the link nearby.

- [ ] **Step 1: Add HelpLink to Inventory page**

Open `src/app/app/inventory/page.tsx`. Add the import at the top:

```tsx
import HelpLink from "../_ui/help-link";
```

Find the `PageHeader` or the section containing the "Log movement" button. Add after the page description or near the button:

```tsx
<HelpLink slug="inventory/adjustments" label="How do inventory adjustments work?" />
```

- [ ] **Step 2: Add HelpLink to BOM page**

Open `src/app/app/bom/page.tsx`. Add import:

```tsx
import HelpLink from "../_ui/help-link";
```

Add near the allocation section or the BOM header:

```tsx
<HelpLink slug="bom/allocation" label="How does allocation work?" />
```

- [ ] **Step 3: Add HelpLink to Orders page**

Open `src/app/app/orders/page.tsx`. Add import:

```tsx
import HelpLink from "../_ui/help-link";
```

Add near the order status column heading or page header:

```tsx
<HelpLink slug="orders/order-statuses" label="What do order statuses mean?" />
```

- [ ] **Step 4: Add HelpLink to Goods Inwards page**

Open `src/app/app/goods-inwards/page.tsx`. Add import:

```tsx
import HelpLink from "../_ui/help-link";
```

Add in the page header area:

```tsx
<HelpLink slug="purchasing/goods-inwards" label="How to receive goods" />
```

- [ ] **Step 5: Add HelpLink to Stocktake page**

Open `src/app/app/stocktake/page.tsx`. Add import:

```tsx
import HelpLink from "../_ui/help-link";
```

Add near the "New session" button or page header:

```tsx
<HelpLink slug="stocktake/running-a-stocktake" label="How to run a stocktake" />
```

- [ ] **Step 6: Add HelpLink to Purchasing page**

Open `src/app/app/purchasing/page.tsx`. Add import:

```tsx
import HelpLink from "../_ui/help-link";
```

Add near the "New purchase order" button:

```tsx
<HelpLink slug="purchasing/purchase-orders" label="How to create a purchase order" />
```

- [ ] **Step 7: Add HelpLink to Planning page**

Open `src/app/app/planning/(gated)/page.tsx`. Add import:

```tsx
import HelpLink from "../../../_ui/help-link";
```

Add in the page header area:

```tsx
<HelpLink slug="production/planning-overview" label="How the planning module works" />
```

- [ ] **Step 8: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/app/app/inventory/page.tsx src/app/app/bom/page.tsx src/app/app/orders/page.tsx
git add src/app/app/goods-inwards/page.tsx src/app/app/stocktake/page.tsx src/app/app/purchasing/page.tsx
git add "src/app/app/planning/(gated)/page.tsx"
git commit -m "feat(help): add contextual HelpLink to 7 app pages"
```

---

## Self-review

**Spec coverage check:**
- ✅ Hub page with getting-started strip and module category grid — Task 5
- ✅ Hub category cards as anchor links scrolling to category sections — Task 5
- ✅ Article pages (26 articles, 8 categories) — Tasks 6–13
- ✅ `ArticleLayout`, `Steps`, `Callout`, `RelatedArticles` components — Tasks 2–3
- ✅ Typed `_registry.ts` with article metadata — Task 1
- ✅ `<HelpLink>` component — Task 4
- ✅ Contextual links on 7 app pages — Task 14
- ✅ Existing developer runbook replaced — Task 5
- ✅ No new dependencies introduced — all plain TSX

**Placeholder scan:** No TBDs, TODOs, or incomplete steps. Every task contains complete code.

**Type consistency:**
- `HelpCategory` defined in Task 1, used in `ArticleLayout` (Task 3) and `articlesByCategory` (Task 1) ✅
- `findArticle` and `articlesByCategory` defined in Task 1, used in `RelatedArticles` (Task 3) and hub page (Task 5) ✅
- `HelpLink` props (`slug`, `label?`) defined in Task 4, used in Task 14 ✅
- `ArticleLayout` props (`title`, `description`, `category`, `relatedSlugs?`, `children`) defined in Task 3, used consistently in Tasks 6–13 ✅
