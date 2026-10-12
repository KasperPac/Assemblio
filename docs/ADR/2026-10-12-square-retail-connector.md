# Square retail connector and customer onboarding

Status: accepted for implementation by the user on 2026-10-12; live rollout pending.
Task: MANUVA-113, continuing MANUVA-27's retail foundation.

Marianne's Hair needs Square POS and Xero without Shopify. Reuse the existing
retail-item/BOM and append-only movement contracts. Manuva remains inventory source
of truth; Xero receives supplier bills, not a second copy of Square revenue.

Add tenant-isolated channel/connection, location/item mapping, durable webhook,
stock-write, order-line staging and count-watermark tables. Keep encrypted OAuth
credentials in a separate server-only table and app secrets in 1Password. Anonymous
and authenticated roles cannot execute connector writes or read credentials. Bind
OAuth state to tenant, user, nonce and expiry; validate webhooks against the exact
registered URL and raw body. SQL composite keys enforce tenant ownership.

Use a separate staging line identity because existing order_line requires a variant
and aggregates a variant per order. Preserve unresolved lines and wait until every
stock line resolves before consuming through apply_sale_consumption once. Custom
or missing-catalogue lines become operator-resolvable sale aliases; they never
become independent Square stock-write targets. Confirmed human history's SKU-first
matching takes precedence over the older agent-authored barcode-first spec prose.

Outbound stock begins disabled and requires an opening stock count. Preserve the
first baseline across pause/reconnect; earlier sales are historical. Exact response
timestamps distinguish write echoes from independent counts. Real count watermarks
prevent late orders from consuming stock already reflected by a count. Refuse
non-echo absolute counts with reservations rather than changing locked reservation
semantics or subtracting reservations twice. Reject shared-component full-stock
targets and non-1:1 retail BOMs. Refunds are not automatic stock returns.

Serialize sync/setup with expiring leases and fence stale workers. Search updated
orders incrementally with a four-day overlap, and replay resolved older pending
orders from immutable local staging. Pagination/time-budget failures remain
retryable. Square and Manuva cannot share a distributed transaction; scheduled
reconciliation and stable request identities repair timing differences.

Contracts: [additive migration](../../supabase/patches/2026-10-12-square-connector.sql).
Operations: [Square guide](../square-integration.md) and
[customer handoff](../marianne-onboarding.md). Database verification reruns the
migration and exercises inventory, RLS, replay, echo and lease invariants. Production
migration, Sandbox/live OAuth and authenticated browser QA remain rollout checks.
