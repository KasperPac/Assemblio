# 03 — Xero developer platform requirements (as of 1 Oct 2026)

Scope: what Xero requires of a multi-tenant SaaS integration in October 2026, for Manuva (AU manufacturing ops SaaS; AU/NZ/UK small product businesses; partial integration exists: OAuth 2.0 auth-code flow, pushes ACCPAY bills).

Method: primary sources only where possible. developer.xero.com renders client-side, so pages were read in a real browser on **2026-10-01** (the "accessed" date for every URL below unless another date is given). Page-level dates are quoted where Xero publishes them. Third-party sources are marked as such. Anything I could not confirm is in §10.

---

## 0. What changed in 2025–2026 (the short version)

| Date | Change | Source |
|---|---|---|
| 4 Dec 2025 | New Developer Platform Terms + Commercial Terms (AI/ML training ban, bot ban, consolidated App Store terms). Apply immediately to developers registering on/after this date. XASS/Commercial Billing closed to new apps. | https://developer.xero.com/pricing ; https://developer.xero.com/xero-developer-platform-terms-conditions ("Last updated: 4 December 2025") |
| 2 Mar 2026 | Five-tier pricing (Starter/Core/Plus/Advanced/Enterprise) replaces the 15% revenue share. Terms apply to pre-Dec-2025 developers. Apps created on/after this date get **granular scopes only**. | https://developer.xero.com/pricing ; https://developer.xero.com/documentation/guides/oauth2/scopes/ |
| 4 Mar 2026 | Granular Accounting API scopes live; Credit Note webhooks (new event schema with `data` object). | https://developer.xero.com/changelog |
| 19 Mar 2026 | Non-financial fields on part/fully-paid ACCPAY bills become editable. | changelog |
| 7 Apr 2026 | Non-blocking CurrencyRate validation warnings on multicurrency documents. | changelog |
| 29 Apr 2026 | Custom connections get granular scopes; new custom connections lose `accounting.journals.read`. | https://developer.xero.com/documentation/guides/oauth2/custom-connections/ |
| 29 Jun 2026 | Authorisation tightened: ManualJournals/Journals endpoints need the connecting Standard user to have **reporting** permission; contact bank details need BankAccountAdmin. | changelog |
| 1 Jul 2026 | Deadline to move all customers off XASS billing. | https://developer.xero.com/faq/pricing-and-policy-updates (Q18) |
| 10 Aug 2026 | `allowBackorders=true` on Invoices for tracked inventory. | changelog |
| 14 Aug / 3 Sep 2026 | Prepayment and Overpayment webhooks. | changelog |
| 18–21 Sep 2026 | xero-node 20.0.0 + backports to v4–v19: request headers (incl. bearer token) redacted from error objects. | https://github.com/XeroAPI/xero-node/pull/823 ; npm registry |
| 13 Sep 2027 | Broad scopes (`accounting.transactions`, `accounting.reports.read`, …) stop working. | changelog entry "Broad scopes deprecation", 6 Aug 2026 |

---

## 1. Auth

Sources: https://developer.xero.com/documentation/guides/oauth2/auth-flow/ ; https://developer.xero.com/documentation/guides/oauth2/pkce-flow/ ; https://developer.xero.com/documentation/guides/oauth2/scopes/

### 1.1 Flows
- **Auth code (confidential client)** — for web servers that can hold a client secret. Token endpoint `POST https://identity.xero.com/connect/token` with `Authorization: Basic base64(client_id:client_secret)`. This is the right flow for Manuva (Next.js server).
- **PKCE** — for native/desktop/mobile apps that cannot hold a secret. `code_challenge_method=S256`; verifier 43–128 chars. **"Single Page Apps (SPAs) are not currently supported."** No client secret is issued for PKCE apps. PKCE is a separate app type, not an add-on to the auth-code app — Manuva does not need it.
- Authorize URL: `https://login.xero.com/identity/connect/authorize?response_type=code&client_id=…&redirect_uri=…&scope=…&state=…`
- Redirect URI must be **https**; `http://localhost/` allowed for testing; **`http://127.0.0.1` is not**. PKCE: custom URL schemes not supported.
- Authorization `code` is single-use and **expires 5 minutes** after issue. `state` must be checked.

### 1.2 Token lifetimes and rotation
| Token | Lifetime |
|---|---|
| id_token | 5 minutes |
| access_token | 30 minutes (JWT; contains `authentication_event_id`, `xero_userid`, `scope`) |
| refresh_token | 60 days |

- Refresh token is only issued if `offline_access` is requested.
- **Rotation:** every refresh returns a new access token *and* a new refresh token; "You must save both tokens".
- **Grace period:** if the response is lost or not saved, the *previous* refresh token can be retried for **30 minutes**; after that the user must re-authorise.
- Architecture implication: refresh must be serialised per connection (row lock / single-flight). Two concurrent workers refreshing the same token is the classic way to lose a connection after the grace window.

### 1.3 Tenants, `/connections`, multi-org
- One access token covers all tenants that user connected; each API call needs `xero-tenant-id`.
- `GET https://api.xero.com/connections` lists connections: `id` (connection id), `authEventId`, `tenantId`, `tenantType` (`ORGANISATION`, `PRACTICEMANAGER`, …), `tenantName`, `createdDateUtc`, `updatedDateUtc`. Filter `?authEventId=<authentication_event_id from the access-token JWT>` to get only the orgs connected in *this* flow. Created ≠ updated means the tenant was disconnected and reconnected.
- A user can pick multiple orgs in one consent only via **Bulk Connections**, which is now an Advanced-tier premium feature (security assessment required); otherwise one org per flow. Disable per-flow with `acr_values=bulk_connect:false`. (https://developer.xero.com/documentation/xero-app-store/app-partner-guides/app-partner-features/)
- Certification expects the app to decide 1:1 vs multi-org explicitly and confirm which org the user wants (checkpoint 1).

### 1.4 Disconnect / revocation
- Disconnect one tenant: `DELETE https://api.xero.com/connections/{connectionId}` (Bearer). Certification **requires** using this rather than letting tokens expire.
- Revoke everything for a user: `POST https://identity.xero.com/connect/revocation` with `token=<refresh_token>` → 200, empty body; removes all that user's connections.
- Without a user token: client-credentials grant with non-tenanted scope `app.connections` can manage connections; the developer portal also has a "Connections management" page (Owner role needed to delete — pricing FAQ Q8).
- Users can disconnect from Xero's side (Settings → Connected apps). The app must detect the resulting API error, mark the connection broken and prompt reconnection (certification checkpoint 1).

### 1.5 Sign in / Sign up with Xero
- **Sign In with Xero** = OIDC with `openid profile email`; button widget `https://edge.xero.com/platform/sso/xero-sso.js`; button label must contain "Xero". Recommended, not required. (https://developer.xero.com/documentation/xero-app-store/app-partner-guides/sign-in/)
- **Sign Up with Xero** — "a requirement for all app partners seeking certification and listing on the Xero App Store" (https://developer.xero.com/documentation/xero-app-store/app-partner-guides/sign-up/). Two variants:
  - *Recommended*: App Store "Get this app" → your connect URL → full OAuth → provision trial pre-filled from Xero; requires Sign In with Xero on your login page for returning users.
  - *Modified*: OAuth with **OpenID scopes only** → prefill your own signup/lead form → connect the org later with full scopes + `offline_access`. Accepted for apps without self-serve trial or that can't use a federated IdP. This is the low-effort path for Manuva (Supabase Auth stays the IdP).
- Also stated as required for App Store listing in pricing FAQ Q28 and Commercial Terms, App Store Appendix §3 ("You must implement and maintain … 'Sign up with Xero'"). The certification-checkpoints page calls it "not a requirement" — see §10 inconsistencies; treat it as **required for listing**.

---

## 2. Scopes

Source: https://developer.xero.com/documentation/guides/oauth2/scopes/ ; https://developer.xero.com/faq/granular-scopes ; changelog 4 Mar 2026 and 6 Aug 2026.

### 2.1 Timeline
- Apps created **on or after 2 Mar 2026** use granular scopes only.
- "Web and PKCE apps – Since March 2026, all new and existing Web and PKCE apps have been assigned granular scopes." Existing apps can mix broad + granular until migration.
- Custom connections: granular from 29 Apr 2026.
- **Broad scopes stop on 13 Sep 2027.** Moving an existing connection to granular scopes requires **user re-consent** ("the user must provide explicit consent for the granular scopes" — granular-scopes FAQ). Scopes are additive; they cannot be removed from an existing token except by revoking.
- SDKs are "not impacted" by the scope change (FAQ).

### 2.2 Mapping
| Deprecated broad scope | Granular replacement |
|---|---|
| `accounting.transactions` | `accounting.invoices`, `accounting.payments`, `accounting.banktransactions`, `accounting.manualjournals` |
| `accounting.transactions.read` | the four `.read` variants |
| `accounting.reports.read` | `accounting.reports.{aged,balancesheet,banksummary,budgetsummary,executivesummary,profitandloss,trialbalance,taxreports}.read` |

Unchanged: `accounting.settings(.read)`, `accounting.contacts(.read)`, `accounting.attachments(.read)`, `accounting.budgets.read`, `accounting.journals.read`, `accounting.reports.tenninetynine.read`.

Resource coverage of the new scopes (verbatim from the scopes table):
- `accounting.invoices` → CreditNotes, Invoices, LinkedTransactions, Quotes, PurchaseOrders, RepeatingInvoices, **Items**
- `accounting.payments` → BatchPayments, Overpayments, Payments, Prepayments
- `accounting.banktransactions` → BankTransactions, BankTransfers
- `accounting.manualjournals` → ManualJournals
- `accounting.settings` → Accounts, BrandingThemes, Currencies, **Items**, InvoiceReminders, Organisation, TaxRates, TrackingCategories, Users
- `accounting.contacts` → Contacts, ContactGroups
- `accounting.attachments` → attachments on Accounts, BankTransactions, BankTransfers, Contacts, CreditNotes, Invoices, LinkedTransactions, ManualJournals, PurchaseOrders, Receipts, RepeatingInvoices
- `accounting.journals.read` → Journals (general ledger) — **premium, Advanced tier + security assessment** (pricing page). Not the same as ManualJournals (pricing FAQ Q7: ManualJournals available on all tiers).

### 2.3 What Manuva needs
| Need | Scope |
|---|---|
| Create bills (ACCPAY), sales invoices (ACCREC), credit notes, purchase orders | `accounting.invoices` |
| Record payments / read bill payment status in detail | `accounting.payments` (or `.read`) — only if Manuva touches payments |
| Manual journals (e.g. COGS / WIP / inventory value postings) | `accounting.manualjournals` |
| Create/match contacts | `accounting.contacts` |
| Items (create/update) | `accounting.invoices` **or** `accounting.settings` (both list Items) |
| Read tax rates, accounts, tracking categories, organisation (lock dates, base currency) | `accounting.settings.read` (`accounting.settings` only if Manuva creates accounts/tracking options/tax rates) |
| Upload PDFs (supplier invoice, GRN) to bills | `accounting.attachments` |
| Keep connection alive | `offline_access` (**mandatory for certification**, checkpoint 4) |
| Sign in / Sign up with Xero | `openid profile email` |

Minimal set for a bills + COGS-journal integration: `openid profile email offline_access accounting.invoices accounting.manualjournals accounting.contacts accounting.settings.read accounting.attachments`. Every extra scope must be justified at certification ("Unexplained or ambiguous use of scopes will not be allowed").

---

## 3. Commercial — developer pricing tiers

Source: https://developer.xero.com/pricing ; https://developer.xero.com/faq/pricing-and-policy-updates ; https://developer.xero.com/xero-developer-platform-commercial-terms (Last updated 4 Dec 2025).

### 3.1 Tiers (AUD, **tax exclusive**, flat monthly fee per app)
| | Starter | Core | Plus | Advanced | Enterprise |
|---|---|---|---|---|---|
| Max connections | 5 | 50 | 1,000 | 10,000 | No limit |
| Monthly fee | $0 | $35 | $245 | $1,445 | POA |
| Egress allotment / month | n/a (unlimited) | 10 GB | 50 GB | 250 GB | POA |
| Egress overage | n/a | $2.40/GB | $2.40/GB | $2.40/GB | POA |
| Ingress | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |
| Daily API limit per org | **1,000** | 5,000 | 5,000 | 5,000 | 5,000 |
| Prerequisites | — | Payment method | **App Certification** + payment method | Certification + **Security Assessment (initial & annual)** | same as Advanced |
| Xero App Store listing | Not available | Not available | Optional | Optional | Required |
| Rapid Sync (limits lifted first 30 min of a connection) | No | No | Yes | Yes | Yes |
| Journals endpoint / XPM API / Bulk Connections | No | No | No | Yes (security assessment + use-case approval) | Yes |
| Support | General | General | General | Priority | Priority |

(Prerequisite row read from the page's table cell by cell: Starter "—", Core "—", Plus/Advanced/Enterprise "App Certification"; Security Assessment only under Advanced and Enterprise.)

Key rules:
- **Flat fee per tier, not per connection.** Tier is driven by connection count (and premium features). "Connection count and API data consumption … measured and priced at the app level. Apps cannot share connection counts … even if they are from the same developer."
- "Connections: customer or tenants connected to your app via a valid OAuth connection." Commercial Terms §2.2(e): a Connection is one that "has continued to stay Connected for the current Billing Period". **Connections count until you remove them** (§2.2(d)) — churned customers must be disconnected or they keep counting.
- Egress = data pulled *from* Xero; the **Organisation endpoint is excluded** (Xero acknowledges it is used as a keep-alive). Measured in GiB, resets on the 1st (UTC). Usage report in the developer portal.
- New apps start on Starter. "In order to add a 6th connection, you will need to first add your payment details. Once that is complete, you will move to the Core tier." (FAQ Q24)
- **Hard caps:** "Your connections are capped at the tier maximums until you meet that tier's requirements." (FAQ Q14) — i.e. connection 51 is blocked until certification is passed and Plus is granted; connection 1,000 is blocked (capped at 999) until the security self-assessment passes.
- Moving up mid-month: billed at the lower tier to month end. Downgrade: by request, twice a year. Credit card only. Charged on the 1st of the following month (pricing page); Commercial Terms say invoices payable within 30 days.
- The old **15% revenue share (XASS + Commercial Billing) is retired** for apps on the new model. Manuva bills its own customers; Xero takes no share.
- Excluded from the tiered pricing: bespoke single-client integrations, Custom Connections, financial-services apps, conversion partners, franchise apps (FAQ Q6).
- **Uncertified-app limit per customer org:** "each organisation or practice is limited to connecting a maximum of two uncertified apps. There is no limit on connecting certified apps." (https://developer.xero.com/documentation/guides/oauth2/limits/). Starter and Core apps are uncertified → a prospect who already has two uncertified apps connected cannot connect Manuva until it is certified.

### 3.2 Cost to Manuva (AUD, ex GST; assumes egress stays inside the allotment)
| Connected orgs | Tier | Monthly | Annual | Per org / month | Gate to reach it |
|---|---|---|---|---|---|
| 5 | Starter | $0 | $0 | $0 | none; 1,000 calls/day/org |
| 25 | Core | $35 | $420 | $1.40 | add credit card |
| 100 | Plus | $245 | $2,940 | $2.45 | **certification passed** (needs Sign Up with Xero + ~10 active customer connections + checkpoint review) |
| 500 | Plus | $245 | $2,940 | $0.49 | same; self-assessment is sent at 800 connections |
| (1,000+) | Advanced | $1,445 | $17,340 | ≤$1.45 | annual security self-assessment |

Egress sanity check (my estimate, not a Xero figure): a paged invoice with lines is a few KB of JSON. 100 orgs × 2,000 documents read/day × ~3 KB ≈ 0.6 GB/day ≈ 18 GB/month — inside Plus's 50 GB. A push-mostly integration (bills, journals) is dominated by ingress, which is free. Overage at $2.40/GB is small in absolute terms. Whether POST/PUT **response bodies** count as egress is not documented (see §10).

Third-party coverage of the same numbers: https://www.accountingtoday.com/news/xero-shifts-to-tiered-pricing-model-for-developers ; https://www.accountantsdaily.com.au/technology/21986-all-you-can-eat-xero-data-buffet-comes-to-abrupt-end ; https://truto.one/blog/xero-api-pricing-changes-2026-costs-tiers-and-how-to-minimize-egress/ (consistent with the primary page).

---

## 4. Certification and App Store

Sources: https://developer.xero.com/documentation/xero-app-store/app-partner-guides/certification-checkpoints/ ; https://developer.xero.com/documentation/xero-app-store/app-partner-guides/building-and-growing-your-app/ ; security pages below.

### 4.1 Path
1. Build; onboard beta customers on Starter → Core.
2. From Core, apply in the developer portal ("Manage Plan") to upgrade to Plus; **certification happens as part of the upgrade**. "Once certified you'll be upgraded to the Plus Tier."
3. Review prerequisites: "you've built Sign Up with Xero and have **ten active customer connections**". Review against the checkpoints; "You may need to provision a test account for us."
4. Optional App Store listing (Plus+): public support documentation, listing submitted via the portal and pushed live by your Developer Evangelist.
5. Security self-assessment before 1,000 connections or any premium API (sent at 800 connections).

**No fee for certification itself** was found; the cost is the Plus tier fee. **No published review timeline** for certification (see §10). Xero recommends applying for listing "once you've onboarded at least 10 beta customers" (limits page).

### 4.2 Certification checkpoints (all integrations)
1. **Connection** — setup page showing connected tenant name and connection status; connect button when disconnected; disconnect button using `DELETE /connections/{id}`; handle disconnects initiated from Xero (detect API error, alert user, update status); decide 1:1 vs multi-org; disconnect trials that don't convert and off-boarded customers. Never ask for Xero credentials; no pop-ups/new tabs for auth; never expose access token, client id or secret client-side.
2. **Branding & naming** — app name = go-to-market name, must not contain "Xero"; use Xero's connect/disconnect buttons and logo undistorted.
3. **App Launcher** — set "Login URL for launcher" in the portal.
4. **Scopes** — minimal; explain any per-user variance; report major scope/use-case changes to api@xero.com after certification. **`offline_access` is required.**
5. **Error handling** — surface Xero's error detail to the user (instant for real-time sync, log page for batch).
6. **Data integrity** — use ACTIVE accounts, avoid system accounts (e.g. 800, 610) except for overpayments; non-ARCHIVED contacts; handle multicurrency correctly.
7. **Account & payment mapping** — user-selectable account codes per line type; never assume default codes.
8. **Taxes** — map Manuva tax codes to the org's Xero tax rates (or let the user create them); "We request that you avoid posting the specific tax amounts."

### 4.3 Security requirements
- Baseline for all partners (https://developer.xero.com/partner/security-requirements-for-developer-partners/): secure storage of credentials/keys, access control for staff, no shared hosting, SSL on all logged-in pages, public privacy policy, OWASP practices; report suspected breaches to api@xero.com.
- Developer Terms §15: report security incidents affecting user data **within 24 hours** to api@support.xero.com with a containment plan.
- **Security Standard for Xero API consumers** (annual self-assessment; mandatory at >1,000 connections or for XPM/HQ/Tax APIs, or if Xero decides) — https://developer.xero.com/partner/security-standard-for-xero-api-consumers :
  1. OAuth 2.0; tokens/customer identifiers never exposed or shared; **refresh token encrypted at rest with AES (AES-128+ preferred) or 3DES; key stored separately** from the data.
  2. TLS 1.2 with AES-256/SHA-256 minimum; endpoints that receive tokens or sensitive data in URL params must **302-redirect**, not render HTML (Referer leakage).
  3. Strong customer authentication — at least two-step auth or SSO; Sign In with Xero "strongly recommended".
  4. Third-party access to customer data disclosed in policies/terms with a justifiable need.
  5. Hardened servers (NIST guide / vendor guidance).
  6. OWASP Top 10; session cookies `Secure` + `HttpOnly`.
  7. Encryption at rest (NIST mechanisms) for repositories holding financial/commercial data.
  8. Audit logging (who/what/when/success/source); **retain ≥ 1 year, immutable**.
  9. No hosting in high-risk jurisdictions.
  10. Security monitoring and anomaly reporting to Xero.
- Assessment effort: ~5 working days to complete, 5–10 working days for Xero to review; remediation = 30 days to submit a plan + up to 60 days to fix (https://developer.xero.com/faq/xero-ecosystem-security-requirements-update).

### 4.4 What listing/certification unlocks
- Connections beyond 50 (Plus, up to 1,000).
- No "two uncertified apps per org" blocker for prospects.
- Rapid Sync (minute/day limits lifted for first 30 min of each new connection; 5-concurrent and 10,000/min app limits still apply).
- App Store listing, in-product placements, campaigns, sponsorship, verified badges, Growth/App Awards programs (Plus+).
- Xero Referral Program (US$200 per referred new paying Xero subscriber) — https://developer.xero.com/documentation/xero-app-store/app-partner-guides/pathways-to-grow

---

## 5. API limits and request mechanics

Sources: https://developer.xero.com/documentation/guides/oauth2/limits/ ; https://developer.xero.com/documentation/api/accounting/requests-and-responses ; https://developer.xero.com/documentation/guides/idempotent-requests/idempotency/

### 5.1 Rate limits (per tenant unless noted)
- Concurrent: **5** in-flight calls.
- Minute: **60** calls.
- Daily: **1,000** (Starter) / **5,000** (Core+). Fixed window, resets at a different time per tenant.
- App-wide: **10,000 calls/minute** across all tenants.
- Headers on every response: `X-DayLimit-Remaining`, `X-MinLimit-Remaining`, `X-AppMinLimit-Remaining`. On 429: `X-Rate-Limit-Problem` (which limit) and `Retry-After` (seconds) for minute/day breaches. Pause that tenant until `Retry-After`.
- Idempotent retries still count against limits.

### 5.2 Size and batching
- Max request size **10 MB** (same page also says keep requests under ~3.5 MB; see §10). Recommended ~**50 elements per request**; "no upper limit in the number of nodes".
- Items: max **500 per request**, recommend 50–100 (Items page) / 100 (limits page).
- Accounts and TaxRates: **one per request**.
- `?summarizeErrors=false` (Accounting API only): every element returned with `StatusAttributeString` OK/WARNING/ERROR and its own `ValidationErrors`; whole call returns HTTP 200 even with element errors. Must be parsed per element.
- Validation warnings (e.g. CurrencyRate) must be logged and surfaced, not ignored.

### 5.3 Reading
- Paging on Invoices, Contacts, CreditNotes, BankTransactions, ManualJournals, Payments, PurchaseOrders, Prepayments, Overpayments: `?page=N&pageSize=1..1000` (default 100); response includes a `pagination` object (`page`, `pageSize`, `pageCount`, `itemCount`). Paged results include line items.
- `If-Modified-Since` header (UTC, to the second) for incremental sync. Not every change bumps `UpdatedDateUTC` (e.g. DueDate/SentToContact on partly-paid docs; contact Balances/IsCustomer/IsSupplier).
- `summaryOnly=true` on Invoices/Contacts (forces paging; drops lines, payments etc.).
- GET Invoices/Contacts/CreditNotes/ManualJournals/PurchaseOrders: requests returning >100k records, or unoptimised filters/orders hitting >100k, are rejected 400. Use the optimised `where` fields, `IDs=`, `Statuses=`, `ContactIDs=`, `InvoiceNumbers=`, `SearchTerm=`.
- `createdByMyApp=true` on GET Invoices.
- JSON dates are `/Date(ms+0000)/`; `UpdatedDateUTCString` (ISO-8601) added 16 Jul 2026 on Invoices, CreditNotes, Payments, Prepayments, Overpayments.

### 5.4 Idempotency
- Header `Idempotency-Key` on POST/PUT/PATCH (ignored on other methods); case-insensitive header; key ≤ **128 chars**; keys are per app.
- Cached for **6 minutes** from first call. Same key + different request → 400 "is used with a different request". After expiry the key is treated as new (duplicates possible).
- Internal errors are cached too; on repeated errors, GET to check whether the resource exists, then retry with a new key.
- If Xero's idempotency store is unavailable, returns 500 until resolved.
- Architecture implication: 6 minutes covers network retries only. Manuva still needs its own outbox/dedupe (store Xero IDs; for bills, check by `Reference`/`InvoiceNumber` + contact before re-creating after the window).

---

## 6. Webhooks

Source: https://developer.xero.com/documentation/guides/webhooks/overview/ ; OpenAPI spec https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-webhooks.yaml (version 19.0.0).

- Configured per app; delivered for every connected org. Event categories / types:
  - **CONTACT** create/update (incl. archive)
  - **INVOICE** create/update (incl. archive) — covers ACCREC and ACCPAY; payload has **no type/status**, so you must GET
  - **CREDITNOTE** create/update (since 4 Mar 2026; includes `data: {Type, Status}`)
  - **PREPAYMENT** create/update (14 Aug 2026), **OVERPAYMENT** create/update (3 Sep 2026)
  - **SUBSCRIPTION** (Xero App Store subscriptions — legacy XASS)
  - **No** webhooks for Payments, Items, PurchaseOrders, BankTransactions, ManualJournals, Accounts, TaxRates, TrackingCategories — these need polling with `If-Modified-Since`.
- Payload: `events[]` (`resourceUrl`, `resourceId`, `eventDateUtc`, `eventType`, `eventCategory`, `tenantId`, `tenantType`), `firstEventSequence`, `lastEventSequence`, `entropy`. Thin events: fetch the resource.
- Signature: header `x-xero-signature` = base64(HMAC-SHA256(raw body, webhook key)). Respond **2xx for valid, 401 for invalid**, within **5 seconds**, HTTPS on 443, no cookies in response. Must hash the raw body (Next.js route handler must read `req.text()` before parsing).
- Intent to Receive (ITR) validation required on create, URL change, or re-enable.
- Delivery: immediate retry, then every 15 minutes for 24 hours; then subscription **disabled** and collaborators emailed. Events during Retry/Disabled are stored **31 days** and replayed in order once healthy. Xero requires consumers to "implement idempotency logic and support message replayability". Ordering only guaranteed within the replay; treat as at-least-once.

---

## 7. Object specifics for an inventory / manufacturing app

### 7.1 Invoices (bills and sales invoices) — https://developer.xero.com/documentation/api/accounting/invoices
- Types: `ACCPAY` (bill), `ACCREC` (sales invoice). Statuses: DRAFT (default, no journals) → SUBMITTED (no journals) → AUTHORISED (journals created) → PAID (automatic); DELETED (draft/submitted only); VOIDED (authorised, no payments).
- `InvoiceNumber`: unique for ACCREC; **non-unique for ACCPAY** and shown as "Reference" in the UI. Max 255.
- Send only `ContactID` in `Contact` — sending other fields updates the contact and **deletes ContactPersons not included**.
- Line items: on update, omit a `LineItemID` and that line is **deleted and recreated** — always send LineItemIDs.
- **Discounts (DiscountRate/DiscountAmount) only on ACCREC and quotes, not ACCPAY or credit notes.**
- `TaxType` overrides the account's default tax; `TaxAmount` can be overridden; max 2 tracking categories per line; `LineAmount` ≤ 9,999,999,999.99; Description ≤ 4,000 chars.
- `Url` shows as "Go to [app name]" in Xero; must not contain "xero".
- Paid documents: ACCPAY editable after payment only for Reference, DueDate, InvoiceNumber, BrandingTheme, Contact (with exceptions), Url, LineItems Description/AccountCode/Tracking, PlannedPaymentDate (since 19 Mar 2026). **No edits in a locked period.**
- `RoundingAmount` (−0.10 to 0.10) honoured only for SUBMITTED/AUTHORISED when SubTotal, TotalTax and Total are all supplied and reconcile; `EnteredTotal` for DRAFT.
- `allowBackorders=true` needed when an ACCREC with tracked items would go into backorder (since 10 Aug 2026).
- Email ACCREC via API: 1,000/day paying orgs, 20 trial, 0 demo.
- Org plan restriction: orgs on the legacy "Early" plan can approve only 20 ACCREC + 5 ACCPAY per month → 400 "You have reached the limit of invoices you can approve" (limits page). Check `GET /Organisation/Actions` (`CreateApprovedBill`, `CreateApprovedInvoice`, `UseMulticurrency`, `CreateManualJournal`…) per connection.

### 7.2 PurchaseOrders — https://developer.xero.com/documentation/api/accounting/purchaseorders
- Non-ledger documents (no journals). Statuses DRAFT/SUBMITTED/AUTHORISED/BILLED/DELETED.
- Do not create contacts (need existing ContactID/ContactNumber). UnitAmount rounded to 4 dp. Line-item update semantics as invoices. Paging enforced, up to 1,000/page. DeliveryInstructions ≤ 500 chars. `SentToContact` only once approved/billed. `summarizeErrors` supported.
- Scope: `accounting.invoices`. Whether Manuva should push POs at all is a product decision; they add no accounting value in Xero beyond visibility.

### 7.3 ManualJournals — https://developer.xero.com/documentation/api/accounting/manualjournals
- Required: `Narration`, ≥ 2 `JournalLines` (`LineAmount` debit +, credit −; `AccountCode`). `LineAmountTypes` defaults to **NoTax**. Statuses DRAFT/POSTED (VOIDED/DELETED). Max 2 tracking per line. `ShowOnCashBasisReports` default true.
- **Cannot post to system accounts (AR, AP, retained earnings) or bank accounts** → 400; use clearing accounts.
- **Cannot journal to or from accounts of type `INVENTORY`** — "Inventory account types are system accounts that you can't journal to or from" (Xero Central, https://central.xero.com/0/article/Track-your-inventory-US); the tracked-inventory guide also notes "restrictions posting to accounts with type INVENTORY via the API" (https://developer.xero.com/documentation/guides/how-to-guides/tracked-inventory-in-xero/).
- Since 29 Jun 2026: the connecting Standard user needs reporting permission or ManualJournals calls fail.
- Scope `accounting.manualjournals`; available on all tiers (not premium).

### 7.4 Items, tracked inventory, and why inventory apps avoid it
- https://developer.xero.com/documentation/api/accounting/items : Code ≤ 30, Name ≤ 50; tracked when `InventoryAssetAccountCode` (type INVENTORY) + `PurchaseDetails.COGSAccountCode` set. `QuantityOnHand` and `TotalCostPool` are **read-only**; changed only by transactions (ACCPAY/SPEND increase, ACCREC/RECEIVE decrease). Xero uses **average cost**. Tracked items can't be deleted once used. Recommended ≤ 4,000 tracked items per org; ≤ 100 items per request.
- Xero's own guidance says tracked inventory "isn't suitable" if the org "uses a third party inventory app", "Receives orders and payments via an eCommerce channel", "Manufactures or assembles goods for sale and needs to track the components", or has >4,000 items (Xero Central article above). That is Manuva's customer profile on every count.
- Consequence: Manuva should push **untracked items** (or none — lines can carry Description + AccountCode only), keep quantity/cost in Manuva, and represent stock value via a **CURRENT-type** asset account (e.g. "Inventory – Manuva") moved by bills and manual journals. If a customer already uses Xero tracked inventory for the same SKUs, Manuva's postings will double-count stock — needs detection at onboarding (`IsTrackedAsInventory`).
- Note: Xero sells its own inventory product, Xero Inventory Plus (US launch Aug 2024 — https://www.xero.com/us/media-releases/xero-unveils-inventory-software-xero-inventory-plus/). Third-party sources say it is US-only and has no manufacturing; not verified (§10).

### 7.5 Contacts — https://developer.xero.com/documentation/api/accounting/contacts
- `Name` is required (≤ 255; no angle brackets, leading/trailing or repeated spaces). Currently unique, but Xero warns it "may no longer be a unique field" — **key on ContactID**.
- `ContactNumber` (≤ 50, writable only via API, shown as "Contact Code") is the intended external key; GET `/Contacts/{ContactNumber}` works.
- PUT errors if Name or ContactNumber matches an existing contact; POST upserts.
- Matching guidance (best practices page): store ContactID; optional match on name/email; let the user choose "map to existing" vs "create" to avoid duplicates.
- Max 5 ContactPersons; >10,000 contacts may degrade performance. Use `where=Name="…"`/`EmailAddress`, `SearchTerm=`; archived contacts excluded unless `includeArchived=true`. Don't post to ARCHIVED or GDPRREQUEST contacts.
- Bank account details require BankAccountAdmin (since 29 Jun 2026).

### 7.6 TaxRates — https://developer.xero.com/documentation/api/accounting/taxrates ; /types
- AU defaults: `OUTPUT` (GST on Income 10%), `INPUT` (GST on Expenses 10%), `EXEMPTOUTPUT`, `EXEMPTEXPENSES`, `BASEXCLUDED`, `INPUTTAXED`, `CAPEXINPUT` (GST on Capital), `EXEMPTCAPITAL`, `EXEMPTEXPORT`, `GSTONIMPORTS`, `GSTONCAPIMPORTS` (last few system-defined/GET only). NZ: `OUTPUT2`/`INPUT2` 15%, `ZERORATED`, `NONE`, `GSTONIMPORTS`. UK: `OUTPUT2`/`INPUT2` 20%, `RROUTPUT`/`RRINPUT` 5%, `ZERORATEDOUTPUT`/`ZERORATEDINPUT`, `EXEMPT*`, `NONE`, domestic reverse charge `DRCHARGE*`, etc.
- User-defined rates get `TaxType` `TAX001`, `TAX002`…; names are user-editable — always GET and map, never hard-code.
- Rate/account-type constraints (e.g. `OUTPUT` cannot be used on expense accounts; `GSTONIMPORTS` only on liability accounts) → error "The TaxType code 'x' cannot be used with account code 'y'". Use `CanApplyTo*` flags to filter mapping dropdowns.
- **"Tax rates created via the API will not work in [AU, NZ, UK] for the purposes of sales tax reporting/filing"** (https://developer.xero.com/documentation/guides/how-to-guides/integration-best-practices/). Map to existing rates.
- One tax rate per request; system rates can't be updated.

### 7.7 Accounts — https://developer.xero.com/documentation/api/accounting/accounts ; /types
- Types: BANK, CURRENT, CURRLIAB, DEPRECIATN, DIRECTCOSTS, EQUITY, EXPENSE, FIXED, **INVENTORY**, LIABILITY, NONCURRENT, OTHERINCOME, OVERHEADS, PREPAYMENT, REVENUE, SALES, TERMLIAB.
- System accounts flagged by `SystemAccount` (DEBTORS, CREDITORS, GST, ROUNDING, RETAINEDEARNINGS, TRACKINGTRANSFERS, …). Rounding account: find by `SystemAccount=ROUNDING`, don't assume code 860.
- For Manuva: inventory asset → CURRENT (not INVENTORY, see 7.3); COGS → DIRECTCOSTS; WIP → CURRENT; purchase-price variance → DIRECTCOSTS/EXPENSE. Payments need `EnablePaymentsToAccount=true` or BANK.
- Create one account per PUT; can archive; can't delete system or used accounts.

### 7.8 TrackingCategories — /types
- Max **2 ACTIVE** and 4 total (2 active + 2 archived) per org; max 2 per line; option names ≤ 100 chars (validation since 10 Feb 2025). Customers often already use both slots (e.g. Region, Department) — Manuva can't assume it can add "Job" or "Location". Map to existing categories/options.

### 7.9 CreditNotes — https://developer.xero.com/documentation/api/accounting/creditnotes
- `ACCPAYCREDIT` (supplier), `ACCRECCREDIT` (customer). Same statuses/line semantics as invoices. Allocate with `PUT /CreditNotes/{id}/Allocations` (must be AUTHORISED; create and allocate are **two calls**); delete allocation via DELETE. Refunds via Payments endpoint. Webhook available.
- Supplier returns of goods → ACCPAYCREDIT.

### 7.10 Attachments — https://developer.xero.com/documentation/api/accounting/attachments
- `PUT|POST /{Endpoint}/{Guid}/Attachments/{FileName}` with raw bytes and correct Content-Type. Supported on Invoices, CreditNotes, ManualJournals, PurchaseOrders, Contacts, Accounts, BankTransactions/Transfers, Receipts, RepeatingInvoices, Quotes. **Max 10 per document**; size limit is 10 MB on the Attachments page vs 25 MB on endpoint pages (§10). Filename may not contain `< > : " / \ | ? * \0 +`. `IncludeOnline=true` for ACCREC docs. Scope `accounting.attachments`.

### 7.11 History & Notes — https://developer.xero.com/documentation/api/accounting/historyandnotes
- `GET /{Endpoint}/{Guid}/History`; `PUT` adds notes (≤ 2,500 chars each), shown as "System Generated". Supported on Invoices, CreditNotes, Contacts, Items, ManualJournals, PurchaseOrders, Payments, BankTransactions, etc. Useful for writing a Manuva reference ("Posted from Manuva GRN-123") into the Xero audit trail.

### 7.12 Lock dates
- `GET /Organisation` returns `PeriodLockDate` and `EndOfYearLockDate` (when set). Posting or editing a document dated on/before the lock date fails with 400, e.g. "The document date cannot be before the period lock date, currently set at …" (error text confirmed via third-party help centres: https://help.dext.com/en/articles/105721-the-document-date-cannot-be-before-the-end-of-year-lock-date-currently-set-at-date ; https://help.wise-sync.com/support/solutions/articles/36000192195). The API has no partial-edit behaviour in locked periods.
- Implication: read lock dates before each batch; if a Manuva event (e.g. a late GRN) falls in a locked period, either post in the first open period with the original date in the narration, or hold it for user decision. `Organisation/Actions` → `ApproveTransactionsBeforePeriodLockDate` tells you whether the connecting user is an adviser.

### 7.13 Multi-currency
- Plan-dependent. AU: "Comprehensive" plan (A$107/mo) and above — the plan card reads "Everything in Grow, plus: … Use multiple currencies" (https://www.xero.com/au/pricing-plans/). NZ and UK: likewise the tier above Grow (https://www.xero.com/nz/pricing-plans/ ; https://www.xero.com/uk/pricing-plans/). (Third-party articles claiming Grow includes it are wrong per these pages.)
- Check `Organisation/Actions` → `UseMulticurrency`, and the org's enabled currencies (`/Currencies`); posting an unsubscribed currency fails ("Organisation is not subscribed to currency EUR"). `CurrencyRate` optional; since 7 Apr 2026 suspicious rates return warnings. Payments support `BankAmount` (22 Jun 2026).

### 7.14 LineAmountTypes and rounding — https://developer.xero.com/documentation/guides/how-to-guides/rounding-in-xero/
- `Exclusive` (default for invoices/POs), `Inclusive`, `NoTax` (default for manual journals). Org defaults in `Organisation.DefaultSalesTax`/`DefaultPurchasesTax`.
- Xero calculates tax **per line, rounded to 2 dp, then sums** — differs from "total then tax" systems by cents. UnitAmount 2 dp by default; `unitdp=4` opt-in on invoices, credit notes, bank transactions, receipts, items. Totals stay 2 dp.
- Fixes: mirror Xero's per-line rounding; or add a rounding line to the `ROUNDING` system account; or override line `TaxAmount`; or `RoundingAmount` (±0.10) with full totals supplied.

---

## 8. 2025–2026 terms changes relevant to Manuva

Sources: https://developer.xero.com/xero-developer-platform-terms-conditions (Last updated 4 Dec 2025; applies to pre-Dec-2025 developers from 2 Mar 2026) ; https://developer.xero.com/xero-developer-platform-commercial-terms (Last updated 4 Dec 2025).

- **No AI training on API data.** "You must not use API Data … to train or fine tune any artificial intelligence models including machine learning tools, large language models or **predictive analytics tools**." API Data = anything accessed, received, transmitted or **generated** through the APIs, raw or processed. Clause 7(b)(i) also bans using it to "adapt, or enhance" AI models. Implication: Manuva can run inference (e.g. an LLM reading a bill) but must not train or fine-tune forecasting/ML models on Xero-sourced data, including derived data. Keep Xero-sourced fields tagged so they can be excluded from any training set.
- **Purpose limitation and use-case approval:** API Data only for "developing, testing, and supporting your app's features in accordance with your approved use case"; material product changes and new use cases need Xero approval (cl. 8).
- **Data passthrough:** API Data must not go to a third party without the user's consent (cl. 7(b)(ii)); must not aggregate/supply API data to another app; must not sell user data. Sending Xero data to an LLM provider or analytics vendor needs to be covered in Manuva's terms/consent.
- **Own terms and privacy policy required**, with recorded acceptance (cl. 9).
- **Bots/browser extensions** that simulate user actions or circumvent security are prohibited.
- **No multiple versions of the same app** (cl. 29) — combined with "Apps cannot share connection counts", you can't split customers across apps to stay on Starter.
- Can't use the platform to move customers off Xero or for competitive benchmarking.
- Audits up to twice a year; Xero may suspend on suspected breach.
- Commercial Terms: annual recertification (§2.1); responsibility to remove churned connections (§2.2(d)); support your own users (§3.4); comply with AU Privacy Act 1988, NZ Privacy Act 2020, UK DPA 2018/UK GDPR (§4.2).
- **Data retention:** I found no explicit retention/deletion period in either terms document (see §10). The certification checkpoints only say to disconnect non-converting and off-boarded customers so "you aren't accessing data beyond what is necessary".

---

## 9. SDK: xero-node vs direct REST

Sources: npm registry `https://registry.npmjs.org/xero-node` (queried 2026-10-01); https://github.com/XeroAPI/xero-node/releases ; https://github.com/XeroAPI/xero-node/pull/823

- Actively maintained, generated from `XeroAPI/Xero-OpenAPI`. Latest `20.0.0` (2026-09-18, OAS 19.0.0). Dependencies: `axios`, `openid-client`.
- **Major-version churn is high**: 14.0.0 (2026-03-05) → 15 (04-02) → 16 (05-07) → 17 (05-17) → 18 (06-03) → 19 (07-14) → 20 (09-18): seven majors in ~6.5 months, each a regenerated OpenAPI build.
- **Security fix 2026-09-18 (XAPI-2608):** error objects previously carried outbound request headers (i.e. the `Authorization: Bearer` token) and, on token/connection paths, the live request object. Fixed in 20.0.0 and backported 2026-09-21 to every major from v4 (4.39.0, 8.1.0 … 19.3.0). Any app that logged xero-node errors on older versions may have written access tokens to logs.
- Granular scopes don't require an SDK change (FAQ).
- Recommendation for Manuva: the surface it needs is small (token exchange/refresh/revoke, `/connections`, ~8 Accounting endpoints, webhook HMAC). A thin typed `fetch` client gives control over rate-limit headers, `Retry-After`, `Idempotency-Key`, `summarizeErrors`, and redaction, and avoids the major-version treadmill. If xero-node is kept, pin ≥ 20.0.0 (or the patched backport of the major in use) and scrub tokens from logs regardless. (The other agent auditing the existing code should check which version, if any, is installed.)

---

## 10. Could not verify / inconsistencies in Xero's own docs

Unverified:
1. **Certification review duration** — not published anywhere I could find. Only the security self-assessment has a stated duration (~5 + 5–10 working days).
2. **Whether POST/PUT response bodies count as egress.** Xero defines egress as data extracted from Xero; responses to writes echo the created object. Not stated.
3. **Whether paying a bill fires an INVOICE UPDATE webhook.** Likely (status/AmountDue change), but not explicitly documented; there is no Payment webhook.
4. **Data-retention obligations after disconnect** — no explicit period in the Terms or Commercial Terms.
5. **GST treatment of developer fees** for an AU entity (contracting party is Xero (NZ) Limited; fees are "tax exclusive").
6. **Current-plan invoice limits** — the 20 AR / 5 AP monthly cap is documented for the legacy "Early" plan; whether any current AU/NZ/UK plan (e.g. Ignite) has an approval cap was not confirmed. Use `Organisation/Actions` at runtime.
7. Xero Inventory Plus being US-only without manufacturing — third-party claim only.
8. Whether Manuva's existing Xero app was created before or after 2 Mar 2026 (determines whether broad scopes are even available to it) — visible only in the developer portal.
9. Supabase Auth support for Xero as an OIDC provider (relevant only if Manuva adopts the *recommended* Sign Up/Sign In flow) — not checked.

Inconsistencies (resolve in favour of the newer/more specific source):
- Auth-flow and PKCE pages still say "Uncertified apps can only connect to 25 tenants"; the limits page and pricing say 5 (Starter) / 50 (Core). The pricing model is authoritative.
- Pricing FAQ Q22 refers to "App certification requirement for the Core, Plus, Advanced, and Enterprise tiers"; the pricing table (cell by cell) and FAQ Q24 show Core needs only a payment method.
- Certification-checkpoints page says Sign Up with Xero is "not a requirement"; the Sign Up page, pricing FAQ Q28, the "Building and growing" page and Commercial Terms App Store Appendix §3 say it is required for certification/listing.
- Attachment size: 10 MB (Attachments page) vs 25 MB (Invoices, CreditNotes, ManualJournals, Contacts, Accounts pages). Design for 10 MB.
- Limits page gives both a 10 MB maximum request and a "maximum size of 3.5MB" for ~50 nodes. Design for ≤ 3.5 MB.
- Manual journals to Retained Earnings: API docs say not allowed; Xero Central's system-account table says the UI allows it. Treat as not allowed via API.
- Billing: card charged on the 1st (pricing page) vs invoice payable within 30 days (Commercial Terms §2.3).
- "Connection" defined as a tenant (pricing glossary) vs "any User who has connected" (Commercial Terms §2.2(e)). Assume tenant-level counting.
- Granular scope availability for existing apps: "from April 2026" (FAQ, checkpoints) vs "Since March 2026, all new and existing Web and PKCE apps have been assigned granular scopes" (scopes page).

---

## 11. Requirements split

### Hard requirements for any Xero integration (Starter/Core, uncertified)
- Auth-code flow server-side; client secret and tokens never client-side; `state` checked; https redirect URI.
- `offline_access`; persist rotated refresh token on every refresh; serialise refreshes per connection; handle the 30-min grace window; re-auth path when the 60-day refresh token lapses.
- Tenant mapping from `/connections` (`authEventId` filter); per-call `xero-tenant-id`.
- Disconnect via `DELETE /connections/{id}`; revoke on account deletion; detect Xero-side disconnects; **remove churned connections** (they count towards the tier).
- Granular scopes (mandatory for apps created after 2 Mar 2026; broad scopes dead 13 Sep 2027 with re-consent).
- Rate limiting per tenant: ≤ 5 concurrent, ≤ 60/min, daily cap (1,000 Starter / 5,000 Core+), app-wide 10,000/min; honour 429 + `Retry-After`; queue work rather than calling inline from requests.
- Batches ≤ ~50 elements, `summarizeErrors=false`, per-element error handling; log and surface warnings.
- `Idempotency-Key` on writes plus app-level dedupe beyond 6 minutes.
- Respect object rules: ACCPAY no discounts; send only ContactID; always send LineItemIDs on update; no manual journals to AR/AP/bank/retained earnings or **INVENTORY-type** accounts; ≤ 2 tracking categories; plan/role checks via `Organisation/Actions`; lock-date pre-check; multicurrency only if enabled; map to existing AU/NZ/UK tax rates (API-created rates break BAS/GST/VAT filing).
- Webhooks (if used): HMAC-SHA256 on raw body, 2xx/401 within 5 s, ITR, idempotent consumer, replay tolerance.
- Terms: no AI/ML training on API data (incl. predictive analytics), consented passthrough only, own ToS + privacy policy, 24-hour incident reporting, no bots.
- Billing: credit card on file before the 6th connection (Core, A$35/mo).

### Only needed for certification / App Store listing (Plus, >50 connections)
- Certification checkpoints 1–8: connection settings page (tenant name, status, connect/disconnect), Xero-branded buttons, app name without "Xero", App Launcher URL, justified minimal scopes, user-visible error handling/log, data-integrity rules, account/payment mapping UI, tax mapping UI.
- **Sign Up with Xero** (modified flow acceptable).
- ~10 active customer connections before review; test account for Xero.
- Public support documentation; App Store listing content (pricing per region, terms, privacy).
- Annual recertification; notify Xero of major scope/use-case changes.
- Security self-assessment before 1,000 connections (sent at 800) and annually thereafter.

### Nice to have
- Sign In with Xero (also satisfies the strong-auth item of the security standard).
- Webhooks for Contacts/Invoices/CreditNotes instead of polling (saves egress and rate limit).
- Rapid Sync (automatic once certified; makes onboarding imports fast).
- Deep links from Manuva to Xero documents; `Url` field back-link from Xero to Manuva.
- History notes on posted documents; attachments (supplier invoice PDF, GRN) on bills.
- Egress hygiene: `If-Modified-Since`, `summaryOnly`, paging at 1,000, Organisation endpoint for keep-alive.
- Direct REST client instead of xero-node (or pin ≥ 20.0.0).
