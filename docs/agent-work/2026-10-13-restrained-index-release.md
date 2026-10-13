# MANUVA-117 — Restrained index design released

Date: 2026-10-13
Author: kasper.simonsen@pac-technologies.com.au
Agent: Codex
Branch: `fix/manuva-117-content-accents`
Worktree: `C:/dev/Assemblio-bold-release`
Monday item: `3279531692`, Manuva / Software Automation.

Approved balanced D is live at `https://app.manuva.app`. Source commit `e6637dac`.
Vercel target verified: kasperpacs-projects/assemblio,
`prj_grIAflKeWphIhIJCqkYSbMpWgMfe`.
Deployment: `dpl_5kE3bqmd7trAJMcuYSBQCJ9aoR9F`,
`https://assemblio-p1h4c2f7i-kasperpacs-projects.vercel.app`.
Created with production environment configuration and `--skip-domain`; waited
for READY, checked the candidate, then promoted. Custom-domain inspection confirms
`app.manuva.app` resolves to this deployment. No push or merge.

Upload inspection included all 711 tracked src/public runtime files and no
protected/local agent config, environment files or root migrations. All 62
protected originals match the migration baseline. No credentials were read,
downloaded or persisted; existing remote environment configuration was used.

Candidate checks: login/privacy 200; app, Products, Components, Reports, Inventory
and Purchasing redirect unauthenticated callers with 307. Three login CSS assets
contain domain/content scopes and the neutral table reset. Promoted login/privacy
also return 200. Error and fatal log queries for this deployment returned zero
entries during the verification window. This is a point-in-time check.

Signed-in Chrome verification used the existing Pac-Technologies viewing context,
without reading/exporting cookies or session values. Reports matches the approved
treatment. Products shows its real catalogue, and searching SCADA produces one
result from twelve. Components retains its filter rail/table and selecting Low
produces two results from sixty. Inventory/Purchasing compact metrics render;
all inspected index screens have 32px titles and no page overflow. No create,
import, movement, tenant-switch, provider-auth or other business action was sent.
The browser is left on unfiltered Products. Live screenshots are in the design
review folder; local preview screenshots remain historical examples.

Local validation: TypeScript/targeted lint/production build pass; 736 tests pass,
15 environment-dependent database tests skip. Shared Products/Components/Reports
renderers were checked in all four themes and at 390px; neutral dialog reset was
verified. This release does not deploy staged Square/Xero integration work, schema
changes or Marianne's invitation. Those earlier open threads remain separate.

Rollback candidate captured before release:
`dpl_4fE5fnQiDGUfnuMUNa5RqTpJdHNq`,
`https://assemblio-eeqda6wh4-kasperpacs-projects.vercel.app`.
Use the verified project/scope and promote that deployment if rollback is needed.
