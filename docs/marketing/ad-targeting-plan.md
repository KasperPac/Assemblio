# Manuva — Ad Targeting Plan (first 90 days)

> **Companion to** `docs/marketing/manuva-brief.md`. Read the brief first for product, ICP, and competitive context.
> **Date:** 2026-05-13
> **Goal:** Concrete starting points for paid acquisition. Channels are ordered by expected ROI for Manuva's current product state (Shopify-only, no Xero/lot tracking yet).

---

## Strategic posture

Two parallel motions, run together:

1. **Competitor-conquest** — capture buyers already shopping for an MRP. High intent, low volume, expensive clicks but short payback. Mostly Google Search + comparison content.
2. **Vertical-pull** — surface in front of Shopify brand operators in fit verticals before they're explicitly shopping. Meta + Reddit + industry pubs.

**Do not run pure top-of-funnel "manufacturing software" generic ads.** The category is too broad, the CPCs are dominated by Cin7 / SAP / Oracle budgets, and Manuva's ICP is narrow.

**Budget split (suggested for a $5–10K/mo test):**
- 45% — Google Search (competitor + intent terms)
- 30% — Meta (vertical-targeted, lookalike, retargeting)
- 15% — LinkedIn (ops manager / production manager titles at SMB manufacturers)
- 10% — Reddit + niche communities + content sponsorships

---

## Channel 1 — Google Search (highest priority)

### Campaign A: Competitor conquest

Target buyers actively comparing or churning from a named competitor.

**Keyword groups (exact + phrase match):**
- `katana mrp alternative`, `katana alternative`, `alternative to katana mrp`, `katana mrp pricing`, `katana too expensive`
- `craftybase alternative`, `craftybase upgrade`, `craftybase vs`
- `mrpeasy alternative`, `mrpeasy too expensive`, `mrpeasy per user pricing`
- `cin7 alternative`, `cin7 too expensive`, `cin7 vs`
- `inflow alternative`, `inflow manufacturing`
- `qoblex alternative`

**Landing page:** dedicated `/compare/<competitor>` page per term group. Lead with price comparison + "unlimited users" + "14-day full-Pro trial".

**Sample ad copy (Katana conquest):**

> **Headline 1:** Katana Alternative — $249/mo Flat
> **Headline 2:** Unlimited Users · No Per-Seat Fees
> **Headline 3:** Built for Shopify Manufacturers
> **Description 1:** Comparable manufacturing depth to Katana — plus BOM versioning, yield %, and capacity planning — for less than a third of Katana's real cost with add-ons.
> **Description 2:** 14-day full-Pro trial. No credit card. See your whole team in the system on day one.

**Sample ad copy (MRPeasy conquest):**

> **Headline 1:** Tired of MRPeasy's Per-User Bill?
> **Headline 2:** Manuva — $499/mo Flat, Unlimited Users
> **Description:** A 10-person team on MRPeasy is $490/mo before extras. Manuva Pro is $499/mo flat, Shopify-native, and built around your orders driving production.

### Campaign B: Generic intent (narrow)

Use sparingly — high CPC, lower intent — but valuable for capturing Shopify-flavoured intent.

**Keyword groups (phrase match, negative `oracle`, `sap`, `netsuite`, `epicor`):**
- `mrp software for shopify`, `manufacturing software for shopify`, `bom software shopify`
- `production planning software small manufacturer`
- `inventory + production software`, `shopify inventory manufacturing`
- `manufacturing software australia` (AU geo-locked)
- `bom management software small business`

**Negative keywords:** `free`, `open source`, `excel template`, `tutorial`, `course`, `udemy`, `linkedin learning`, `wholesale only`, `enterprise`.

### Tracking
- One conversion event per stage: `trial_started`, `trial_activated_first_bom`, `paid_converted`.
- Pipe through Google Ads enhanced conversions so post-trial paid conversions back-attribute correctly.

---

## Channel 2 — Meta (Facebook + Instagram)

### Campaign A: Vertical-targeted prospecting

**Targeting (interest + behaviour overlay):**
- Job title: `founder`, `CEO`, `COO`, `operations manager`, `production manager`, `head of operations`
- Interests: `Shopify`, `Shopify Plus`, `ecommerce`, `Shopify App Store`, `direct-to-consumer`, `DTC`, `private label`, `small business owner`
- Behaviour: small business owners, business decision-makers

**Vertical layers (run as separate ad sets, identical creative theme, different vertical imagery):**
1. Cosmetics / skincare / candles / soap
2. Supplements / health food / beverages
3. Apparel / print / embroidery
4. Coffee roasters / packaged food
5. Hardware / homewares

**Geo:** AU (priority), then NZ, UK, US.

**Creative themes:**
- **Spreadsheet-pain hook** — split-screen of a tangled Excel BOM vs Manuva's UI. Caption: *"If your BOM lives in a spreadsheet, your warehouse is one resignation away from chaos. Manuva — $99/mo, 14 days free."*
- **Shopify-native hook** — Shopify order → automatic component reservation animation. Caption: *"Every Shopify order should reserve your components automatically. With Manuva, it does."*
- **Founder-quote hook** — testimonial once available; until then, use the "unlimited users" angle: *"Stop paying per seat for your warehouse team. $249/mo, everyone's in."*

**Sample ad — cosmetics vertical:**

> **Primary text:** Running a Shopify cosmetics brand off a recipe spreadsheet and a Trello board? Manuva replaces both. Real BOMs, batch records, supplier POs, and live stock — all connected to your Shopify orders.
> **Headline:** Manufacturing ops for indie beauty brands
> **Description:** From $99/mo · 14-day free trial · No credit card
> **CTA:** Start free trial

### Campaign B: Retargeting

Standard 14/30/90-day windows on:
- Pricing page visitors
- Comparison page visitors
- Trial-started-but-not-activated
- Trial-activated-but-not-converted

Creative emphasis: "your trial is waiting", feature highlight rotation (BOM versioning, capacity planning, reports).

### Campaign C: Lookalike (post-100 paid customers)

1% LAL off paid converters, separately for AU and US. Layer over the same vertical-interest groups above as an exclusion check — don't double-spend on already-targeted users.

---

## Channel 3 — LinkedIn

Lower volume but highest ICP fidelity. Best for the **Pro tier** ($499) conversation.

**Targeting:**
- Company size: 11–200
- Industries: `Consumer Goods`, `Cosmetics`, `Food & Beverages`, `Apparel & Fashion`, `Manufacturing`, `Wine & Spirits`, `Sporting Goods`
- Seniority: Owner, Founder, CXO, VP, Director, Manager
- Function: Operations, Production, Supply Chain
- Geo: AU, NZ, UK, US

**Format:** Sponsored content + single-image. LinkedIn message ads work but burn goodwill fast — avoid in first 90 days.

**Hook angle:** capacity planning + financial profitability (Pro-only, no direct competitor has the combo).

**Sample copy:**

> **Headline:** What did last month's production actually cost you in labour?
> **Body:** Most manufacturing software tracks materials but not the hours your team spent making each SKU. Manuva Pro gives you departments, staffing, and actual-vs-planned time — connected to your BOMs and Shopify orders. $499/mo flat, unlimited users.
> **CTA:** See how it works

---

## Channel 4 — Reddit + niche communities

Cheap, high-trust, but small. Use for awareness and inbound search lift, not direct response.

**Subreddits worth a sponsored post or sustained organic presence:**
- `r/shopify` (1M+ members)
- `r/ecommerce`
- `r/manufacturing`
- `r/smallbusiness`
- `r/Entrepreneur` (large but noisy)
- `r/handmadeAustralia`
- `r/AusFinance` (occasional crossover)

**Other communities:**
- Shopify subreddit, Shopify Community forums
- DTC Twitter / X (sponsored creator posts)
- Indie Hackers (founder audience overlap)
- Makers Australia Facebook group
- AusVeg / AIFST / AFGC member newsletters (food vertical)

**Approach:** sponsor existing creator/operator content rather than running display ads. Reddit ads themselves convert poorly for B2B SaaS in this price band.

---

## Channel 5 — Industry pubs + trade events (AU)

Slow-burn. Useful when there's headcount for an account exec, less useful for pure paid acquisition in month 1–3. Capture for the quarterly plan.

**Publications worth a sponsored insert or display:**
- *Food & Drink Business*
- *Australian Food News*
- *Inside FMCG*
- *Cosmetics Business* (AU/UK)

**Events worth a booth or speaking slot (when budget allows):**
- Fine Food Australia (Sydney/Melbourne, annual)
- AUSPACK (biennial)
- Foodservice Australia
- AIFST Convention

---

## First-90-days schedule

| Weeks | Action |
|---|---|
| 1–2 | Build out competitor-comparison landing pages (`/compare/katana`, `/compare/craftybase`, `/compare/mrpeasy`, `/compare/cin7`). Set up Google Ads conversion tracking. Build retargeting pixels on Meta + LinkedIn. |
| 3–4 | Launch Google Search **competitor conquest** at $1.5–3K/mo. Launch Meta vertical prospecting at $1.5–2K/mo across 2 verticals (start with cosmetics + apparel — least blocked by missing Xero/lot tracking). |
| 5–8 | Read trial conversion data. Pause underperforming ad sets. Layer in LinkedIn Pro-tier campaign at $1–1.5K/mo. Test 2 new Meta vertical groups. |
| 9–12 | Build lookalike audiences from first paid converters. Scale top-performing creative 2–3x. Start writing case study #1 (negotiate free-year discount with strongest design partner). |
| 13 | Quarterly review. Decide whether Xero / lot tracking has shipped — if yes, unlock food-and-beverage and supplement verticals (currently blocked). |

---

## Measurement targets (90-day check-ins)

| Metric | 30-day | 60-day | 90-day |
|---|---|---|---|
| Trial signups | 30 | 90 | 200 |
| Trial → activation (first BOM built) | 35% | 40% | 45% |
| Activation → paid conversion | 12% | 15% | 18% |
| CAC blended | <$1,500 | <$1,000 | <$700 |
| CAC payback | — | — | <9 months |

Adjust against the Manuva ARPU stack ($99–$499/mo, Growth dominant) — payback under 9 months at Growth tier ($249 × 12 = $2,988 ARR) means CAC under ~$700.

---

## Notes for the agent picking this up

- The two **deal-blocker gaps** (Xero, lot tracking) are unshipped as of 2026-05-13. **Do not target food, supplements, or beverages with ads claiming traceability or accounting sync** until those ship. Lean on cosmetics, apparel, hardware, candles for the first 90 days — they're least blocked by these gaps.
- Manuva already advertises a 14-day **full-Pro** trial with no credit card. This is the strongest trial in the segment — feature it in every ad.
- The `/pricing` page is the canonical price comparison surface (`docs/superpowers/specs/2026-05-10-pricing-page-handover.md`). Drive all comparison-page CTAs there or into trial signup at `/login`.
- Pricing is flat per-account with **no per-seat fees** — this is the headline distinction in every B2B SaaS comparison conversation. Lead with it.
