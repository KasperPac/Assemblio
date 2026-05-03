# Feature Gap Analysis — Design Spec

**Date:** 2026-05-04
**Author:** Kasper Simonsen (with Claude)
**Status:** Approved (brainstorming phase complete; ready for implementation plan)

---

## 1. Purpose

Produce a single document that, for each of Assemblio's 8 core features, identifies:

1. **Table-stakes gaps** — what's missing that would prevent a credible Katana / Cin7 alternative pitch.
2. **JTBD friction** — where each target persona's daily workflow breaks down or forces a workaround.
3. **AU/NZ market hooks** — local-market features that are cheap to build and slow for US-built competitors to copy.
4. **Differentiators** — gaps in Katana / Cin7 themselves that Assemblio could exploit.

Then roll up a cross-feature **top-10 priority list** scored on customer value × marketing impact ÷ effort, and cluster those into 2–4 strategic themes for marketing.

The document is a **decision artefact**, not a roadmap commitment. Its job is to make "what to build next" obvious before any further design work.

## 2. Context & assumptions

### Target personas

- **Solo maker** — 1–10 staff, Shopify-native, single location, assembles kits or finished goods. Lives in spreadsheets today.
- **Mid manufacturer** — 10–50 staff, Shopify retail + some wholesale, real production planning, multiple staff entering data.
- **Job shop** — variable BOMs, every order slightly different, quoting matters as much as inventory.

All 8 features must work well across all 3 personas for the product to be viable. No persona-specific weighting in the analysis.

### Competitive frame

Assemblio competes against:

- **Katana MRP** — visual production planning, similar Shopify-native pitch. Beat them on UX or price.
- **Cin7 Core (DEAR) / Unleashed** — broader inventory/ERP, accounting-first. Beat them on simplicity.
- **Spreadsheets + Shopify alone** — the real default for solo makers. Beat them on automation and onboarding speed.

### Market

Australia / New Zealand first. Xero + MYOB are dominant; QuickBooks is a distant third. AUD-only is acceptable for v1. GST handling is required for any accounting integration.

### Stage

Pre-launch. No real customer conversations yet. The analysis is principled (codebase + competitor table-stakes + market knowledge), not customer-validated. The output should be re-tested against real prospects before any major build commitment.

## 3. Methodology — four lenses

Each gap is classified into exactly one of four lenses. The lenses are mutually exclusive on purpose — forcing classification surfaces what kind of bet each item is.

| Lens | Question it answers | Bet type |
|---|---|---|
| Table stakes | "Will the prospect even shortlist us without this?" | Defensive / parity |
| JTBD friction | "Does the current user keep hitting a wall?" | Retention / NPS |
| AU/NZ market hooks | "Can we win this region before the US tools catch up?" | Geographic moat |
| Differentiators | "Where do Katana/Cin7 hurt their users, and could we be obviously better?" | Offensive / positioning |

If an item could fit two lenses, classify it under the **highest-leverage** lens for marketing (usually Differentiators > AU hooks > Table stakes > JTBD).

## 4. Scoring rubric

### Customer value (1–5)

How much pain does this remove for the persona it targets?

- **1** — nice-to-have; no one stays or leaves over it
- **3** — visible friction; a workaround exists
- **5** — blocker; they cannot run their business on Assemblio without it

### Marketing impact (1–5)

How much does this change the sales / landing-page conversation?

- **1** — invisible (background tech)
- **3** — mention on a feature page; helps in evaluation
- **5** — headline-worthy / category-defining ("the only Shopify MRP that does X")

### Build effort

Calibrated to this codebase:

- **S** — days. Mostly UI plus a column or two. Example: supplier contact fields.
- **M** — 1–2 weeks. New tables + UI + non-trivial server logic. Example: batch/lot tracking.
- **L** — ~1 month. New subsystem touching multiple features. Example: Xero integration, multi-location.
- **XL** — >1 month. Architectural shift. Example: multi-currency throughout, true MRP scheduling.

### Priority score

```
score = (Customer value × Marketing impact) ÷ effort_weight
effort_weight: S = 1, M = 2, L = 4, XL = 8
```

Tie-break by preferring items that **unblock another high-priority item** or **reduce churn risk**.

## 5. Document structure

The gap-analysis document will be written to `docs/superpowers/feature-gap-analysis.md` (note: the *output* sits outside the `specs/` folder because it's an ongoing reference artefact, not a spec). Structure:

```
1. Context & assumptions (½ page)
   - Personas, competitive frame, AU/NZ assumption
   - How to read the scorecards

2. Per-feature scorecards (8 sections, ½–1 page each, equal weighting)
   1. Shopify Product Import
   2. Component Inventory & Item Details
   3. Bills of Material (with versioning)
   4. Goods Inwards
   5. Orders from Shopify
   6. Stocktake
   7. Suppliers
   8. Reports

3. Cross-feature top-10 (the punchline)
   - Ranked table: rank | item | source feature | persona | CV | MI | Effort | Score | one-line rationale

4. Strategic clusters (½ page)
   - Group the top-10 into 2–4 themes (e.g., "AU-native finance loop," "Job-shop quoting," "Shopify-omnichannel")
   - One paragraph per cluster — what it unlocks for marketing

5. Out of scope (¼ page)
   - Ideas considered and rejected, with one-line reasons
   - Prevents re-litigation
```

### Per-feature scorecard template

Each of the 8 features uses this exact structure:

```markdown
### <Feature name>

**Today (one paragraph):** what's actually shipped, in plain language.

**Table stakes — gaps that block a credible Katana/Cin7 alternative:**
- <Gap> — why missing it loses deals

**JTBD friction — workflow breakdowns for our personas:**
- <Persona: Solo / Mid / Job-shop> — <where they get stuck or leave the app>

**AU/NZ market hooks — cheap leverage US-built tools won't ship fast:**
- <Hook> — concrete value

**Differentiators — gaps in Katana/Cin7 we could exploit:**
- <Idea> — why it stings them

**Scoring summary:**
| Item | Lens | Persona | CV (1-5) | MI (1-5) | Effort | Score |
|------|------|---------|----------|----------|--------|-------|
| ...  | ...  | ...     | ...      | ...      | ...    | ...   |
```

## 6. Tone & length

- **Tone:** plain English, opinionated. Call out weak features ("Suppliers is barely a feature") rather than hedging. Hedging makes the doc unactionable.
- **Length target:** 8–12 pages of dense markdown. Long enough to be useful, short enough to re-read.
- **No filler.** Every gap listed must have a one-line "why this matters" justification or it gets cut.

## 7. Out of scope (for this spec)

The following are explicitly **not** part of this brainstorm:

- **Building any of the gaps.** This spec produces an analysis document only. Each top-priority gap will get its own brainstorm → spec → plan cycle later.
- **Customer validation.** The analysis is principled, not interview-derived. Real customer interviews are a separate workstream.
- **Pricing strategy.** Surfaces in marketing impact scoring but isn't designed here.
- **Roadmap timing / quarter assignment.** The top-10 is a priority order, not a calendar.
- **Engineering capacity planning.** Effort estimates are coarse (S/M/L/XL); detailed estimation belongs in the implementation plan for each chosen item.

## 8. Acceptance criteria

The gap-analysis document is complete when:

1. All 8 features have scorecards using the template in §5.
2. Every scorecard line has a populated lens, persona (where applicable), CV, MI, Effort, and one-line rationale.
3. The cross-feature top-10 table is ranked by score with no ties unbroken.
4. 2–4 strategic clusters are named, each with a paragraph linking marketing message to product capability.
5. The "out of scope" section lists at least 5 ideas considered and rejected, each with a one-line reason.
6. Total length is between 8 and 12 pages of rendered markdown.
7. No "TBD" or placeholder text remains.

## 9. Next step

After this spec is approved by the user, invoke the **writing-plans** skill to break the analysis into bite-sized tasks (one task per scorecard, plus roll-up tasks). The plan will be executed in a separate session.
