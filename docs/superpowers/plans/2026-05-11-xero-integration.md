# Xero Accounting Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect a tenant's Xero organisation via OAuth and automatically push a Bill to Xero whenever a goods inwards delivery receipt is completed.

**Architecture:** A lib module `src/lib/accounting/` holds the Xero OAuth helpers and bill push logic. Two API routes handle the OAuth dance (`/api/xero/install` + `/api/xero/callback`). A new `accounting_connection` table stores tokens per tenant. After a delivery receipt is successfully saved, `createDeliveryReceipt` calls `pushBillToAccounting()` — which fetches the connection, refreshes the token if needed, formats the receipt as a Xero ACCPAY invoice, creates it, and logs the result in `accounting_sync_event`. The receipt creation never fails due to a sync error. Sync status is surfaced in the Settings → Integrations page.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), TypeScript, Xero API v2 (REST + JSON), OAuth 2.0 authorization code flow

---

### Task 1: Database migration — accounting_connection and accounting_sync_event

**Goal:** Create the two tables that store Xero connection credentials and bill sync history per tenant.

**Files:**
- Create: `supabase/patches/accounting_integration.sql`

**Acceptance Criteria:**
- [ ] `accounting_connection` table exists with all columns
- [ ] `accounting_sync_event` table exists with all columns
- [ ] Both tables have RLS enabled with `current_tenant_id()` policy
- [ ] Only one active connection per tenant+provider is allowed (unique partial index)
- [ ] `authenticated` role has full access to both tables

**Verify:** In Supabase SQL editor → run the patch file → `\d accounting_connection` shows all columns; `\d accounting_sync_event` shows all columns.

**Steps:**

- [ ] **Step 1: Create `supabase/patches/accounting_integration.sql`**

```sql
-- accounting_connection: one active row per tenant per provider
create table public.accounting_connection (
  id                  uuid        default gen_random_uuid() primary key,
  tenant_id           uuid        not null,
  provider            text        not null check (provider in ('xero', 'qbo')),
  access_token        text        not null,
  refresh_token       text        not null,
  token_expires_at    timestamptz not null,
  -- provider-specific organisation identifier
  provider_org_id     text        not null,  -- Xero tenantId
  account_name        text        not null,  -- e.g. "My Company - Xero"
  -- which Xero account code to use on bill lines (user-configurable; 300 is common AU purchases)
  default_account_code text       not null default '300',
  connected_by        uuid        references auth.users(id),
  connected_at        timestamptz not null default now(),
  is_active           boolean     not null default true,
  created_at          timestamptz not null default now()
);

-- Only one active connection per tenant per provider
create unique index accounting_connection_tenant_provider_active_idx
  on public.accounting_connection (tenant_id, provider)
  where is_active = true;

alter table public.accounting_connection enable row level security;

create policy "tenant isolation"
  on public.accounting_connection
  using (tenant_id = public.current_tenant_id());

grant all on public.accounting_connection to authenticated;

-- accounting_sync_event: one row per bill push attempt
create table public.accounting_sync_event (
  id             uuid        default gen_random_uuid() primary key,
  tenant_id      uuid        not null,
  connection_id  uuid        not null references public.accounting_connection(id) on delete cascade,
  entity_type    text        not null check (entity_type in ('bill')),
  entity_id      uuid        not null,  -- delivery_receipt.id
  external_id    text,                  -- Xero InvoiceID (null on failure)
  status         text        not null check (status in ('synced', 'failed')),
  error          text,
  synced_at      timestamptz not null default now()
);

alter table public.accounting_sync_event enable row level security;

create policy "tenant isolation"
  on public.accounting_sync_event
  using (tenant_id = public.current_tenant_id());

grant all on public.accounting_sync_event to authenticated;
```

- [ ] **Step 2: Apply the patch in Supabase SQL editor**

Copy the file contents into the Supabase dashboard SQL editor for your project and run it. Verify with:
```sql
select column_name from information_schema.columns
where table_name = 'accounting_connection' order by ordinal_position;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/patches/accounting_integration.sql
git commit -m "feat(xero): add accounting_connection and accounting_sync_event tables"
```

---

### Task 2: Xero OAuth lib

**Goal:** Implement the Xero OAuth helpers — build auth URL, exchange code for tokens, refresh tokens, fetch organisations, create a bill — as pure async functions in `src/lib/accounting/xero.ts`.

**Files:**
- Create: `src/lib/accounting/xero.ts`

**Acceptance Criteria:**
- [ ] `buildXeroAuthUrl(state)` returns a valid Xero authorization URL
- [ ] `exchangeXeroCode(code)` exchanges a code for `{ access_token, refresh_token, expires_in }`
- [ ] `refreshXeroToken(refreshToken)` returns a fresh token set
- [ ] `getXeroOrgs(accessToken)` returns `{ tenantId, tenantName }[]`
- [ ] `createXeroBill(accessToken, xeroTenantId, bill)` returns a Xero InvoiceID string
- [ ] All functions throw descriptive errors on non-2xx responses

**Verify:** `npx tsx -e "import { buildXeroAuthUrl } from './src/lib/accounting/xero'; console.log(buildXeroAuthUrl('test-state'))"` → prints a Xero URL containing `login.xero.com`.

**Steps:**

- [ ] **Step 1: Add env var entries to `.env.local`**

Add these three lines (get values from the Xero developer portal after creating an app):

```
XERO_CLIENT_ID=your_client_id
XERO_CLIENT_SECRET=your_client_secret
XERO_REDIRECT_URI=http://localhost:3000/api/xero/callback
```

For production, set `XERO_REDIRECT_URI` to `https://app.manuva.io/api/xero/callback`.

- [ ] **Step 2: Create `src/lib/accounting/xero.ts`**

```typescript
const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID!;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET!;
const XERO_REDIRECT_URI = process.env.XERO_REDIRECT_URI!;

const AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const INVOICES_URL = "https://api.xero.com/api.xro/2.0/Invoices";

export type XeroTokenSet = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds until access_token expires
};

export type XeroOrg = {
  tenantId: string;
  tenantName: string;
};

export type XeroBillLine = {
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode: string;
};

export type XeroBillInput = {
  contactName: string;
  date: string;      // "YYYY-MM-DD"
  dueDate: string;   // "YYYY-MM-DD"
  reference?: string;
  lines: XeroBillLine[];
};

function xeroBasicAuth(): string {
  return Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString("base64");
}

export function buildXeroAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: XERO_CLIENT_ID,
    redirect_uri: XERO_REDIRECT_URI,
    scope: "accounting.transactions offline_access",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeXeroCode(code: string): Promise<XeroTokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${xeroBasicAuth()}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: XERO_REDIRECT_URI,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Xero token exchange failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<XeroTokenSet>;
}

export async function refreshXeroToken(refreshToken: string): Promise<XeroTokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${xeroBasicAuth()}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Xero token refresh failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<XeroTokenSet>;
}

export async function getXeroOrgs(accessToken: string): Promise<XeroOrg[]> {
  const res = await fetch(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch Xero orgs (${res.status}): ${body}`);
  }
  const data = await res.json() as Array<{ tenantId: string; tenantName: string }>;
  return data.map((d) => ({ tenantId: d.tenantId, tenantName: d.tenantName }));
}

export async function createXeroBill(
  accessToken: string,
  xeroTenantId: string,
  bill: XeroBillInput
): Promise<string> {
  const body = {
    Invoices: [
      {
        Type: "ACCPAY",
        Contact: { Name: bill.contactName },
        Date: bill.date,
        DueDate: bill.dueDate,
        Reference: bill.reference ?? "",
        LineItems: bill.lines.map((l) => ({
          Description: l.description,
          Quantity: l.quantity,
          UnitAmount: l.unitAmount,
          AccountCode: l.accountCode,
        })),
      },
    ],
  };
  const res = await fetch(INVOICES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": xeroTenantId,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Xero bill creation failed (${res.status}): ${err}`);
  }
  const data = await res.json() as { Invoices: Array<{ InvoiceID: string }> };
  return data.Invoices[0].InvoiceID;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/accounting/xero.ts
git commit -m "feat(xero): add xero.ts — OAuth helpers and bill creation"
```

---

### Task 3: OAuth routes — install, callback, disconnect

**Goal:** Three Next.js route handlers that implement the full Xero OAuth connect/disconnect lifecycle.

**Files:**
- Create: `src/app/api/xero/install/route.ts`
- Create: `src/app/api/xero/callback/route.ts`
- Create: `src/app/api/xero/disconnect/route.ts`

**Acceptance Criteria:**
- [ ] `GET /api/xero/install` redirects an authenticated admin to the Xero authorization page
- [ ] `GET /api/xero/callback` exchanges the code, fetches orgs, upserts `accounting_connection`, redirects to settings with `?xero=connected`
- [ ] `POST /api/xero/disconnect` deactivates the connection row, redirects to settings with `?xero=disconnected`
- [ ] Unauthenticated or non-admin requests are redirected to `/app/settings/integrations`
- [ ] State cookie is cleared after callback

**Verify:** `npm run dev` → Settings → Integrations → click "Connect Xero" → Xero login page opens. After authorizing → redirected back to `/app/settings/integrations?xero=connected`.

**Steps:**

- [ ] **Step 1: Create `src/app/api/xero/install/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { buildXeroAuthUrl } from "@/lib/accounting/xero";

export async function GET() {
  const ctx = await getServerTenantContext();
  if (!ctx || (ctx.role !== "admin" && ctx.role !== "super_admin")) {
    return NextResponse.redirect(
      new URL("/app/settings/integrations", process.env.NEXT_PUBLIC_APP_URL!)
    );
  }

  const state = `${crypto.randomUUID()}:${ctx.tenantId}`;
  const authUrl = buildXeroAuthUrl(state);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("xero_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
```

- [ ] **Step 2: Create `src/app/api/xero/callback/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeXeroCode, getXeroOrgs } from "@/lib/accounting/xero";

const SETTINGS_URL = `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/integrations`;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = request.cookies.get("xero_oauth_state")?.value;

  // Validate state to prevent CSRF
  if (!code || !state || !storedState || state !== storedState) {
    const res = NextResponse.redirect(`${SETTINGS_URL}?xero=error`);
    res.cookies.delete("xero_oauth_state");
    return res;
  }

  // State is "{nonce}:{tenantId}"
  const tenantId = storedState.split(":").slice(1).join(":");

  try {
    const tokens = await exchangeXeroCode(code);
    const orgs = await getXeroOrgs(tokens.access_token);
    if (orgs.length === 0) throw new Error("No Xero organisations found");

    // Use the first org (most Xero accounts have exactly one)
    const org = orgs[0];

    const admin = createAdminClient();

    // Deactivate any existing connection for this tenant+provider
    await admin
      .from("accounting_connection")
      .update({ is_active: false })
      .eq("tenant_id", tenantId)
      .eq("provider", "xero")
      .eq("is_active", true);

    await admin.from("accounting_connection").insert({
      tenant_id: tenantId,
      provider: "xero",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      provider_org_id: org.tenantId,
      account_name: org.tenantName,
      is_active: true,
    });

    const res = NextResponse.redirect(`${SETTINGS_URL}?xero=connected`);
    res.cookies.delete("xero_oauth_state");
    return res;
  } catch (err) {
    console.error("[xero/callback]", err);
    const res = NextResponse.redirect(`${SETTINGS_URL}?xero=error`);
    res.cookies.delete("xero_oauth_state");
    return res;
  }
}
```

- [ ] **Step 3: Create `src/app/api/xero/disconnect/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { createAdminClient } from "@/lib/supabase/admin";

const SETTINGS_URL = `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/integrations`;

export async function POST() {
  const ctx = await getServerTenantContext();
  if (!ctx || (ctx.role !== "admin" && ctx.role !== "super_admin")) {
    return NextResponse.redirect(`${SETTINGS_URL}?xero=error`);
  }

  const admin = createAdminClient();
  await admin
    .from("accounting_connection")
    .update({ is_active: false })
    .eq("tenant_id", ctx.tenantId)
    .eq("provider", "xero")
    .eq("is_active", true);

  return NextResponse.redirect(`${SETTINGS_URL}?xero=disconnected`);
}
```

- [ ] **Step 4: Add `NEXT_PUBLIC_APP_URL` to `.env.local` if not already set**

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/xero/
git commit -m "feat(xero): add OAuth install/callback/disconnect routes"
```

---

### Task 4: Push bill lib + goods-inwards trigger

**Goal:** A `pushBillToAccounting()` function that fetches the tenant's Xero connection, refreshes the token if needed, formats the receipt as a bill, creates it in Xero, and logs the result — then wire it into `createDeliveryReceipt`.

**Files:**
- Create: `src/lib/accounting/push-bill.ts`
- Modify: `src/app/app/goods-inwards/actions.ts`

**Acceptance Criteria:**
- [ ] If no active Xero connection exists for the tenant, `pushBillToAccounting` returns without error
- [ ] If the access token is expired, it is refreshed and the connection row is updated before the bill is created
- [ ] Receipt lines with `cost_per_unit = null` are excluded from the bill (no costed lines → function returns without pushing)
- [ ] A bill is created in Xero with the supplier's name, received date, reference, and one line per costed receipt line
- [ ] The result (success or failure + error message) is logged to `accounting_sync_event`
- [ ] `createDeliveryReceipt` awaits `pushBillToAccounting` after the activity log insert; a push failure does not roll back the receipt
- [ ] `pushBillToAccounting` never throws — all errors are caught and written to `accounting_sync_event`

**Verify:** `npm run dev` → create a delivery receipt with at least one costed line → check `accounting_sync_event` table in Supabase for a row with `status = 'synced'` and a non-null `external_id`.

**Steps:**

- [ ] **Step 1: Create `src/lib/accounting/push-bill.ts`**

```typescript
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshXeroToken, createXeroBill } from "@/lib/accounting/xero";

export async function pushBillToAccounting(
  tenantId: string,
  receiptId: string
): Promise<void> {
  const admin = createAdminClient();

  // 1. Fetch active Xero connection
  const { data: connection } = await admin
    .from("accounting_connection")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("provider", "xero")
    .eq("is_active", true)
    .maybeSingle();

  if (!connection) return; // No Xero connected — skip silently

  // 2. Refresh token if within 60 seconds of expiry
  let accessToken = connection.access_token;
  if (new Date(connection.token_expires_at).getTime() - Date.now() < 60_000) {
    try {
      const refreshed = await refreshXeroToken(connection.refresh_token);
      accessToken = refreshed.access_token;
      await admin
        .from("accounting_connection")
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          token_expires_at: new Date(
            Date.now() + refreshed.expires_in * 1000
          ).toISOString(),
        })
        .eq("id", connection.id);
    } catch (err) {
      await admin.from("accounting_sync_event").insert({
        tenant_id: tenantId,
        connection_id: connection.id,
        entity_type: "bill",
        entity_id: receiptId,
        status: "failed",
        error: `Token refresh failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
  }

  // 3. Fetch receipt with lines, component names, and supplier name
  const { data: receipt } = await admin
    .from("delivery_receipt")
    .select(
      `
      supplier_reference,
      received_at,
      supplier_name_override,
      supplier:supplier_id ( name ),
      delivery_receipt_line (
        quantity_delivered,
        cost_per_unit,
        notes,
        component:component_id ( name )
      )
    `
    )
    .eq("id", receiptId)
    .eq("tenant_id", tenantId)
    .single();

  if (!receipt) return;

  // 4. Build bill lines — skip any lines without a cost
  type LineRow = {
    quantity_delivered: number;
    cost_per_unit: number | null;
    notes: string | null;
    component: { name: string } | null;
  };

  const billLines = (receipt.delivery_receipt_line as LineRow[])
    .filter((l) => l.cost_per_unit != null)
    .map((l) => ({
      description:
        (l.component?.name ?? "Component") +
        (l.notes ? ` — ${l.notes}` : ""),
      quantity: l.quantity_delivered,
      unitAmount: l.cost_per_unit!,
      accountCode: connection.default_account_code,
    }));

  if (billLines.length === 0) return; // Nothing costed to bill

  type SupplierRow = { name: string } | null;
  const supplierName =
    (receipt.supplier as SupplierRow)?.name ??
    receipt.supplier_name_override ??
    "Unknown Supplier";

  const date = receipt.received_at.slice(0, 10); // "YYYY-MM-DD"

  // 5. Create bill in Xero
  let externalId: string | null = null;
  let status: "synced" | "failed" = "failed";
  let error: string | null = null;

  try {
    externalId = await createXeroBill(accessToken, connection.provider_org_id, {
      contactName: supplierName,
      date,
      dueDate: date,
      reference: receipt.supplier_reference,
      lines: billLines,
    });
    status = "synced";
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  // 6. Log result — never throws
  await admin.from("accounting_sync_event").insert({
    tenant_id: tenantId,
    connection_id: connection.id,
    entity_type: "bill",
    entity_id: receiptId,
    external_id: externalId,
    status,
    error,
  });
}
```

- [ ] **Step 2: Wire into `createDeliveryReceipt` in `src/app/app/goods-inwards/actions.ts`**

Add the import at the top of the file:

```typescript
import { pushBillToAccounting } from "@/lib/accounting/push-bill";
```

After the existing activity log insert (line ~136) and before the `revalidatePath` calls, add:

```typescript
  // Push bill to accounting integration (non-blocking failure)
  await pushBillToAccounting(tenantId, receipt.id);
```

The final sequence in `createDeliveryReceipt` becomes:

```typescript
  // ... existing: rpc("receive_delivery_receipt") ...
  // ... existing: activity_log insert ...

  await pushBillToAccounting(tenantId, receipt.id);

  revalidatePath("/app/goods-inwards");
  revalidatePath("/app/purchasing");
  revalidatePath("/app/inventory");
  revalidatePath("/app/activity-log");

  redirect(`/app/goods-inwards/${receipt.id}`);
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/accounting/push-bill.ts src/app/app/goods-inwards/actions.ts
git commit -m "feat(xero): push bill to Xero on delivery receipt completion"
```

---

### Task 5: Settings UI — Xero connect panel

**Goal:** Add a Xero section to the Settings → Integrations page showing connection status and the last 5 sync events, with connect/disconnect actions.

**Files:**
- Create: `src/app/app/settings/integrations/xero-manage.tsx`
- Modify: `src/app/app/settings/integrations/page.tsx`

**Acceptance Criteria:**
- [ ] The integrations page queries `accounting_connection` and `accounting_sync_event` for the current tenant
- [ ] If no active Xero connection: shows a "Connect Xero" link pointing to `/api/xero/install`
- [ ] If connected: shows the Xero org name, a "Disconnect" form posting to `/api/xero/disconnect`, and a table of the last 5 sync events (date, status, receipt reference or error)
- [ ] A `?xero=connected` query param shows a success banner; `?xero=error` shows an error banner
- [ ] Handles `?xero=disconnected` to show a disconnected confirmation

**Verify:** `npm run dev` → Settings → Integrations → Xero section appears. Connect via OAuth → section shows org name and "Disconnect" button. Create a delivery receipt with cost → sync event appears in the table.

**Steps:**

- [ ] **Step 1: Create `src/app/app/settings/integrations/xero-manage.tsx`**

```tsx
"use client";

import styles from "../settings-layout.module.css";

type SyncEvent = {
  id: string;
  status: "synced" | "failed";
  error: string | null;
  synced_at: string;
  external_id: string | null;
};

type XeroManageProps = {
  connected: boolean;
  accountName?: string;
  recentSyncs: SyncEvent[];
};

export function XeroManage({ connected, accountName, recentSyncs }: XeroManageProps) {
  if (!connected) {
    return (
      <div className={styles.integrationRow}>
        <div className={styles.integrationInfo}>
          <span className={styles.integrationName}>Xero</span>
          <span className={styles.integrationDesc}>
            Automatically push bills to Xero when deliveries are received.
          </span>
        </div>
        <a href="/api/xero/install" className={styles.connectButton}>
          Connect Xero
        </a>
      </div>
    );
  }

  return (
    <div className={styles.integrationSection}>
      <div className={styles.integrationRow}>
        <div className={styles.integrationInfo}>
          <span className={styles.integrationName}>Xero</span>
          <span className={styles.integrationConnected}>{accountName}</span>
        </div>
        <form action="/api/xero/disconnect" method="POST">
          <button type="submit" className={styles.disconnectButton}>
            Disconnect
          </button>
        </form>
      </div>
      {recentSyncs.length > 0 && (
        <table className={styles.syncTable}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Xero Bill ID</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {recentSyncs.map((ev) => (
              <tr key={ev.id}>
                <td>{new Date(ev.synced_at).toLocaleDateString()}</td>
                <td>{ev.status}</td>
                <td>{ev.external_id ?? "—"}</td>
                <td>{ev.error ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `src/app/app/settings/integrations/page.tsx`**

Add the Xero query after the existing Shopify query. Read the current page to find the exact insertion points, then:

After the Shopify store query, add:

```tsx
  // Xero connection
  const { data: xeroConnection } = await supabase
    .from("accounting_connection")
    .select("id, account_name, is_active")
    .eq("tenant_id", tenantId)
    .eq("provider", "xero")
    .eq("is_active", true)
    .maybeSingle();

  const { data: xeroSyncs } = xeroConnection
    ? await supabase
        .from("accounting_sync_event")
        .select("id, status, error, synced_at, external_id")
        .eq("tenant_id", tenantId)
        .eq("connection_id", xeroConnection.id)
        .order("synced_at", { ascending: false })
        .limit(5)
    : { data: [] };
```

Then in the JSX, add the `<XeroManage>` component after the Shopify section:

```tsx
import { XeroManage } from "./xero-manage";

// In the JSX:
<XeroManage
  connected={!!xeroConnection}
  accountName={xeroConnection?.account_name ?? undefined}
  recentSyncs={xeroSyncs ?? []}
/>
```

Also handle the `?xero=` query params in the existing `StatusBanner` or alongside it:

```tsx
const xeroParam = searchParams?.xero;
// Add xero status messages to the existing banner logic or render a separate banner:
{xeroParam === "connected" && (
  <div role="status" aria-live="polite" className={styles.bannerSuccess}>
    Xero connected successfully.
  </div>
)}
{xeroParam === "disconnected" && (
  <div role="status" aria-live="polite" className={styles.bannerInfo}>
    Xero disconnected.
  </div>
)}
{xeroParam === "error" && (
  <div role="alert" aria-live="assertive" className={styles.bannerError}>
    Xero connection failed. Please try again.
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app/settings/integrations/xero-manage.tsx src/app/app/settings/integrations/page.tsx
git commit -m "feat(xero): add Xero connect/disconnect panel to integrations settings"
```
