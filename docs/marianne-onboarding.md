# Marianne's Hair — operator handoff

Task: MANUVA-113. Customer workspace already exists; provider connections do not.

| Setting | Verified value |
| --- | --- |
| Tenant | `14e93c7c-06bd-4af8-b0a6-55edfed55cc7` |
| Currency / timezone | AUD / Australia/Brisbane |
| Plan | Starter, trial ends 2026-11-11 |
| Default location | Salon |
| Administrator | `marianneshair@hotmail.com`; prepared invitation, unsent |
| Shopify | No connection |

The user confirmed on 2026-10-12 that neither developer application is registered.
Register **Manuva** as the application; the customer authorises that application
against its merchant/accounting organisation afterwards. Registration is separate
from Marianne's Manuva administrator invitation.

## Square registration

Use the [Square Developer Console](https://developer.squareup.com/apps), following
the [official account/application guide](https://developer.squareup.com/docs/get-started/create-account-and-application).
Register the production callback `https://app.manuva.app/api/square/callback`.
Configure a webhook at `https://app.manuva.app/api/square/webhook` for
`order.created`, `order.updated`, `order.fulfillment.updated`,
`catalog.version.updated`, `inventory.count.updated`, and
`oauth.authorization.revoked`. The configured URL must match signature validation
exactly. Use a separate Sandbox app/configuration for Pac-Technologies testing.

Store values directly in the **assemblio** 1Password Environment. Resolve its ID
through the 1Password MCP; never save the ID or credential values in repo files:

- `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`
- `SQUARE_REDIRECT_URI`, `SQUARE_WEBHOOK_URL`, `SQUARE_WEBHOOK_SIGNATURE_KEY`
- `SQUARE_ENVIRONMENT`, `SQUARE_PILOT_TENANTS`
- `SQUARE_TOKEN_KEY` (32 cryptographically random bytes, base64 encoded), optional
  `SQUARE_TOKEN_KEY_VERSION` (initially 1)

The production pilot allow-list must include the verified tenant above. Keep the
existing MCP's read-only Sandbox configuration separate; it does not connect this
customer. OAuth requests catalogue/inventory/order/merchant reads plus inventory
writes; it never requests Square catalogue writes or any Shopify access.

After release, the Square account owner uses "Connect Square". Map the trading
location to Salon, resolve all products and sale aliases, complete an opening
stock count in Manuva, then explicitly enable outbound stock updates. Detailed
operator steps and known limits are in [Square integration](square-integration.md).

## Xero registration

Use [Xero My Apps](https://developer.xero.com/myapps) and register a web application
with callback `https://app.manuva.app/api/xero/callback`. The implemented OAuth
flow is described by [Xero's authorization-code guide](https://developer.xero.com/documentation/guides/oauth2/auth-flow/).
Store `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`,
`ACCOUNTING_TOKEN_KEY` (32 random bytes, base64), optional
`ACCOUNTING_TOKEN_KEY_VERSION`, and `XERO_PILOT_TENANTS` in the same Environment.
Include this customer in the pilot allow-list after Demo Company verification.
Do not replace an existing encryption key once credentials are stored.

The existing implementation requests `openid`, `profile`, `email`,
`offline_access`, `accounting.invoices`, `accounting.contacts`, and
`accounting.settings.read`. Manuva sends **supplier bills**, awaiting approval.
It does not send Square sales or financial refunds. Confirm the salon's existing
Square-to-Xero sales arrangement separately; do not create duplicate revenue.
The Xero organisation owner authorises access and selects the correct organisation,
inventory/other-charge accounts and existing tax rates.

## Release and verification

The new Square migration has been verified on scratch PostgreSQL and has **not**
been applied to production. The implementation branch is
`feat/manuva-113-square-onboarding`, based on `chore/manuva-44-45-xero-cleanup`.
Xero PR #32 is merged into that staging branch; PR #31 into main remains open.
Production remains at main commit `63416549` as verified on 2026-10-12.
There has been no push or deployment from this onboarding work.

Before a live connection, release the reviewed changes, apply the additive Square
migration, probe anonymous RPC access, configure runtime variable injection and
schedule `/api/cron/square-sync` with bearer `CRON_SECRET` through the existing
Supabase scheduler pattern. Square retry/renewal processing must run for dormant
connections too. Existing Xero worker/maintenance schedules need their own setup.
Scheduler credentials must use the established protected configuration path.
Never run `vercel env pull` or save plaintext `.env` values in this project.

The Vercel CLI is available through temporary `npx` in this session; installing it
with `npm i -g vercel` is recommended for later deployment/log inspection. This
does not authorise an automatic deployment.

Verify Square in the Pac-Technologies Sandbox and Xero Demo Company first; verify
signature failures, replay safety, mapping, inventory ledger/balance agreement and
supplier-bill posting. A live merchant still needs account-owner consent.
Send Marianne's invitation only when the user asks; refresh its seven-day expiry
if it has expired or rollout is delayed. Its acceptance token must never appear
in documentation, logs or chat.
