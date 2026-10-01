# Xero supplier bills (MVP) — design

**Date:** 2026-10-01 · **Task:** MANUVA-34 · **Status:** spec approved 2026-10-01
**Research:** `docs/research/xero-integration/01–04` (code audit, Manuva financial model, Xero platform, market and accounting)

---

## 1. Context and decision

A Xero integration was built in May 2026: OAuth connect, plus a bill pushed on every goods receipt. It is deployed but has never worked, and must not be switched on as written.
- The accounting tables were never applied to prod, and there are no `XERO_*` env vars.
- It requests the broad `accounting.transactions` scope, which apps created after 2 Mar 2026 cannot use.
- Tokens are stored in plaintext and are readable by every tenant member.
- The OAuth callback trusts an unsigned state and has no auth check.

The full audit is in `01-existing-code-audit.md`.

Manuva's data supports supplier bills today. It cannot yet support a COGS journal or a stock-value tie-out: there is no cost on stock movements, and manufactured fulfilment does not consume components (MANUVA-43).

**Decision: phased delivery.**
1. **This spec:** production-grade supplier bills, through a new supplier-invoice step in Manuva.
2. **Separate spec:** the costing foundation — a unit cost on every inventory movement, components consumed on manufactured fulfilment, and cost frozen at sale.
3. **Next release:** a daily COGS and stock-adjustment journal, plus a Manuva vs Xero inventory tie-out.

## 2. Goals and non-goals

**Goals**
- An admin connects one Xero organisation per tenant securely, and the connection stays healthy without attention.
- Purchasing users record the supplier's tax invoice against receipts, and Manuva creates a matching bill in Xero exactly once.
- Every failure is visible, explained in plain English, and fixable or retried. Nothing fails silently.
- The data model, token handling and outbox are reusable for the COGS journal release and for MYOB later.

**Non-goals (this spec)**

| Item | When |
|---|---|
| COGS / stock-adjustment journal, inventory tie-out | Next release (gated Growth+) |
| Sales invoices (B2B / wholesale / manual orders), payment status back from Xero, credit notes, tracking categories, landed cost into inventory, GRNI accrual, multi-currency bills | V2 |
| Xero App Store listing and certification | V2 (needs Plus tier and about 10 live connections) |
| Posting Shopify or Square sales | Never. A2X, Xero's Shopify app or Square's own integration already do it, and Manuva posting them would double revenue. |

## 3. User flows

### 3.1 Connect (admin only, all plans, pilot allowlist first)
1. Settings → Integrations → **Connect Xero** → Xero consent screen.
2. Callback → if this consent authorised more than one organisation, show an organisation picker.
3. The connection is saved in status `connected` with `setup_completed_at = null`. Nothing posts until setup completes.

### 3.2 Setup wizard (`/app/settings/integrations/xero/setup`, eyebrow "Admin")
All pickers are populated live from the organisation.
1. **Accounts**
   - **Inventory asset account:** active, type `CURRENT`. It must not be Xero's `INVENTORY` type, because manual journals cannot post to that type and the COGS release needs to.
   - **Other charges account** (freight, surcharges): active, type `EXPENSE` or `DIRECTCOSTS`.
   - **Bills start date:** invoices dated before it never sync.
2. **Tax**
   - **Default purchase tax rate** and **GST-free rate**, from the organisation's active rates that can apply to expenses. Rates are never created by the API, because that breaks BAS.
   - **Default amounts mode:** tax inclusive or tax exclusive.
3. **Sales source:** "What sends your sales to Xero?" Options: A2X / Link My Books / Xero's Shopify app / Square / Amaka / Nothing / Other.
   - The answer is stored.
   - Guidance is shown: Manuva will never post sales, and when Manuva's COGS journal ships, COGS must be switched off in that tool.

The wizard also shows the organisation's base currency and name. The base currency comes from Xero, not from `tenant.currency`, which is unreliable (MANUVA-41).

### 3.3 Supplier linking
- Before an invoice for a supplier can be posted while a connection exists, that supplier must be linked to a Xero contact.
- An inline control searches Xero contacts by name. The user can **Link** to a result or **Create in Xero**, which runs an outbox `create_contact` job and is queued ahead of the bill.
- The link stores the Xero ContactID. Contacts are never matched by name at posting time.

### 3.4 Enter supplier invoice (`/app/purchasing/invoices/new?po=… | ?receipt=…`, eyebrow "Operations")
1. Choose one or more **posted supplier-delivery receipts from the same supplier**, with or without a PO.
   - Receipts with reasons `customer_return`, `opening_stock`, `sample`, `adjustment` or `other` are not eligible.
   - A receipt line already on a live (non-voided) invoice is not offered.
2. Stock lines are prefilled from the receipt lines: component, received quantity, and receipt cost as the unit price. Editable fields:
   - quantity and unit price (4 decimal places);
   - tax rate (defaults from setup);
   - account (defaults to the inventory account).
3. Add **other-charge lines**: description, amount, tax rate, and account (defaults to the other charges account).
4. Header fields:
   - **Supplier invoice number** (required).
   - **Invoice date** (required).
   - **Due date** (required). It defaults from `supplier.payment_terms` when parseable (§3.4a), otherwise invoice date + 30 days.
   - **Amounts mode:** inclusive or exclusive.
   - **Invoice total as printed**, used as a cross-check.
5. **Matching: warn and allow.** Per stock line, the form shows the quantity difference against received and the unit-price difference against the PO line, highlighted. A computed total that differs from the printed total by more than $0.05 is also highlighted. None of these block posting.
6. **Save draft** (editable) or **Post**.
   - **Post** locks the invoice and writes the invoiced ex-tax unit cost back to `delivery_receipt_line.cost_per_unit`. An **Update component costs** checkbox (default on) also sets `component.cost_per_unit`, matching the existing receipt behaviour.
   - **Post** also enqueues `create_bill` when the tenant has a connected, set-up connection and the invoice date is on or after the bills start date.
   - Otherwise the invoice is posted with sync status `not_synced`. Supplier invoices remain useful without Xero.
7. Foreign-currency suppliers (`supplier.default_currency` set and different from the organisation's base currency) show a warning that the bill posts in the base currency. Multi-currency is V2.

**§3.4a Payment-terms parsing.** These forms are supported, case-insensitive:
- `N days`, `Net N`, `N` → invoice date + N.
- `EOM` → end of the invoice month.
- `N EOM` / `N days EOM` → end of the invoice month + N days.

Anything else falls back to +30. The due date is always editable.

### 3.5 After posting
- The invoice shows its sync status: `queued` → `sent`, with **View in Xero** linking to the bill. Bills are created in status **SUBMITTED** (Awaiting Approval).
- **Void** is admin-only.
  - Voiding needs a reason, and frees the receipt lines for re-entry.
  - If a sync is pending, the queued `create_bill` is cancelled.
  - If the bill was sent, a `void_bill` job is enqueued (§6.5).
  - The receipt-line costs written on posting are left as they are.
- Corrections are made by **Void, then re-enter**. Posted invoices are never edited.

### 3.6 Disconnect (admin)
1. Revoke the refresh token at Xero.
2. Call `DELETE /connections/{connectionId}`, which also frees the tier slot.
3. Delete the credential row and set status `disconnected`.
4. Posted invoices keep their Xero links.
5. Pending jobs move to `cancelled` with the message "Xero disconnected".

### 3.7 Connection health
- Connection states: `connected`, `needs_reconnect`, `disconnected`.
- An admin banner appears app-wide when the state is `needs_reconnect` or failed or gave-up jobs exist.
- An email goes to the connecting admin through the existing Resend setup on:
  - a transition to `needs_reconnect`;
  - a job moving to `gave_up`.

  At most one email per connection per 24 hours.

## 4. Data model

**New migration.** `supabase/patches/accounting_integration.sql` is deleted. It was never applied, and its grants are the origin of the token exposure.

### 4.1 Tables

**`accounting_connection`**: one row per (tenant, provider); unique on `(tenant_id, provider)`.
- Identity: `id`, `tenant_id` (FK tenant), `provider` (check `'xero'`).
- Status: `status` (`connected` | `needs_reconnect` | `disconnected`).
- Xero organisation: `external_org_id` (Xero tenantId), `external_connection_id`, `org_name`, `base_currency`.
- Audit: `connected_by` (FK auth.users), `connected_at`, `disconnected_at`, `last_refreshed_at`, `last_error`, `last_alert_at` (throttles the alert email to once per 24 hours, §3.7).
- Setup: `inventory_account_code`, `other_charges_account_code`, `purchase_tax_type`, `gst_free_tax_type`, `default_amounts_mode` (`inclusive` | `exclusive`), `bills_start_date`, `sales_source`, `setup_completed_at`.
- Reconnecting to the same organisation keeps the setup values. Reconnecting to a different organisation clears them and `setup_completed_at`.

**`accounting_credential`** (server only)
- `connection_id` (PK, FK, on delete cascade).
- `access_token_enc`, `refresh_token_enc` (text; an AES-256-GCM envelope `v{keyVersion}.{iv}.{tag}.{ciphertext}`, base64url). Text rather than bytea, because PostgREST round-trips bytea as escaped hex.
- `key_version`, `access_expires_at`, `refresh_expires_at`.
- `refresh_lease_until`, `version` (int), `updated_at`.

**`accounting_contact_link`**
- `tenant_id`, `provider`, `supplier_id` (FK), `external_contact_id`, `external_name`, `linked_by`, `linked_at`.
- Unique on `(tenant_id, provider, supplier_id)`.

**`supplier_invoice`**
- Identity: `id`, `tenant_id`, `supplier_id`, `purchase_order_id` (nullable).
- Invoice details: `invoice_number`, `invoice_date`, `due_date`, `amounts_mode`, `currency`.
- Amounts: `subtotal`, `tax_total`, `total`, `entered_total`.
- Status: `status` (`draft` | `posted` | `voided`) and `sync_status` (`not_synced` | `queued` | `sent` | `failed` | `voided_in_xero`).
- Xero link: `external_id`, `external_url`.
- Audit: `posted_by`, `posted_at`, `voided_by`, `voided_at`, `void_reason`, `created_by`, `created_at`, `updated_at`.
- Unique on `(tenant_id, supplier_id, lower(invoice_number))` where `status <> 'voided'`.

**`supplier_invoice_line`**
- Identity: `id`, `tenant_id`, `supplier_invoice_id` (FK, cascade), `line_no`.
- Source: `kind` (`stock` | `other`), `delivery_receipt_line_id` (nullable; required when `kind = 'stock'`), `component_id`.
- Values: `description`, `quantity` (numeric), `unit_amount` (numeric(18,4)), `tax_type`, `account_code`, `line_amount`, `tax_amount`.
- Variances captured at posting: `qty_variance`, `price_variance`.
- A receipt line may appear on only one live (non-voided) invoice. No index can express this, because it depends on the parent invoice's status, so `post_supplier_invoice` enforces it while holding row locks on the receipt lines (§6.1).

**`accounting_outbox`**
- Identity: `id`, `tenant_id`, `connection_id`, `provider`.
- Work item: `operation` (`create_contact` | `create_bill` | `void_bill`), `entity_type`, `entity_id`.
- State: `status` (`pending` | `working` | `sent` | `failed` | `gave_up` | `cancelled`), `attempts`, `next_attempt_at`, `locked_at`, `locked_by`.
- Ordering: `depends_on` (nullable FK to outbox; e.g. a bill waits for its contact).
- Xero: `idempotency_key`, `external_id`.
- Errors: `error_class` (`transient` | `fixable` | `auth` | `daily_limit`), `error_message` (plain English), `error_detail` (jsonb, scrubbed).
- Timestamps: `created_at`, `completed_at`.
- Unique on `(entity_type, entity_id, operation)` where `status in ('pending','working','failed')`.

### 4.2 Access
- **`accounting_credential`:** RLS enabled with **no policies**, and `revoke all` from `anon` and `authenticated`. It is read and written only with the service role, by server code.
- **All other tables:** RLS on, and tenant `SELECT` for `authenticated` via `current_tenant_id()`.
  - Writes to `accounting_connection`, `accounting_contact_link` and `accounting_outbox` go through server actions and routes using the service role, after `getServerTenantContext()` and role checks. `authenticated` gets no insert, update or delete on those three.
  - `supplier_invoice` and `supplier_invoice_line` drafts are written by server actions under the user's session, with tenant RLS. Posting and voiding go through the functions in §6.1.
- **New functions:** after the migration, run `scripts/probe_anon_rpc_surface.sh`. `CREATE FUNCTION` grants `EXECUTE` to `PUBLIC`, so revoke by OID.
- **Do not** revoke `anon` `EXECUTE` on the RLS helper functions (see the 2026-09-25 handoff).

### 4.3 Related fixes in this change
- `get_tenant_vitals` and `get_tenant_health_indicators` are repointed at the new tables (MANUVA-44). Generate the patch from the deployed source and change only those references.
- `activity_log` events:
  - `accounting.connected`, `accounting.disconnected`, `accounting.setup_completed`;
  - `supplier_invoice.posted`, `supplier_invoice.voided`;
  - `accounting.sync_failed`, `accounting.sync_gave_up`.

## 5. Xero app, auth and tokens

### 5.1 App and config
- **New Xero web app.** Redirect `https://app.manuva.app/api/xero/callback`. Starter tier, free up to 5 organisations; Core at A$35/mo from the 6th.
- **Env vars:** `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`, `ACCOUNTING_TOKEN_KEY` (32 bytes, base64), `ACCOUNTING_TOKEN_KEY_VERSION`, `XERO_PILOT_TENANTS` (comma-separated tenant ids).
  - Values are stored in the project's 1Password Environment, then set in Vercel.
  - `ACCOUNTING_TOKEN_KEY` must not be the same as any existing secret.
- `getXeroConfig()` returns `{ ok: false, reason: 'missing-config' }` when any value is absent. The UI then shows "Xero isn't configured" rather than redirecting.

### 5.2 Scopes
`openid profile email offline_access accounting.invoices accounting.contacts accounting.settings.read`

- Only what this MVP uses.
- The COGS release adds `accounting.manualjournals` and reports read, through a one-click re-consent prompt on the Xero card.

### 5.3 OAuth
- **`GET /api/xero/install`**
  - Requires `getServerTenantContext()` and the admin role.
  - Builds state as `base64url({ tenantId, userId, nonce, exp: now+10m })` plus an HMAC-SHA256 signature keyed with `XERO_CLIENT_SECRET`.
    - It uses a new shared module, `src/lib/security/signed-state.ts`.
    - Shopify's own `signPayload` is left untouched during its App Store review and moves to the shared module under MANUVA-37.
  - Sets an httpOnly `SameSite=Lax` nonce cookie.
- **`GET /api/xero/callback`**
  - Re-runs the session and admin checks.
  - Verifies the signature, expiry, nonce cookie, and that `tenantId`/`userId` match the session.
  - Exchanges the code.
  - Reads `authentication_event_id` from the access token, then calls `GET /connections` and keeps only connections with that `authEventId`. One match → use it. Several → organisation picker page. Zero → error.
    - While the user picks, the token set and the candidate organisations are held in a 10-minute httpOnly cookie, `xero_pending`, encrypted with `ACCOUNTING_TOKEN_KEY`.
    - Nothing is written to the database until an organisation is chosen.
  - Encrypts and stores the credentials, then upserts the connection.
  - Every Supabase call is checked with `assertNoError`. A failed write never reports "connected".

### 5.4 Token manager: `getXeroAccess(connectionId)`
All Xero calls go through it.
- If the access token has more than 2 minutes left, decrypt it and return it.
- Otherwise, claim a lease:

  ```sql
  update accounting_credential
  set refresh_lease_until = now() + interval '30 seconds'
  where connection_id = $1
    and (refresh_lease_until is null or refresh_lease_until < now())
  returning *
  ```

  - **The winner** refreshes at Xero, then writes the new tokens with `version = version + 1 where version = $read_version`, and clears the lease.
  - **Losers** poll the row (250 ms, up to 10 s) for the version bump, then use the new token.
- A refresh returning `invalid_grant` sets the connection to `needs_reconnect` and raises an `auth` error.
- A `401` on an API call with a token less than 2 minutes old is treated the same way: the app was removed in Xero.
- **Daily job:** refresh every `connected` connection with `last_refreshed_at` older than 7 days.

### 5.5 Disconnect
1. `POST https://identity.xero.com/connect/revocation` with the refresh token.
2. `DELETE /connections/{external_connection_id}`.
3. Delete the credential row and set status `disconnected`.
4. Revocation failures are logged but do not block the local disconnect. The admin sees "Disconnected in Manuva; remove Manuva in Xero → Connected apps if it still appears".

### 5.6 Xero client (`src/lib/accounting/xero/client.ts`)
A thin `fetch` wrapper, not `xero-node`.
- Headers: `Authorization`, `xero-tenant-id`, `Accept: application/json`, and `Idempotency-Key` on writes.
- 15 s timeout via `AbortController`.
- Parses `Retry-After`, `X-MinLimit-Remaining`, `X-DayLimit-Remaining` and `X-Rate-Limit-Problem`.
- Every error passes through a scrubber that strips authorisation headers and token-shaped strings before it is stored or logged.

### 5.7 Organisation reads
Used by the wizard and by pre-checks:
- `GET /Organisation`: name, base currency, `PeriodLockDate`, `EndOfYearLockDate`.
- `GET /Accounts?where=Status=="ACTIVE"`.
- `GET /TaxRates?where=Status=="ACTIVE"`, filtered to `CanApplyToExpenses`.
- `GET /Contacts?searchTerm=` for linking.

## 6. Sync engine

### 6.1 Posting and voiding (database functions)
**`post_supplier_invoice(invoice_id, update_component_costs bool)`** runs in one transaction.
- Validates:
  - the invoice is a draft in the caller's tenant;
  - every line's receipt line is eligible;
  - no receipt line is on another live invoice.
- Computes and stores the totals and variances, then sets `status = 'posted'`.
- Writes the invoiced ex-tax unit cost to the receipt lines (and to components if asked).
- Decides `sync_status`.
- Inserts the outbox jobs:
  - a `create_contact` if the supplier is unlinked and the user chose Create;
  - `create_bill`, with `depends_on` set to the contact job if there is one.

**`void_supplier_invoice(invoice_id, reason)`** (admin-checked)
- Sets `status = 'voided'`.
- Cancels a `pending`/`failed` `create_bill`, setting `sync_status = 'not_synced'`, or inserts `void_bill` if the bill was sent. On `void_bill` success, `sync_status = 'voided_in_xero'`.

Both are `SECURITY INVOKER` where RLS allows. Any `SECURITY DEFINER` function sets `search_path`, checks the tenant and role itself, and has `EXECUTE` revoked from `anon`/`PUBLIC`.

### 6.2 Triggering
- After a post, void or contact create, the server action calls `after(() => processOutbox({ connectionId }))` from `next/server`. This runs after the response, so the user doesn't wait for Xero.
- **Scheduled triggers:**
  - `/api/cron/accounting-outbox`: every 5 minutes.
  - `/api/cron/accounting-maintenance`: daily (token refresh, health, alert emails).
  - Both check `CRON_SECRET`.
  - **The scheduler is Supabase `pg_cron` + `pg_net`.** The Vercel team is on Hobby, which allows only daily crons and a small number of jobs.
    - The migration enables both extensions.
    - `CRON_SECRET` and the app base URL are stored in Supabase Vault (`vault.create_secret`).
    - Two `cron.schedule` jobs (`*/5 * * * *` and `0 17 * * *` UTC, about 3–4am AU) call `net.http_post` against `https://app.manuva.app/api/cron/accounting-*`, with the secret read from `vault.decrypted_secrets` inside the job.
    - Each route returns within the function time limit by processing a bounded batch: at most 25 jobs per connection per run.

### 6.3 Claiming
`claim_accounting_jobs(connection_id, limit)` selects jobs where:
- `status = 'pending'`, or `status = 'failed'` with `error_class = 'transient'`. A `fixable` job only becomes claimable when an admin's **Retry** sets it back to `pending` and clears `error_class`;
- `next_attempt_at <= now()`;
- any `depends_on` job is `sent`.

It uses `for update skip locked` and sets them to `working` with `locked_at`/`locked_by`.
- A `working` job with `locked_at` older than 5 minutes is reclaimable.
- Each connection processes **one job at a time**, inside Xero's limit of 5 concurrent calls per organisation.
- The 5-minute run iterates over connections with due jobs.

### 6.4 `create_bill`
1. **Pre-checks:**
   - the connection is `connected` and setup is complete;
   - the mapped accounts and tax types are still active (from a 10-minute cached read);
   - the invoice date is after both lock dates.

   A failed pre-check is a `fixable` error with a specific message.
2. **Duplicate check** on attempt > 1:

   ```
   GET /Invoices?where=Type=="ACCPAY" AND Contact.ContactID==guid("…") AND InvoiceNumber=="…"
   ```

   If a non-deleted bill exists, adopt its InvoiceID and go to step 4.
3. **Create:** `POST /Invoices?unitdp=4&summarizeErrors=false`, with `Idempotency-Key: si-{invoice_id}-create`. The key is the same on every attempt. Xero honours it for 6 minutes; after that, step 2 is the guard.
   - `Type: "ACCPAY"`, `Contact.ContactID`, `InvoiceNumber` (the supplier's number), `Date`, `DueDate`.
   - No `Reference`: Xero ignores it on bills. The PO number goes into each stock line's description instead.
   - `LineAmountTypes`: `Inclusive` or `Exclusive`.
   - `CurrencyCode`: the organisation's base currency. `Status: "SUBMITTED"`.
   - `LineItems[]`: `{ Description, Quantity, UnitAmount, AccountCode, TaxType }`. **Never `ItemCode`**, so Xero's tracked inventory is never triggered.
   - Stock line descriptions are `"{component SKU} {component name} · {PO number} · receipt {ref}"`. The PO and receipt parts are left out when absent.
4. **Success:**
   - Store `external_id` and `external_url` (`https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=…`).
   - Set `sync_status = 'sent'`.
   - If Xero's `Total` differs from Manuva's `total`, store Xero's figure and record the rounding difference in `error_detail` as information.
   - Write the activity log entry.

### 6.5 `void_bill`
`GET` the bill.
| Xero state | Action |
|---|---|
| `DRAFT` or `SUBMITTED` | `POST` with `Status: "DELETED"` |
| `AUTHORISED` with no payments | `Status: "VOIDED"` |
| Has payments or credit allocations | `fixable`: "Remove the payment in Xero first, then retry." |
| Already deleted or voided | Treated as success |

### 6.6 `create_contact`
`POST /Contacts` with `{ Name, EmailAddress, Phones, Addresses }` from the supplier. On success, write `accounting_contact_link`.

If Xero reports a duplicate name, the job does not auto-link. It fails as `fixable` with "A contact named X already exists in Xero — link to it instead."

## 7. Failure handling

| Class | Triggers | Behaviour |
|---|---|---|
| `transient` | 5xx, network or timeout, 429 minute or concurrency limit | Retry at `Retry-After` when present, otherwise backoff of 1m, 5m, 15m, 1h, 3h, 6h, 12h (24h ceiling from first attempt). Then `gave_up`, banner and email. |
| `fixable` | 400 validation (archived account or contact, invalid tax type, locked period, duplicate invoice number in Xero, contact name clash), failed pre-checks | No automatic retry. A plain-English message with a link to the fix (wizard step, supplier link, invoice date). An admin clicks **Retry** to move it back to `pending`. |
| `auth` | `invalid_grant`, 401 on a fresh token, 403 missing scope | Connection set to `needs_reconnect`. Jobs pause without counting attempts and resume on reconnect. A 403 scope error prompts re-consent. |
| `daily_limit` | 429 whose `X-Rate-Limit-Problem` names the daily limit | `next_attempt_at = now() + Retry-After`. All jobs for that connection are deferred to the same time. Not counted as an attempt. |

The message catalogue lives in `src/lib/accounting/xero/errors.ts`. It maps Xero `ValidationErrors[].Message` patterns to user text, seeded from Unleashed's published Xero error catalogue (see research 04). Unknown errors show "Xero rejected this bill: {first validation message}". The raw detail is stored in `error_detail`.

## 8. UI

All screens use `PageHeader` (with eyebrow), `StatusBadge`, `EmptyState` and the `_ui/table.module.css` / `_ui/buttons.module.css` composes. No hand-written table or card CSS.

- **Settings → Integrations, Xero card**
  - Status badge (`success` connected, `warning` needs reconnect, neutral disconnected), organisation name, last sent, failed-job count.
  - Actions: Connect / Finish setup / Reconnect / Disconnect.
  - **Sync log:** last 50 jobs with status badge, plain-English error, Retry (admin), and a link to the invoice. `EmptyState` when there are none.
  - The card is visible only to tenants in `XERO_PILOT_TENANTS` until general release.
- **Setup wizard:** three steps (§3.2), each validated against live organisation data before **Next**.
- **Supplier invoices list** (`/app/purchasing/invoices`, eyebrow "Operations")
  - Toolbar tabs: Draft, Not synced, Queued, Sent, Failed, Voided.
  - Columns: invoice number, supplier, PO, invoice date, due date, total, sync status, and a Xero link.
  - Add a link from the Purchasing page header.
- **Enter supplier invoice:** full page (multi-line form; same precedent as `goods-inwards/new`). Inline supplier-link control (§3.3). Variance cells use `--warning`.
- **PO detail and receipt detail:** an **Invoiced / Not invoiced** `StatusBadge`, a link to the invoice(s), and an **Enter supplier invoice** action in `PageHeader` `actions`.
- **Admin banner:** shown under the app header when the connection is `needs_reconnect` or failed/gave-up jobs exist. It links to the Xero card.

**Roles**
- Entering and posting supplier invoices follows the same role rule as goods inwards.
- Connect, disconnect, setup, void and retry are admin-only (`admin` or `super_admin`).

## 9. Plans and pilot
- **Supplier invoices:** all plans.
- **Xero bills:** all plans.
- **The future COGS journal and tie-out:** Growth and up. This uses a new `accountingJournals` plan flag that is actually enforced (see MANUVA-42 on unenforced flags).
- **Pilot:** `XERO_PILOT_TENANTS` gates the Xero card and the outbox until 1–2 real tenants have run a month of bills through it. General release is removing the gate.

## 10. Testing

**Unit (vitest)**
- Signed state (tamper, expiry, user/tenant mismatch).
- Token manager (lease winner/loser, version conflict, `invalid_grant` → `needs_reconnect`).
- Bill payload builder (inclusive/exclusive, `unitdp=4` values, no `ItemCode`, reference and invoice number placement, due-date parser §3.4a).
- Error classifier and message catalogue.
- Backoff schedule.
- Duplicate-adoption path.
- Void decision table.
- Scrubber (no token-shaped strings survive).

Supabase fakes must also return `{ error }` cases, which the May tests never exercised.

**Database** (`supabase/__tests__/…verify.sql` on scratch Postgres)
- `post_supplier_invoice` (eligibility, duplicate receipt line, cost write-back, outbox rows, `depends_on`).
- `void_supplier_invoice`.
- `claim_accounting_jobs` (skip locked, dependency gating, stale lock reclaim).
- Unique constraints.
- `accounting_credential` not selectable by `authenticated`/`anon`.

Then run `scripts/probe_anon_rpc_surface.sh` against prod after the migration.

**End to end (Xero Demo Company; it resets every 28 days):**
1. Connect with two organisations, and see the picker.
2. Complete the wizard.
3. Link one supplier and create another.
4. Post an inclusive and an exclusive invoice with a freight line.
5. Force a transient failure, then retry.
6. Lock a period → fixable error → change date → retry.
7. Void a SUBMITTED bill and an AUTHORISED bill.
8. Attempt to void a paid bill.
9. Disconnect and confirm in Xero → Connected apps.
10. Let a token expire, then let the daily job refresh it.

**QA plan:** rewrite `docs/qa-feature-test-plan.md` §16 (remove the inaccurate "signed state" and "webhook HMAC" claims) and add a changelog line.

## 11. Rollout
1. **Separate small PR, first:** remove the Xero panel and the `pushBillToAccounting` call from receipts (MANUVA-45), and patch the two health functions to stop referencing the missing tables (MANUVA-44).
2. Register the Xero app. Generate `ACCOUNTING_TOKEN_KEY`. Store all values in the project's 1Password Environment, then set them in Vercel.
3. Generate the migration from this spec, review it, and apply it to prod (the only environment). Run the anon probe.
4. Ship the code behind `XERO_PILOT_TENANTS`. Run the end-to-end checklist against the Demo Company in prod.
5. **Pilot:** 1–2 tenants for one month of real bills. Their accountant confirms the bills match the supplier invoices.
6. General release: remove the allowlist.
7. Follow-up (separate item): move Shopify tokens to the same encrypted, server-only storage (MANUVA-37).

## 12. Open items
- **Vercel plan:** resolved. The team is on Hobby, so scheduling uses Supabase `pg_cron` + `pg_net` (§6.2).
  - Hobby is licensed for non-commercial use only. Moving to Pro is a business decision outside this spec.
  - The design does not depend on Pro.
- **Xero certification timing.** Not needed for the pilot. Plan it once about 10 connections are live, because a Xero organisation can connect at most 2 uncertified apps (research 03).
- **Docs to correct:**
  - `docs/superpowers/specs/2026-05-11-integrations-strategy-analysis.md`: "A2X never touches COGS" is wrong.
  - `docs/research/manuva-gtm/results/28_…`: the 85/15 economics are obsolete after 2026-03-02.

  Do this when the COGS release is specced.
