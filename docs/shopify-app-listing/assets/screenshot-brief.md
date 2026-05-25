# Screenshot Brief

Shopify requires 3 to 6 screenshots, each **1600 × 900 px** (16:9), PNG or JPG.

Below are 5 recommended screenshots, ordered as they should appear on the listing.

---

## 1. Embedded surface inside Shopify Admin

**Route:** `/shopify/embedded` (loaded inside Shopify Admin iframe)

**What to show:**
- The Manuva embedded surface in a connected, healthy state
- Last synced timestamp populated (recent, e.g. "2 minutes ago")
- "Sync now" + "Open Manuva" buttons visible
- Surrounded by Shopify Admin chrome (left nav, top bar) — capture the full Shopify Admin window, not just the iframe

**Why it's first:** Reviewers want to see the merchant's experience inside Shopify, not the standalone app. This screenshot proves the embedded surface works.

**Demo data needed:**
- Store: `manuva-demo.myshopify.com`
- Last sync: within the past hour
- Status: ok

**Save to:** `docs/shopify-app-listing/assets/screenshot-1-embedded.png`

---

## 2. BOM Builder

**Route:** `/app/bom` (or the BOM detail page)

**What to show:**
- A real product variant with 5-8 components listed
- Each component has a quantity, supplier name, and unit cost
- A roll-up "Total cost per unit" visible in the corner
- Use a recognisable example: e.g. "Candle - 250g Lavender" with components for wax, wick, fragrance, jar, label

**Save to:** `docs/shopify-app-listing/assets/screenshot-2-bom.png`

---

## 3. Production order tied to a Shopify order

**Route:** `/app/orders/[orderId]` for an order originating from Shopify

**What to show:**
- An order showing its Shopify origin badge (`Shopify #1042` or similar)
- The production order spawned from it: status "In progress"
- Components allocated, shortages flagged in amber
- A timeline showing "Synced from Shopify &rarr; Production order created &rarr; Components allocated"

**Save to:** `docs/shopify-app-listing/assets/screenshot-3-production-order.png`

---

## 4. Multi-location inventory

**Route:** `/app/inventory`

**What to show:**
- A table of components with columns: Component, Warehouse A (on hand), Warehouse B (on hand), Reserved, In production
- 12-15 rows, mix of healthy and low-stock items (low-stock highlighted)
- A "Create PO" button visible

**Save to:** `docs/shopify-app-listing/assets/screenshot-4-inventory.png`

---

## 5. Settings &rarr; Integrations (the connect flow)

**Route:** `/app/settings/integrations`

**What to show:**
- The Shopify integration card showing a connected store
- Last synced status: green check, "5 minutes ago"
- A "Disconnect" + "Sync now" + "Manage" UI
- Optionally show the Stripe/billing card too, to make clear that's where billing is handled

**Save to:** `docs/shopify-app-listing/assets/screenshot-5-integrations.png`

---

## Optional: demo video (60-120s)

Not required, but reviewers move significantly faster on apps with a video. Suggested arc:

1. (0:00-0:10) Open Shopify Admin, click Apps &rarr; Manuva. Embedded surface loads.
2. (0:10-0:25) Click "Sync now". Show sync completing.
3. (0:25-0:40) Click "Open Manuva". Land in app.manuva.app. Show synced products.
4. (0:40-1:00) Open BOM Builder. Add a component to a variant.
5. (1:00-1:20) Open an order. Convert to production order. Allocation runs.
6. (1:20-1:40) Show multi-location inventory updating after allocation.
7. (1:40-2:00) Close on the dashboard / outro.

**Save to:** `docs/shopify-app-listing/assets/demo-video.mp4`

---

## Capture tips

- Use a clean, fresh dev store with realistic-looking demo data (no `test test test` placeholders)
- Capture at exactly 1600×900 if possible; if your monitor is bigger, use the browser zoom + window resize tools
- Use the **light theme** for consistency with the icon/feature image
- No personal data — no real customer names, no production tokens visible in URLs
- Annotate sparingly if at all: Shopify prefers clean product shots over annotated tutorials
