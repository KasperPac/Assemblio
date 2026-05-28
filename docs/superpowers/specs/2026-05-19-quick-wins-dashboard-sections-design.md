# Quick-Wins Dashboard — New Sections Design Spec
**Date:** 2026-05-19
**Status:** Approved for planning
**Extends:** `docs/marketing/quick-wins.html` (existing dashboard, 82.5 KB)
**Branch:** `feat/quick-wins-dashboard`

---

## Overview

Add three new sections to the existing `docs/marketing/quick-wins.html` static dashboard. No new file — append to the existing Jinja2 template and Python build pipeline. The three sections are:

- **Section 5 — Integrations Roadmap**: wave progress + per-integration capability cards + competitor matrix
- **Section 6 — Competitor Feature Gaps**: prioritised gap table with severity badges + Manuva advantages panel
- **Section 7 — Client Pipeline**: Kanban board (localStorage) + acquisition channels reference table

The existing pipeline is: `build_quick_wins.py` → loaders/filters/charts/mapping modules → `quick-wins.html.j2` → `docs/marketing/quick-wins.html`. New sections extend the same template and build script. No new output files.

---

## Section 5 — Integrations Roadmap

### Purpose
Show where Manuva stands on integrations vs. competitors, what's coming and when, and the specific data flows each integration covers.

### Data source
`docs/superpowers/specs/2026-05-11-integrations-strategy-analysis.md` — wave sequencing, per-vendor API details, competitor tables.

### Layout

**Wave tracker bar** (top of section):
- Four labelled stages with progress indicators:
  - Wave 0: Shopify — ✅ Shipped
  - Wave 1: Xero — 🔄 In progress
  - Wave 2: WooCommerce · Amazon AU · QuickBooks Online — Planned
  - Wave 3: MyOB · Etsy · eBay AU · Starshipit — Planned
  - Out of scope: A2X (partner recommendation callout)

**Integration cards grid** (one card per integration target, 10 total):
Each card contains:
- Name + wave badge (0/1/2/3) + status pill (Shipped / In progress / Planned)
- **Data flows list**: specific syncs — e.g.:
  - Shopify: Orders in · Stock push · Fulfilment writeback · Returns: not yet
  - Xero: Sales invoices · Purchase bills · Per-production-order COGS journal · WIP roll-forward · Variance lines (PPV, MUV, scrap)
  - WooCommerce: Orders in · Stock push · Fulfilment writeback
  - Amazon AU: Orders in · FBA + FBM · Fulfilment writeback (FBM only)
  - QuickBooks Online: Sales invoices · Purchase bills · COGS journal (Xero parity)
  - MyOB AccountRight: Bills · Invoices · COGS journal · Inventory Adjustment for build events
  - Etsy: Orders in (polling) · Stock push · Listing sync
  - eBay AU: Orders in · Stock push · Fulfilment writeback with tracking
  - Starshipit: Order handoff · Tracking writeback
  - A2X: Partner — payout reconciliation (not built)
- **AU gotcha** (one-liner): e.g. "Amazon AU = separate seller account from US/EU"; "MyOB requires `x-myobapi-cftoken` header alongside OAuth"; "Etsy: 10k QPD shared across all shops — rate-limit risk at scale"; "eBay: must set `marketplaceId: EBAY_AU` on each offer"

**Competitor × Integration matrix** (collapsible, below cards):
- Rows: 10 integrations (same as cards)
- Columns: Katana · Cin7 Core · MRPeasy · Craftybase · inFlow · **Manuva**
- Cell values: Native / Via Extensiv / Zapier only / None
- Manuva column shows: Shipped / Wave 1 / Wave 2 / Wave 3 / Partner
- Color coding matches severity: Native = green, Via Extensiv = amber, Zapier = amber, None = red

### Data loading
New Python module `scripts/quick_wins/integrations.py` — parses the integrations analysis doc (or returns hardcoded structured data) and returns a list of integration dicts for template rendering. No YAML source file needed; data is stable and can be hardcoded as Python dicts.

---

## Section 6 — Competitor Feature Gaps

### Purpose
Surface the 13 prioritised gaps so the dashboard reader knows what's blocking deals and what Manuva already wins on.

### Data source
`docs/superpowers/specs/2026-05-11-competitive-analysis.md` — Part 3 gap prioritisation table + strengths callouts.

### Layout

**Summary bar** (top):
- Four severity pill counts: 🔴 2 Critical · 🟡 3 High · 🟠 5 Medium · 🟢 3 Low
- "X gaps in progress / done" counter (derived from localStorage state)

**Prioritised gap table**:
- Columns: Gap name · Severity · Competitors with it (n/7) · Status
- Ordered: Critical first, then High, Medium, Low; within tier by competitor count desc
- Status column values: **In progress** · **Planned** · **Backlog** · **Done** — each cell is a clickable cycle button, state saved to `manuva:quick-wins:gaps` in localStorage
- Pre-seeded statuses (from known roadmap): Accounting integration = In progress; Multi-channel ecommerce = Wave 2 (render as Planned)
- All 13 gaps from the research doc included

**Manuva advantages panel** (below table):
- Heading: "Where Manuva wins today"
- 4 bullet callouts:
  - Yield % per BOM line — only tool at this price range (Katana has none at any price)
  - BOM versioning + templates — unique at $249/mo
  - Unlimited users flat pricing — Katana hits $807/mo with add-ons for equivalent features
  - Capacity planning + staff costing at Pro — no direct competitor at $499/mo flat

### Data loading
New Python module `scripts/quick_wins/gaps.py` — returns hardcoded list of gap dicts (name, severity, competitor_count, default_status). Static data, no file parsing needed.

---

## Section 7 — Client Pipeline

### Purpose
Track real sales pipeline prospects and provide a per-segment outbound reference for finding new clients.

### Layout

**Funnel summary bar** (top):
- Live counts from localStorage: "N Prospects · N Discovery · N Trial · N Negotiation · N Won"
- Total pipeline MRR estimate (sum of MRR on all cards that have a value)

**Pipeline board** (Kanban, 5 columns):
- Columns: Prospect → Discovery Call → Trial → Negotiation → Closed Won
- Cards are draggable between columns (HTML5 drag-and-drop)
- Each card contains:
  - Company name (editable inline on click)
  - Segment tag (dropdown from the 9 quick-win segments)
  - Estimated MRR (optional numeric field)
  - Notes (single line, optional)
  - Delete button (×)
- "Add card" button at the bottom of each column
- Full board state persisted to `manuva:quick-wins:pipeline` (localStorage, JSON array of card objects)

**Acquisition channels table** (below or right of board, static reference):
- 9 rows — one per quick-win segment
- Columns: Segment · Primary channel · Secondary channel · Where to find them
- Content (hardcoded, derived from segment knowledge):
  | Segment | Primary | Secondary | Where to find them |
  |---|---|---|---|
  | Cosmetics / Skincare | Instagram DM (beauty founders) | Beauty Expo AU | #indiebeauty, AU beauty founder Facebook groups |
  | Candle / Soap makers | Facebook groups | Etsy seller communities | "Candle making AU" FB groups, Faire wholesale |
  | Coffee Roasters | Direct outreach | Specialty coffee events | ASCA events, AU specialty roaster directories |
  | Small-batch Food / Bev | Industry associations | State food expos | AFCA, Fine Food Australia |
  | Apparel / Accessories | Shopify App Store reviews | Fashion trade shows | AGHA Gift Fair, rag trade FB groups |
  | Supplements / Nutraceuticals | LinkedIn (founders) | TGA compliance forums | Supplement industry associations |
  | Pet Food / Treats | Facebook groups | Petbarn supplier pathway | AU pet industry trade shows |
  | Craft Beer / Spirits | Brewing associations | BrewCon AU | IBD AU chapter, independent bottle shops |
  | Home Goods / Furniture | Trade shows | Interior design communities | AGHA, Decor + Design Melbourne |

### Data loading
No new Python module needed — acquisition channel table is static HTML in the template. Pipeline board is entirely client-side JS.

---

## Build pipeline changes

### New Python modules
- `scripts/quick_wins/integrations.py` — returns `INTEGRATIONS` list and `COMPETITOR_MATRIX` dict
- `scripts/quick_wins/gaps.py` — returns `FEATURE_GAPS` list and `MANUVA_ADVANTAGES` list

### Template changes
- `scripts/quick_wins/templates/quick-wins.html.j2` — append three new `<section>` blocks after existing Section 4
- New CSS: integration card grid, wave tracker, competitor matrix table, Kanban board columns + cards, drag-and-drop styles
- New JS: Kantt board drag-and-drop + localStorage, gaps status cycling + localStorage, integrations matrix toggle

### Build script changes
- `scripts/build_quick_wins.py` — import and call new modules, pass data to template context

### Tests
- `scripts/quick_wins/tests/test_integrations.py` — validate INTEGRATIONS list shape, all 10 entries present, required fields
- `scripts/quick_wins/tests/test_gaps.py` — validate FEATURE_GAPS list, 13 entries, severity values in allowed set
- Integration test: rebuild HTML, assert new section headings appear in output

---

## Constraints

- Output remains a single self-contained HTML file — no external JS beyond Chart.js CDN already present
- localStorage keys use existing prefix `manuva:quick-wins:*`
- All new CSS uses existing Manuva design tokens (`--brand-1`, `--bg-card`, `--ink-strong`, etc.)
- No new CDN dependencies — drag-and-drop uses native HTML5 API
- Python data modules contain no file I/O (hardcoded dicts) — keeps build deterministic and test-friendly
