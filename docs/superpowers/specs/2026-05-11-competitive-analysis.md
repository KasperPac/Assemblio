# Manuva Competitive Analysis
**Date:** 2026-05-11
**Purpose:** Dual-use — roadmap gap analysis + sales/marketing positioning.

---

## Competitors Covered

| Competitor | Price range | Tier |
|---|---|---|
| **Craftybase** | $20–$49+/mo | SMB / maker |
| **Qoblex** | $79–$179/mo | SMB / inventory-first |
| **inFlow Inventory** | $110–$1,319/mo | SMB / inventory-first |
| **Katana MRP** | $179–$799/mo (add-ons push to $747–$1,095) | Direct competitor |
| **MRPeasy** | $49/user/mo | Mid-market MRP |
| **Cin7 Core** | $349–$999/mo | Established ERP-lite |
| **Fishbowl** | $4,395–$6,595 one-time license | Legacy / on-premise |

**Manuva pricing for reference:** Starter $99/mo · Growth $249/mo · Pro $499/mo · Enterprise custom.

---

## Part 1 — Feature Matrix

Key: **✓** = included · **—** = not available · **add-on** = available at extra cost · **tier** = available from named tier upward

### 1. Shopify & Ecommerce Integrations

| Feature | Manuva | Katana | Craftybase | Qoblex | inFlow | MRPeasy | Cin7 Core |
|---|---|---|---|---|---|---|---|
| Shopify native integration | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Real-time webhook sync | ✓ | ✓ | hourly (paid) | ✓ | ✓ | ✓ | ✓ |
| Multiple Shopify stores | Pro+ | ✓ | — | — | — | — | Standard+ |
| WooCommerce | — | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Amazon | — | ✓ | Business+ | ✓ | ✓ | — | ✓ |
| Etsy | — | — | ✓ | — | — | — | — |
| B2B / wholesale portal | — | — | — | add-on $49/mo | — | — | ✓ |

**Gap:** Manuva is Shopify-only. Every competitor except Craftybase supports WooCommerce and most support Amazon. This limits Manuva to brands selling exclusively through Shopify.

---

### 2. Inventory Management

| Feature | Manuva | Katana | Craftybase | Qoblex | inFlow | MRPeasy | Cin7 Core |
|---|---|---|---|---|---|---|---|
| Component / raw material tracking | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Finished goods tracking | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Inventory movements ledger | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Stocktake / cycle counts | ✓ | ✓ | — | — | ✓ | ✓ | ✓ |
| Activity log | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Low stock alerts | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Reorder points / auto-PO | — | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Bin / aisle locations | Growth+ | add-on $149/mo | — | — | ✓ | ✓ | Advanced+ |
| Lot / batch tracking | — | add-on $249/mo | Indie+ | — | ✓ | ✓ | Standard+ |
| Serial number tracking | — | add-on $249/mo | — | — | ✓ | ✓ | Standard+ |
| Barcode scanning | — | add-on $149/mo | — | — | ✓ | ✓ | ✓ |
| Label printing | — | add-on $149/mo | — | — | — | — | ✓ |

**Gaps:**
- **Lot/batch/serial tracking** is the most significant gap. This is table-stakes for food, cosmetics, supplements, and any regulated goods. Katana, Cin7, inFlow, MRPeasy, and Craftybase all have it. Craftybase includes it from $49/mo.
- **Reorder points / auto-PO** — Manuva has no demand signal for when to reorder. Every competitor except Craftybase has this.
- **Barcode scanning** — not critical for early-stage but increasingly expected as warehouses grow.

---

### 3. BOM & Manufacturing

| Feature | Manuva | Katana | Craftybase | Qoblex | inFlow | MRPeasy | Cin7 Core |
|---|---|---|---|---|---|---|---|
| Bill of Materials | ✓ | ✓ | ✓ | ✓ | add-on $39–$299/mo | ✓ | ✓ |
| Multi-level / nested BOM | ✓ | ✓ | limited | ✓ | add-on | ✓ | ✓ |
| Production orders / work orders | ✓ | ✓ | — | ✓ | add-on | ✓ | ✓ |
| Component allocation engine | ✓ | ✓ | — | — | — | ✓ | ✓ |
| Yield % per BOM line | Growth+ | — | — | — | — | ✓ | — |
| BOM versioning | Growth+ | — | — | — | — | ✓ | — |
| BOM templates | Growth+ | — | — | — | — | — | — |
| Sub-assembly / kitting | ✓ | ✓ | limited | ✓ | ✓ | ✓ | ✓ |
| Batch production tracking | — | ✓ | ✓ | — | — | ✓ | ✓ |
| Visual production scheduler | — | ✓ | — | — | — | ✓ | ✓ |
| Subcontracting / outsourced ops | — | — | — | — | — | ✓ | — |
| Shop floor / floor view | Pro+ | — | — | — | — | ✓ | — |

**Advantages:**
- **Yield %** — Manuva is the only tool in this price range with yield % per BOM line. Katana doesn't have it at any price.
- **BOM versioning + templates** — unique at the $249 price point. MRPeasy has it but costs more per user.
- **BOM templates** — no competitor in this segment has this.
- **Shop floor view** — Manuva has a planning/floor view at Pro. Katana doesn't offer this at all.

**Gap:**
- **Visual production scheduler** — Katana's biggest UX differentiator. Drag-and-drop manufacturing order timeline. Manuva's planning module exists but doesn't have the same visual polish.
- **Batch production tracking** — no batch-level tracking on production runs.

---

### 4. Purchasing

| Feature | Manuva | Katana | Craftybase | Qoblex | inFlow | MRPeasy | Cin7 Core |
|---|---|---|---|---|---|---|---|
| Purchase orders | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Supplier management | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Goods inwards / receiving | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Reorder point → auto-PO | — | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Multi-currency purchasing | — | ✓ | — | — | ✓ | ✓ | ✓ |
| Supplier lead time tracking | ✓ (reports) | ✓ | — | — | — | ✓ | ✓ |

**Advantage:** Manuva has lead-time accuracy reporting — a differentiator Katana doesn't surface.

**Gap:** No reorder point automation means users must manually monitor stock and create POs. Multi-currency is absent, which matters for brands with overseas suppliers.

---

### 5. Costing & Finance

| Feature | Manuva | Katana | Craftybase | Qoblex | inFlow | MRPeasy | Cin7 Core |
|---|---|---|---|---|---|---|---|
| Cost per unit (BOM rollup) | Growth+ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Margin tracking per product | Growth+ | ✓ | — | — | — | ✓ | ✓ |
| Inventory valuation | Growth+ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| COGS tracking | Growth+ | ✓ | ✓ | — | — | ✓ | ✓ |
| Financial profitability dashboard | Pro+ | — | — | — | — | ✓ | ✓ |
| Accounting sync (QuickBooks) | — | ✓ | Growth+ | — | ✓ | ✓ | ✓ |
| Accounting sync (Xero) | — | ✓ | — | — | — | ✓ | ✓ |
| Multi-currency | — | ✓ | — | — | ✓ | ✓ | ✓ |

**Advantage:** Financial profitability dashboard at Pro is a genuine differentiator — Katana has no equivalent at any price.

**Gap:** **No accounting integration** is the most commercially painful gap. Virtually every competitor (including Craftybase at $49/mo) syncs to QuickBooks or Xero. Manuva users have to manually export and reconcile. This is a likely deal-breaker for any business with an accountant or bookkeeper.

---

### 6. Capacity & Staffing

| Feature | Manuva | Katana | Craftybase | Qoblex | inFlow | MRPeasy | Cin7 Core |
|---|---|---|---|---|---|---|---|
| Departments | Pro+ | — | — | — | — | — | — |
| Staffing levels | Pro+ | — | — | — | — | ✓ | — |
| Capacity planning | Pro+ | — | — | — | — | ✓ | — |
| Actual vs planned time tracking | Pro+ | — | — | — | — | ✓ | — |
| Staff costing | Pro+ | — | — | — | — | — | — |

**Advantage:** This entire module is a Manuva differentiator at the $499 price point. Katana has nothing here. Cin7 has nothing here. MRPeasy has staffing and capacity but at $49/user/mo costs more per user. **Staff costing is unique** — no direct competitor tracks wage costs against production in this way at this price.

---

### 7. Reports & Exports

| Feature | Manuva | Katana | Craftybase | Qoblex | inFlow | MRPeasy | Cin7 Core |
|---|---|---|---|---|---|---|---|
| Dashboard overview | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Stock on hand | Growth+ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Inventory movements | Growth+ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| PO summary / spend by supplier | Growth+ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| PO variance | ✓ | — | — | — | — | ✓ | ✓ |
| Lead-time accuracy | ✓ | — | — | — | — | — | — |
| Dead stock / slow-moving | ✓ | — | — | — | — | ✓ | ✓ |
| Inventory integrity | ✓ | — | — | — | — | — | — |
| Stocktake history | ✓ | — | — | — | — | ✓ | ✓ |
| Inventory valuation report | Growth+ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Date range filtering | Growth+ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| PDF export | Pro+ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| CSV export | Pro+ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Advantage:** PO variance, lead-time accuracy, inventory integrity, and dead stock reports give Manuva a deeper analytical story than Katana. These are operational intelligence reports that buyers will not find in the primary competitor.

**Gap:** PDF and CSV exports are locked to Pro ($499). Competitors include exports from entry-level tiers. This could be a friction point on the Growth tier sales conversation.

---

### 8. Platform & Support

| Feature | Manuva | Katana | Craftybase | Qoblex | inFlow | MRPeasy | Cin7 Core |
|---|---|---|---|---|---|---|---|
| Free trial | 14-day (full Pro) | 14-day | 14-day | 14-day | 14-day | 30-day | 14-day |
| Per-seat pricing | No | Yes | No | No | No | Yes | Yes (Standard) |
| API access | Pro+ | ✓ | — | add-on $20/mo | ✓ | ✓ | Standard+ |
| Mobile app | — | — | ✓ | — | ✓ | ✓ | ✓ |
| Barcode scanning (mobile) | — | add-on | — | — | ✓ | ✓ | ✓ |
| Multi-currency | — | ✓ | — | — | ✓ | ✓ | ✓ |
| SSO | Enterprise | — | — | — | — | — | ✓ |
| Accounting sync | — | Xero, QBO | QBO (paid) | — | QBO | Xero, QBO | Xero, QBO |
| Setup / onboarding | Self-serve | Self-serve | Self-serve | Self-serve | Self-serve | Self-serve | Guided ($) |

**Advantage:**
- 14-day trial with full Pro access — strongest trial offer in the segment. MRPeasy offers 30 days but limited feature access.
- Flat per-tier pricing with unlimited users from Growth — Katana, MRPeasy, and Cin7 all charge per seat. For a 10-person team, Manuva Growth ($249) beats Katana ($179 + $199 mfg add-on) on users alone.

**Gap:** No mobile app. No accounting sync. These are expected features by the time a brand is evaluating tools.

---

## Part 2 — Competitive Positioning

### 2.1 Katana MRP — Primary Competitor

**Their buyer:** Shopify-native product brand, 5–50 person team, $500K–$5M revenue, has outgrown spreadsheets. Usually selling finished goods with a manufacturing step (apparel, supplements, food & beverage, cosmetics, hardware).

**Their three strongest selling points:**
1. Shopify App Store presence — they're the first result when searching for manufacturing on Shopify
2. Visual drag-and-drop production scheduler — genuinely excellent UX for production teams
3. Established brand — 7+ years in market, many case studies and G2 reviews

**Where they're weak:**
- Add-on pricing is confusing and expensive. A Growth-comparable setup requires the base plan ($359/mo) + manufacturing add-on ($199/mo) + traceability ($249/mo) = $807/mo. Manuva Growth is $249/mo.
- No capacity planning at any price point
- No staff costing or time tracking
- No yield % in BOMs — every BOM line is fixed quantity only
- No BOM versioning — changing a BOM destroys history
- No financial profitability dashboard
- No PO variance or lead-time accuracy reports

**Manuva pitch (2–3 sentences):**
"Katana is a solid tool, but by the time you add the warehouse and traceability modules you need, you're paying $800/mo — and you still don't get capacity planning, BOM versioning, or the ability to track what each production run actually cost in labour. Manuva gives you all of that for $249/mo with unlimited users. Your whole team can be in the system on day one without a per-seat bill landing at the end of the month."

**Which Manuva tier wins this conversation:** Growth ($249/mo).

---

### 2.2 Craftybase — Entry-Level / Upgrade Path

**Their buyer:** Solo maker or very early-stage handmade brand. Often selling on Etsy as primary channel, Shopify secondary. Annual revenue under $200K. No employees or one part-timer. Candles, skincare, jewellery, baked goods, small-batch food.

**Their three strongest selling points:**
1. Entry price point ($20–$49/mo) — lowest cost in the market
2. Purpose-built for artisan/batch workflows — recipe management, COGS per batch
3. Etsy + Shopify integration in one tool

**Where they're weak:**
- No purchase orders or supplier management — you can't run procurement through Craftybase
- No receiving / goods inwards workflow
- No production orders beyond simple batch logging
- No team features — effectively single-user
- No capacity planning or staffing
- Scales poorly — the moment you hire your first warehouse person or need multi-user access, you've outgrown it

**Manuva pitch:**
"Craftybase is where a lot of our customers start out — it's great for solo makers who just need COGS and Shopify sync. But once you're writing POs to suppliers, training a warehouse team, and needing to know your production capacity for the next month, Craftybase hits a wall. Manuva Starter is $99/mo and includes everything you need to run a growing manufacturing operation, not just track recipes."

**Which Manuva tier wins this conversation:** Starter ($99/mo).

---

### 2.3 MRPeasy — Full-MRP Alternative

**Their buyer:** Traditional small manufacturer (not Shopify-first), 10–200 employees, physical goods with complex routing, subcontracting, or quality compliance requirements. Often non-consumer goods: industrial parts, contract manufacturing, electronics assembly.

**Their three strongest selling points:**
1. Full MRP — master production scheduling, capacity planning, shop floor reporting
2. Quality control and subcontracting modules — rare at this price range
3. End-to-end traceability — lot, serial, batch across the full supply chain

**Where they're weak:**
- Per-user pricing ($49/user/mo) adds up fast. A 10-person team is $490/mo before any extras.
- Not Shopify-native — Shopify integration exists but isn't the primary workflow; orders don't drive production automatically
- Complex to set up and use — built for operations managers, not e-commerce founders
- Dated UI — functional but not the experience a modern DTC brand expects

**Manuva pitch:**
"MRPeasy is powerful if you're running a traditional manufacturing operation with 30 people on the floor and a dedicated ops manager. If you're a Shopify brand that manufactures your own products, it's overkill — and at $49/user/mo you'll hit $500/mo the moment you give your team access. Manuva Pro is $499/mo flat for unlimited users and is built around your Shopify orders driving production, not the other way around."

**Which Manuva tier wins this conversation:** Pro ($499/mo) — the buyer considering MRPeasy has budget and needs the full feature set.

---

### 2.4 Cin7 Core — Established ERP Anchor

**Their buyer:** Mid-market multichannel business, $5M+ revenue, selling across Shopify + Amazon + wholesale B2B, with accounting integration requirements and possibly multiple warehouses across different states or countries.

**Their three strongest selling points:**
1. 700+ integrations — if it exists, Cin7 probably connects to it
2. Full ERP coverage including CRM, B2B portal, and advanced WMS
3. Established vendor — perceived lower risk for finance and ops leadership

**Where they're weak:**
- $349/mo minimum for Standard — enterprise budget for SMB features
- Complex to implement — guided onboarding adds cost; not self-serve for most buyers
- Overkill for Shopify-first brands who don't need multichannel ERP
- Not manufacturing-first — production features are adequate, not excellent

**Manuva pitch:**
"Cin7 is built for businesses that need an ERP across 10 sales channels, a B2B wholesale portal, and deep accounting sync. If you're manufacturing for Shopify, you'll pay $349/mo minimum for a lot of features you'll never use. Manuva is built specifically for Shopify manufacturers — better production tooling, lower price, and you'll actually be up and running in a day."

**Which Manuva tier wins this conversation:** Growth ($249/mo) for most, Pro ($499/mo) for larger teams.

---

## Part 3 — Gap Prioritisation for Roadmap

Gaps ranked by estimated sales impact and frequency:

| Gap | Impact | Competitors with it | Notes |
|---|---|---|---|
| **Accounting integration (Xero / QuickBooks)** | 🔴 Critical | All except Qoblex | Likely deal-breaker for any business with an accountant. Most common reason a CFO vetoes a tool. |
| **Lot / batch / serial tracking** | 🔴 Critical | Katana, Cin7, inFlow, MRPeasy, Craftybase | Required for food, cosmetics, supplements, regulated goods. Craftybase has it at $49/mo — embarrassing gap at $99/mo Starter. |
| **Reorder points / auto-PO** | 🟡 High | Katana, Cin7, inFlow, MRPeasy, Qoblex | Reduces manual purchasing work. Frequently cited in Katana reviews as a reason to stay. |
| **Multi-channel ecommerce (WooCommerce, Amazon)** | 🟡 High | All except Craftybase | Limits top of funnel to Shopify-only brands. Many Shopify brands also sell on Amazon. |
| **Export (PDF / CSV) on Growth tier** | 🟡 High | All competitors from entry tier | Growth-tier users currently can't export reports. Creates friction in sales conversations. |
| **Multi-currency** | 🟠 Medium | Katana, Cin7, inFlow, MRPeasy | Important for brands with overseas suppliers or international Shopify stores. |
| **Visual production scheduler** | 🟠 Medium | Katana, MRPeasy, Cin7 | Katana's biggest UX differentiator. Hard to build well, but noticeable absence. |
| **Barcode scanning** | 🟠 Medium | Katana (add-on), Cin7, inFlow, MRPeasy | More relevant as warehouse headcount grows. |
| **Mobile app** | 🟠 Medium | Craftybase, inFlow, MRPeasy, Cin7 | Useful for floor staff. Less critical for Manuva's current buyer profile. |
| **Batch production tracking** | 🟠 Medium | Katana, Cin7, MRPeasy, Craftybase | Related to lot tracking. Important for any batch-mode manufacturing. |
| **B2B / wholesale portal** | 🟢 Low | Cin7, Qoblex (add-on) | Different buyer motion. Not relevant until Manuva targets wholesale channels. |
| **Subcontracting** | 🟢 Low | MRPeasy only | Niche — relevant for brands that outsource part of production. |
| **CRM / customer management** | 🟢 Low | Cin7 only | Out of scope for Manuva's manufacturing focus. |

---

## Summary

**Manuva's strongest competitive position:** Growth tier ($249/mo) against Katana. The value story is compelling — comparable manufacturing depth, unlimited users, BOM versioning + yield %, and better operational reports, at less than a third of Katana's real cost with add-ons.

**The two gaps that need to close before Manuva can win without a discount:**
1. Accounting integration — the absence of Xero/QuickBooks sync is the most commonly cited veto by finance stakeholders.
2. Lot/batch tracking — required for regulated product categories and increasingly expected by DTC brands with any traceability requirement.

**The module where Manuva has no competition:** Capacity planning + departments + staffing + actual time tracking + staff costing at Pro. No direct competitor offers this combination at $499/mo flat. This is the basis for a strong "Manuva Pro vs MRPeasy" story.
