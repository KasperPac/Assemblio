# MANUVA-117 — Approved restrained index implementation

Date: 2026-10-13
Author: kasper.simonsen@pac-technologies.com.au
Agent: Codex
Branch: `fix/manuva-117-content-accents`
Worktree: `C:/dev/Assemblio-bold-release`
Monday item: `3279531692`, Manuva / Software Automation.

User approved balanced D after reviewing Products and Components: "yep looks
good, let's do it". Prior deployment authorization remains in the session.
Implemented D in shared PageHeader, topbar and navigation, using the existing
18 exact index map. Headers have a soft domain tint and narrow marker, 32px
Archivo titles (28px mobile), and compact accessible metrics. Reports uses
"Reports" without a poster cover; its delivery performance remains in the card.
Reports' extra wrapper padding/width cap is corrected, sections have domain
markers and cards stay neutral with semantic warnings/health preserved.

Content accents scope existing links/controls and table-heading surfaces to the
index domain. Dialogs and menus restore neutral theme and focus tokens. Detail
route header behavior and business actions/filters are preserved. No schema,
tenant enforcement, inventory semantics or provider integration work changed.
No new Square/Xero implementation or invitation send is included in this release.

Validation: TypeScript and targeted lint pass; production build passes. Test
suite: 736 passed, 15 environment-dependent DB tests skipped. Updated the existing
header contract tests for the new markup/no-watermark and content dialog reset.
Inspected real shared Products/Components/Reports renderers without prototype
styling in all four themes: no page overflow, 32px titles, no poster bands. At
390px, all three have 360px header width, 28px titles and no page overflow.
Opened the real product dialog UI with fixture actions: its brand/card tokens
match the neutral theme. Mobile viewport override was reset afterward.

Vercel project and current production verified: kasperpacs-projects/assemblio,
`prj_grIAflKeWphIhIJCqkYSbMpWgMfe`, current deployment
`dpl_4fE5fnQiDGUfnuMUNa5RqTpJdHNq` at
`https://assemblio-eeqda6wh4-kasperpacs-projects.vercel.app` (rollback candidate).
Existing production environment configuration is used remotely; no secrets
were read, downloaded or written locally. Protected originals and existing user
edits remain untouched. No push or merge.

Deployment is the next step, after upload-file review and source commit.
This entry records implementation validation, not a completed release. Final
deployment evidence will be recorded separately after promotion/read-back.
