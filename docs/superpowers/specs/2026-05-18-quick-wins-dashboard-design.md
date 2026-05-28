# Quick Wins Dashboard — Design Spec

**Date:** 2026-05-18
**Author:** Kasper Simonsen (with Claude)
**Status:** Approved (brainstorming phase complete; ready for implementation plan)

---

## 1. Purpose

Produce a single self-contained HTML file at `docs/marketing/quick-wins.html` that surfaces the 9 Phase-1, high-priority segments from the GTM research as actionable cards, alongside the full 12-week 90-day plan and Charter Partner pipeline. The goal is **start actioning by the end of the same day the file is opened** — every quick win must map to specific tasks already written in the 90-day plan, with ticks persisted client-side.

This is a strategic artefact that lives in the repo and travels (email/share/screenshot). A future in-app port at `/app/admin/quick-wins` will reuse ~70% of this work — data shape, chart specs, layout, copy — and replace only `localStorage` with Supabase + server actions.

## 2. Inputs

| Source | What's used |
|---|---|
| `docs/research/manuva-gtm/results/*.json` | Per-segment metrics (ARPU, CAC, LTV, time-to-value, motion, where-they-live, fit score, etc.) |
| `docs/research/manuva-gtm/outline.yaml` | Tier and priority for each segment |
| `docs/marketing/90-day-gtm-plan.md` | Week-by-week tasks (Weeks 1–12) and Day-90 review checklist |
| `docs/marketing/charter-design-partner-program.md` | Charter slot definitions and recruitment phasing |
| `C:\dev\manuva-tokens\Manuva Design System\colors_and_type.css` | Inlined at top of HTML for brand-consistent styling |

## 3. Filter — the 9 quick-win segments

Filter applied: `phase == "Phase 1"` AND `priority <= 2` AND `addressable_window == "now"`. Yields:

| # | Segment | Tier | Priority | ARPU (AU$) | 12-mo MRR (AU$) | Motion |
|---|---|---|---|---|---|---|
| 01 | Indie cosmetics & skincare | A | 1 | 210 | 4,200–7,400 | Design partner |
| 04 | Candle, soap & home-fragrance | A | 1 | 185 | 5,500–11,100 | 14-day CC trial |
| 08 | Pet treats & dry pet food | A | 2 | 280–330 | 2,200–4,500 | Paid pilot |
| 11 | Packaged foods, sauces, condiments | A | 2 | 220–280 | 2,500–5,200 | Two-track |
| 14 | Functional ferment brands | A | 2 | 170 | 1,500–2,800 | Founder-led + CC trial |
| 16 | Katana defectors | B | 1 | 245 | 2,900–6,100 | Inbound + CC trial |
| 17 | Craftybase graduates | B | 1 | 235 | 3,500–5,800 | Inbound + CC trial |
| 19 | Unleashed defectors (NZD-billed) | B | 1 | 320 | 2,800–4,500 | Paid pilot |
| 21 | Shopify Plus no-ops | B | 2 | 430 | 2,400–4,000 | Two-track |

The build script reads the JSON files and applies this filter declaratively; if priority/phase fields shift in a future research refresh, the segment list updates automatically.

## 4. Output structure (single page, anchor nav)

```
Header + nav  ─────────────────────────────────────
[Overview · Segments · 90-Day Plan · Charter]

Overview ──────────────────────────────────────────
4 KPI cards · Bar chart · Scatter chart

Segments ──────────────────────────────────────────
Filter strip · 9 segment cards

90-Day Plan ───────────────────────────────────────
Gantt swimlanes · Week-by-week checklist (12 weeks)
Day-90 review checklist

Charter Program ───────────────────────────────────
5 slot tiles · Outreach cadence summary
```

## 5. KPI cards (top of Overview)

Four cards. Computed at build time, displayed prominently.

| Card | Formula |
|---|---|
| **Total 12-mo MRR if all hit** | Sum of upper bound of each segment's `mrr_12mo_range` |
| **Blended ARPU** | Weighted mean of `arpu_aud` across the 9, weighted by upper-bound MRR |
| **Founder hours/week** | Top number: 40 hr/wk (from plan §2). Sub-line: "Build 16 · Sell 12 · Support 6 · Content 6" rendered as a horizontal stacked bar inside the card |
| **Segments addressable today** | Count where `roadmap_dependency` does not gate on Xero/MYOB/QBO/Woo/Amazon. Sub-line: count "addressable after Xero ships" |

## 6. Charts (three, via Chart.js CDN)

### 6.1 Horizontal bar — MRR potential per segment

- **Y axis:** segment label (sorted desc by upper-bound MRR)
- **X axis:** 12-mo MRR upper bound (AU$)
- **Colour:** priority (P1 = `--brand-1`, P2 = lighter shade)
- **Tooltip:** lower bound + ARPU + motion

### 6.2 Scatter — ARPU × time-to-value

- **X axis:** `time_to_value_days` (lower-is-better)
- **Y axis:** `arpu_aud` (higher-is-better)
- **Bubble size:** `manuva_fit_score` × 8
- **Bubble colour:** motion type (Charter / Paid pilot / CC trial / Inbound)
- **Quadrant labels:** "Fastest cash" (top-left), "Richest" (top-right), "Slow & cheap" (bottom-left), "Hardest" (bottom-right)
- **Tooltip:** segment name + ARPU + TTV + motion + CAC

### 6.3 Gantt — 90-day plan workstream view

- **4 swimlanes:** Build, Sell, Support, Content (matches founder-hours table in plan §2)
- **X axis:** Weeks 1–12 with date labels
- **Blocks:** each weekly deliverable rendered as a coloured horizontal bar in its swimlane, labelled with task title
- **Hover:** full deliverable text from the plan

Implementation note: Chart.js doesn't have a native Gantt; render as a horizontal stacked-bar chart with custom datalabels, or as a hand-rolled SVG. SVG is preferred — simpler control and avoids a second charting library.

## 7. Segment cards (Segments section)

Nine cards, filterable. Each card:

```
┌─────────────────────────────────────────────────┐
│ #16  Katana defectors                  ★ P1     │
├─────────────────────────────────────────────────┤
│ ARPU 245 · MRR 2.9–6.1k · CAC 80 · LTV 8.2k    │
│ LTV:CAC 6.4× · TTV 14 days · Churn risk: low    │
├─────────────────────────────────────────────────┤
│ Motion: Inbound funnel + 14-day CC-required     │
│         trial                                   │
├─────────────────────────────────────────────────┤
│ ▾ Where they live                               │
│   • G2 Katana 1–3★ reviews (AU-tagged)         │
│   • r/shopify · r/Entrepreneur                  │
│   • Brahmin Solutions blog readership           │
├─────────────────────────────────────────────────┤
│ ▾ This week (3)                                 │
│   ☐ Send 6 personalised DMs to G2 reviewers     │
│   ☐ Publish Katana real-cost calculator         │
│   ☐ ...                                         │
│ ▾ This month (5)                                │
│   ☐ ...                                         │
├─────────────────────────────────────────────────┤
│ Source: results/16_katana_defectors.json ↗      │
└─────────────────────────────────────────────────┘
```

**Action mapping rules:**
- Build script tokenises each 90-day plan task. If a task mentions a segment (e.g., "candle", "Craftybase", "Katana"), it's mapped to that segment's card.
- Cross-cutting tasks (e.g., "Ship Xero integration") appear on every segment whose `roadmap_dependency` references Xero, prefixed with `↳ shared` so they're not double-counted.
- Segments without explicit mentions in the plan (likely #8 pet treats, #11 packaged foods, #14 ferments) get a single placeholder card action: *"This segment is parked in Phase 2 of the 90-day plan — see Day-90 review §6"* with a link to the relevant plan section.
- "This week" = tasks from the current ISO week (build script reads system date, falls back to Week 1 if before plan start).
- "This month" = tasks from the current and next 3 weeks.

## 8. 90-Day Plan section

Two views, stacked:

1. **Gantt** (chart 6.3 above) — visual at-a-glance.
2. **Week-by-week checklist** — every task from plan §3, rendered as a flat checklist grouped by week. Each `☐` is a `<input type=checkbox>` with `data-task-id` keyed to the task's plan position (e.g., `w03-t02`). State persisted in `localStorage` under `manuva:quick-wins:tasks`.
3. **Day-90 review checklist** — plan §6's decision-point list, separately ticked.

## 9. Charter Program section

Five slot tiles, each editable in place:

```
┌──────────────────┐
│ Slot 1 · Cosmetics│
│ Status: [Open ▾]  │   options: Open / Outreach /
│ Contact: ________ │   In-talks / Signed / Withdrawn
│ Note:    ________ │
└──────────────────┘
```

Persisted in `localStorage` under `manuva:quick-wins:charter`. Below the tiles, an 8-week recruitment cadence summary lifted verbatim from `charter-design-partner-program.md` §5.

## 10. Filter strip (Segments section only)

Three filters, all multi-select dropdowns:

- **Phase:** Phase 1 (default-on for all 9), Phase 2, Phase 3 (greyed — none in current list)
- **Motion:** Design partner · Paid pilot · 14-day CC trial · Inbound · Two-track
- **ARPU band:** <200 · 200–300 · 300–400 · 400+

Changing a filter re-renders the segment cards *and* the two Overview charts (so the KPI math also reflects the filter). Charts and KPIs at top show `*` indicator if a filter is active.

Filter state persisted in URL hash so views are shareable (`#phase=1&motion=inbound`).

## 11. Build script — `scripts/build_quick_wins.py`

Single Python script. Inputs read from absolute paths under the repo. Output: `docs/marketing/quick-wins.html`.

Pseudocode:

```python
1. Load all results/*.json -> dict keyed by id.
2. Load outline.yaml -> overlay tier/priority/phase onto each segment.
3. Apply quick-win filter (§3) -> 9 segments.
4. Parse 90-day-gtm-plan.md -> structured tasks {week, workstream, title, segments_mentioned}.
5. Compute KPIs (§5).
6. Compute chart datasets (§6).
7. For each segment, attach week/month action lists (§7 mapping rules).
8. Read colors_and_type.css -> inline in <style>.
9. Render template (Jinja2 or .format()) -> write quick-wins.html.
```

**Step 4 — task tokenisation rules:**

*Workstream classifier* (first match wins, case-insensitive on the task's first verb):

| Verbs / phrases | Workstream |
|---|---|
| Ship, build, draft, deploy, publish (a page or feature), set up (a system) | Build |
| Send, DM, post (to community), outreach, demo, sign, convert, pitch, reach out, schedule (a call) | Sell |
| Run (a Charter call), onboard, support, triage, run (a cadence call) | Support |
| Publish (a post/article), write (a draft), launch (a webinar), submit (to a directory) | Content |

Where a task contains multiple verbs, the *primary* verb is the one closest to the task's outcome noun. Edge cases: tasks that are clearly cross-workstream (e.g., "Build calculator and publish post") are duplicated across both swimlanes for the Gantt only, not double-counted in the segment cards.

*Segment-mention keywords* (case-insensitive substring match against the task text; multiple matches allowed):

| Segment id | Keywords |
|---|---|
| 01 (cosmetics) | cosmetic, skincare, indie beauty, Jennifer Rudd, Skincare Business Foundations, Beauty Industry Group |
| 04 (candle/soap) | candle, soap, home fragrance, Australian Candle Makers, Australian Soapmakers |
| 08 (pet treats) | pet treat, dry pet food |
| 11 (packaged foods) | packaged food, sauce, condiment, FSANZ |
| 14 (ferments) | ferment, kombucha-adjacent, sauerkraut, kimchi |
| 16 (Katana defectors) | Katana, real-cost calculator, Brahmin Solutions |
| 17 (Craftybase grads) | Craftybase, Craftybase ceiling, Indie tier |
| 19 (Unleashed defectors) | Unleashed, NZD billing |
| 21 (Shopify Plus no-ops) | Shopify Plus, Plus brand |

A task with zero segment matches is "cross-cutting" — surfaced under the segment card only if its text references a `roadmap_dependency` value (e.g., "Xero", "MYOB"), tagged `↳ shared`.

Dependencies: `python-docx` already present (not needed here); add `pyyaml` and optionally `jinja2`. Both stdlib-adjacent.

## 12. Styling

- Manuva design tokens from `colors_and_type.css` inlined at top of `<style>`.
- Layout: single-column, ~1100px max-width, generous whitespace.
- Typography: tokens from `colors_and_type.css` (no overrides).
- Charts: use `--brand-1`, `--brand-2`, `--ink-strong`, `--bg-card` from the token set.
- Dark mode: skip for v1. If tokens define a dark theme, the HTML respects it via the existing CSS custom properties.

## 13. State persistence

All ticks and Charter slot status stored in `localStorage`:

| Key | Shape |
|---|---|
| `manuva:quick-wins:tasks` | `{"w03-t02": true, "w04-t01": false, ...}` |
| `manuva:quick-wins:charter` | `[{slot:1, status:"in-talks", contact:"...", note:"..."}, ...]` |
| `manuva:quick-wins:day90` | `{"d90-1": true, ...}` |

Persistence is per-browser. The page header includes a "Reset all ticks" button (with `confirm()`) and an "Export state to JSON" button so progress is recoverable.

## 14. Out of scope (deliberately)

- Cross-device sync (use in-app port for that).
- Editing segment data inline (read-only; edit the JSON and re-run the build script).
- Adding new tasks beyond the 90-day plan (edit the plan, re-run).
- Authentication / multi-user.
- Automated push to LinkedIn / blog (Cowork or other automation is a separate decision — see conversation note).
- Phase 2 / Phase 3 segments — covered by JSON but greyed in the filter.
- Performance instrumentation (page loads in <1s with 9 cards + 3 charts; not worth tuning).

## 15. Acceptance criteria

1. `scripts/build_quick_wins.py` runs on Python 3.13 with no manual edits and writes `docs/marketing/quick-wins.html`.
2. Opening `quick-wins.html` in Chrome shows: header nav, 4 KPI cards, bar chart, scatter chart, 9 segment cards, Gantt, week-by-week checklist, Day-90 checklist, 5 Charter tiles.
3. All 9 segments render with non-empty ARPU, MRR range, CAC, LTV, TTV, churn risk, motion.
4. Each segment card's "This week" and "This month" lists contain at least one item (placeholder where unmapped).
5. Ticking a checkbox persists across page reload (verified by toggling 3 ticks, reloading, ticks remain).
6. Editing a Charter slot status and reloading retains the value.
7. Filter strip filters cards AND recomputes the two charts and 4 KPIs.
8. URL hash reflects filter state and re-applies on share.
9. Page passes Chrome DevTools Lighthouse accessibility check at ≥90.
10. Manuva colour tokens applied (verify by inspecting `--brand-1` is used on primary bars).
11. File size <300 KB total (Chart.js CDN excluded). All data inlined.
12. No "TBD" or placeholder text in rendered HTML except where §7 mapping rules dictate (parked segments).

## 16. Future port to `/app/admin/quick-wins`

When porting to the Manuva app:

- Replace `localStorage` with two Supabase tables: `quick_win_task_status (tenant_id, task_key, status, updated_at)` and `charter_slot (tenant_id, slot_number, status, contact, note, updated_at)`, both RLS-restricted to admin/super_admin.
- Replace Chart.js with `react-chartjs-2` or Recharts (same data shape).
- Replace HTML scaffold with a Next.js Server Component reading the same JSON at request time (or seeded to Supabase).
- The build script becomes a one-off seed script.
- Layout and copy stay identical.

Estimated rework: ~1 day after the standalone HTML is shipped and validated.

## 17. Next step

After this spec is approved and committed, invoke the **writing-plans** skill to break implementation into bite-sized tasks (build script, HTML scaffold, KPI math, three charts, segment cards, 90-day section, Charter section, filter strip, state persistence, acceptance verification). The plan will be executed in a subsequent session.
