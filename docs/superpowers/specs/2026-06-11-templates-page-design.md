# Templates Page: Replace BOM Page, Labor Templates, Dynamic Linking

**Date:** 2026-06-11
**Status:** Approved

## Problem

1. The Bills of Materials page (`/app/bom`) duplicates functionality that already
   lives on variant detail pages (version status switching, set-active, line
   quantity editing). It adds no unique value.
2. BOM templates (`/app/bom/templates`) only cover components. Labor/routing
   operations (`product_bom_labor`) have no template concept, so routings are
   re-entered per BOM.
3. Templates are one-time copies. When a template changes, BOMs created from it
   silently drift; there is no way to propagate updates.

## Decisions

- **Full replacement:** sidebar "Bills of Materials" becomes "Templates" →
  `/app/templates`. `/app/bom` and `/app/bom/templates` pages are deleted and
  redirect to `/app/templates`.
- **Two template types**, presented as tabs: Component Templates and
  Labor & Routing Templates.
- **Labor templates have two modes:** `basic` (departments + operations only;
  times filled per BOM) and `advanced` (all labor-line fields).
- **Dynamic linking applies to both template types.** A per-template toggle.
- **Merge rule on publish:** template wins for its own lines (regenerated from
  the template, manual quantity overrides reset, manually deleted template
  lines re-added); manually added lines are kept.
- **Publish is explicit:** edits accumulate; a "Push update to N BOMs" button
  opens a confirmation dialog listing affected BOMs with deselectable
  checkboxes (all pre-selected).
- **New versions inherit status:** active → new version active, old archived;
  draft → new draft.
- **Provenance via columns** (approach A): one component template + one labor
  template link per BOM; line-level `source_template_line_id`.
- **Labor template consumption included:** "Apply template" action on the
  variant page labor section.

## Design

### 1. Data model (one idempotent SQL patch, applied manually before deploy)

New tables (RLS mirrors `bom_template` tenant policies):

```sql
create table public.labor_template (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  name text not null,
  description text,
  mode text not null default 'basic' check (mode in ('basic', 'advanced')),
  is_linked boolean not null default false,
  lines_updated_at timestamptz,
  last_published_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.labor_template_line (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  template_id uuid not null references public.labor_template(id) on delete cascade,
  department_id uuid not null references public.department(id),
  operation_name text not null,
  sequence integer not null default 1,
  setup_hours numeric not null default 0,
  run_hours_per_unit numeric not null default 0,
  admin_hours_per_unit numeric not null default 0,
  electricity_kwh_per_unit numeric not null default 0,
  gas_units_per_unit numeric not null default 0,
  blocked_by integer[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);
```

Modified tables:

```sql
alter table public.bom_template
  add column is_linked boolean not null default false,
  add column lines_updated_at timestamptz,
  add column last_published_at timestamptz;

alter table public.product_bom
  add column component_template_id uuid references public.bom_template(id) on delete set null,
  add column labor_template_id uuid references public.labor_template(id) on delete set null;

alter table public.product_bom_component
  add column source_template_line_id uuid references public.bom_template_line(id) on delete set null;

alter table public.product_bom_labor
  add column source_template_line_id uuid references public.labor_template_line(id) on delete set null;
```

Notes:

- `on delete set null` everywhere: deleting a template never breaks BOMs; they
  become unlinked.
- Pre-existing BOMs have no provenance and stay unlinked (no backfill is
  possible — `createBomFromTemplate` never recorded the source).
- Basic-mode labor template lines store 0 for all time/utility fields.

### 2. Routes & navigation

- New page `src/app/app/templates/page.tsx` with `?tab=components|labor`
  (default `components`). PageHeader: eyebrow "Products", title "Templates".
- Sidebar: "Bills of Materials" entry → "Templates", href `/app/templates`,
  same position, template/copy-style icon.
- Delete: `src/app/app/bom/page.tsx`, `bom-create-form.tsx`,
  `bom-component-line-form.tsx`, `bom.module.css`, and
  `src/app/app/bom/templates/` (page, template-forms, css; `actions.ts`
  contents move to the new templates route). `src/app/app/bom/actions.ts`
  stays — variant-page components (`bom-editor`, `bom-lightbox`,
  `bom-versions-tab`) import from it.
- Redirects: `/app/bom` and `/app/bom/templates` → `/app/templates`
  (route files that call `redirect()`).
- `route-meta.ts`: `/app/bom*` entries replaced with `/app/templates`.
- All `revalidatePath("/app/bom")` / `revalidatePath("/app/bom/templates")`
  calls updated to `/app/templates`.
- Update links: `bom-lightbox.tsx` create-template link,
  `template-wizard.tsx` hint text.

### 3. Templates page UI

Single column, tab bar under the PageHeader (pill-style buttons writing
`?tab=`), "+ New template" in PageHeader actions (creates the type of the
active tab).

Each template renders as a card:

- **Header row:** name, line-count badge, Linked/Not linked badge, Basic or
  Advanced badge (labor only), amber "Unpublished changes" badge (linked
  templates where `lines_updated_at > last_published_at`).
- **Description** (when present).
- **Line list:** components → name (link), SKU, qty, remove; labor →
  sequence, operation, department, setup hours, run hours/unit, remove.
  Basic-mode cards show dashes for the time columns.
- **Footer:** Edit button (components: existing TemplateLightbox pattern
  moved over; labor: new editor dialog), Dynamic link toggle **with an info
  icon + tooltip explaining linking**, "Push update to N BOMs" button (only
  when linked and unpublished changes exist and N > 0), "Used by N BOMs"
  text, Delete button (warns when the template is in use).

Labor editor dialog: rows of department select + operation name + sequence;
advanced mode additionally exposes setup/run/admin hours, electricity, gas,
notes. Mode is chosen at template creation and switchable on the template
(switching to basic hides but does not erase advanced values).

Tooltip copy for the info icon: "When dynamic linking is on, you can push
template changes to every BOM created from this template. Each push rolls
those BOMs to a new version."

### 4. Dynamic linking & publish

**Link lifecycle:** creating a BOM from a component template, or applying a
labor template, records `component_template_id` / `labor_template_id` on the
BOM and `source_template_line_id` on each copied line. The toggle only
controls whether publishing is offered; provenance is always recorded, so
toggling off and on later still works.

**Change detection:** any template line insert/update/delete sets
`lines_updated_at = now()` on the template. Badge + publish button show when
`lines_updated_at > coalesce(last_published_at, '-infinity')`.

**Affected-BOM list:** BOMs where the template id matches, reduced to the
latest version per variant, excluding variants that no longer exist and
lineages whose latest version is archived. Dialog shows variant title, SKU,
current version + status, and the resulting `vN → vN+1 status` chip.
All checkboxes pre-selected; deselected BOMs are skipped and offered again on
the next publish.

**Publish algorithm** (server action; per selected BOM, independent):

1. Load the latest version of the BOM lineage.
2. Insert new `product_bom` (version + 1), copying both template-id columns.
3. Insert lines:
   - manual lines (`source_template_line_id is null`) copied as-is;
   - template lines regenerated fresh from the current template with new
     provenance ids (for the template type being published; the *other*
     type's lines are copied as-is including provenance).
4. Status: old active → new active and old archived (reuse existing
   set-active semantics); old draft → new draft, old draft left unchanged.
5. After all BOMs: set `last_published_at = now()` on the template.
6. Activity log: one `bom.template_publish` event per updated BOM with
   metadata `{template_id, template_type, bom_id, old_version, new_version}`.

Publishing with zero selected BOMs still stamps `last_published_at`.

### 5. Consuming templates

- **Component templates:** `createBomFromTemplate` and the BOM lightbox
  start-from-template flow record provenance (template id + per-line source
  ids). No other UI change.
- **Labor templates:** variant page labor section gains "Apply template" →
  picker dialog (name, mode badge, operation count). Applying:
  - copies operations into `product_bom_labor` with provenance ids (basic
    mode: zeros for times/utilities);
  - sets `labor_template_id` on the BOM;
  - keeps existing manual operations;
  - if a different labor template was applied earlier, deletes that
    template's provenance lines first (same rule as the merge).

### 6. Error handling

- Publish handles each BOM independently; failures don't abort the batch and
  the result message reports successes and failures.
- Deleting an in-use template warns ("Used by N BOMs — they will keep their
  lines but lose the link") before proceeding.
- Invalid `?tab=` values fall back to `components`.
- The SQL patch must be applied before deploy (new columns are referenced by
  inserts/selects without fallbacks — they are nullable additions to
  existing tables plus brand-new tables).

## Testing

- Vitest unit tests for the pure merge/versioning logic
  (`buildPublishedLines(oldLines, templateLines)` and status inheritance):
  manual lines kept, template lines regenerated, qty overrides reset,
  removed template lines re-added, other-type provenance preserved.
- `npx tsc --noEmit` against known baseline.
- Manual verification: tab switching, template CRUD both types, basic vs
  advanced editor, link toggle + tooltip, publish dialog with deselection,
  version roll + status inheritance on the variant page, labor template
  apply, redirects from old routes.
