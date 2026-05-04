# Assemblio — Feature Gap Analysis

**Date:** 2026-05-04
**Status:** Decision artefact — pre-launch, principled (not customer-validated)
**Source spec:** `docs/superpowers/specs/2026-05-04-feature-gap-analysis-design.md`

---

## 1. Context & assumptions

### Personas

- **Solo maker** (1–10 staff) — Shopify-native, single location, assembling kits or finished goods. Lives in spreadsheets today. Onboarding speed matters more than depth.
- **Mid manufacturer** (10–50 staff) — Shopify retail plus some wholesale, multiple staff entering data, real production planning. Depth and roles/permissions start to matter.
- **Job shop** — variable BOMs, every order slightly different, quoting is as important as inventory. Per-order BOM overrides and lead-time visibility dominate.

All three must work for the product to be viable; no persona-specific weighting in the analysis.

### Competitive frame

- **Katana MRP** — visual production planning, similar Shopify-native pitch. Beat them on UX or price.
- **Cin7 Core (DEAR) / Unleashed** — broader inventory/ERP, accounting-first. Beat them on simplicity.
- **Spreadsheets + Shopify alone** — the real default for solo makers. Beat them on automation and onboarding speed.

### Market

Australia / New Zealand first. Xero + MYOB are dominant; QuickBooks is a distant third. AUD-only is acceptable for v1. GST handling is required for any accounting integration. Local logistics (AusPost / StarTrack / Sendle) and BAS reporting are local hooks US-built tools won't ship fast.

### How to read the scorecards

Each gap is classified into **exactly one** of four lenses, picked for the highest-leverage marketing angle (Differentiators > AU/NZ hooks > Table stakes > JTBD):

| Lens | Question it answers |
|---|---|
| Table stakes | Will the prospect even shortlist us without this? |
| JTBD friction | Does the current user keep hitting a wall? |
| AU/NZ market hooks | Can we win this region before US tools catch up? |
| Differentiators | Where do Katana/Cin7 hurt their users, and could we be obviously better? |

**Scoring:**
- **CV (1–5)** — customer value: 1 = nice-to-have, 5 = blocker.
- **MI (1–5)** — marketing impact: 1 = invisible, 5 = headline-worthy.
- **Effort:** S = days, M = 1–2 weeks, L = ~1 month, XL = >1 month (calibrated to this codebase).
- **Score** = `CV × MI ÷ effort_weight` (S=1, M=2, L=4, XL=8). Higher is better. Tie-break: unblocks-other-priority > reduces-churn-risk.

---

## 2. Per-feature scorecards

### 2.1 Shopify Product Import

_(populated by Task 1)_

### 2.2 Component Inventory & Item Details

_(populated by Task 2)_

### 2.3 Bills of Material (with versioning)

_(populated by Task 3)_

### 2.4 Goods Inwards

_(populated by Task 4)_

### 2.5 Orders from Shopify

_(populated by Task 5)_

### 2.6 Stocktake

_(populated by Task 6)_

### 2.7 Suppliers

_(populated by Task 7)_

### 2.8 Reports

_(populated by Task 8)_

---

## 3. Cross-feature top-10

_(populated by Task 9)_

---

## 4. Strategic clusters

_(populated by Task 10)_

---

## 5. Out of scope

_(populated by Task 11)_
