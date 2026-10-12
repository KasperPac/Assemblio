# MANUVA-73 — bold app index headers

Date: 2026-10-12
Author: kasper.simonsen@pac-technologies.com.au
Agent: Codex
Branch: `feat/manuva-73-bold-bands`
Worktree: `C:/dev/Assemblio-bold`
Base: `932164b8` (local Square onboarding implementation, with staged Xero work)
Monday: item `3256730200`, Manuva board `5099992950`, Software Automation.

Resumed the October 2 design handoff at the user's request. Added the scoped bold
foundation, Archivo display/numeral font, exact 18-route index map, joined topbar/header
bands, domain navigation and neutral dialog/menu resets. Notices remain above the band;
record details stay quiet. Applied all 18 headers with existing gates, actions and roles.

Metrics use actual data: distinct below-reorder components, exact receivable PO counts
with tenant-local arrive-today bounds, distinct production order lines, and on-time
processed supplier receipts over equal rolling 90-day windows. Production and receipt
reads paginate past PostgREST's row cap. Missing report data/failed optional metric reads
show a dash, with no invented success rate or historical comparison.

Independent review caught production truncation, unscoped dark-button token changes,
unequal report windows and long tenant-name overflow. Those were corrected. Source
line endings were retained on unchanged lines to keep the diff reviewable.
Updated design guidance, QA and four affected existing in-app help articles. This base
does not contain the separate public-manual branch or `docs/help-style.md`; no manuals
were removed or fabricated. The former token-library path is unavailable; current
references are `C:/dev/ManuvaDesignSystem` and the marketing bold handoff.

Verification:
- Full suite: 1,122 passed, 15 environment-dependent database tests skipped.
- Final focused route/header/metric/help suite: 59 passed.
- Production Turbopack build and TypeScript check passed after metric/pagination fixes.
- Full lint retains baseline debt (139 base errors, 138 at initial final comparison);
  34 changed TypeScript files/helpers checked against baseline, no new lint errors.
- Browser fixture: actual PageHeader, Topbar, SidebarNav and compiled CSS, production
  Archivo fonts, Pac-Technologies content; 7 domain/default variants × 4 themes ×
  3 widths (1440, 1024, 390) passed joined-band, contrast and clipping checks.
- Dialog and avatar-menu neutral resets passed all four themes; quiet detail fixture
  has zero bands. A 180-character tenant name fits at all three widths.
- No signed-in live-data walkthrough was performed; fixture rendering stubs navigation
  and server-action boundaries and does not prove backend/action integration.
- All 62 protected original repo files match the migration baseline. Main checkout's
  existing user edits remain present. No secrets, auth invitations or production changes.

Tracked follow-ups (not changed in this UI rollout):
- MANUVA-115, item `3276523621`: existing Floor Board department read lacks an explicit
  tenant predicate; review RLS/context and seek approval before policy changes.
- MANUVA-116, item `3276537518`: existing Lead time accuracy detail uses different
  eligibility/date rules from the corrected overview; align the detail and exports.
- MANUVA-114 remains the pre-existing optional webpack print-selector build issue.

Publishing is pending user instruction: this branch depends on local Square and staged
Xero commits. Review the stacked history before selecting a release base. Do not push,
merge or deploy automatically. Marianne's invitation remains unsent and provider apps
still need registration/configuration before live Square/Xero authorization.
