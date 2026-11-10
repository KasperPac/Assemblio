# MANUVA-117 — Reports layout and accent comparison

Date: 2026-10-13
Author: kasper.simonsen@pac-technologies.com.au
Agent: Codex
Branch: `fix/manuva-117-content-accents`
Worktree: `C:/dev/Assemblio-bold-release`
Monday item: `3279531692` on Manuva / Software Automation.

User reported Reports looked wrong, then requested accents beyond the bold header,
and explicitly asked to view restrained and expressive examples side by side in intent.
They then preferred constrained styling and reconsidered bold marketing colours
for a professional app. Prepared C with neutral headers, compact Inter typography,
quiet cards/rules and a small navigation marker in response.
Reproduced the live defect in their existing Chrome Manuva tab, already viewing
Pac-Technologies. No auth/session values were read or exported. The page wrapper
adds a 32px vertical gap and caps its cover at 1168px while the topbar is 1678px.

Prepared a local layout correction, shared index accent scope and two real-renderer
previews. A uses fine rules/small labels/coloured links; B adds tinted heading/card
areas and stronger typography. Fixture inputs are identical; backend actions and
tenant writes are not connected. Published domain token names and dark shades are
used; neutral surfaces, status colours and dialog resets are preserved in the draft.

Added a reusable preview generator in `scripts/`, comparison screenshots and a
design-review README. Both variants were inspected in Chrome, with four-theme band
geometry and normal-link contrast checks. TypeScript passes. The live deployment
has not changed. C was visually inspected and has no content hero band, a 28px
title and no horizontal overflow in four themes. Normal link contrast is at least
5.79:1. The user prefers the professional direction; applying it across shared
components/pages remains future work. Existing source changes implement the
initial A draft; C is currently isolated in the preview generator.

Interactive preview helper listens on localhost:3218. The original live app tab is
left on Reports; all three comparison tabs are marked as deliverables. Source/docs
and protected originals are preserved; no Git push or production deploy.

Resume from `fix/manuva-117-content-accents` in this worktree. Review C with the
user, then replace the initial accent draft with the shared professional treatment,
update design-system/page-map documentation, verify and deploy the chosen result.

Validation: TypeScript, targeted ESLint on Reports/AppContent/preview generator,
and `git diff --check` pass. Including the app layout in ESLint exposes its
pre-existing `any` at the planning flag and two unused action imports; verified
these exist in HEAD before this change. No backend behaviour was changed.
