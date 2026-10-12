# Marianne's Hair onboarding — MANUVA-113

Customer uses Square POS and Xero; Shopify stays disconnected. The customer tenant
and administrator invitation are prepared in production; the invitation is unsent.
The user approved Square schema and signed-webhook implementation on 2026-10-12.

- [x] Create and read back the tenant: AUD, Australia/Brisbane, 30-day Starter trial,
  default Salon location; prepare the administrator invitation without sending it.
- [x] Add isolated Square channel, protected credentials, location/item mappings,
  durable webhook records and atomic order/count ingestion; verify on scratch Postgres.
- [x] Add tenant-bound OAuth, token refresh and raw-body signature verification;
  verify expiry, session mismatch, malformed signatures and refresh contention.
- [x] Import Square catalog and completed orders, preserving ambiguous/unmatched
  lines; consume stock once through the existing ledger contract after mapping.
- [x] Reconcile counts and retry stock writes; require a confirmed opening count,
  preserve historical sales, avoid echo and late-order double consumption.
- [x] Add admin connection/mapping controls and update QA/help documentation.
- [x] Review changes, run targeted/full tests, TypeScript and build checks; commit
  only reviewed changes. Do not push or deploy automatically.

Live connections still require app registration, runtime variables in the assemblio
1Password Environment, customer OAuth consent and a released build. Xero PR #32 is
merged into the staging branch; PR #31 into main is open. Manuva posts supplier
bills only; Square sales must not be posted a second time to Xero.
