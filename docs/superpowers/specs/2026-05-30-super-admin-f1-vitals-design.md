# Super-Admin F1: Tenant Vitals + Integration Health — Design

**Date:** 2026-05-30
**Status:** Approved, pending implementation plan
**Depends on:** `docs/superpowers/specs/2026-05-28-super-admin-foundation-design.md`

---

## Goal

Give platform operators immediate health signal on every tenant — before they open the detail page — and a full vitals breakdown once they do. No view-as required. Covers integration status (Shopify, Xero/QBO), activity levels, and a data snapshot.

---

## What already exists (do not rebuild)

- `shopify_store` has `last_synced_at`, `last_sync_status` (`'ok'` | `'failed'`), `last_sync_meta` JSONB
- `accounting_connection` has `provider`, `is_active`, `token_expires_at`, `account_name`
- `accounting_sync_event` has per-sync `status` (`'synced'` | `'failed'`) + `synced_at`
- `tenant_subscription` has `status`, `trial_ends_at`, `stripe_customer_id` — already displayed in the subscription panel
- `activity_log` has tenant-scoped events with `actor_id` + `created_at`
- `get_user_emails(p_ids uuid[])` RPC already returns `last_sign_in_at` per user (added in foundation work)
- `is_platform_operator()` SQL helper guards all new RPCs

---

## Decisions

| Decision | Choice |
|---|---|
| Where vitals live | Health dot on tenant list; full Vitals panel on tenant detail (between Members and Audit sections) |
| Access model | Two new `security definer` RPCs — no RLS changes to individual business tables |
| Stripe in integration panel | **Excluded** — subscription status + next renewal already displayed in the Subscription section above. No Stripe card. |
| Activity proxy | `activity_log` events (tenant-scoped write actions) for 7-day counts; `auth.users.last_sign_in_at` via `get_user_emails` for last sign-in |
| Data counts | `component`, `product_bom`, `orders` (open only), `suppliers` — all via the `get_tenant_vitals` RPC |
| List health query | Single `get_tenant_health_indicators(uuid[])` call after tenant list, joined client-side by tenant ID |
| Vitals query | Single `get_tenant_vitals(uuid)` call on detail page, parallel with existing queries via `Promise.all` |

---

## Schema — new SQL

File: `supabase/patches/super_admin_tenant_vitals.sql`

### `get_tenant_health_indicators(p_tenant_ids uuid[])`

Returns one row per tenant with a health level and reasons array. Called by the tenant list page.

```sql
returns table(tenant_id uuid, health text, reasons text[])
```

**Health rules (evaluated in order — first match wins):**

| Level | Condition |
|---|---|
| `critical` | Shopify `last_sync_status = 'failed'`, OR any active `accounting_connection` with `token_expires_at < now()`, OR `tenant_subscription.status = 'past_due'` |
| `warn` | `trial_ends_at` between `now()` and `now() + 7 days`, OR no `activity_log` row in last 30 days, OR active accounting connection with `token_expires_at` between `now()` and `now() + 7 days` |
| `ok` | Everything else (including tenants with no integrations connected) |

The `reasons` array contains human-readable strings for each triggered condition, e.g. `["Shopify sync failed", "Trial ending soon"]`. Used in the tooltip on hover.

Security: function body checks `is_platform_operator()` and raises `forbidden` if not.

---

### `get_tenant_vitals(p_tenant_id uuid)`

Returns a single row with all vitals data for one tenant. Called by the tenant detail page.

```sql
returns table(
  -- Activity
  last_activity_at         timestamptz,
  seven_day_event_count    int,
  seven_day_active_members int,
  member_last_sign_in_at   timestamptz,  -- max across all members
  -- Data counts
  component_count          int,
  bom_count                int,
  open_order_count         int,
  supplier_count           int,
  -- Shopify
  shopify_connected        bool,
  shopify_store_domain     text,
  shopify_last_synced_at   timestamptz,
  shopify_last_sync_status text,
  shopify_last_sync_error  text,          -- first error from last_sync_meta JSONB, null if ok
  -- Accounting (most recent active connection)
  accounting_provider      text,          -- 'xero' | 'qbo' | null
  accounting_account_name  text,
  accounting_token_expires_at timestamptz,
  accounting_token_expired    bool,
  accounting_thirty_day_synced int,
  accounting_thirty_day_failed int
)
```

All data is computed server-side in SQL. `open_order_count` counts orders where `status NOT IN ('completed', 'cancelled')`. Security: same `is_platform_operator()` guard.

Both functions are granted `execute` to `authenticated` only (not `anon`).

---

## File structure

**New SQL:**
- `supabase/patches/super_admin_tenant_vitals.sql`

**Modified:**
- `src/app/app/super-admin/page.tsx` — fetch health indicators; add health dot column to table
- `src/app/app/super-admin/super-admin.module.css` — health dot styles
- `src/app/app/super-admin/tenants/[tenantId]/page.tsx` — add `get_tenant_vitals` to `Promise.all`; render `<VitalsPanel>`

**New:**
- `src/app/app/super-admin/tenants/[tenantId]/_components/vitals-panel.tsx`
- `src/app/app/super-admin/tenants/[tenantId]/_components/vitals-panel.module.css`

---

## Tenant list — health dot column

A new `Health` column inserted as the second column (after Name, before Status).

Rendered as a 10px circle with a tooltip on hover listing the `reasons` array. No colour key legend in the UI — the tooltip is self-explanatory.

```
Name        Health   Status       Plan   ...
Acme Corp   🟢       Active       pro    ...
Beta Ltd    🔴 ⓘ    Trialing     starter ...
  └─ tooltip: "Shopify sync failed · Trial ending soon"
```

**Query pattern on the list page:**

```ts
// After fetching tenants:
const tenantIds = (tenants ?? []).map(t => t.id);
const { data: healthRows } = await supabase.rpc("get_tenant_health_indicators", {
  p_tenant_ids: tenantIds,
});
const healthByTenant = new Map(
  (healthRows ?? []).map(r => [r.tenant_id, r])
);
// Then in the row render: healthByTenant.get(t.id)
```

---

## Tenant detail — Vitals panel

Inserted between the Members section and the Audit section.

### Layout

Three equal-width cards in a CSS grid (`grid-template-columns: repeat(3, 1fr)`). On narrow viewports, stacks to one column.

---

### Card 1: Integrations

**Shopify row:**
- Left: Shopify icon + label "Shopify"
- Right: if connected — status dot + `"Synced 3h ago"` (relative time) or `"Sync failed · <error text truncated to 80 chars>"`
- If not connected: `"Not connected"` in muted ink

**Xero / QBO row:**
- Left: provider label ("Xero" or "QuickBooks")
- Right: if connected — `"Token expires in 4 days"` (warn colour if ≤ 7 days, danger colour if expired) + `"28 synced / 2 failed (30d)"`
- If not connected: `"Not connected"` in muted ink

**If no integrations at all:** Single muted row: `"No integrations connected"`

---

### Card 2: Activity

```
Last sign-in       3 days ago       (max across all members, from get_user_emails)
Active members     3 of 5           (distinct actors in activity_log last 7 days / total)
Write events       142              (activity_log count last 7 days)
```

If `last_activity_at` is null or > 30 days ago, render "Last sign-in" in warn colour.

---

### Card 3: Data snapshot

```
Components (SKUs)  1,204
BOMs               47
Open orders        12
Suppliers          38
```

Numbers formatted with `toLocaleString()`. No links (this is read-only data snapshot).

---

## Testing

Vitest, co-located with SQL and components.

**`super_admin_tenant_vitals.sql` RPC tests** (run against local Supabase with seeded data):
- Non-platform-operator calling `get_tenant_health_indicators` → throws `forbidden`
- Tenant with failed Shopify sync → `health = 'critical'`, reasons includes `'Shopify sync failed'`
- Tenant with trial ending in 3 days → `health = 'warn'`
- Tenant with no issues → `health = 'ok'`, reasons empty
- `get_tenant_vitals` with no integrations → all integration fields null/false
- `get_tenant_vitals` with active Xero + expired token → `accounting_token_expired = true`

**`vitals-panel.tsx` unit tests** — mock the vitals data shape; assert:
- Expired token renders in danger colour
- Null `last_activity_at` renders "No activity" not a date error
- "Not connected" shown when `shopify_connected = false`

---

## Non-goals for F1

- Revenue metrics / MRR (ruled out in brainstorm — not needed to run the product)
- Stripe events panel (subscription status already visible above)
- Shopper-level activity (PII — privacy model B forbids without view-as)
- Historical health trend charts
- Email alerts when health turns critical
- Shopify token expiry tracking (`shopify_install_tokens` has no `expires_at` — Shopify tokens don't expire on a fixed schedule; sync status is the reliable signal)
