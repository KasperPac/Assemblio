# MANUVA-117 — Products and Components previews

Date: 2026-10-13
Author: kasper.simonsen@pac-technologies.com.au
Agent: Codex
Branch: `fix/manuva-117-content-accents`
Worktree: `C:/dev/Assemblio-bold-release`
Monday item: `3279531692`, Manuva / Software Automation.

User requested Products and Components with the balanced D treatment. Extended
the existing preview generator to render both actual page return trees and their
child components, replacing data queries with labelled Pac-Technologies samples
and actions with preview-only errors. Added `preview-catalog-fixtures.mjs` for
isolated boundary code. Shell navigation switches between the three examples;
filters and sorting are visual-only. No production page files were changed.

Products has a violet identity, softly tinted header/table headings, compact
Archivo title and neutral rows. Components has the blue identity, existing filter
rail and flat table, with low and critical stock styling retained. Fixed the
preview topbar's avatar text to use neutral ink for these two domain colours.
Added a build-only mode to refresh assets without restarting the owned server.

Inspected both in Chrome and all four themes on desktop: 32px headings, correct
selected navigation, no page overflow. Header eyebrow contrast is at least
5.96:1 for Products and 5.75:1 for Components. Saved both viewport screenshots
after a full-page capture timed out. Preview syntax, targeted lint, generation
and whitespace checks pass. Esbuild emits an existing filter-rail composition
display-order warning; desktop rendering was inspected, mobile was not tested.

Local helper: port 3218. Both example tabs are deliverables. No live data access,
tenant writes, production deploy, push, protected-original edits or secret use.
D still awaits visual feedback; the shared app rollout remains outstanding and
MANUVA-117 remains Working on it. Resume from this worktree, select the treatment
from the examples, then replace the initial A draft with shared components/pages
for the chosen direction and verify authenticated app behaviour before release.
