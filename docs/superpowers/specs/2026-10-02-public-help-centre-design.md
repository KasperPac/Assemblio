# Public help centre: one manual per module

- **Task:** MANUVA-58 (platform); one item per manual, plus the demo seed, screenshot script and marketing link (created with the plan)
- **Date:** 2026-10-02
- **Status:** design approved in chat; spec awaiting review

## 1. Outcome

Anyone, customer or prospect, can read a complete manual for every Manuva module at
`https://app.manuva.app/help`, found from the marketing site, from inside the app and from search
engines. Each manual matches what the app does today, and stays that way because it lives beside the
code it describes.

**Success looks like:**

- 11 module manuals are live at public URLs, with no login.
- Every manual follows the same shape as the Purchasing & Xero manual written on 2026-10-02 (Claude Docs).
- Every in-app help link and every old `/app/help/...` address lands on the right manual section.
- Screenshots come from a clean demo workspace and can be regenerated with one command.
- A feature change that alters a module updates its manual in the same PR, enforced by a CLAUDE.md
  rule and by tests that fail on broken links and missing images.

**Decided in chat (2026-10-02):**

| Question | Decision |
|---|---|
| Who reads it | Anyone: public, linked from the marketing site and from inside the app |
| Where it lives | This repo, served by the app at `app.manuva.app/help` (approach A) |
| Screenshots | Yes, captured from a seeded demo workspace |
| Existing 26 articles | Folded into the manuals; old URLs redirect |

## 2. What the help centre contains

### 2.1 The manuals

| # | Slug | Manual | Covers |
|---|---|---|---|
| 1 | `getting-started` | Getting started | Company details, inviting your team and roles, locations, connecting Shopify, first product |
| 2 | `products-and-boms` | Products & BOMs | Products, variants, BOM editor, versions, retail items, costing |
| 3 | `components-and-templates` | Components & templates | Component catalogue and filter rail, costs, component packs and labour routings |
| 4 | `inventory-and-warehouse` | Inventory & warehouse | Stock levels, movements, adjustments, bin locations, barcode scanning |
| 5 | `stocktake` | Stocktake | Count sessions, counting, CSV import, discrepancies, commit |
| 6 | `orders-and-shopify` | Orders & Shopify | Order sync, allocation, fulfilment, statuses |
| 7 | `purchasing-and-xero` | Purchasing & Xero | POs, goods inwards, supplier invoices, Xero bills |
| 8 | `suppliers` | Suppliers | Supplier records, lead times, linked components, Xero contacts |
| 9 | `production-planning` | Production planning *(plan-gated)* | Floor plan, shopfloor queue, departments, staffing and capacity, actual time, staff costings |
| 10 | `reports` | Reports | Each report: what it answers, how to read it, export |
| 11 | `workspace-admin` | Workspace admin | Settings (profile, company, team and roles, integrations, locations, appearance), subscription invoices, Activity Log, Trash |

Two placements are settled while drafting from the code, and the result is recorded in the plan's
ledger:

- whether costing belongs in Products & BOMs or Orders;
- whether Suppliers is big enough to stand alone, or folds into Purchasing.

The slug list is otherwise fixed. Renaming a slug after launch costs a redirect.

### 2.2 The shape of a manual

Every manual uses these `##` sections, in this order. A section with nothing true to say is
omitted, never padded.

1. **Lead paragraph** (no heading): what the module is for and who uses it.
2. **How it fits together:** one diagram, plus a sentence of reading.
3. **Task sections**, one per job a user does (e.g. *Entering a supplier invoice*): numbered steps
   with UI text quoted exactly, and screenshots where they help.
4. **Statuses explained:** a table of every status label the module shows, and what moves it on.
5. **Fixing problems:** the exact error messages the app shows, what each means, and what to do.
6. **Who can do what:** a role table, using *(admin)*, *(super_admin)* and *(plan-gated)* markers.
7. **Common questions.**

## 3. Architecture

### 3.1 Routes and files

```
src/app/help/
  layout.tsx            public frame: logo, search, "Open Manuva", footer
  page.tsx              index: manual cards (Getting started first) + search
  [manual]/page.tsx     one manual: header, contents list, MDX body
  help.module.css
src/content/help/
  getting-started.mdx … workspace-admin.mdx   one file per manual
  manuals.ts            registry: ordered list of manuals with their meta
  redirects.ts          old /app/help slug -> new /help/<manual>#<anchor>
src/lib/help/
  headings.ts           slugify + extract `##` headings from MDX source
  search.ts             pure filter over manuals and headings
src/components/help/    MDX building blocks (see 3.3)
mdx-components.tsx      maps MDX elements to components; h2 gets its anchor
public/help/<manual>/*.png    screenshots
```

- `/help` sits outside `/app`, so `src/proxy.ts` (matcher `/app/:path*`) never runs on it, and no
  login is needed. The app already serves public pages this way (`/pricing`, `/privacy`).
- `[manual]/page.tsx` uses `generateStaticParams` from the registry and `dynamicParams = false`, so
  every manual is prerendered at build and an unknown slug is a 404.
- The public frame uses the Manuva design system tokens, and works in light and dark themes through
  the existing root `ThemeProvider`.

### 3.2 Content format: MDX

- **Package:** add `@next/mdx` (with `@mdx-js/loader`, `@mdx-js/react` and `@types/mdx`), the
  official Next.js MDX support. `next.config.ts` gains `pageExtensions` and the MDX wrapper. No
  custom remark or rehype plugins, so Turbopack needs no extra configuration.
- **Meta:** each file exports
  `export const meta = { title, description, order, planGated? }`. `manuals.ts` imports each file's
  meta and default export; that list is the single source of manual order and titles.
- **Headings and contents list:**
  - `headings.ts` exposes `slugify(text)` and `extractHeadings(source)`, which reads the `##` lines
    of a manual's MDX source at build time (`fs.readFileSync`, as `/privacy` already does).
  - `mdx-components.tsx` renders `h2` with `id={slugify(text)}`, so anchors and the contents list
    come from the same function and cannot disagree.
  - A test enforces that `##` headings are plain text, because a heading with markup would not slug
    predictably.

### 3.3 Building blocks

| Component | Use | Notes |
|---|---|---|
| `Steps` / `Step` | Numbered procedures | Moved from `src/app/app/help/_ui/` |
| `Callout` | Tip / info / warning | Moved from `src/app/app/help/_ui/` |
| `Screenshot` | One captured image with caption | `next/image`, required `alt`, fixed width/height; until its file exists it renders a labelled placeholder (PRs 2–3) |
| `Diagram` | A module's "how it fits together" picture | One SVG React component per manual in `src/components/help/diagrams/`; tokens only, `role="img"` + `aria-label` |
| `StatusTable` | Status label, meaning, what moves it on | Status shown with the app's `StatusBadge` |
| `RoleTable` | Action against role columns | Plain table composing `_ui/table.module.css` |

Plain Markdown covers the rest: paragraphs, lists, tables, bold for UI text, inline code for values.

### 3.4 Index and search

- `/help` shows the 11 manuals as cards in registry order, with Getting started first.
- A client-side filter box searches manual titles, descriptions and `##` headings, and links straight
  to `/help/<manual>#<anchor>`. The data is built server-side and passed as props; `search.ts` is a
  pure function. There is no search service and no full-text index.

### 3.5 Links from the app

- **HelpLink:** changes from `slug` to `to="<manual>#<anchor>"` and builds `/help/<manual>#<anchor>`.
  It opens in a new tab (`target="_blank"`, `rel="noopener"`) so a user mid-task keeps their work.
  The five existing uses (Inventory, Orders, Stocktake, Purchasing, Planning floor) are repointed.
- **Top bar:** the Help menu item goes to `/help`, also in a new tab.
- **Old addresses:** `next.config.ts` `redirects()` sends `/app/help` to `/help`, and each of the 26
  old article slugs to its new section, as permanent redirects. The map lives in
  `src/content/help/redirects.ts`. Next runs config redirects before the proxy, so a signed-out
  visitor following an old link is not sent to login first.
- **Removed:** `src/app/app/help/` (the 26 article pages, `_registry.ts` and its tests) and the
  `/app/help` entry in `route-meta.ts`.

### 3.6 Search engines

- Each manual sets `title`, `description` and a canonical URL `https://app.manuva.app/help/<manual>`
  (from `NEXT_PUBLIC_APP_URL`).
- `src/app/sitemap.ts` lists `/help` and every manual. `public/robots.txt` keeps its existing lines
  and gains `Sitemap: https://app.manuva.app/sitemap.xml`. It already allows everything outside
  `/app/`.

### 3.7 Marketing site

One PR on `KasperPac/ManuvaMarketingBold` adds a **Help** link to the nav and footer, pointing to
`https://app.manuva.app/help`. Proxying `manuva.app/help` to the app is out of scope (section 8).

## 4. Screenshots and the demo workspace

### 4.1 Demo workspace

- **Company:** a fictional business, **Birchwood Goods Co.**, a small homewares maker selling online.
  No real company, person or brand is depicted.
- **Data:** components, products with variants and BOMs, templates, five suppliers, POs in each
  status, receipts, supplier invoices (draft and posted), orders across statuses, a stocktake
  session, warehouse zones and bins, departments and staff, and some activity-log and trash entries.
- **Plan:** `has_planning_module = true` and an active subscription, so the Production planning
  manual has real screens and the subscription guard never blocks capture.
- **Seed:** one SQL file, `supabase/seeds/help-demo-workspace.sql`.
  - Fixed UUIDs and `on conflict do nothing`, so it can be re-run safely.
  - It uses the app's own database functions wherever they exist (inventory movements, receipts,
    posting), so stock ledgers and statuses are consistent with what the app would have produced.
  - **Running it writes to the production database** (`svhaotzrtfbwmphaacjj`, the only database).
    It is applied only after an explicit yes in the session that runs it.
- **Demo user:** a dedicated user who belongs only to the demo tenant, created through the Supabase
  admin API. It never has a password.

### 4.2 Capture script

- `npm run help:screenshots` runs `scripts/help-screenshots/`, a Playwright script (adds
  `@playwright/test` as a dev dependency) against the local dev server.
- **Sign-in:** the script asks the Supabase admin API for a one-time sign-in link for the demo user
  and opens it. No password is typed anywhere. The service-role key reaches the script only through
  `op run --environment <Manuva env>`, never from a file.
- **Capture list:** `scripts/help-screenshots/shots.ts` lists every screenshot: output path, URL, an
  optional setup step (open a dialog, pick a tab), and the element to crop to.
- **Look:** fixed viewport 1440×900, light theme, device scale 2, cropped to the page content. The
  top bar is never captured, so no user names or emails appear.
- **Output:** PNG files in `public/help/<manual>/<name>.png`, losslessly compressed.
- **Re-running** refreshes every image; that is how screenshots keep up with UI changes.

### 4.3 Xero and Shopify

- **Xero:** needs the Xero developer app (client ID and secret in 1Password), the token key, and the
  demo tenant in `XERO_PILOT_TENANTS`. The demo workspace then connects to the Xero Demo Company,
  and the script captures the Manuva side: the card, setup, sync statuses and the sync log. Screens
  inside Xero itself are described in text, not captured.
- **Shopify:** demo orders carry Shopify-style references, but no store is connected. The Shopify
  connection screens show the not-connected state unless a development store is linked later.

## 5. Accuracy and style

- **From the code:** each manual is drafted by reading its module's routes, server actions,
  components and UI strings. Button labels, statuses and error messages are quoted exactly as the
  app shows them.
- **No guessing:** a detail the code does not settle is left out. No invented numbers, timings or
  limits.
- **Review:** a separate reviewer checks every claim against the code before a manual lands.
- **Style guide:** `docs/help-style.md` covers:
  - **Voice:** plain, second person, short sentences.
  - **Spelling:** Australian English in prose. UI text is quoted exactly as the app spells it, even
    where that differs, e.g. "labor".
  - **Section order:** the shape in 2.2.
  - **UI text:** bold for UI text; numbered steps for procedures.
  - **Markers:** *(admin)*, *(super_admin)* and *(plan-gated)*.
  - **Screenshots:** when to use one, and how to write the alt text.

## 6. Keeping it current

- **CLAUDE.md rule** ("Help manuals (keep current)"): a change that adds or amends a feature updates
  that module's manual in the same change, and re-runs the screenshots for pages it touched. This is
  the same mechanism as the existing QA test plan rule.
- **Tests (vitest)** that fail the build of a stale help centre:
  - every manual in the registry has a file, meta and at least one `##` section;
  - `##` headings are plain text and unique within a manual;
  - every `redirects.ts` target and every `HelpLink to=` in `src/` resolves to an existing manual and
    anchor;
  - every `Screenshot` src exists in `public/help/` (from PR 4 on); every entry in `shots.ts` is
    referenced by a manual;
  - `slugify`, `extractHeadings` and the search filter behave as specified.
- **QA plan:** `docs/qa-feature-test-plan.md` gains a Help centre section and a changelog line.

## 7. Delivery

1. **PR 1, platform:** routes, MDX setup, building blocks, search, `HelpLink` change, redirects,
   sitemap and robots, removal of `src/app/app/help`, style guide, CLAUDE.md rule and QA plan. It
   also ships the **Purchasing & Xero** manual, ported from the Claude Docs version, to prove the
   pattern. The manual documents supplier invoices from PR #32, so PR 1 merges after #32.
2. **PRs 2 and 3, manuals:** the remaining 10 manuals in two batches of five, each with screenshot
   placeholders.
3. **PR 4, screenshots:** the demo seed, the demo user setup, the capture script and every image.
   The seed is applied to production only after an explicit yes. The Xero shots follow once the Xero
   developer app exists.
4. **Marketing PR:** the Help link on `ManuvaMarketingBold`.

**Tracking:** monday board Manuva (`5099992950`). MANUVA-58 covers the spec and PR 1. The plan
creates one item per manual, plus one each for the demo seed, the capture script and the marketing
link. Commit messages and PR titles carry the task code.

## 8. Out of scope

- A hosted search service or full-text index.
- Serving the help centre at `manuva.app/help` (a proxy from the marketing site can be added later
  without moving content).
- Screenshots of Xero's own screens, and any video.
- Translations, and versioned help for older releases.
- An in-app slide-over help panel; help opens in its own tab.

## 9. Risks

| Risk | Mitigation |
|---|---|
| `@next/mdx` behaves differently under Next 16 / Turbopack | No custom plugins; PR 1 proves it with `next build` before any manual beyond the first is written |
| The seed's database functions expect an authenticated tenant context | Where a function needs one, the seed sets the same context the app does, or inserts directly with a comment explaining why; verified by reading the stock ledger back |
| Manuals drift from the code after launch | CLAUDE.md rule plus link, anchor and image tests |
| Screenshots go stale | One command regenerates them all from the capture list |
| A manual describes a feature that is not merged yet | Each content PR is checked against `main` at merge; Purchasing & Xero waits for #32 |
