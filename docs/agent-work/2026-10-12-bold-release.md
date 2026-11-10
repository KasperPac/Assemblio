# MANUVA-73 — production release

Date: 2026-10-12
Author: kasper.simonsen@pac-technologies.com.au
Agent: Codex
Authorization: the user explicitly said "you can deploy" after reviewing the bold rollout.

Prepared `release/manuva-73-bold-bands` in `C:/dev/Assemblio-bold-release` from the
verified current production commit `63416549`. Applied only the bold UI/metric change
from `c42b7767`, resolving differences to retain production's existing actions and
not pull in unreleased Square/Xero integration code or migrations. Release code is
`41321f8c`. The staged Square/Xero branches and original checkout remain intact.

Vercel target verified through project inspection: `kasperpacs-projects/assemblio`,
project `prj_grIAflKeWphIhIJCqkYSbMpWgMfe`, public app domain `app.manuva.app`.
Used CLI source deployments with existing production environment configuration;
no environment values were downloaded or persisted. No Git push or merge.

Validation on the production-based branch: 736 tests passed, 15 environment-dependent
DB tests skipped; local production build passed. Original component/theme fixture checks
remain applicable to the unchanged shared band files. Signed-in live-data walkthrough
is not part of the completed validation evidence.

Upload rules exclude protected/local agent files and environment files. Initial candidates
exposed unanchored directory exclusions: nested `src/lib/supabase` and `public/docs` were
omitted. Fixed the rules to root-only `/supabase` and `/docs` before promotion. Final dry
upload included every one of 710 tracked `src`/`public` runtime files, no protected/local
config or environment paths, and no root SQL migrations. First failed candidate was
`dpl_D52ix6Thgoz3U9y7UVUzNJ8fr5VJ`; the second candidate was not promoted because its
privacy document was missing. Production custom-domain traffic remained on the old release.

Final candidate: `dpl_4fE5fnQiDGUfnuMUNa5RqTpJdHNq`,
`https://assemblio-eeqda6wh4-kasperpacs-projects.vercel.app`.
Remote production build reached READY. Before promotion, `/login` and `/privacy`
returned 200 (including the real privacy document); `/app`, Inventory, Purchasing,
Reports and platform indexes returned 307 to the existing login route for an
unauthenticated request. The served CSS contained all six domain tokens and Archivo.

Promoted this candidate after the checks passed. Vercel alias read-back confirms
`app.manuva.app` and `assemblio-one.vercel.app` point to the final deployment. Repeated
the login/privacy/redirect and CSS checks on the public domain successfully. Runtime
error/fatal query for this deployment returned no error groups during verification.
Only the bold release is published; no new Square/Xero code, schema, auth-policy
changes or invitation sends were included. Git branches remain local and unpushed.

Rollback candidate captured before deployment:
`dpl_7b82cuiCSP17mLBykGuo5SyQk5Ed`,
`https://assemblio-af8o6b186-kasperpacs-projects.vercel.app`.

All 62 protected original repo files still match the migration baseline. Existing
user edits remain. Marianne's invitation remains unsent and provider registration
is still required for real Square/Xero connections.
