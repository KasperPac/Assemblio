# Marianne's Hair onboarding

Author: Kasper Simonsen (git identity); agent: Codex.
Task: MANUVA-113; date: 2026-10-12.

Created and read back tenant `14e93c7c-06bd-4af8-b0a6-55edfed55cc7` in the existing
production Supabase project using the existing tenant/subscription contract and a
verified super-admin identity. Name: Marianne's Hair; currency AUD; timezone
Australia/Brisbane, confirmed by the user. Starter trial expires 2026-11-11;
default location is Salon. The initial Sydney assumption was corrected before handoff.
The create_tenant audit record exists. No Shopify or Xero connection exists.

Prepared an admin-role tenant invitation for `marianneshair@hotmail.com`, expiring
2026-10-19. No invitation email was sent, as the user requested. Refresh its expiry
before sending through the existing invitation flow. No user membership exists yet.
The invitation token was generated only at runtime and never printed or written
to a local file.

Square connection tables are absent in production; only the retail foundation has
been implemented. The user approved the remaining Square schema and signed webhook
implementation. Work continues in `C:/dev/Assemblio-square-marianne`, branch
`feat/manuva-113-square-onboarding`, based on the Xero staging branch. Originals and
existing edits in the main checkout remain untouched.

Xero PR #32 is merged into `chore/manuva-44-45-xero-cleanup`; PR #31 to main remains
open. Production is main at `63416549`, deployed 2026-09-30. Xero runtime variable
names are absent from the app's 1Password Environment. Account-owner authorization
and runtime configuration are still required. Never describe either provider as
connected until OAuth and live verification succeed. No push or release is authorized
automatically.

Verification: tenant, subscription, location, empty memberships, empty Shopify and
Xero connections, create_tenant audit and prepared invitation were read back.
An initial verification used the obsolete table name shop; the corrected check used
shopify_store. A separate Auth listUsers query failed after provisioning read-back;
it does not establish whether the supplied administrator email already has an account.

Implementation now includes encrypted Square OAuth credentials and refresh leases,
signed durable webhook intake, catalog/location/product mappings, custom sale
resolution, idempotent retail consumption, opening-count gating and guarded
reconciliation/stock pushes. Existing inventory functions and Shopify writes were
preserved. Confirmed human history specifies SKU-first matching; the older agent
spec's barcode-first prose does not override that choice.

Review found and fixed reservation double subtraction, stale counts undoing newer
sales, incomplete-order mapping, unresolved custom sales, uncertain write responses,
and expired worker leases. Absolute non-echo counts with reservations require
manual review rather than changing the locked inventory semantics. Square refunds
are not an automatic stock return or financial integration.

Scratch PostgreSQL/PGlite applied the migration twice and passed 77 explicit SQL
assertions. Docker was unavailable, so leases/CAS were verified sequentially,
without an independent multi-process race run. The additive production schema has
not been applied. Live Square/Xero OAuth remains unverified because the user
confirmed neither developer app is registered.

Build verification initially used a shared node_modules junction; replacing it
disturbed the original checkout's generated dependencies. Both checkouts were
restored using their unchanged lockfiles. Read-back confirmed the original Next
package exists and all 62 protected repo source hashes still match the migration
baseline. Original user edits remain unchanged. A 1Password runtime-injection
build attempt later timed out at desktop authorization; no secret values were
printed or saved.

The optional webpack build rejects two pre-existing print selectors in report
and warehouse CSS modules; those files were not changed. Follow-up MANUVA-114
records the issue. Default build and final test outcomes are recorded below when
verification finishes. The final full application suite passed 1,070 tests,
with 15 pre-existing environment-dependent database tests skipped.

The default Turbopack production build compiled and generated all 146 routes,
including Square OAuth/webhook/cron, management and legacy in-app help. TypeScript
and changed-file ESLint passed. A final incremental-search/currency guard change
was followed by targeted verification and a repeat build. Sales now use an
updated-at checkpoint with four-day overlap, skip already consumed orders, and
replay resolved older pending orders locally. The customer remains ready for
account setup; developer registration, production schema/release and live Sandbox
then account-owner verification are still outstanding. The public help branch is
not merged, so Square help was added to the existing in-app registry rather than
creating a partial public-manual tree.

Final verification: default production build passed after the last code changes;
changed-file ESLint and TypeScript passed; 92 targeted Square/help tests passed;
77 database assertions passed. The full suite's 1,070 pass count precedes the final
four targeted checkpoint/currency tests. Independent backend review found no
remaining blocking code findings. Authenticated browser and real provider QA were
not performed. All 62 protected source hashes matched, and the original checkout's
pre-existing git edits remained unchanged. Implementation is committed locally on
the isolated branch; no push or deployment. MANUVA-113 remains blocked on real
provider registration/configuration and rollout; it must not be marked Done yet.
