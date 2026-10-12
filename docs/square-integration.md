# Square retail integration

In-app customer guide: [Connect Square and map retail stock](../src/app/app/help/getting-started/connect-square/page.tsx),
served at `/app/help/getting-started/connect-square` by the existing help system.
This document also includes operator setup; the newer public manual tree is not
present in this checkout.

Square brings retail catalogue items and completed sales into Manuva. Manuva is
the stock source of truth. Services and other non-stock items are ignored; they
do not consume components. Shopify is optional and does not need to be connected.
Xero receives supplier bills from Manuva, not Square sales. Keep the existing
Square-to-Xero sales arrangement to avoid sending revenue twice.

## Roles

| Action | Member | Admin | Super admin with active workspace |
| --- | --- | --- | --- |
| Connect or disconnect Square | No | Yes | Yes |
| Sync catalogue and sales | No | Yes | Yes |
| Map locations or products | No | Yes | Yes |
| Enable stock updates to Square | No | Yes | Yes |

Square is available only to explicitly allow-listed pilot workspaces. A platform
observer cannot change the connection. An operator with no active workspace
must select one first.

## Connect the account

1. Open **Settings → Integrations**. The Square card shows "Not connected",
   "Connected", "Needs reconnect", or "Not configured" from the current state.
2. Select "Connect Square". The Square account owner signs in to Square and
   authorises Manuva. An invitation to Manuva does not authorise Square access.
3. Check the merchant and environment on "Manage Square". "Sandbox" is for test
   transactions; a live salon needs "Production".
4. Select "Sync Square" to import the catalogue and sales.

"Not configured" requires operator setup before account authorisation. A failed
authorisation displays "Square connection failed. Try connecting again. The
Square account owner must authorise access." Token expiry can require
"Reconnect Square".

Setup changes and sync share a channel lock. "Square sync is running. Wait for
it to finish, then try again." means another sync or administrator is working
on the connection. Wait and retry; a crashed operation's lock expires.

## Map locations and products

1. Open "Manage Square", then "Map location". Choose an active Square location
   and the Manuva location that supplies its stock. Select "Save mapping".
2. Review "Product mappings". Use "Mapping status" to find "unmatched" or
   "ambiguous" entries. SKU matching precedes barcode matching; duplicate
   matches require a manual choice. Manual mappings take precedence.
3. Select "Resolve mapping" and choose one of these actions:
   - "Link existing retail variant": select a retail variant with a 1:1 active
     BOM (one component, quantity 1, and 100% yield).
     Ordinary Square variations consume one retail unit. A converted variation
     consumes the ratio configured by Square from its stockable item and does
     not receive a separate full-stock update.
   - "Create retail item": create a product, variant, component, and 1:1 BOM
     from the Square name, SKU, and barcode. Stock begins at zero.
   - "Ignore non-stock item": enter a reason, such as a hair service. Ignored
     items do not consume stock.
   - "Remove link": return the item to the unmatched queue.
4. Select "Save mapping". Then select "Sync Square" to retry orders waiting
   for mappings.

Every order waits until all its stock lines are mapped or ignored. Manuva does
not partially deduct an order while another line remains unresolved. Services
are ignored during import. A location or product mapping change pauses outbound
stock updates; check counts and confirm before re-enabling them.

The mapping list has 50 items per page. Choices show up to 500 retail variants;
use "Find retail variants by SKU" to narrow them. A missing default Manuva
location prevents creating retail items. The error reads "Couldn't save that
product mapping. Check that a default Manuva location is set, then try again."

The "Source" column distinguishes "Catalogue" products from "Sale line"
entries. A completed sale can contain a custom item or a deleted/missing
catalogue variation. Manuva keeps that sale line in the unmatched queue so the
order cannot silently skip its stock consumption. Use "Resolve mapping" to
link it to the retail stock actually sold, create a retail item, or ignore a
service/non-stock line with a reason. These sale-only aliases may share a retail
variant with its catalogue mapping; they consume stock without receiving an
independent Square quantity update. Custom lines are scoped to their order, so
two sales with the same free-text label need separate review. A later catalogue
sync can upgrade a missing variation to a catalogue entry when it becomes
available; custom lines remain sale-only.

## Count opening stock and enable updates

1. Resolve every unmatched or ambiguous product and map all trading locations.
2. Complete the physical opening stock count in Manuva. Creating or importing
   a product does not import its Square quantity as a Manuva balance.
3. Under "Stock updates to Square", tick "I have completed the opening stock
   count in Manuva and checked every product and location mapping."
4. Select "Enable stock updates". Manuva records the opening sales baseline and
   enables stock updates. Earlier sales are covered by the opening count and
   are not deducted again.

Completed sales after the baseline use the append-only inventory movement
ledger. Repeated webhooks and sync retries must not deduct the same sale twice.
Sync searches recently updated orders with a four-day overlap for delayed POS
uploads. Older sales waiting for mappings are replayed from their stored lines
when resolved; they do not need to remain in the external search window. Currency
must match the workspace; the retail pilot supports two-decimal currencies such
as AUD and refuses other minor-unit conventions instead of importing wrong prices.
Stock updates to Square start disabled; enabling them is an explicit admin
action. Subsequent disable/re-enable preserves the original baseline rather
than skipping sales received while updates were off.

Square physical "IN_STOCK" count changes can record restocks through the ledger.
A non-echo absolute Square count with existing Manuva reservations requires
manual review; it is refused to avoid deducting reserved stock twice. Refunds
do not automatically restock items or send financial adjustments to Xero.
Check whether goods were physically returned and record the appropriate stock
change. Appointment services remain excluded from stock consumption.

"Confirm the opening stock count before enabling Square stock updates." means
the confirmation checkbox was not ticked. "Couldn't change Square stock updates.
Map locations and resolve every product first, then try again." means setup or
the save failed. Resolve the queue and retry; do not assume stock updates are on.

## Disconnect

Select "Disconnect Square", review the confirmation, and confirm. Sales sync
and stock updates stop. Manuva products, movements, and balances remain. If
remote revocation fails, the message reads "Square disconnected locally. The
account owner must also remove Manuva access in Square." The account owner
should remove the authorisation in Square before treating access as revoked.

## Operator setup

Use the project's 1Password Environment and runtime secret injection. Store
values there; config and documentation contain variable names only:

- `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`, `SQUARE_REDIRECT_URI`
- `SQUARE_TOKEN_KEY`, optional `SQUARE_TOKEN_KEY_VERSION`
- `SQUARE_ENVIRONMENT` (`production` for a live merchant)
- `SQUARE_PILOT_TENANTS` (explicit tenant IDs; wildcard access is refused)
- `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_WEBHOOK_URL` (the exact public URL required by
  the signed webhook handler)

Register the OAuth callback `/api/square/callback` and the signed webhook
endpoint in the Square developer dashboard. Apply the approved Square migration,
deploy the connector, configure event delivery and scheduled retry processing,
and run a Pac-Technologies sandbox pilot before connecting a real merchant.
Account-owner OAuth authorisation and Xero organisation authorisation are
separate manual steps. This guide describes the connector; it is not evidence
that a customer's accounts have been authorised or that production is deployed.

Square and Manuva do not share a distributed transaction. Notifications and
scheduled reconciliation repair timing differences; do not treat a transient
quantity difference as proof of a completed sync. New sale/count notifications
pause outbound writes until processed, and failed or uncertain writes remain
retryable with stable request identity. A real Sandbox pilot and signed-in browser
QA remain release checks; local tests alone do not authorise a production rollout.

Configure a scheduled request to `/api/cron/square-sync` with
`Authorization: Bearer <CRON_SECRET>` through Supabase `pg_cron`/`pg_net` or the
approved scheduler. Set `CRON_SECRET` through runtime secret injection and keep
its value in 1Password. Merely deploying the endpoint does not schedule retries.
