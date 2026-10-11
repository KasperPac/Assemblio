# Assemblio / Manuva

Multi-tenant manufacturing SaaS: Shopify ingestion, BOMs, component inventory,
production orders, purchasing, suppliers, stocktakes, and warehouse/bin locations.
Stack: Next.js App Router, TypeScript, CSS Modules, Supabase Postgres/Auth/RLS.
Use `package.json` for installed versions. Production: `https://manuva.app`; app: `/app`.

Read [agent history](docs/agent-history.md) for the project timeline, confirmed decisions, gotchas, and open threads.
Read [migration notes](docs/codex-migration.md) for setup, permission mappings, plugin dependencies, and unmapped behavior.
Read [project reference](docs/codex-project-reference.md) when working on domain tables, branding, or legacy task scripts.
If `AGENTS.local.md` exists in a directory you are working in, read it explicitly; keep it untracked.

## Backend contracts and locked policies

- Before implementing features, read `supabase/schema.sql` and relevant `supabase/patches/*.sql`.
  Use the schema's actual fields/table names; never guess. Update docs and ADRs for approved contract changes.
- Supabase is the source of truth for balances and availability. Shopify inventory is reference only.
  Assemblio does not adjust Shopify inventory levels or perform Shopify writes.
- Every inventory change writes an append-only `inventory_movement` and maintains `inventory_balance`.
  Never update a balance without a movement.
- Every domain read/write is constrained by `tenant_id`. Derive tenant context from the authenticated
  session/server mapping using `getServerTenantContext()` from `@/lib/tenant/context`; never trust client tenant IDs.
- Tests/fixtures use **Pac-Technologies**, never **Fabulous**.
- Allocation uses the tenant default location, with no splitting. Availability = on-hand minus reserved.
  Reservation movements use negative deltas.
- Webhook processing must be idempotent.
- Say variant for `shopify_variant`, component for `component`, and BOM for
  `product_bom` plus `product_bom_component`; use actual table names.
- Server actions are route-local `actions.ts` files. Admin checks include both `admin` and `super_admin`.
  Activity logging uses `activity_log.event` and JSON `metadata`.

Ask before changing tenant enforcement, movement semantics, Shopify write scopes/inventory writes,
webhook topics/verification, schema/migrations, or adding a datastore beyond Supabase.

## Product UI and documentation

- When writing UI, read `docs/design-system.md`, then
  `C:/dev/manuva-tokens/Manuva Design System/README.md` and `colors_and_type.css` in that directory.
  Follow the Manuva design system and its token names (`--brand-1`, `--bg-card`, `--ink-strong`);
  do not invent tokens or hardcode colors. Asset details are in the project reference.
- For every new/amended feature, update `docs/qa-feature-test-plan.md` in the same change:
  entry point, behavior, testable checkboxes, and `(admin)` / `(super_admin)` / `(gated)` markers where applicable.
  Add a dated changelog line: `YYYY-MM-DD — added|amended <feature>: <summary>`.
- For behavior changes, update the affected public help manual in `src/content/help/*.mdx`, following
  `docs/help-style.md`: steps, quoted UI labels, statuses, errors, and role table. New modules also need
  entries in `src/content/help/manuals.ts` and `src/content/help/content.ts`.
- Reports about the app's build use the house design system at `C:/dev/Kasper Simonsen Dev DS`;
  read its `README.md` and `SKILL.md` first. Product screens use Manuva's design system.

## Working conventions

- Propose a brief plan for non-trivial work; implement incrementally and run checks appropriate to the change.
  Allocation changes require math/rollup tests; webhooks require idempotency tests; balance changes require
  movement/balance invariant tests. Keep scripts in `scripts/`, non-interactive by default.
- Track work on **Manuva**, board `5099992950`, workspace **Software Automation** (`5217812`).
  Preserve its existing `MANUVA-n` codes and status labels until explicitly migrated. Derive new ordinals
  from `max(Task No) + 1`; verify status writes by read-back. Use topical groups and first-class items;
  status carries lifecycle. Global task rules take precedence over legacy subitem/script notes.
  Include verified task codes in commits and PR titles; never invent one when tracking is unavailable.
- Use relevant skills from `.agents/skills/`; use `competitor-analysis-codex` and `security-audit-codex`
  for adapted workflows. Their legacy copies are link targets for protected Claude files; never edit those originals.
  Inherited third-party plugin capabilities are listed in migration notes.
- At session start, read the latest relevant handoff in `~/.claude/handoffs/c-dev-assemblio/` if present,
  and repo handoffs in `docs/`; at work boundaries record actual work in a new `docs/agent-work/` entry.
- Secrets belong in the project's 1Password Environment. Reference variable names only; on Windows use
  the beta CLI's `op run --environment <resolved-ID> -- <command>`. Never persist secret values in files/logs.
- Preserve existing user edits. Until the user confirms retirement, do not modify/delete `.claude/`,
  `~/.claude/`, or any `CLAUDE*.md`; do not run config synchronization that rewrites them.
- Review completed changes before declaring them done. Keep delegated work ownership explicit; verify
  blockers/user gates from evidence. Record a handoff before switching context or ending unfinished work.
- When changing SEO JSON-LD, run the installed SEO plugin's schema validator and read its result.
  On Windows use runtime secret injection rather than 1Password local env mounts.
- Keep replies concise: decisions, findings, blockers, changes, and validation.
