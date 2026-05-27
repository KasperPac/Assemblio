## Tenancy / Auth / Observability / Integrity Audit

Scope: multi-tenant isolation, auth/session/super-admin, audit logging, webhook idempotency, and the operational integrity surfaces (Reports UI, Settings card, `/api/internal/integrity`, `scripts/integrity_audit.mjs`, `npm run ops:integrity`).

Evidence cites `path:line`. Effort is the engineering cost to close the gap: S (<1d), M (1-3d), L (3-7d), XL (>1wk).

---

### Tenancy enforcement

#### Shipped
- **Server-derived tenant context.** `src/lib/tenant/context.ts:3-53` reads `auth.getUser()` then loads `profiles.tenant_id`, and additionally verifies it appears in `profile_tenant_access` (or the user is `super_admin`). Falls back to the first accessible tenant if the profile's active tenant is stale. Tenant is never accepted from client input.
- **SECURITY DEFINER RPC for switching.** `src/app/app/actions.ts:13-28` posts a `tenant_id` from the sidebar dropdown to `set_active_tenant()`, which internally calls `has_tenant_access()` and raises `'No access to tenant'` on failure (`supabase/patches/multi_tenant_access_and_super_admin.sql:66-87`). The client value is therefore not trusted; the RPC validates it.
- **Database RLS baseline.** `supabase/schema.sql:564-611` enables RLS and creates `<table>_tenant_isolation` policies (`tenant_id = current_tenant_id() OR is_super_admin()`) on 30+ domain tables. The patch `supabase/patches/multi_tenant_access_and_super_admin.sql:129-166` re-asserts the same set after migration.
- **Every domain query carries `.eq("tenant_id", tenantId)`.** 86 occurrences across 17 server actions/lib files (e.g. `src/app/app/stocktake/actions.ts:84,98,279`, `src/app/app/purchasing/actions.ts:60,79`, `src/app/app/orders/actions.ts:228,242`). Defense-in-depth even though RLS would block cross-tenant rows.
- **OAuth state tenant binding.** `src/app/api/shopify/callback/route.ts:93-97,122-131` refuses the callback if the signed cookie's `tenantId` doesn't match the current profile, and blocks store-domain conflicts across tenants.
- **Sign-up tenant resolution by email domain.** `src/app/login/actions.ts:53-105` resolves tenant from `tenant_domain` by the email's domain, inserts `profiles` and `profile_tenant_access` using the admin client. Never reads tenant from the form.

#### Partial
- **RLS coverage has gaps.** `bom_template` and `bom_template_line` (defined `supabase/schema.sql:243-258`) are **not** in either RLS loop (`schema.sql:564-611`, `patches/multi_tenant_access_and_super_admin.sql:129-166`). They have a `tenant_id` column but no policy — RLS is OFF by default, so authenticated cross-tenant reads/writes via the anon key will succeed. Effort to fix: **S** (add the two tables to the array).
- **`shopify_webhook_event` has no tenant scope.** Table has `enable row level security` but no policies (`supabase/schema.sql:191-200`). That means authenticated clients cannot read it at all (fine — it's admin-only), but it also carries no `tenant_id` column, so it is intentionally global. Fine for webhook identity/dedupe, but operators auditing past webhooks via the app can never filter by tenant. Effort to backfill: **M**.
- **`profiles.tenant_id` still treated as source of truth.** `current_tenant_id()` reads `profiles.tenant_id` directly (`patches/multi_tenant_access_and_super_admin.sql:15-22`). If a `profile_tenant_access` row is revoked but `profiles.tenant_id` is stale, RLS still grants access to the stale tenant. `getServerTenantContext` handles this at the app layer by verifying membership, but SQL-level RLS does not. Effort: **M** (change `current_tenant_id` to additionally verify access, or move to a JWT claim).

#### Missing
- **Tenant context is re-derived on every request.** No JWT claim carries `tenant_id`; Supabase Auth is not configured with a `raw_app_meta_data.tenant_id` claim, so `current_tenant_id()` costs a `profiles` lookup per policy check. Functional but expensive. Effort: **L**.
- **No tenant-policy audit table/test.** There is no automated check that every new domain table is added to the RLS loop. Effort: **S** (add a test that enumerates `information_schema.tables` vs a whitelist; or add a migration linter).

#### Risks
- **`Fabulous` tenant only blocked in the CLI** (`scripts/integrity_audit.mjs:82-85`). Nothing in `src/lib/**` or DB prevents a `Fabulous` tenant from being created or used. Policy is guidance-only at the app and schema layer.
- **`profile_tenant_access` seeded from `profiles` once.** `patches/multi_tenant_access_and_super_admin.sql:10-13` copies existing `(profile_id, tenant_id)` pairs into the access table via `on conflict do nothing`. Any user created before this patch who had `profiles.tenant_id` set but was later moved will retain access until explicitly revoked.

---

### Auth (login, session, super-admin)

#### Shipped
- **Middleware gate.** `middleware.ts:12-47` creates a cookie-backed server client and redirects unauthenticated requests to `/app/*` to `/login?redirect=...`. Matcher is `/app/:path*` only.
- **Email/password auth.** `src/app/login/page.tsx:1-83` + `src/app/login/actions.ts:18-40` use Supabase `signInWithPassword`. Redirect path is sanitized to require a leading `/` (`actions.ts:11-16`).
- **Domain-scoped sign-up.** `src/app/login/actions.ts:42-112` refuses sign-up if the email domain has no matching `tenant_domain` row and provisions `profiles` + `profile_tenant_access` via the service-role admin client only after tenant resolution.
- **Super-admin plumbing.** `is_super_admin()` + `has_tenant_access()` SQL functions (`patches/multi_tenant_access_and_super_admin.sql:37-64`) underpin RLS bypass. App layer exposes tenant switcher for super-admins to all tenants in `src/app/app/layout.tsx:20-37`.
- **Provisioning script.** `scripts/provision_super_admin.mjs:45-140` creates the auth user, sets `profiles.role='super_admin'`, and back-fills `profile_tenant_access` rows for every existing tenant — non-interactive and idempotent.

#### Partial
- **Client-side navigation redirect only.** Middleware uses `supabase.auth.getSession()` (`middleware.ts:31-33`) which trusts the cookie. Route handlers & server components additionally call `supabase.auth.getUser()` (verifies JWT via Supabase server). Server actions that do not call `getServerTenantContext` rely on `getUser` inside `createSupabaseServerClient` usage — inconsistent. Effort to standardize: **S**.
- **Profile insert race.** `signUp` inserts `profiles` with admin client *after* `supabase.auth.signUp` returns (`actions.ts:75-97`). If profile insert fails, the auth user exists with no profile — subsequent logins will hit "Missing tenant context" instead of a clean error. Effort: **S** (wrap in a DB function or compensating delete).

#### Missing
- **No auth observability.** No `activity_log` events on sign-in/sign-up/password-change/sign-out. `src/app/app/actions.ts:7-11` (`signOut`) does not log. Effort: **S**.
- **No MFA, no password policy, no rate limiting on sign-in server action.** Relies entirely on Supabase Auth defaults. Effort: **M**.
- **Redirect whitelist is permissive.** `getRedirectPath()` (`actions.ts:11-16`) accepts any path starting with `/`, including `//evil.com` (browsers typically reject but some don't). Effort: **S** (also reject `//`).

#### Risks
- **Session cookies set in middleware via `cookies.setAll`** (`middleware.ts:22-28`), but also in the server client (`src/lib/supabase/server.ts:22-30`) which swallows errors. OK in practice but session refresh failures are silent.
- **Admin client has no authN guard at boundary.** `createSupabaseAdminClient` (`src/lib/supabase/admin.ts:3-13`) is callable from anywhere in the server bundle. Multiple API routes use it after a `getUser()` check (e.g. `src/app/api/shopify/sync/route.ts:9-14,29-46`) — good — but any future code path calling it directly would bypass RLS. No lint/codemod fence.

---

### Observability (activity_log, event_log, webhook idempotency)

#### Shipped
- **`activity_log` table.** `supabase/schema.sql:547-554` — `(tenant_id, actor_id, event, metadata, created_at)`. Wired into:
  - `src/lib/shopify/sync.ts:311-324` (SHOPIFY_SYNC_COMPLETED)
  - `src/app/app/orders/actions.ts:35-44,182-191` (order_allocation_run)
  - `src/app/app/goods-inwards/actions.ts:93-95,159-161` (purchase_order_received, purchase_order_line_received)
  - `src/app/app/components/actions.ts:61-63` (component_created)
  - `src/app/app/stocktake/actions.ts:101-109,281-283` (stocktake_status_changed, stocktake_applied)
  - `src/app/app/products/actions.ts:152-154` (bom_created)
  - `src/app/app/trash/actions.ts:171-173` (trash.emptied)
- **`event_log` table.** `supabase/schema.sql:556-562` — `(tenant_id, event_type, payload, created_at)`. Written by the Shopify webhook route with the topic as `event_type` (`src/app/api/shopify/webhooks/route.ts:60-65`).
- **Activity log UI.** `src/app/app/activity-log/page.tsx:1-12` lists last 10 events (tenant-scoped by RLS).
- **Webhook idempotency.** `src/app/api/shopify/webhooks/route.ts:32-51` upserts `shopify_webhook_event` with `onConflict: "webhook_id", ignoreDuplicates: true`; an empty result triggers `isDuplicateWebhookEvent` → returns `200 Duplicate` without re-processing (`src/lib/shopify/webhook.ts:14-16`). Unique constraint on `webhook_id` (`schema.sql:191-198`). HMAC verified first (`route.ts:19-21`), then identity headers (`route.ts:22-24,webhook.ts:18-20`).
- **Sync topic gate.** `shouldRunStoreSync` (`src/lib/shopify/webhook.ts:31-43`) only runs a full sync for the whitelisted topics in `SHOPIFY_SYNC_TOPICS` (`webhook.ts:1-8`).
- **Sync metadata mirror.** `shopify_store.last_sync_status` / `last_sync_meta` updated on every webhook-triggered sync branch (route.ts:98-126), including the error branch.

#### Partial
- **`activity_log.actor_id` rarely populated.** Only `src/lib/shopify/sync.ts:313` explicitly sets `actor_id`, and sets it to `null`. All app action inserts omit it entirely (null by default). Schema references `auth.users(id)` (`schema.sql:550`). Effort: **S** (add `actor_id: user.id` in server actions).
- **`event_log` only written by Shopify webhooks.** Other server-side events (allocation, stocktake applied, PO receive) use `activity_log` instead. Distinction between "user-initiated audit" and "ingested event" is implicit only. Effort: **S** to document, **M** to unify.
- **Webhook idempotency assumes `ignoreDuplicates` semantics.** The code relies on `ignoreDuplicates: true` returning an empty row on conflict; if Supabase JS changes behaviour (e.g. returning the existing row on conflict), `isDuplicateWebhookEvent(null)` becomes false and the handler would re-process. Add an explicit `select existing by webhook_id` path to harden. Effort: **S**.
- **No retention / archival.** `activity_log` and `event_log` grow unbounded. Effort: **M** (TTL partition or scheduled delete).

#### Missing
- **No structured logging / tracing.** Errors from server actions surface via `redirect(?planError=...)` (`src/app/app/orders/actions.ts:78,146,153`) but are not logged to `activity_log` with correlation IDs. Effort: **M**.
- **No webhook-processing metrics.** Duration, retry count, dead-letter for failed sync attempts are only captured in `last_sync_meta` for the latest attempt — history is lost (`src/app/api/shopify/webhooks/route.ts:98-126`). Effort: **M**.
- **No audit-log UI filters.** `/app/activity-log` is a last-10 client component with no filters by event or actor (`src/app/app/activity-log/page.tsx:1-12`). Effort: **S**.
- **No idempotency beyond Shopify webhooks.** Any future webhook surface (Xero, Monday, etc.) has no shared `webhook_event` abstraction. Effort: **M**.

#### Risks
- **`shopify_webhook_event` has RLS enabled with no policies**, so the admin client is the only way to read/write it (`schema.sql:200`). Intentional, but every operator tool needs the service role. Loss of that key = loss of webhook audit trail.
- **Activity log writes are unchecked.** `supabase.from("activity_log").insert(...)` return values are not awaited/checked in most actions (e.g. `src/app/app/orders/actions.ts:35-44`, `stocktake/actions.ts:101-109`). A failed log insert is silent.

---

### Operational integrity

#### Reports UI (`/app/reports`)
- **Shipped:** `src/app/app/reports/page.tsx:36-165` renders margin / capacity KPIs from `job_cost_snapshot`, `job_cost_actual_rollup`, `department_utilization_week`. CSV export `src/app/app/reports/export/route.ts:37-165` embeds full integrity audit output (invariant issues, reconciliation drifts, duplicate allocations, PO over-receipts).
- **Partial:** Reports page itself does **not** render integrity counters; it shows only financial KPIs. Integrity detail is only in the CSV export and in `/app/settings`. Effort to surface: **S**.
- **Missing:** No "run audit now" button or timestamp of last audit on the Reports page. No link to CLI script or API. Effort: **S**.
- **Risk:** Reports page queries `profile` without `.limit(1)` chain but uses `.single()` which throws on multiple rows — the sign-up bug (profile insert after auth.signUp) could leave users without a profile and crash the page.

#### Settings card (`/app/settings`)
- **Shipped:** `src/app/app/settings/page.tsx:119-163` computes total integrity issue count, `overviewCards[3]` renders an "Integrity" card, `src/app/app/settings/page.tsx:192-221` renders per-check counts with a `StatusBadge`. Links to `/app/reports` but not to the JSON API.
- **Partial:** No drill-down — clicking "Open full integrity reporting" goes to `/app/reports` which is financial, not integrity detail. Effort: **S** (dedicated `/app/reports/integrity` page).
- **Missing:** No per-check remediation actions (e.g. "reconcile this drift", "void over-receipt"). Audit is read-only. Effort: **L**.

#### `/api/internal/integrity`
- **Shipped:** `src/app/api/internal/integrity/route.ts:5-41` requires `auth.getUser()`, loads profile tenant, calls `loadInventoryIntegrityAudit`. Returns summary + full details as JSON. RLS-enforced scope via the user's client (not admin).
- **Partial:** Endpoint is named `/internal/` but has no additional guard beyond "authenticated + has profile" — any tenant member can fetch their tenant's integrity report. Intended? Effort: **S** to add role gate, **M** to document.
- **Missing:** No caching header / ETag; audit runs fresh on every call (four `select *` queries). Effort: **S**.
- **Risk:** The `tenantId` used in the response body (`route.ts:28`) is echoed from `profile.tenant_id` — if `profiles.tenant_id` is stale (see RLS gap above), the report label disagrees with the RLS-filtered rows.

#### CLI script / `npm run ops:integrity`
- **Shipped:** `scripts/integrity_audit.mjs:1-195`:
  - Arg parser with `--tenant` (default `Pac-Technologies`) and `--no-fail`.
  - Policy guard blocking `--tenant Fabulous` (lines 82-85).
  - Requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
  - Uses service-role client with `persistSession: false`.
  - Loads tenant by name, then balances/movements/allocations/POs filtered by tenant_id.
  - Reports non-zero exit on issues unless `--no-fail`.
- **Partial:** Duplicates logic already in `src/lib/inventory/audit.ts` / `invariants.ts` / `reconciliation.ts` rather than importing them (script is `.mjs`, lib is TS). Drift risk. Effort: **M** (compile shared check module or move script to TS via tsx).
- **Missing:** No JSON output mode for machine ingestion. No `--all-tenants` sweep. Effort: **S**.
- **Risk:** Service role key must be on the operator's machine. No equivalent "read-only" ops role.

#### Individual checks

| Check | Impl | Evidence | Status | Gaps |
|---|---|---|---|---|
| **Negative balances** (on_hand/in_prod/reserved) | `findInventoryInvariantIssues` | `src/lib/inventory/invariants.ts:20-65` | Shipped | Tolerance is exact zero; no skew/hysteresis. Effort S. |
| **Over-reservation** (`on_hand - reserved < 0`) | same | `invariants.ts:54-61` | Shipped | Doesn't account for `in_prod` as available stock buffer. Effort S to document semantics. |
| **Balance/movement reconciliation drift** | `reconcileInventoryBalances` | `src/lib/inventory/reconciliation.ts:34-78`, tolerance 1e-4 (`audit.ts` wires it, `reconciliation.ts:37`) | Shipped | Only compares on_hand + in_prod — `reserved` drift is NOT reconciled. Reservation movements exist per AGENTS.md but the check ignores them. Effort M. |
| **Duplicate allocation keys** | inline in `loadInventoryIntegrityAudit` | `src/lib/inventory/audit.ts:84-91`, CLI mirror `scripts/integrity_audit.mjs:136-143` | Shipped | Schema has unique constraint patch (`supabase/patches/order_component_allocation_unique.sql`) — check is defensive but cannot occur under unique index. Still useful as sentinel. |
| **PO over-receipt** | inline | `src/lib/inventory/audit.ts:93-95`, CLI `integrity_audit.mjs:145-150` | Shipped | Schema CHECK already enforces `quantity_received <= quantity` (`schema.sql:543`). Defensive only. |

**Missing integrity checks** worth adding (not currently implemented):
- Allocation sum per order line vs BOM requirement (detect under-allocated orders after partial BOM edits). Effort **M**.
- Orphan `inventory_movement` rows with no matching balance row. Effort **S**.
- `shopify_store.status='active'` with no `shopify_install_tokens`. Effort **S**.
- `profile_tenant_access` parity — profile rows whose `tenant_id` is not in access table (catches the stale-profile RLS gap). Effort **S**.
- Webhook retry/failure rate from `shopify_store.last_sync_status='failed'`. Effort **S**.

#### Contract conformance summary
- "Every read/write constrained by `tenant_id`" — **Partial** (two bom_template tables unguarded; `shopify_webhook_event` is global by design).
- "Tenant never trusted from client" — **Shipped** (only `set_active_tenant` RPC accepts it, and it re-authorizes).
- "Super-admin support" — **Shipped** with documented `is_super_admin()` path and provisioning script.
- "`activity_log`, `event_log` for audit" — **Partial** (sparse actor_id, no retention, unchecked inserts).
- "Webhooks must be idempotent" — **Shipped** for Shopify via unique `webhook_id` + ignoreDuplicates path.
- "Integrity checks at Reports UI, Settings card, `/api/internal/integrity`, CLI, `npm run ops:integrity`" — **Shipped** (caveat: Reports page shows financial KPIs, not integrity; integrity counters live on Settings and in CSV export).
- "Current checks: negative balances, over-reservation, balance/movement reconciliation drift, duplicate allocation keys, PO over-receipt" — **Shipped**; reconciliation ignores `reserved`, otherwise complete.

---

### Top remediation priorities
1. Add `bom_template` + `bom_template_line` to both RLS loops. **S**, cross-tenant read/write risk today.
2. Tighten `current_tenant_id()` to verify `profile_tenant_access` membership (or promote to JWT claim). **M**, prevents stale-profile drift.
3. Write `actor_id` on every `activity_log` insert and assert the insert succeeded. **S**, closes silent-log gap.
4. Add `reserved` to reconciliation drift check. **M**, honours AGENTS.md reservation-as-movement contract.
5. Move `scripts/integrity_audit.mjs` onto the shared `src/lib/inventory` checks to eliminate drift. **M**.
6. Add migration/test that fails CI when a new table with `tenant_id` lacks an RLS policy. **S**.
