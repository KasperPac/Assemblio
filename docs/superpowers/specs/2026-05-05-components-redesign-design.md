# Components Page Redesign — Design Spec

## Context

The components list and detail pages serve one primary job: **stock checking** — "do I have enough of X to run this job?" Secondary use is understanding what would be affected if a component ran out (BOM traceability). Purchasing is out of scope (handled offline with suppliers).

---

## List Page

### Columns

Replace the current on-hand / in-production / reorder point columns with:

| Column | Description |
|--------|-------------|
| **Component** | Name + SKU (monospace, muted) |
| **On-hand** | Physical quantity in stock |
| **Available** | On-hand minus quantity committed to open production orders. Labelled "on-hand − committed" in column subheading. Bold; red when zero. |
| **Reorder point** | Threshold for replenishment. De-emphasised (smaller, muted text). |
| **Category** | Component category |

The "in-production" column is removed — it's derivable as on-hand minus available, and clutters the primary question.

### Stock Status Signal

Each row carries a coloured dot (left of component name) based on available quantity vs reorder point:

- **Green** — available ≥ reorder point (OK)
- **Amber** — available > 0 but < reorder point (Low)
- **Red** — available = 0 (Critical — production is blocked)

Low rows get a subtle amber row tint (`#fffbeb`). Critical rows get a subtle red row tint (`#fff5f5`). Tints are gentle enough not to be alarming but distinct enough to scan quickly.

### Filter Tabs

Add a **"Low Stock"** tab alongside "All". The Low Stock tab shows all components where available < reorder point (both amber and red). The tab displays a red count badge when there are items to action.

```
[ All  42 ]  [ Low Stock  7 ]
```

### Search

Unchanged — search by name or SKU.

---

## Detail Page

### Page Header

Add a stock status badge next to the component name and SKU:
- `⚠ Critical — 0 available` (red) when available = 0
- `⚠ Low — N available` (amber) when available < reorder point
- No badge when OK (don't add noise for the normal case)

### Overview Tab

Replace the current 8-card layout with **4 focused stat cards**:

1. **On-hand** — physical stock quantity
2. **Available** — on-hand minus committed. This is the hero metric. Highlighted with a coloured border (red when zero, amber when low). Sub-text shows how many are committed ("3 committed to production").
3. **In Production** — quantity committed to open production orders. Sub-text: "Committed to open orders".
4. **Reorder Point** — the replenishment threshold. Sub-text shows delta when below threshold ("Below threshold by N").

Below the stat cards: a **Recent Receipts** mini-table (last 3–5 goods inwards receipts for this component). Columns: date, supplier, docket reference, qty received. This replaces the noisy remaining stat cards with information that's actually useful in context (who supplies this, how recently, what quantities).

### Sidebar

Keep the existing sidebar structure (340px). Ensure it includes:
- Category
- Unit of measure
- Cost per unit
- **Stock value** (cost per unit × on-hand quantity) — derived, displayed as currency
- Preferred supplier (if set)
- Lead time (if set; otherwise "—")

Actions:
- **Edit component** (primary)
- **Receive stock** (secondary) — links to `/app/goods-inwards/new`. Quick path from spotting low stock to recording a delivery. Pre-selecting this component on the new receipt form is a nice-to-have if the form supports it.
- **Delete** (danger)

### BOM Usage Tab

A table of every bill of material that specifies this component. Purpose: traceability — which products would be affected if this component ran out?

Columns:
| Column | Description |
|--------|-------------|
| **BOM / Product** | BOM name as a link to the full BOM detail page. Description below name in muted text. |
| **Qty per unit** | How many of this component are required to produce one unit of the finished product. Displayed as a pill. |
| **Status** | Active (green) or Draft (grey). Active BOMs are live products; draft BOMs are works-in-progress or superseded. |

Intro line above table: "This component is specified in N bills of material."

BOM names are navigable links — clicking opens the full BOM detail page.

Empty state when the component is not used in any BOM.

### Movements Tab

No changes. Remains an investigation tool showing the last 50 stock movements (receipts, production consumption, adjustments).

---

## Data Requirements

### Available Quantity

`available = on_hand - quantity_committed_to_open_production_orders`

This requires a query or DB function that sums component quantities allocated to production orders in non-terminal statuses (i.e., not completed or cancelled). The exact query depends on the production order data model.

### Recent Receipts on Overview

Query `delivery_receipt_line` joined to `delivery_receipt` filtered by `component_id`, ordered by `received_at` desc, limit 5.

### Low Stock Count (tab badge)

Count of components where `available < reorder_point`. Can be a simple count query or derived client-side from the full list.

---

## Out of Scope

- Purchasing / reorder workflow — handled offline
- Demand forecasting
- Production order demand on the BOM Usage tab — that belongs in Movements or a future production planning view
