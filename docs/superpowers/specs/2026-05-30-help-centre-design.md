# Help Centre Design

**Date:** 2026-05-30  
**Status:** Approved

## Summary

Replace the existing developer runbook at `/app/help` with a proper user-facing help centre. Structure: a hub page with category cards and a getting-started strip, plus individual article pages per topic. Articles authored as plain TSX pages — no new dependencies. Contextual `<HelpLink>` components scattered through the app link directly to relevant articles.

---

## Architecture

### Routing

| Route | Purpose |
|---|---|
| `/app/help` | Hub page — category grid + getting-started strip |
| `/app/help/getting-started/first-bom` | Example article page |
| `/app/help/[category]/[article]` | All article pages follow this pattern |

Each article is a standard Next.js page component (`page.tsx`). No dynamic catch-all route — each article gets its own file so content can be fully custom JSX.

### File structure

```
src/app/app/help/
  page.tsx                        ← Hub page
  layout.tsx                      ← Help layout (breadcrumb wrapper)
  help.module.css
  _registry.ts                    ← Typed article index (slug, title, category, description)
  _ui/
    article-layout.tsx            ← Wraps every article (title, intro, breadcrumb, related footer)
    steps.tsx                     ← <Steps> / <Step> numbered list components
    callout.tsx                   ← <Callout type="tip|warning|info"> aside block
    related-articles.tsx          ← Related links footer, resolves titles from registry
  getting-started/
    first-bom/page.tsx
    connect-shopify/page.tsx
    first-stocktake/page.tsx
    create-purchase-order/page.tsx
  inventory/
    adjustments/page.tsx
    movements/page.tsx
    locations/page.tsx
  bom/
    creating-a-bom/page.tsx
    components/page.tsx
    versions/page.tsx
    allocation/page.tsx
  orders/
    fulfilment/page.tsx
    shopify-sync/page.tsx
    order-statuses/page.tsx
  purchasing/
    purchase-orders/page.tsx
    goods-inwards/page.tsx
    suppliers/page.tsx
  production/
    planning-overview/page.tsx
    shopfloor/page.tsx
    capacity/page.tsx
  stocktake/
    running-a-stocktake/page.tsx
    csv-import/page.tsx
    resolving-discrepancies/page.tsx
  reports/
    stock-on-hand/page.tsx
    valuation/page.tsx
    dead-stock/page.tsx

src/components/ui/help-link.tsx   ← Shared contextual link component (app-wide)
```

---

## The Registry

`_registry.ts` exports a typed array of article metadata. This is the index — not the content. The hub page and `<HelpLink>` both import from here.

```ts
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
  slug: string;         // e.g. "inventory/adjustments"
  category: HelpCategory;
  title: string;
  description: string;
};

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "getting-started/first-bom",
    category: "getting-started",
    title: "Set up your first BOM",
    description: "Create a bill of materials from scratch and link it to a product.",
  },
  // ... all articles
];
```

---

## Shared UI Components

### `<ArticleLayout>`

Wraps every article page. Accepts `title`, `description`, `category`, and `slug`. Renders the breadcrumb (`Help → Category → Article`), page header, and wires up the `<RelatedArticles>` footer.

```tsx
<ArticleLayout
  title="Recording an inventory adjustment"
  description="Correct on-hand quantities when physical counts differ from the system."
  category="inventory"
  slug="inventory/adjustments"
>
  {/* article body */}
</ArticleLayout>
```

### `<Steps>` / `<Step>`

Numbered step list. Each `<Step>` is one action. Renders blue numbered circles.

```tsx
<Steps>
  <Step>Open <strong>Inventory</strong> and select a component.</Step>
  <Step>Click <strong>Log movement</strong>, choose a reason code, and enter the delta.</Step>
  <Step>Submit and verify the movement in <strong>Recent movements</strong>.</Step>
</Steps>
```

### `<Callout type="tip" | "warning" | "info">`

Coloured aside block. Tip = green left border, Warning = amber, Info = blue.

```tsx
<Callout type="tip">
  Run a stocktake session after bulk adjustments to keep the audit trail clean.
</Callout>
```

### `<RelatedArticles>`

Footer links to 2–3 related articles by slug. Titles auto-resolved from the registry.

```tsx
<RelatedArticles slugs={["stocktake/running-a-stocktake", "inventory/movements"]} />
```

---

## Hub Page

Two sections:

**Getting Started strip** — full-width highlighted band at the top with quick-start guides for new users. Four cards: Set up your first BOM, Connect Shopify, Run your first stocktake, Create a purchase order.

**Module category grid** — 2-column responsive grid of category cards at the top of the page. Each card is an anchor link that scrolls down to that category's section. Below the grid, each category has an inline section listing all its articles as clickable links with their description. No intermediate category pages — everything on one hub page.

---

## Content Scope (Launch)

22 articles across 8 categories:

| Category | Articles |
|---|---|
| 🚀 Getting Started | first-bom, connect-shopify, first-stocktake, create-purchase-order |
| 📦 Inventory | adjustments, movements, locations |
| 🔧 BOMs & Components | creating-a-bom, components, versions, allocation |
| 📋 Orders | fulfilment, shopify-sync, order-statuses |
| 🛒 Purchasing | purchase-orders, goods-inwards, suppliers |
| 🏭 Production | planning-overview, shopfloor, capacity |
| 🔢 Stocktake | running-a-stocktake, csv-import, resolving-discrepancies |
| 📊 Reports | stock-on-hand, valuation, dead-stock |

---

## Contextual Help Links

### `<HelpLink>` component

```tsx
// src/components/ui/help-link.tsx
<HelpLink slug="inventory/adjustments" />
// → renders ⓘ icon, links to /app/help/inventory/adjustments

<HelpLink slug="inventory/adjustments" label="How do adjustments work?" />
// → renders "ⓘ How do adjustments work?" as a small secondary text link
```

- No `label` → icon-only with tooltip on hover
- With `label` → icon + text link
- Opens in same tab
- Styled as secondary/muted text — never competes with primary actions

### Placement at launch

| Page | Location | Article slug |
|---|---|---|
| Inventory | Near "Log movement" button | `inventory/adjustments` |
| BOM detail | Near allocation section | `bom/allocation` |
| Orders | Near order status badge | `orders/order-statuses` |
| Goods Inwards | Page header | `purchasing/goods-inwards` |
| Stocktake | Page header | `stocktake/running-a-stocktake` |
| Purchase Orders | Near "Create PO" button | `purchasing/purchase-orders` |
| Planning | Page header | `production/planning-overview` |

More added incrementally as pain points are identified.

---

## What's Out of Scope

- Search (can be added once content exists)
- AI assistant / chat
- Admin UI to edit content (developer-maintained)
- Public-facing help (stays inside `/app`, requires login)
- Video embeds (text + steps only at launch)

---

## Implementation Order

1. Shared UI components (`_ui/` folder) — `ArticleLayout`, `Steps`, `Callout`, `RelatedArticles`
2. Registry (`_registry.ts`) with all article metadata
3. Hub page (`/app/help/page.tsx`) — replaces the existing developer runbook
4. `<HelpLink>` component (`src/components/ui/help-link.tsx`)
5. Article pages — Getting Started first (highest value for new users), then by module
6. Contextual links — drop `<HelpLink>` into the 7 identified app pages
