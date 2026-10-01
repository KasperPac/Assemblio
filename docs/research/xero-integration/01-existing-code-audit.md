# 01 — Existing Xero integration: code audit

Audit date 2026-10-01. Repo `C:\dev\assemblio` at `main` = `63416549` (also the live production deployment
`dpl_7b82cuiCSP17mLBykGuo5SyQk5Ed`). Read-only: SELECT-only SQL on prod `svhaotzrtfbwmphaacjj`, Vercel env
var *names* only, no secrets read or printed. Anything not directly verified is marked **(inferred)**.

---

## Summary

- **The integration is not live.** The code has been deployed to production since May, but the patch
  `supabase/patches/accounting_integration.sql` was never applied. `accounting_connection` and
  `accounting_sync_event` do not exist in prod, and the migration history has no entry for them. The Vercel
  project `assemblio` has no `XERO_*` env vars. Every receipt therefore no-ops silently. Admins still see a
  "Connect Xero" button, which redirects to Xero with `client_id=undefined` **(inferred from code + missing
  env)**.
- **It could not work even with the patch and env vars in place.** The code requests the broad
  `accounting.transactions` scope (`xero.ts:45`). No Xero app credentials exist anywhere, so any app created
  now is a post-2-March-2026 app. Those apps can only use granular scopes and get `invalid_scope` for the
  broad one.
- **There are two security defects that must not ship.** (1) Tokens are stored in plaintext in a table that
  any authenticated tenant member can SELECT, UPDATE and DELETE through PostgREST. (2) The OAuth callback
  does no session or role check and trusts an unsigned `nonce:tenantId` cookie. That lets an outsider attach
  their own Xero org to another tenant.
- **The accounting is naive.** Contacts match by name only. There is no TaxType, LineAmountTypes, CurrencyCode
  or `unitdp`. Account `'300'` is a hardcoded default that no UI can change. The supplier invoice number goes
  into `Reference`, which is ACCREC-only, so it is dropped on bills. The due date equals the received date.
  Bills are also raised for non-supplier stock-ins (customer return, opening stock, sample, adjustment).
- **Verdict: keep the skeleton, rewrite the core.** The table shape, the UI panel shell, the line-mapping idea
  and the mocked test harness are reusable. OAuth, token storage and refresh, bill construction, idempotency,
  retry and error surfacing all need rebuilding. Shopify's modules are the template, but **not** its token-table
  RLS, which has the same exposure (see Incidental).

---

## What exists

| Piece | File | What it does |
|---|---|---|
| Schema patch | `supabase/patches/accounting_integration.sql:1-88` | `accounting_connection` (plaintext `access_token`/`refresh_token` :5-6, `provider_org_id` = Xero tenantId :10, `default_account_code` default `'300'` :13, `is_active` :16) with a partial unique index on (tenant_id, provider) where active (:21-23). `accounting_sync_event` (entity_type `'bill'` only, status `synced`/`failed`) :48-58. Both tables have RLS with tenant-only policies for all four verbs (:27-43, :62-78) and `grant all … to authenticated` (:45, :80). **Not applied in prod.** |
| Xero HTTP lib | `src/lib/accounting/xero.ts` | Env via non-null assertions (:1-3). `buildXeroAuthUrl` with scope `"accounting.transactions offline_access"` (:40-49). `exchangeXeroCode` (:51-69), `refreshXeroToken` (:71-88), `getXeroOrgs` → GET /connections (:90-100), and `createXeroBill` → POST /Invoices with ACCPAY, `Contact:{Name}`, Date, DueDate, `Reference`, and lines {Description, Quantity, UnitAmount, AccountCode} (:102-140). There are no retries, timeouts, idempotency key or 429 handling. |
| Install route | `src/app/api/xero/install/route.ts` | Admin/super_admin check (:8-11). State = `${randomUUID()}:${tenantId}`, stored **unsigned** in an httpOnly `xero_oauth_state` cookie for 600s (:13-23). |
| Callback route | `src/app/api/xero/callback/route.ts` | Compares the query `state` with the cookie (:13). Takes tenantId from the cookie (:20). **No session or role check.** Exchanges the code, fetches orgs and takes **`orgs[0]`** (:24-27). Deactivates the old active row (:30-35), inserts a new row (:37-46), and redirects `?xero=connected`. Neither write's result is checked. |
| Disconnect route | `src/app/api/xero/disconnect/route.ts` | Admin check (:8-11). Sets `is_active=false` (:13-19). No token revocation, no `DELETE /connections`, result unchecked. |
| Bill push | `src/lib/accounting/push-bill.ts` | Loads the active connection with the admin client (:10-18). Refreshes if <60s to expiry and writes the new tokens back unchecked (:20-46). Reads the receipt and lines (:48-68). Drops unpriced lines (:77-87). Supplier name falls back from supplier → override → `"Unknown Supplier"` (:89-93). Date = `received_at.slice(0,10)`, **dueDate = same date** (:95, :105). Inserts a sync event (:114-122). Never throws on HTTP failure. |
| Hook point | `src/app/app/goods-inwards/actions.ts:141` | `await pushBillToAccounting(tenantId, receipt.id)` runs **synchronously** inside `createDeliveryReceipt`. It runs after the `receive_delivery_receipt` RPC and activity log and before redirect, for **every** receipt including non-PO stock-ins (:73-77). Not called from `updateDeliveryReceipt` (:254) or `linkReceiptToPo` (:151). |
| Settings UI | `src/app/app/settings/integrations/page.tsx:40-56, 89-110`; `xero-manage.tsx` | Admin-only page (:23-25). The badge is "Connected" when an `is_active` row exists, with no token-health check (:93). Shows the last 5 sync events (status, external_id, raw error). Connect is an `<a href="/api/xero/install">` and Disconnect a POST form (`xero-manage.tsx:71-81`). Banners for `?xero=connected/disconnected/error`. Supabase errors are ignored, so in prod (table missing) it renders "Not connected". |
| Super-admin vitals | `supabase/patches/super_admin_tenant_vitals.sql:30-36, 139-144, 186-203` (+ `super_admin_platform_observer_fixes.sql`); `src/app/app/super-admin/tenants/[tenantId]/_components/vitals-panel.tsx:21-139` | The deployed plpgsql functions `get_tenant_vitals` and `get_tenant_health_indicators` read `accounting_connection` / `accounting_sync_event`. |
| Tests | `src/lib/accounting/push-bill.test.ts` (added 2026-09-03, `11755ad9`) | 10 cases on `pushBillToAccounting` with a mocked admin client and a mocked `xero.ts`: no connection, synced, failed, refresh, refresh failure, unpriced lines, supplier fallback, unnamed component, missing receipt. Fakes always return `error: null`, so no Supabase error path is tested. **There are no tests** for `xero.ts`, the three routes or the UI. Tests were not executed in this audit (read-only constraint). |
| Plan | `docs/superpowers/plans/2026-05-11-xero-integration.md` (+ `.tasks.json`) | 5 tasks (schema, lib, routes, push + trigger, UI). The tasks JSON still shows **all 5 as `pending`** and was never updated. |

Commits: `f1a1d072`, `375155c0`, `8f0f2443`, `373b0b2d`, `13751af0`, `26be1173` (all 2026-05-11) and `11755ad9` (2026-09-03, tests). All are on `main`, and nothing in the working tree touches these files.

---

## Live status (evidence)

| Check | Result |
|---|---|
| Prod tables | `select … from public.accounting_connection` → **`ERROR 42P01: relation "public.accounting_connection" does not exist`**. `pg_class` has no relation matching `%accounting%` or `%xero%`. |
| Prod migrations | `supabase_migrations.schema_migrations` has no accounting/xero migration. Only `super_admin_tenant_vitals` (20260531002724) and `…_fix_operator_check` (20260531002937) are present. |
| Row counts / per-row provider, is_active, expiry | **N/A — the tables do not exist.** Zero connections have ever existed in prod. |
| Env var names needed by code | `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI` (`xero.ts:1-3`), `NEXT_PUBLIC_APP_URL` (routes :5). |
| Vercel `assemblio` env names (not decrypted) | CRON_SECRET, VERCEL_PROJECT_ID, VERCEL_API_TOKEN, SUPABASE_MANAGEMENT_PAT, SUPABASE_PROJECT_REF, SHOPIFY_SCOPES, SHOPIFY_UNLISTED_API_KEY/SECRET, SHOPIFY_API_KEY/SECRET, BETA_NOTIFY_EMAIL, NEXT_PUBLIC_SITE_URL, RESEND_FROM, RESEND_API_KEY, NEXT_PUBLIC_APP_URL (**production target only**), NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, SUPABASE_SERVICE_ROLE_KEY. **No `XERO_*`.** `hiddenProductionEnvCount: 0`. Local `.env`, `.env.local` and `.env.example` have no `XERO*` names either. |
| Deployed? | Yes. The prod deployment is commit `63416549` = `main` HEAD, which contains all the Xero code. |
| Visible to users? | Yes, to tenant **admin/super_admin** only (`page.tsx:23-25`). There is no plan or feature gate. It shows "Not connected" plus a "Connect Xero" button. Clicking it would send the browser to `login.xero.com/...client_id=undefined&redirect_uri=undefined` **(inferred: `URLSearchParams` stringifies `undefined`; not clicked)**. |
| Is the push firing? | It is called on every receipt. The connection lookup errors (PostgREST: missing table), the error is ignored and `data` is null, so it returns early (`push-bill.ts:10-18`). That is one wasted round trip per receipt. Prod has 9 receipts total and 1 in the last 30 days (latest 2026-09-22), across 2 tenants. No `accounting_*` requests appear in the 24h edge-log window. |
| Collateral breakage | The plpgsql functions `get_tenant_vitals` and `get_tenant_health_indicators` are deployed and reference the missing table after their operator check. plpgsql resolves relations at run time, so **every operator call should raise 42P01 (inferred; not observed — no calls in the 24h log window, and I could not execute them because `auth.uid()` is null in MCP)**. The tenant list deliberately ignores the RPC error (`super-admin/page.tsx:66-73`), so **every tenant would show green health**. The tenant detail page logs the error and drops vitals. The one 42P01 entry in `postgres_logs` (2026-09-30T23:59:41Z) is almost certainly my own count query. |
| Square | No Square code on `main`; only the remote branch `origin/feat/square-pos-integration`. |

---

## Defects

### Critical

**C1. The OAuth scope is invalid for any Xero app that could be created today.** `src/lib/accounting/xero.ts:45` requests `"accounting.transactions offline_access"`. Apps created on or after 2026-03-02 can only use granular scopes (`accounting.invoices`, `accounting.payments`, `accounting.banktransactions`, `accounting.manualjournals`, …) and get `invalid_scope` for the broad one. Pre-March apps may use broad scopes until 2027-09-13. No Xero app credentials exist anywhere (Vercel, local env), so the app will be new. The project's own strategy spec said "Granular scopes from day one" (`docs/superpowers/specs/2026-05-11-integrations-strategy-analysis.md:398`). There are also no contacts or settings scopes, which a ContactID mapping, account picker or tax-rate picker would need. *Impact: connect fails at Xero's consent screen.*

**C2. Plaintext tokens are readable and writable by every tenant member.** `accounting_integration.sql:5-6` stores `access_token`/`refresh_token` as plain `text`. Policies :27-43 allow SELECT/INSERT/UPDATE/DELETE to anyone whose `current_tenant_id()` matches, with no role check. `grant all … to authenticated` (:45) lets any logged-in member, including non-admin roles, call `GET /rest/v1/accounting_connection?select=refresh_token` with the anon key and their JWT. A Xero refresh token gives 60 days of write access to the company's ledger. Members can also rewrite `provider_org_id` or `default_account_code`, or delete or forge `accounting_sync_event` rows (:62-80). Disconnected rows keep their live tokens indefinitely (see H5). *Latent until the patch is applied; would be live on apply.*

**C3. The callback has no authentication and trusts an unsigned state.** `install/route.ts:13-23` sets `xero_oauth_state = "<uuid>:<tenantId>"` with no HMAC. `callback/route.ts:11-20` only checks that the query `state` equals the cookie, then takes `tenantId` from the cookie. It never calls `getServerTenantContext()` and never checks the role. Anyone can set that cookie in their own browser, put the same string in a Xero authorize URL (client_id is public), and authorise **their own** Xero org. The callback then deactivates the victim tenant's connection (:30-35) and inserts the attacker's org (:37-46). After that, the victim's receipts (supplier names, components, quantities, prices) are pushed into the attacker's ledger. Precondition: knowing the victim's tenant UUID. Shopify signs its state (`src/app/api/shopify/callback/route.ts:102-134`, `verifySignedPayload` + expiry + nonce). The QA plan claims Xero's state is "signed" (`qa-feature-test-plan.md:513`); it is not.

**C4. The feature was shipped to prod without its schema or config.** The code is deployed (C-level only because it is user-visible and has collateral damage). Tables are absent and env vars are absent. The admin UI offers a Connect button that dead-ends (inferred). Two super-admin RPCs depend on the missing table (inferred broken, masked as all-green health). *Fix: either unship the panel and hook or ship the whole thing. Do not apply the current patch as-is, because of C2.*

### High

**H1. Multi-org selection is wrong.** `callback/route.ts:24-27` takes `orgs[0]` from `GET /connections`. That endpoint returns every org the user has connected to this app, not just the one just authorised. A user with more than one org, or reconnecting to a different org, can silently get the wrong ledger. There is no picker, no use of the token's `authEventId` to filter to this consent, and the chosen org is not shown before the first push.

**H2. There is no idempotency.** `createXeroBill` (`xero.ts:124-133`) sends no `Idempotency-Key`. Nothing prevents two `synced` events for one receipt: there is no unique constraint on (entity_type, entity_id) for synced rows and no pre-check in `push-bill.ts`. If Xero creates the bill but the response is lost (timeout or 5xx after commit), the event is `failed`, and any future retry duplicates the bill. `createDeliveryReceipt` has no double-submit guard (unlike `orders/actions.ts:32`), so a double-click creates two receipts and two bills **(inferred)**.

**H3. Failed pushes are never retried and barely surfaced.** There is no retry path: no job, no button, no queue. The only surface is the last-5 table on the admin-only settings page (`page.tsx:48-56`). The receipt page shows nothing, and there are no notifications or emails. A failure means a bill silently missing from the ledger.

**H4. The token lifecycle is fragile.**
- Refresh happens **only** when a receipt is created (`push-bill.ts:21`). Xero refresh tokens die after 60 days, so a quiet tenant's connection dies silently while the badge still says "Connected" (`page.tsx:93` checks only `is_active`). There is no background refresh and no health state.
- The rotated tokens are written back with no error check (`push-bill.ts:25-34`). If that write fails, the new refresh token is lost, and the old one dies after Xero's 30-minute grace period, leaving the connection dead.
- Concurrent refresh (two receipts in the same minute) has no lock or compare-and-swap, so the last writer wins. Xero's 30-minute reuse grace makes this mostly survivable, but it is unguarded.
- Revocation from the Xero side (user removes the app) is not detected. It shows up only as failed events.
- Shopify's `getValidAccessToken` (`src/lib/shopify/token-refresh.ts:104-169`) at least centralises this with a 5-minute window and a config check.

**H5. Disconnect does not disconnect.** `disconnect/route.ts:13-19` only flips `is_active`. It never calls Xero's token revocation endpoint or `DELETE /connections/{id}`. The app stays authorised in the customer's Xero, and the plaintext refresh token stays in the row (readable per C2). Reconnecting also leaves the old row, with its tokens, in place (`callback/route.ts:30-35`). Nothing purges them.

**H6. Bill semantics are wrong.**
- (a) `supplier_reference` is sent as `Reference` (`xero.ts:114`). On invoices that field is ACCREC-only; for ACCPAY the supplier invoice number belongs in `InvoiceNumber`, which Xero shows as "Reference". The supplier's invoice number is therefore lost.
- (b) `DueDate = date` (`push-bill.ts:105`), so every bill is due on receipt. `suppliers.payment_terms` exists in prod and is ignored.
- (c) Bills are raised for any receipt with priced lines, including non-PO stock-ins with reason `customer_return`, `opening_stock`, `sample`, `adjustment` or `other` (`receipt-form.tsx:41-48`, `actions.ts:73-77, 141`). That books payables to "Unknown Supplier" or a free-text name for liabilities that do not exist.
- (d) No `Status` is sent. Xero defaults to DRAFT, which is the safe choice but is implicit.

**H7. The super-admin vitals and health RPCs are broken in prod (inferred).** See Live status. This is collateral of shipping code that depends on an unapplied patch. The tenant list masks it as all-healthy.

### Medium

- **M1. Tax is not handled.** No `TaxType` and no `LineAmountTypes` (`xero.ts:107-123`), so Xero treats lines as tax-**exclusive** by default and applies the account's default tax rate. Manuva records no GST basis for `cost_per_unit`: prod has no tax or GST columns on `delivery_receipt(_line)` or `purchase_order`, and per teammate manuva-finance-map none anywhere in the public schema. If users enter GST-inclusive costs, every bill is overstated by GST **(inferred risk)**. There is also no handling of GST-free or imported items.
- **M2. The account code is effectively hardcoded.** The `default_account_code` default is `'300'` (`accounting_integration.sql:13`). Nothing in `src` lets anyone change it (grep: used only at `push-bill.ts:84`). It is not validated against the org's chart of accounts, so if 300 is missing or archived, every push fails. There is no per-component, category or inventory-account mapping.
- **M3. Contacts map by name only.** `Contact: { Name }` (`xero.ts:111`). Xero matches an existing contact by name or creates a new one, so spelling variants create duplicate contacts and `"Unknown Supplier"` becomes a real contact. `suppliers` has no Xero ContactID column.
- **M4. Currency is ignored.** There is no `CurrencyCode`, and `suppliers.default_currency` and `tenant.currency` (both in prod) are ignored. A foreign-currency supplier's bill is booked in base currency at face value. The prod `tenant.currency` column **defaults to `'NZD'`**, and 4 of 7 tenants hold NZD versus 3 AUD (verified 2026-10-01; flagged by teammate manuva-finance-map, who reports the UI hard-codes AUD — see `02-manuva-financial-model.md`). The currency Manuva thinks a tenant uses is therefore unreliable as a source for the Xero currency; it would need to come from the Xero org's base currency.
- **M5. Rounding.** `UnitAmount` is passed as the raw `numeric` value with no `?unitdp=4`. Xero rounds unit amounts to 2 dp unless `unitdp=4` is given (per Xero Invoices docs; confirm in a sandbox). Sub-cent component costs (bolts, washers) would be distorted, e.g. 10,000 × 0.0125.
- **M6. Supabase errors go unchecked everywhere.** This is the pattern `assertNoError` (`src/lib/supabase/assert-no-error.ts`) was written to stop.
  - `callback/route.ts:30, 37`: an insert failure still redirects `?xero=connected`. Deactivate-then-insert is not atomic, so a failed insert leaves the tenant with **no** connection.
  - `disconnect/route.ts:14`.
  - `push-bill.ts:10` (this is why prod silently no-ops), `:25`, `:36`, `:48` and `:114`. A failed insert at `:114` means a bill exists in Xero with no record in Manuva.
- **M7. The push is synchronous in the request path.** `actions.ts:141` makes the user wait on a Xero refresh plus the bill POST before the redirect. `fetch` has no timeout. A non-HTTP throw inside `pushBillToAccounting` (e.g. null `received_at` at `push-bill.ts:95`) is not caught and would show an error page after the receipt is already committed.
- **M8. Edits and deletions do not propagate.** `updateDeliveryReceipt` (supplier, reference, date) and `linkReceiptToPo` change data after the bill is pushed, and the bill is never updated or voided.
- **M9. Config is not guarded.** The `process.env.X!` assertions (`xero.ts:1-3`) mean missing config produces a broken redirect instead of a clear error. Shopify has `getShopifyOAuthConfig()` returning `missing-config`.
- **M10. The QA plan is inaccurate.** `qa-feature-test-plan.md:513` claims "signed state" and "mismatch blocks". `:647` claims Xero webhooks/callbacks verify HMAC/signature. `:648` claims state cookies are signed. None of these are true for Xero, and there are no Xero webhooks. `:516` "Bill push posts accounting events" is accurate but untestable in prod.

### Low

- **L1.** There is no 429 / `Retry-After` handling. Xero enforces per-org minute and daily limits plus a concurrency cap; a 429 is just logged as `failed` with no backoff.
- **L2.** There are no `activity_log` entries for connect, disconnect or push, contrary to the CLAUDE.md convention (`logActivity` exists in `src/lib/activity`). `connected_by` is never populated (`callback/route.ts:37-46`).
- **L3.** `NEXT_PUBLIC_APP_URL` targets production only in Vercel, so in preview builds `SETTINGS_URL` becomes `"undefined/app/settings/integrations"` (routes :5).
- **L4.** The receipt form's default date is the UTC date (`receipt-form.tsx:429`, `new Date().toISOString().slice(0,10)`). AU users before about 10–11am local get yesterday's date, and the bill inherits it. This is an upstream bug, not in push code.
- **L5.** The raw Xero response body is stored and displayed as `error` (`push-bill.ts:111`, `xero-manage.tsx:100`). It is not user-meaningful and may be long JSON.
- **L6.** UI and design system: the sync table is hand-written (`syncTable`) instead of composing `_ui/table.module.css`. There is no `EmptyState` when connected with zero events, and the status shows raw `synced`/`failed` text instead of `StatusBadge`.
- **L7.** Tests cover only `push-bill` with mocks, and the fakes never return Supabase errors. The plan's `.tasks.json` was never updated from `pending`.

---

## Plan: what was deferred or out of scope

- The plan (`2026-05-11-xero-integration.md`) has **no explicit "deferred", "out of scope" or "non-goals" section** (grep for defer/scope/future/TODO finds only the scope string at :183). Its scope is exactly: OAuth connect/disconnect, the two tables, one ACCPAY bill per delivery receipt, and the settings panel.
- The plan does not mention token encryption, org selection, contact or account or tax mapping, currency, idempotency, retry, webhooks, revocation, or edits to pushed bills. These are omissions, not explicit deferrals.
- The broader roadmap in `docs/superpowers/specs/2026-05-11-integrations-strategy-analysis.md:398` envisaged far more: "Bills, invoices, per-production-order COGS journals with variance lines (PPV/MUV/LRV/scrap), landed-cost allocation, WIP roll-forward, two-active-tracking-category mapping. Granular scopes from day one." It also covers multi-currency gating (:263) and an A2X partnership instead of revenue sync (:339). None of that is built.
- The plan's Task 1 acceptance criterion "`authenticated` role has full access to both tables" (:25) is the origin of C2.

---

## Reusable vs rewrite

**Keep:**
- The two-table concept. Rename and extend it: per-provider connection, sync event with a unique (entity, provider) synced row, attempt count and next-retry.
- The `XeroManage` panel shell and banner handling.
- The line-mapping logic in `push-bill.ts:77-93`, which is a reasonable start.
- The mocked test harness in `push-bill.test.ts`.
- The hook location after receipt commit, with the push moved off the request path.

**Rewrite:**
- OAuth routes: signed, expiring state bound to user and tenant; session and admin re-check in the callback; org picker using `authEventId`; granular scopes; config guard.
- Token storage: a service-role-only table with no `authenticated` grant, and encryption at rest (Vault or app-level AES-GCM).
- A token manager: single-flight refresh with a row lock or compare-and-swap, a scheduled refresh before the 60-day expiry, and connection health states shown in the UI.
- Disconnect: revoke the token, call `DELETE /connections`, purge the stored tokens.
- The bill builder:
  - `InvoiceNumber` for the supplier reference
  - ContactID mapping stored on suppliers
  - account and tax-rate mapping read from the org
  - `LineAmountTypes` and `CurrencyCode`
  - `unitdp=4`
  - due date from payment terms
  - explicit `Status`
  - push only `supplier_delivery` and PO receipts
- Reliability: `Idempotency-Key` derived from the receipt, a retry queue or cron with 429 backoff, and a receipt-level sync badge with a retry action.
- Logging: `activity_log` entries.

Roughly every file except the UI shell changes materially, so treat this as a **rebuild on the existing skeleton, not a patch**. Do not apply `accounting_integration.sql` in its current form.

---

## Incidental (outside Xero scope, verified, not investigated further)

- **The Shopify token table has the same exposure as C2.** In prod, `shopify_install_tokens` has a single `ALL` policy `tenant_id = current_tenant_id()` for role `public`, and `anon` + `authenticated` hold full table privileges. Any authenticated tenant member can therefore read the Shopify access and refresh tokens through PostgREST **(inferred from grants + policy; not exploited)**. The "higher standard" Shopify baseline should not be copied for token storage.
- Edge logs show repeated `POST 406` on `/rest/v1/shopify_webhook_event?on_conflict=webhook_id&select=id`. This is probably dedupe with `.single()` on an ignored duplicate; not investigated.

Sources for Xero platform facts: [Xero Scopes](https://developer.xero.com/documentation/guides/oauth2/scopes/), [Granular Scopes FAQ](https://developer.xero.com/faq/granular-scopes), [Apideck: Xero scopes change](https://www.apideck.com/blog/xero-scopes), [Xero auth flow / token lifetimes](https://developer.xero.com/documentation/guides/oauth2/auth-flow/), [Xero token types](https://developer.xero.com/documentation/guides/oauth2/token-types), [Xero Accounting API Invoices](https://developer.xero.com/documentation/api/accounting/invoices).
