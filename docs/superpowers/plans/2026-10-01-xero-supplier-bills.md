# Xero Supplier Bills (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dead May 2026 Xero code with a production-grade integration: an admin connects Xero, purchasing users record supplier tax invoices against goods receipts, and Manuva creates each bill in Xero exactly once.

**Architecture:**
- **Pure library.** Pure TypeScript modules in `src/lib/accounting/` hold every rule (crypto, OAuth state, Xero client, error mapping, invoice maths, bill payloads, job state machine), and are unit-tested with vitest.
- **Postgres owns the data invariants.** New tables live behind RLS, encrypted credentials are readable only by the server, and `SECURITY DEFINER` functions handle posting, voiding and claiming jobs.
- **Delivery to Xero runs through an outbox.**
  - A server action kicks it after each response using `after()` from `next/server`.
  - Supabase `pg_cron` + `pg_net` call the cron routes every 5 minutes and daily. The Vercel team is on Hobby, so Vercel Cron can't do it.
- **Thin UI.** Next.js server components and actions compose the `_ui/` primitives.

**Tech Stack:** Next.js 16.1 (App Router, server actions, `after`), React 19, Supabase Postgres + supabase-js 2.49, vitest 4, Node `crypto` (AES-256-GCM, HMAC-SHA256), Xero Accounting API 2.0 over plain `fetch`, Resend for email.

**Spec:** `docs/superpowers/specs/2026-10-01-xero-supplier-bills-design.md`. Executors read the spec alongside this plan. Research: `docs/research/xero-integration/01–04`.

**Task code:** MANUVA-34. Put `MANUVA-34` in every commit message, and also `MANUVA-44` or `MANUVA-45` for the cleanup chunk. Commit message bodies containing backticks must be written to a file and committed with `git commit -F <file>` (handoff gotcha 11).

## Global Constraints

**Xero access**
- Scopes, exactly: `openid profile email offline_access accounting.invoices accounting.contacts accounting.settings.read`. Never request `accounting.transactions`.
- The redirect URI is `https://app.manuva.app/api/xero/callback`. The app lives on `app.manuva.app`, never on `manuva.app`.
- Bills are created as `Type: "ACCPAY"` with `Status: "SUBMITTED"` and `unitdp=4`.
  - Line items **never** carry `ItemCode`.
  - The supplier's invoice number goes in `InvoiceNumber`. `Reference` is ignored by Xero on bills, so the PO number goes into each stock line's description instead.
- Use a thin `fetch` client, never the `xero-node` SDK.
- Xero calls have a 15-second timeout.
- `Idempotency-Key` on every Xero create is `si-{invoiceId}-create`, `si-{invoiceId}-void` or `sup-{supplierId}-contact`.

**Tokens and secrets**
- Tokens are stored only in `accounting_credential`, AES-256-GCM encrypted, in envelope `v{version}.{iv}.{tag}.{ct}` (base64url).
- `anon`/`authenticated` get **no** privileges on that table.
- The key is `ACCOUNTING_TOKEN_KEY`: 32 bytes, base64.
- Every Supabase `{ error }` is checked with `assertNoError` from `src/lib/supabase/assert-no-error.ts`. Never leave a supabase-js result unchecked.
- Secrets live in 1Password first and are then copied to Vercel. Never in a file, a commit, a test fixture or a log.

**Database changes**
- Production (`svhaotzrtfbwmphaacjj`) is the only database. Every migration is a file in `supabase/patches/`.
- Apply a migration **only after the user says yes in this session**. Use the Supabase MCP `apply_migration`.
- After any migration that adds a function, run `scripts/probe_anon_rpc_surface.sh`.
- Never revoke `anon` `EXECUTE` on `current_tenant_id`, `is_super_admin`, `has_tenant_access`, `is_platform_operator` or `current_profile_role` (handoff gotcha 5).
- Never hand-retype an existing SQL function. Dump it with `pg_get_functiondef` and edit only the named lines (handoff gotcha 3).

**Roles and access**
- Admin means `role === "admin" || role === "super_admin"`. Use `requireAdmin()` / `isAdminRole()` from `src/lib/tenant/authz.ts`.
- Tenant context always comes from `getServerTenantContext()`.
- Pilot gating uses the `XERO_PILOT_TENANTS` env var (comma-separated tenant ids, or `*`), through `isXeroPilotTenant()`.

**UI and repo conventions**
- UI follows `docs/design-system.md`: `PageHeader` with an eyebrow on every page, `StatusBadge`, `EmptyState`, and `composes:` from `_ui/table.module.css` and `_ui/buttons.module.css`. No hex colours, no invented tokens, no inline layout styles.
- Never `git stash` in this repo. Never touch the ~200 pre-existing dirty files (`.playwright-mcp/`, `.claude/`, pycache, `ui-shot-*.png`). Stage only the files each task names.
- Commands:
  - unit tests: `npx vitest run <path>`
  - full suite: `npm test`
  - types: `npx tsc --noEmit`
  - lint: `npx eslint <paths>`

## Review Focus

Each line names a failure the spec implies but the happy path never exercises. Its pinning test lives in the named task.

1. **A retry after a lost Xero response** must adopt the existing bill, not create a second one. Task 15, `handleCreateBill` test "adopts an existing bill on a retry".
2. **Two workers refreshing the same token at once** must leave exactly one refresh and both callers with a valid token. Task 12, test "a lease loser waits and uses the winner's token".
3. **An invoice dated inside a Xero lock period** fails as `fixable` with the lock date in the message, and makes no create call. Task 15, test "blocks a bill dated on or before the lock date".
4. **A receipt line already on a posted invoice** cannot be posted on a second one, even if both were drafted concurrently. Task 10 verify SQL, case "second posting of the same receipt line is refused".
5. **Reconnecting to a different Xero organisation** cancels queued jobs and drops contact links that point at the old organisation's ContactIDs. Task 13, test "saveConnection cancels jobs and drops links when the organisation changes".

---

## File Map

**Chunk A: cleanup (PR 1, ships alone)**

| File | Change |
|---|---|
| `supabase/patches/2026-10-01-manuva-44-vitals-without-accounting.sql` | Create. Neutralises the accounting reads in the two super-admin functions. |
| `src/app/app/goods-inwards/actions.ts` | Modify. Remove the `pushBillToAccounting` import and call. |
| `src/app/app/settings/integrations/page.tsx` | Modify. Remove the Xero card and its queries. |
| `src/app/app/settings/integrations/xero-manage.tsx` | Delete. |
| `src/lib/accounting/xero.ts`, `src/lib/accounting/push-bill.ts`, `src/lib/accounting/push-bill.test.ts` | Delete. |
| `src/app/api/xero/install/route.ts`, `src/app/api/xero/callback/route.ts`, `src/app/api/xero/disconnect/route.ts` | Delete. |
| `supabase/patches/accounting_integration.sql` | Delete. Never applied, and unsafe. |
| `docs/qa-feature-test-plan.md` | Modify. §16 marked "removed pending rebuild", plus a changelog line. |

**Chunk B: pure library**

| File | Responsibility |
|---|---|
| `src/lib/security/signed-state.ts` (+ `.test.ts`) | HMAC-signed, expiring OAuth state |
| `src/lib/security/token-crypto.ts` (+ `.test.ts`) | AES-256-GCM token envelopes, key loading |
| `src/lib/accounting/xero/config.ts` (+ `.test.ts`) | Env config, scopes, authorize URL, pilot gate |
| `src/lib/accounting/xero/scrub.ts` (+ `.test.ts`) | Strip tokens from anything stored or logged |
| `src/lib/accounting/xero/identity.ts` (+ `.test.ts`) | Token exchange, refresh, revoke, `/connections` |
| `src/lib/accounting/xero/client.ts` (+ `.test.ts`) | Accounting API `fetch` wrapper and rate headers |
| `src/lib/accounting/xero/errors.ts` (+ `.test.ts`) | Error classes and the plain-English catalogue |
| `src/lib/accounting/outbox/backoff.ts` (+ `.test.ts`) | Retry schedule |
| `src/lib/accounting/supplier-invoice/terms.ts` (+ `.test.ts`) | Payment-terms → due date |
| `src/lib/accounting/supplier-invoice/calc.ts` (+ `.test.ts`) | Line amounts, totals, variances, eligibility |
| `src/lib/accounting/supplier-invoice/draft.ts` (+ `.test.ts`) | Draft payload parsing and validation |
| `src/lib/accounting/xero/org.ts` (+ `.test.ts`) | Organisation, account, tax and contact reads; lock dates |
| `src/lib/accounting/xero/setup.ts` (+ `.test.ts`) | Setup validation and sales-source guidance |
| `src/lib/accounting/xero/bill.ts` (+ `.test.ts`) | Bill, contact and void payloads; duplicate-search filter |

**Chunk C: database**

| File | Responsibility |
|---|---|
| `supabase/patches/2026-10-01-xero-supplier-bills.sql` | Tables, RLS, grants, functions, vitals repoint |
| `supabase/__tests__/2026-10-01-xero-supplier-bills.verify.sql` | Scratch-Postgres proofs |

**Chunks D–H: integration**

| File | Responsibility |
|---|---|
| `src/lib/accounting/xero/tokens.ts` (+ `.test.ts`) | `getXeroAccessToken` with lease, plus the Supabase credential store |
| `src/lib/accounting/xero/access.ts` | `xeroAccessFor(db, connection)` wiring |
| `src/lib/accounting/connection.ts` (+ `.test.ts`) | Callback validation, pending-org cookie, save, disconnect |
| `src/app/api/xero/install/route.ts`, `src/app/api/xero/callback/route.ts` | OAuth routes (new) |
| `src/app/app/settings/integrations/xero/choose/page.tsx` | Organisation picker |
| `src/app/app/settings/integrations/xero/setup/page.tsx`, `setup-form.tsx`, `setup.module.css` | Setup wizard |
| `src/app/app/settings/integrations/xero/actions.ts` | Choose org, save setup, disconnect, retry job |
| `src/app/app/settings/integrations/xero-card.tsx`, `xero-card-actions.tsx` | Integrations card and sync log |
| `src/app/app/purchasing/invoices/page.tsx` | Supplier invoice list |
| `src/app/app/purchasing/invoices/new/page.tsx`, `invoice-form.tsx` | Create/edit draft |
| `src/app/app/purchasing/invoices/[id]/page.tsx`, `invoice-actions.tsx` | Detail, post, void |
| `src/app/app/purchasing/invoices/actions.ts` | Draft, post, void, contact search and link |
| `src/app/app/purchasing/invoices/supplier-link.tsx` | Link a supplier to a Xero contact |
| `src/app/app/purchasing/invoices/invoices.module.css` | Styles |
| `src/lib/accounting/outbox/handlers.ts` (+ `.test.ts`) | `create_contact` / `create_bill` / `void_bill` |
| `src/lib/accounting/outbox/state.ts` (+ `.test.ts`) | Pure job state transitions |
| `src/lib/accounting/outbox/process.ts` (+ `.test.ts`) | Claim → run → record; `kickOutbox` |
| `src/lib/accounting/maintenance.ts` (+ `.test.ts`) | Daily refresh and alert selection |
| `src/app/api/cron/accounting-outbox/route.ts`, `src/app/api/cron/accounting-maintenance/route.ts` | Cron entry points |
| `src/lib/email/templates/xero-attention.tsx` | Alert email |
| `src/app/app/_components/accounting-banner.tsx` | Admin banner |
| `supabase/patches/2026-10-01-xero-cron-schedule.sql` | `pg_cron` + `pg_net` schedule (applied at rollout) |
| `src/lib/activity/events.ts` | New events |

---

# Chunk A — Cleanup PR (MANUVA-44, MANUVA-45)

Branch: `chore/manuva-44-45-xero-cleanup` from `main`. This chunk ships as its own PR before anything else.

### Task 1: Stop the super-admin health functions reading missing tables (MANUVA-44)

**Files:**
- Create: `supabase/patches/2026-10-01-manuva-44-vitals-without-accounting.sql`

**Interfaces:**
- Consumes: the deployed `public.get_tenant_vitals(uuid)` and `public.get_tenant_health_indicators(uuid[])`.
- Produces: the same signatures and return columns, with accounting columns always `null`/`0`. Task 11 later repoints them at the new tables.

- [ ] **Step 1: Dump the deployed definitions**

Run through the Supabase MCP `execute_sql` (project `svhaotzrtfbwmphaacjj`):

```sql
select pg_get_functiondef('public.get_tenant_vitals(uuid)'::regprocedure) as vitals,
       pg_get_functiondef('public.get_tenant_health_indicators(uuid[])'::regprocedure) as health;
```

Paste both bodies, unmodified, into the new patch file under this header:

```sql
-- ---------------------------------------------------------------------
-- MANUVA-44 — super-admin vitals/health read tables that do not exist.
--
-- get_tenant_vitals and get_tenant_health_indicators were deployed on
-- 2026-05-31 reading public.accounting_connection / accounting_sync_event.
-- Those tables only ever existed in supabase/patches/accounting_integration.sql,
-- which was never applied. plpgsql resolves relations at run time, so every
-- operator call raises 42P01; the tenant list swallows the error and shows
-- every tenant healthy.
--
-- Generated from pg_get_functiondef on 2026-10-01. The ONLY edits are the
-- accounting reads, which now return null/0 with unchanged column types.
-- MANUVA-34 (Xero rebuild) repoints them at the new tables.
-- Idempotent.
-- ---------------------------------------------------------------------
```

- [ ] **Step 2: Make exactly these edits in the vitals body**

Replace:

```sql
  -- Capture most recent active accounting connection id once
  select ac.id into v_acct_conn_id
  from   public.accounting_connection ac
  where  ac.tenant_id = p_tenant_id
    and  ac.is_active = true
  order  by ac.connected_at desc
  limit  1;
```

with:

```sql
  -- MANUVA-44: no accounting tables yet (see header).
  v_acct_conn_id := null;
```

Replace the whole accounting column block, from `ac.provider  as accounting_provider,` to the `as accounting_thirty_day_failed` subquery inclusive, with:

```sql
    null::text                                                             as accounting_provider,
    null::text                                                             as accounting_account_name,
    null::timestamptz                                                      as accounting_token_expires_at,
    null::boolean                                                          as accounting_token_expired,
    0                                                                      as accounting_thirty_day_synced,
    0                                                                      as accounting_thirty_day_failed
```

Delete the line `left join  public.accounting_connection ac  on ac.id = v_acct_conn_id;` and end the previous line (`left join public.shopify_store ss on ss.tenant_id = p_tenant_id`) with `;`.

- [ ] **Step 3: Make exactly this edit in the health body**

Replace the subquery that starts `select ac.token_expires_at` and ends `)  as acct_token_expires_at,` with:

```sql
      null::timestamptz                       as acct_token_expires_at,
```

- [ ] **Step 4: Verify that only the intended lines changed**

Save the original dump to `C:\Users\Work\AppData\Local\Temp\claude\C--dev-assemblio\1810ece4-6140-46a5-b412-7da6a655f704\scratchpad\vitals-original.sql`, then run:

```bash
git diff --no-index --stat "C:/Users/Work/AppData/Local/Temp/claude/C--dev-assemblio/1810ece4-6140-46a5-b412-7da6a655f704/scratchpad/vitals-original.sql" supabase/patches/2026-10-01-manuva-44-vitals-without-accounting.sql
grep -n "accounting_connection\|accounting_sync_event" supabase/patches/2026-10-01-manuva-44-vitals-without-accounting.sql
```

Expected:
- The `grep` matches nothing except the header comment.
- The diff touches only the header and the blocks above.

- [ ] **Step 5: Ask the user, then apply**

Ask: "Apply MANUVA-44 patch to production? It redefines two super-admin functions; only the accounting reads change." On an explicit yes, apply it with MCP `apply_migration` (name `manuva_44_vitals_without_accounting`). Then:

```sql
select position('public.accounting' in pg_get_functiondef('public.get_tenant_vitals(uuid)'::regprocedure)) as v,
       position('public.accounting' in pg_get_functiondef('public.get_tenant_health_indicators(uuid[])'::regprocedure)) as h;
```

Expected: `v = 0, h = 0`.

Then run `bash scripts/probe_anon_rpc_surface.sh`. Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/patches/2026-10-01-manuva-44-vitals-without-accounting.sql
git commit -m "MANUVA-44 fix(super-admin): stop vitals/health reading missing accounting tables"
```

### Task 2: Remove the dead May Xero integration from the app (MANUVA-45)

**Files:**
- Modify: `src/app/app/goods-inwards/actions.ts` (lines 7 and 141)
- Modify: `src/app/app/settings/integrations/page.tsx`
- Delete: `src/app/app/settings/integrations/xero-manage.tsx`, `src/lib/accounting/xero.ts`, `src/lib/accounting/push-bill.ts`, `src/lib/accounting/push-bill.test.ts`, `src/app/api/xero/install/route.ts`, `src/app/api/xero/callback/route.ts`, `src/app/api/xero/disconnect/route.ts`, `supabase/patches/accounting_integration.sql`
- Modify: `docs/qa-feature-test-plan.md`

**Interfaces:**
- Produces: no Xero UI, no `/api/xero/*` routes, and no accounting call on receipt creation. Task 13 re-creates `/api/xero/install` and `/api/xero/callback` from scratch.

- [ ] **Step 1: Remove the receipt hook**

In `src/app/app/goods-inwards/actions.ts`, delete the line `import { pushBillToAccounting } from "@/lib/accounting/push-bill";` and the line `  await pushBillToAccounting(tenantId, receipt.id);`. Nothing else in that file changes.

- [ ] **Step 2: Remove the Xero card**

In `src/app/app/settings/integrations/page.tsx`:
- Delete `import XeroManage from "./xero-manage";`.
- Delete `xero?: string;` from `searchParams`.
- Delete the `xeroConnection` and `xeroSyncs` queries.
- Delete the whole second `<div className={styles.card}>` block, the one containing `<span className={styles.cardName}>Xero</span>`.

`tenantId` is then unused in that file. Change `const { supabase, tenantId } = ctx;` to `const { supabase } = ctx;`.

- [ ] **Step 3: Delete the dead files**

```bash
git rm src/app/app/settings/integrations/xero-manage.tsx src/lib/accounting/xero.ts src/lib/accounting/push-bill.ts src/lib/accounting/push-bill.test.ts src/app/api/xero/install/route.ts src/app/api/xero/callback/route.ts src/app/api/xero/disconnect/route.ts supabase/patches/accounting_integration.sql
```

- [ ] **Step 4: Check that nothing still references them**

```bash
grep -rn "push-bill\|accounting/xero\"\|xero-manage\|accounting_sync_event\|pushBillToAccounting" src
```

Expected: no output.

- [ ] **Step 5: Update the QA plan**

In `docs/qa-feature-test-plan.md`, replace the body of `## 16. Xero / Accounting **(admin)**` with:

```markdown
Removed 2026-10-01 pending the MANUVA-34 rebuild (spec:
`docs/superpowers/specs/2026-10-01-xero-supplier-bills-design.md`). The May
2026 integration was never live: no tables in prod, no Xero app, invalid
scope. No Xero UI or routes exist until the rebuild ships.

- [ ] Settings → Integrations shows Shopify only (no Xero card)
- [ ] Creating a goods receipt makes no accounting call
```

Remove the Xero entry at line ~412 (`src/lib/accounting/push-bill.test.ts`). Then append to `## Changelog`:

```markdown
- 2026-10-01 — amended Xero / Accounting: removed the never-live May integration (UI card, /api/xero routes, receipt bill push) pending the MANUVA-34 rebuild.
```

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit
npm test
npx eslint src/app/app/goods-inwards/actions.ts src/app/app/settings/integrations/page.tsx
```

Expected: tsc clean, eslint clean, and the suite green with the same pass count as `main` minus the deleted `push-bill` tests.

- [ ] **Step 7: Commit and open PR 1**

```bash
git add src/app/app/goods-inwards/actions.ts src/app/app/settings/integrations/page.tsx docs/qa-feature-test-plan.md
git commit -m "MANUVA-45 chore(xero): remove never-live May integration pending rebuild"
git push -u origin chore/manuva-44-45-xero-cleanup
```

Write the PR body to `C:\Users\Work\AppData\Local\Temp\claude\C--dev-assemblio\1810ece4-6140-46a5-b412-7da6a655f704\scratchpad\pr1-body.md`:

```markdown
## What
- MANUVA-44: `get_tenant_vitals` / `get_tenant_health_indicators` no longer read the never-created accounting tables (they raised 42P01 for every platform operator; the tenant list hid it as all-green).
- MANUVA-45: removes the May 2026 Xero code that was deployed but never live (no tables, no Xero app, invalid scope, plaintext tokens). Rebuild is MANUVA-34.

## Verify
- `npx tsc --noEmit`, `npm test` green
- Prod: both functions' definitions no longer reference `public.accounting_*`; `scripts/probe_anon_rpc_surface.sh` exits 0

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

```bash
gh pr create --title "MANUVA-44/45 Remove dead Xero code; stop vitals reading missing tables" --body-file "C:/Users/Work/AppData/Local/Temp/claude/C--dev-assemblio/1810ece4-6140-46a5-b412-7da6a655f704/scratchpad/pr1-body.md"
```

Then post an update on MANUVA-44 and MANUVA-45 with the PR link, set Status = Done once merged, and verify by read-back.

---

# Chunk B — Pure library

Branch: `feat/manuva-34-xero-bills` from `main` after PR 1 merges. Chunks B–H land on this branch.

### Task 3: Signed OAuth state

**Files:**
- Create: `src/lib/security/signed-state.ts`
- Test: `src/lib/security/signed-state.test.ts`

**Interfaces:**
- Produces:
  - `createSignedState(fields: StateFields, secret: string, ttlMs: number, now?: number): string`
  - `readSignedState<T extends StateFields>(token: string, secret: string, now?: number): ReadStateResult<T>`
  - `newNonce(): string`
  - `type StateFields = Record<string, string | number>`
  - `type ReadStateResult<T> = { ok: true; payload: T & { exp: number } } | { ok: false; reason: "malformed" | "bad-signature" | "expired" }`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/security/signed-state.test.ts
import { describe, expect, it } from "vitest";
import { createSignedState, readSignedState, newNonce } from "./signed-state";

const SECRET = "test-secret";
const NOW = 1_800_000_000_000;

describe("signed state", () => {
  it("round-trips fields and adds exp", () => {
    const token = createSignedState({ tenantId: "t1", userId: "u1", nonce: "n1" }, SECRET, 600_000, NOW);
    const r = readSignedState<{ tenantId: string; userId: string; nonce: string }>(token, SECRET, NOW + 1000);
    expect(r).toEqual({ ok: true, payload: { tenantId: "t1", userId: "u1", nonce: "n1", exp: NOW + 600_000 } });
  });

  it("rejects a token signed with another secret", () => {
    const token = createSignedState({ a: "1" }, "other", 600_000, NOW);
    expect(readSignedState(token, SECRET, NOW)).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a tampered body", () => {
    const token = createSignedState({ tenantId: "t1" }, SECRET, 600_000, NOW);
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ tenantId: "t2", exp: NOW + 600_000 })).toString("base64url");
    expect(readSignedState(`${forged}.${sig}`, SECRET, NOW)).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects an expired token", () => {
    const token = createSignedState({ a: "1" }, SECRET, 1000, NOW);
    expect(readSignedState(token, SECRET, NOW + 1000)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects malformed input", () => {
    expect(readSignedState("nodot", SECRET, NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(readSignedState("a.b.c", SECRET, NOW)).toEqual({ ok: false, reason: "malformed" });
  });

  it("refuses to sign with an empty secret", () => {
    expect(() => createSignedState({ a: "1" }, "", 1000, NOW)).toThrow(/empty secret/);
  });

  it("makes 32-hex-char nonces that differ", () => {
    const a = newNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newNonce()).not.toBe(a);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/security/signed-state.test.ts`
Expected: FAIL, "Cannot find module './signed-state'".

- [ ] **Step 3: Implement**

```ts
// src/lib/security/signed-state.ts
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type StateFields = Record<string, string | number>;
export type ReadStateResult<T extends StateFields> =
  | { ok: true; payload: T & { exp: number } }
  | { ok: false; reason: "malformed" | "bad-signature" | "expired" };

function sign(body: string, secret: string): string {
  if (!secret) throw new Error("signed-state: empty secret");
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createSignedState(
  fields: StateFields,
  secret: string,
  ttlMs: number,
  now: number = Date.now()
): string {
  const body = Buffer.from(JSON.stringify({ ...fields, exp: now + ttlMs })).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function readSignedState<T extends StateFields>(
  token: string,
  secret: string,
  now: number = Date.now()
): ReadStateResult<T> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [body, sig] = parts;
  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "bad-signature" };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!payload || typeof payload !== "object" || typeof (payload as { exp?: unknown }).exp !== "number") {
    return { ok: false, reason: "malformed" };
  }
  const p = payload as T & { exp: number };
  if (p.exp <= now) return { ok: false, reason: "expired" };
  return { ok: true, payload: p };
}

export function newNonce(): string {
  return randomBytes(16).toString("hex");
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/security/signed-state.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/security/signed-state.ts src/lib/security/signed-state.test.ts
git commit -m "MANUVA-34 feat(security): HMAC-signed expiring state for OAuth"
```

### Task 4: Token encryption

**Files:**
- Create: `src/lib/security/token-crypto.ts`
- Test: `src/lib/security/token-crypto.test.ts`

**Interfaces:**
- Produces:
  - `type TokenKey = { key: Buffer; version: number }`
  - `loadTokenKey(env?: Record<string, string | undefined>): TokenKey`
  - `encryptToken(plaintext: string, k: TokenKey): string`
  - `decryptToken(envelope: string, k: TokenKey): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/security/token-crypto.test.ts
import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptToken, encryptToken, loadTokenKey } from "./token-crypto";

const key = { key: randomBytes(32), version: 1 };

describe("token-crypto", () => {
  it("round-trips a token", () => {
    const env = encryptToken("refresh-abc", key);
    expect(env).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(env).not.toContain("refresh-abc");
    expect(decryptToken(env, key)).toBe("refresh-abc");
  });

  it("uses a fresh IV per call", () => {
    expect(encryptToken("same", key)).not.toBe(encryptToken("same", key));
  });

  it("fails on a tampered ciphertext", () => {
    const [v, iv, tag, ct] = encryptToken("secret", key).split(".");
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 0xff;
    expect(() => decryptToken([v, iv, tag, flipped.toString("base64url")].join("."), key)).toThrow();
  });

  it("fails on the wrong key or version", () => {
    const env = encryptToken("secret", key);
    expect(() => decryptToken(env, { key: randomBytes(32), version: 1 })).toThrow();
    expect(() => decryptToken(env, { key: key.key, version: 2 })).toThrow(/v1.*v2/);
  });

  it("loads a 32-byte base64 key and rejects bad ones", () => {
    const b64 = randomBytes(32).toString("base64");
    expect(loadTokenKey({ ACCOUNTING_TOKEN_KEY: b64, ACCOUNTING_TOKEN_KEY_VERSION: "3" }).version).toBe(3);
    expect(loadTokenKey({ ACCOUNTING_TOKEN_KEY: b64 }).version).toBe(1);
    expect(() => loadTokenKey({})).toThrow(/not set/);
    expect(() => loadTokenKey({ ACCOUNTING_TOKEN_KEY: randomBytes(16).toString("base64") })).toThrow(/32 bytes/);
    expect(() => loadTokenKey({ ACCOUNTING_TOKEN_KEY: b64, ACCOUNTING_TOKEN_KEY_VERSION: "0" })).toThrow(/positive integer/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/security/token-crypto.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/security/token-crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type TokenKey = { key: Buffer; version: number };

export function loadTokenKey(env: Record<string, string | undefined> = process.env): TokenKey {
  const raw = env.ACCOUNTING_TOKEN_KEY;
  if (!raw) throw new Error("ACCOUNTING_TOKEN_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ACCOUNTING_TOKEN_KEY must be 32 bytes, base64-encoded");
  const version = Number.parseInt(env.ACCOUNTING_TOKEN_KEY_VERSION ?? "1", 10);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("ACCOUNTING_TOKEN_KEY_VERSION must be a positive integer");
  }
  return { key, version };
}

export function encryptToken(plaintext: string, k: TokenKey): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k.key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v${k.version}.${iv.toString("base64url")}.${tag.toString("base64url")}.${ct.toString("base64url")}`;
}

export function decryptToken(envelope: string, k: TokenKey): string {
  const parts = envelope.split(".");
  if (parts.length !== 4 || !/^v\d+$/.test(parts[0])) throw new Error("Malformed token envelope");
  const version = Number.parseInt(parts[0].slice(1), 10);
  if (version !== k.version) {
    throw new Error(`Token encrypted with key v${version}; current key is v${k.version}`);
  }
  const decipher = createDecipheriv("aes-256-gcm", k.key, Buffer.from(parts[1], "base64url"));
  decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/security/token-crypto.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/security/token-crypto.ts src/lib/security/token-crypto.test.ts
git commit -m "MANUVA-34 feat(security): AES-256-GCM token envelopes"
```

### Task 5: Xero config, scrubber, identity and API client

**Files:**
- Create: `src/lib/accounting/xero/config.ts`, `scrub.ts`, `identity.ts`, `client.ts`
- Test: `src/lib/accounting/xero/config.test.ts`, `scrub.test.ts`, `identity.test.ts`, `client.test.ts`

**Interfaces:**
- Produces from `config.ts`:
  - `XERO_SCOPES`, `XERO_AUTHORIZE_URL`, `XERO_TOKEN_URL`, `XERO_REVOKE_URL`, `XERO_CONNECTIONS_URL`, `XERO_API_BASE`
  - `type XeroConfigOk = { ok: true; clientId: string; clientSecret: string; redirectUri: string }`
  - `type XeroConfig = XeroConfigOk | { ok: false; reason: "missing-config"; missing: string[] }`
  - `getXeroConfig(env?)`
  - `buildXeroAuthorizeUrl(cfg: XeroConfigOk, state: string): string`
  - `isXeroPilotTenant(tenantId: string | null, env?): boolean`
- Produces from `scrub.ts`: `scrubSecrets(value: unknown): unknown`
- Produces from `identity.ts`:
  - `type XeroTokenSet = { accessToken: string; refreshToken: string; expiresInSec: number }`
  - `type TokenResult = { ok: true; tokens: XeroTokenSet } | { ok: false; status: number; error: string }`
  - `exchangeCode(cfg, code, fetchImpl?)`, `refreshTokens(cfg, refreshToken, fetchImpl?)`
  - `revokeRefreshToken(cfg, refreshToken, fetchImpl?): Promise<boolean>`
  - `type XeroConnectionInfo = { id: string; tenantId: string; tenantName: string; tenantType: string; authEventId: string }`
  - `listConnections(accessToken, fetchImpl?): Promise<XeroConnectionInfo[]>`
  - `deleteConnection(accessToken, connectionId, fetchImpl?): Promise<boolean>`
  - `readAuthEventId(accessToken: string): string | null`
  - `organisationsForEvent(conns, authEventId): XeroConnectionInfo[]`
- Produces from `client.ts`:
  - `type XeroAccess = { accessToken: string; xeroTenantId: string }`
  - `type RateInfo = { minRemaining: number | null; dayRemaining: number | null; retryAfterSec: number | null; problem: string | null }`
  - `type XeroRequest = { method: "GET" | "POST" | "PUT"; path: string; query?: Record<string, string>; body?: unknown; idempotencyKey?: string }`
  - `type XeroFailure = { ok: false; status: number; body: unknown; rate: RateInfo; networkError?: string }`
  - `type XeroResult<T> = { ok: true; status: number; data: T; rate: RateInfo } | XeroFailure`
  - `parseRateHeaders(h: Headers): RateInfo`
  - `xeroRequest<T>(access, req, fetchImpl?, timeoutMs?): Promise<XeroResult<T>>`. It never throws.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/accounting/xero/config.test.ts
import { describe, expect, it } from "vitest";
import { buildXeroAuthorizeUrl, getXeroConfig, isXeroPilotTenant, XERO_SCOPES } from "./config";

const full = { XERO_CLIENT_ID: "cid", XERO_CLIENT_SECRET: "sec", XERO_REDIRECT_URI: "https://app.manuva.app/api/xero/callback", ACCOUNTING_TOKEN_KEY: "k" };

describe("xero config", () => {
  it("reports every missing variable", () => {
    expect(getXeroConfig({})).toEqual({ ok: false, reason: "missing-config", missing: ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET", "XERO_REDIRECT_URI", "ACCOUNTING_TOKEN_KEY"] });
  });

  it("returns config when complete", () => {
    expect(getXeroConfig(full)).toEqual({ ok: true, clientId: "cid", clientSecret: "sec", redirectUri: full.XERO_REDIRECT_URI });
  });

  it("requests granular scopes only", () => {
    expect(XERO_SCOPES).toBe("openid profile email offline_access accounting.invoices accounting.contacts accounting.settings.read");
    expect(XERO_SCOPES).not.toContain("accounting.transactions");
  });

  it("builds the authorize URL", () => {
    const cfg = getXeroConfig(full);
    if (!cfg.ok) throw new Error("expected ok");
    const url = new URL(buildXeroAuthorizeUrl(cfg, "st.ate"));
    expect(url.origin + url.pathname).toBe("https://login.xero.com/identity/connect/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe(full.XERO_REDIRECT_URI);
    expect(url.searchParams.get("scope")).toBe(XERO_SCOPES);
    expect(url.searchParams.get("state")).toBe("st.ate");
  });

  it("gates by pilot list or *", () => {
    expect(isXeroPilotTenant("t1", { XERO_PILOT_TENANTS: "t0, t1" })).toBe(true);
    expect(isXeroPilotTenant("t2", { XERO_PILOT_TENANTS: "t0,t1" })).toBe(false);
    expect(isXeroPilotTenant("t2", { XERO_PILOT_TENANTS: "*" })).toBe(true);
    expect(isXeroPilotTenant("t1", {})).toBe(false);
    expect(isXeroPilotTenant(null, { XERO_PILOT_TENANTS: "*" })).toBe(false);
  });
});
```

```ts
// src/lib/accounting/xero/scrub.test.ts
import { describe, expect, it } from "vitest";
import { scrubSecrets } from "./scrub";

describe("scrubSecrets", () => {
  it("redacts secret-named keys at any depth", () => {
    expect(scrubSecrets({ a: { access_token: "x", Authorization: "Bearer y", ok: 1 } })).toEqual({ a: { access_token: "[redacted]", Authorization: "[redacted]", ok: 1 } });
  });
  it("redacts bearer strings and JWT-shaped strings inside text", () => {
    const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlLXZhbHVl";
    expect(scrubSecrets(`failed with Bearer abc.def and ${jwt}`)).toBe("failed with Bearer [redacted] and [redacted-jwt]");
  });
  it("leaves ordinary values alone", () => {
    expect(scrubSecrets(["x", 2, null, { Message: "Account code '300' is not valid" }])).toEqual(["x", 2, null, { Message: "Account code '300' is not valid" }]);
  });
});
```

```ts
// src/lib/accounting/xero/identity.test.ts
import { describe, expect, it, vi } from "vitest";
import { exchangeCode, organisationsForEvent, readAuthEventId, refreshTokens, listConnections, deleteConnection } from "./identity";

const cfg = { ok: true as const, clientId: "cid", clientSecret: "sec", redirectUri: "https://app.manuva.app/api/xero/callback" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

describe("identity", () => {
  it("exchanges a code with basic auth and form body", async () => {
    const f = vi.fn().mockResolvedValue(json(200, { access_token: "a", refresh_token: "r", expires_in: 1800 }));
    const r = await exchangeCode(cfg, "the-code", f);
    expect(r).toEqual({ ok: true, tokens: { accessToken: "a", refreshToken: "r", expiresInSec: 1800 } });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://identity.xero.com/connect/token");
    expect(init.headers.Authorization).toBe("Basic " + Buffer.from("cid:sec").toString("base64"));
    expect(new URLSearchParams(init.body).get("grant_type")).toBe("authorization_code");
    expect(new URLSearchParams(init.body).get("redirect_uri")).toBe(cfg.redirectUri);
  });

  it("surfaces invalid_grant on refresh", async () => {
    const f = vi.fn().mockResolvedValue(json(400, { error: "invalid_grant" }));
    expect(await refreshTokens(cfg, "old", f)).toEqual({ ok: false, status: 400, error: "invalid_grant" });
  });

  it("maps a network failure to status 0", async () => {
    const f = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    expect(await refreshTokens(cfg, "old", f)).toEqual({ ok: false, status: 0, error: "network_error" });
  });

  it("reads authentication_event_id from the access token", () => {
    expect(readAuthEventId(jwt({ authentication_event_id: "evt-1" }))).toBe("evt-1");
    expect(readAuthEventId("not-a-jwt")).toBeNull();
  });

  it("keeps only organisations from this consent", () => {
    const conns = [
      { id: "c1", tenantId: "o1", tenantName: "A", tenantType: "ORGANISATION", authEventId: "evt-1" },
      { id: "c2", tenantId: "o2", tenantName: "B", tenantType: "ORGANISATION", authEventId: "evt-0" },
      { id: "c3", tenantId: "p1", tenantName: "Practice", tenantType: "PRACTICE", authEventId: "evt-1" },
    ];
    expect(organisationsForEvent(conns, "evt-1").map((c) => c.id)).toEqual(["c1"]);
    expect(organisationsForEvent(conns, null)).toEqual([]);
  });

  it("lists connections and treats 404 on delete as done", async () => {
    const f = vi.fn().mockResolvedValueOnce(json(200, [{ id: "c1", tenantId: "o1", tenantName: "A", tenantType: "ORGANISATION", authEventId: "e" }])).mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect((await listConnections("tok", f))[0].tenantId).toBe("o1");
    expect(await deleteConnection("tok", "c1", f)).toBe(true);
  });
});
```

```ts
// src/lib/accounting/xero/client.test.ts
import { describe, expect, it, vi } from "vitest";
import { parseRateHeaders, xeroRequest } from "./client";

const access = { accessToken: "tok", xeroTenantId: "org-1" };

describe("xeroRequest", () => {
  it("sends auth, tenant, idempotency and query", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ Invoices: [] }), { status: 200, headers: { "x-minlimit-remaining": "59" } }));
    const r = await xeroRequest(access, { method: "POST", path: "/Invoices", query: { unitdp: "4" }, body: { a: 1 }, idempotencyKey: "si-1-create" }, f);
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.xero.com/api.xro/2.0/Invoices?unitdp=4");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.headers["xero-tenant-id"]).toBe("org-1");
    expect(init.headers["Idempotency-Key"]).toBe("si-1-create");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(r.rate.minRemaining).toBe(59);
  });

  it("returns a failure with scrubbed body instead of throwing", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ Message: "bad", access_token: "leak" }), { status: 400 }));
    const r = await xeroRequest(access, { method: "GET", path: "/Accounts" }, f);
    expect(r).toMatchObject({ ok: false, status: 400, body: { Message: "bad", access_token: "[redacted]" } });
  });

  it("maps network errors to status 0", async () => {
    const f = vi.fn().mockRejectedValue(new Error("socket hang up Bearer abc"));
    const r = await xeroRequest(access, { method: "GET", path: "/Accounts" }, f);
    expect(r).toMatchObject({ ok: false, status: 0, networkError: "socket hang up Bearer [redacted]" });
  });

  it("parses rate headers", () => {
    const h = new Headers({ "retry-after": "42", "x-rate-limit-problem": "day", "x-daylimit-remaining": "0" });
    expect(parseRateHeaders(h)).toEqual({ minRemaining: null, dayRemaining: 0, retryAfterSec: 42, problem: "day" });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/accounting/xero`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the four modules**

```ts
// src/lib/accounting/xero/config.ts
export const XERO_SCOPES = [
  "openid", "profile", "email", "offline_access",
  "accounting.invoices", "accounting.contacts", "accounting.settings.read",
].join(" ");
export const XERO_AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
export const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
export const XERO_REVOKE_URL = "https://identity.xero.com/connect/revocation";
export const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
export const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

type Env = Record<string, string | undefined>;
export type XeroConfigOk = { ok: true; clientId: string; clientSecret: string; redirectUri: string };
export type XeroConfig = XeroConfigOk | { ok: false; reason: "missing-config"; missing: string[] };

const REQUIRED = ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET", "XERO_REDIRECT_URI", "ACCOUNTING_TOKEN_KEY"] as const;

export function getXeroConfig(env: Env = process.env): XeroConfig {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) return { ok: false, reason: "missing-config", missing };
  return { ok: true, clientId: env.XERO_CLIENT_ID!, clientSecret: env.XERO_CLIENT_SECRET!, redirectUri: env.XERO_REDIRECT_URI! };
}

export function buildXeroAuthorizeUrl(cfg: XeroConfigOk, state: string): string {
  const p = new URLSearchParams({ response_type: "code", client_id: cfg.clientId, redirect_uri: cfg.redirectUri, scope: XERO_SCOPES, state });
  return `${XERO_AUTHORIZE_URL}?${p.toString()}`;
}

export function isXeroPilotTenant(tenantId: string | null, env: Env = process.env): boolean {
  if (!tenantId) return false;
  const list = (env.XERO_PILOT_TENANTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes("*") || list.includes(tenantId);
}
```

```ts
// src/lib/accounting/xero/scrub.ts
const SECRET_KEYS = /^(authorization|access_token|refresh_token|id_token|client_secret|token)$/i;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/g;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;

export function scrubSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[depth]";
  if (typeof value === "string") return value.replace(BEARER, "Bearer [redacted]").replace(JWT, "[redacted-jwt]");
  if (Array.isArray(value)) return value.map((v) => scrubSecrets(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEYS.test(k) ? "[redacted]" : scrubSecrets(v, depth + 1);
    return out;
  }
  return value;
}
```

```ts
// src/lib/accounting/xero/identity.ts
import { XERO_CONNECTIONS_URL, XERO_REVOKE_URL, XERO_TOKEN_URL, type XeroConfigOk } from "./config";

type FetchLike = typeof fetch;
export type XeroTokenSet = { accessToken: string; refreshToken: string; expiresInSec: number };
export type TokenResult = { ok: true; tokens: XeroTokenSet } | { ok: false; status: number; error: string };
export type XeroConnectionInfo = { id: string; tenantId: string; tenantName: string; tenantType: string; authEventId: string };

const TIMEOUT_MS = 15_000;

function basicAuth(cfg: XeroConfigOk): string {
  return "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
}

function postForm(url: string, cfg: XeroConfigOk, form: Record<string, string>, fetchImpl: FetchLike) {
  return fetchImpl(url, {
    method: "POST",
    headers: { Authorization: basicAuth(cfg), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function toTokenResult(res: Response): Promise<TokenResult> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return { ok: false, status: res.status, error: typeof body.error === "string" ? body.error : `http_${res.status}` };
  if (typeof body.access_token !== "string" || typeof body.refresh_token !== "string") {
    return { ok: false, status: res.status, error: "missing_tokens" };
  }
  return {
    ok: true,
    tokens: {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresInSec: typeof body.expires_in === "number" ? body.expires_in : 1800,
    },
  };
}

export async function exchangeCode(cfg: XeroConfigOk, code: string, fetchImpl: FetchLike = fetch): Promise<TokenResult> {
  try {
    return await toTokenResult(await postForm(XERO_TOKEN_URL, cfg, { grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri }, fetchImpl));
  } catch {
    return { ok: false, status: 0, error: "network_error" };
  }
}

export async function refreshTokens(cfg: XeroConfigOk, refreshToken: string, fetchImpl: FetchLike = fetch): Promise<TokenResult> {
  try {
    return await toTokenResult(await postForm(XERO_TOKEN_URL, cfg, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl));
  } catch {
    return { ok: false, status: 0, error: "network_error" };
  }
}

export async function revokeRefreshToken(cfg: XeroConfigOk, refreshToken: string, fetchImpl: FetchLike = fetch): Promise<boolean> {
  try {
    return (await postForm(XERO_REVOKE_URL, cfg, { token: refreshToken }, fetchImpl)).ok;
  } catch {
    return false;
  }
}

export async function listConnections(accessToken: string, fetchImpl: FetchLike = fetch): Promise<XeroConnectionInfo[]> {
  const res = await fetchImpl(XERO_CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Xero /connections returned ${res.status}`);
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    tenantId: String(r.tenantId),
    tenantName: String(r.tenantName ?? ""),
    tenantType: String(r.tenantType ?? ""),
    authEventId: String(r.authEventId ?? ""),
  }));
}

export async function deleteConnection(accessToken: string, connectionId: string, fetchImpl: FetchLike = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`${XERO_CONNECTIONS_URL}/${encodeURIComponent(connectionId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/** The token came straight from Xero over TLS; we only read a claim, we do not trust it for auth. */
export function readAuthEventId(accessToken: string): string | null {
  const parts = accessToken.split(".");
  if (parts.length < 2) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    return typeof claims.authentication_event_id === "string" ? claims.authentication_event_id : null;
  } catch {
    return null;
  }
}

export function organisationsForEvent(conns: XeroConnectionInfo[], authEventId: string | null): XeroConnectionInfo[] {
  if (!authEventId) return [];
  return conns.filter((c) => c.authEventId === authEventId && c.tenantType === "ORGANISATION");
}
```

```ts
// src/lib/accounting/xero/client.ts
import { XERO_API_BASE } from "./config";
import { scrubSecrets } from "./scrub";

export type XeroAccess = { accessToken: string; xeroTenantId: string };
export type RateInfo = { minRemaining: number | null; dayRemaining: number | null; retryAfterSec: number | null; problem: string | null };
export type XeroRequest = { method: "GET" | "POST" | "PUT"; path: string; query?: Record<string, string>; body?: unknown; idempotencyKey?: string };
export type XeroFailure = { ok: false; status: number; body: unknown; rate: RateInfo; networkError?: string };
export type XeroResult<T> = { ok: true; status: number; data: T; rate: RateInfo } | XeroFailure;

const EMPTY_RATE: RateInfo = { minRemaining: null, dayRemaining: null, retryAfterSec: null, problem: null };
const num = (v: string | null) => (v === null || v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));

export function parseRateHeaders(h: Headers): RateInfo {
  return {
    minRemaining: num(h.get("x-minlimit-remaining")),
    dayRemaining: num(h.get("x-daylimit-remaining")),
    retryAfterSec: num(h.get("retry-after")),
    problem: h.get("x-rate-limit-problem"),
  };
}

export async function xeroRequest<T>(
  access: XeroAccess,
  req: XeroRequest,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15_000
): Promise<XeroResult<T>> {
  const url = new URL(`${XERO_API_BASE}${req.path}`);
  for (const [k, v] of Object.entries(req.query ?? {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${access.accessToken}`,
    "xero-tenant-id": access.xeroTenantId,
    Accept: "application/json",
  };
  if (req.body !== undefined) headers["Content-Type"] = "application/json";
  if (req.idempotencyKey) headers["Idempotency-Key"] = req.idempotencyKey;

  let res: Response;
  try {
    res = await fetchImpl(url.toString(), {
      method: req.method,
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, body: null, rate: EMPTY_RATE, networkError: String(scrubSecrets(message)) };
  }
  const rate = parseRateHeaders(res.headers);
  const text = await res.text().catch(() => "");
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text.slice(0, 2000);
    }
  }
  if (!res.ok) return { ok: false, status: res.status, body: scrubSecrets(parsed), rate };
  return { ok: true, status: res.status, data: parsed as T, rate };
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/lib/accounting/xero`
Expected: all pass (config 5, scrub 3, identity 6, client 4).

- [ ] **Step 5: Commit**

```bash
git add src/lib/accounting/xero/config.ts src/lib/accounting/xero/scrub.ts src/lib/accounting/xero/identity.ts src/lib/accounting/xero/client.ts src/lib/accounting/xero/*.test.ts
git commit -m "MANUVA-34 feat(xero): config, identity, scrubbed fetch client"
```

### Task 6: Error classification and retry schedule

**Files:**
- Create: `src/lib/accounting/xero/errors.ts`, `src/lib/accounting/outbox/backoff.ts`
- Test: `src/lib/accounting/xero/errors.test.ts`, `src/lib/accounting/outbox/backoff.test.ts`

**Interfaces:**
- Consumes: `XeroFailure` (Task 5).
- Produces from `errors.ts`:
  - `type ErrorClass = "transient" | "fixable" | "auth" | "daily_limit"`
  - `type ClassifiedError = { errorClass: ErrorClass; message: string; detail: unknown; retryAfterSec: number | null }`
  - `XERO_ERROR_CATALOGUE`
  - `xeroValidationMessages(body): string[]`
  - `toUserMessage(m: string): string`
  - `fixableError(message, detail?)`
  - `classifyXeroFailure(f: XeroFailure): ClassifiedError`
- Produces from `backoff.ts`:
  - `BACKOFF_MINUTES`, `GIVE_UP_AFTER_MS`
  - `nextAttemptAt(attemptsMade: number, firstAttemptAt: Date, now: Date, retryAfterSec: number | null): Date | null`
  - `nextUtcMidnight(now: Date): Date`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/accounting/xero/errors.test.ts
import { describe, expect, it } from "vitest";
import { classifyXeroFailure, toUserMessage, xeroValidationMessages } from "./errors";

const rate = { minRemaining: null, dayRemaining: null, retryAfterSec: null, problem: null };
const fail = (status: number, body: unknown = null, r = rate) => ({ ok: false as const, status, body, rate: r });

describe("classifyXeroFailure", () => {
  it("network and 5xx are transient", () => {
    expect(classifyXeroFailure({ ...fail(0), networkError: "x" }).errorClass).toBe("transient");
    expect(classifyXeroFailure(fail(503)).errorClass).toBe("transient");
  });
  it("429 minute is transient with retry-after; 429 day is daily_limit", () => {
    expect(classifyXeroFailure(fail(429, null, { ...rate, retryAfterSec: 30, problem: "minute" }))).toMatchObject({ errorClass: "transient", retryAfterSec: 30 });
    expect(classifyXeroFailure(fail(429, null, { ...rate, retryAfterSec: 3600, problem: "day" }))).toMatchObject({ errorClass: "daily_limit", retryAfterSec: 3600 });
  });
  it("401 and 403 are auth", () => {
    expect(classifyXeroFailure(fail(401)).errorClass).toBe("auth");
    expect(classifyXeroFailure(fail(403)).errorClass).toBe("auth");
  });
  it("400 validation is fixable with a catalogue message", () => {
    const body = { Elements: [{ ValidationErrors: [{ Message: "Account code '300' is not a valid code for this document." }] }] };
    const c = classifyXeroFailure(fail(400, body));
    expect(c.errorClass).toBe("fixable");
    expect(c.message).toMatch(/account on this bill is archived or missing/);
  });
  it("unknown validation text is passed through", () => {
    const c = classifyXeroFailure(fail(400, { Elements: [{ ValidationErrors: [{ Message: "Something odd" }] }] }));
    expect(c.message).toBe("Xero rejected this: Something odd");
  });
});

describe("catalogue", () => {
  it.each([
    ["The TaxType code 'INPUT' cannot be used with account code '630'.", /tax rate on this bill/],
    ["The contact is archived and cannot be used.", /contact is archived/],
    ["The document date cannot be before the period lock date of 30 Jun 2026.", /locked for this invoice date/],
    ["Invoice # must be unique.", /already has a bill with this invoice number/],
    ["The contact name Acme Ltd is already assigned to another contact.", /already exists in Xero/],
  ])("maps %s", (msg, re) => {
    expect(toUserMessage(msg)).toMatch(re);
  });
  it("collects nested messages once", () => {
    expect(xeroValidationMessages({ Elements: [{ ValidationErrors: [{ Message: "A" }, { Message: "A" }], LineItems: [{ ValidationErrors: [{ Message: "B" }] }] }] })).toEqual(["A", "B"]);
  });
});
```

```ts
// src/lib/accounting/outbox/backoff.test.ts
import { describe, expect, it } from "vitest";
import { nextAttemptAt, nextUtcMidnight } from "./backoff";

const t0 = new Date("2026-10-01T00:00:00Z");
const min = (n: number) => n * 60_000;

describe("nextAttemptAt", () => {
  it("follows 1m, 5m, 15m, 1h", () => {
    expect(nextAttemptAt(1, t0, t0, null)!.getTime() - t0.getTime()).toBe(min(1));
    expect(nextAttemptAt(2, t0, t0, null)!.getTime() - t0.getTime()).toBe(min(5));
    expect(nextAttemptAt(3, t0, t0, null)!.getTime() - t0.getTime()).toBe(min(15));
    expect(nextAttemptAt(4, t0, t0, null)!.getTime() - t0.getTime()).toBe(min(60));
  });
  it("uses Retry-After when present", () => {
    expect(nextAttemptAt(5, t0, t0, 20)!.getTime() - t0.getTime()).toBe(20_000);
  });
  it("gives up once the next attempt would pass 24h from the first", () => {
    const late = new Date(t0.getTime() + min(23 * 60));
    expect(nextAttemptAt(7, t0, late, null)).toBeNull();
  });
});

describe("nextUtcMidnight", () => {
  it("rolls to the next UTC day", () => {
    expect(nextUtcMidnight(new Date("2026-10-01T13:45:00Z")).toISOString()).toBe("2026-10-02T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/accounting/xero/errors.test.ts src/lib/accounting/outbox/backoff.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/accounting/xero/errors.ts
import type { XeroFailure } from "./client";

export type ErrorClass = "transient" | "fixable" | "auth" | "daily_limit";
export type ClassifiedError = { errorClass: ErrorClass; message: string; detail: unknown; retryAfterSec: number | null };

export const XERO_ERROR_CATALOGUE: ReadonlyArray<{ pattern: RegExp; message: string }> = [
  { pattern: /account code .*(is not a valid code|has been archived|cannot be used)/i, message: "The Xero account on this bill is archived or missing. Pick another account in Xero setup, then retry." },
  { pattern: /(taxtype|tax type|tax rate).*(not valid|cannot be used|does not exist|invalid)/i, message: "The tax rate on this bill can't be used in Xero any more. Update the tax mapping in Xero setup or change the line's tax rate, then retry." },
  { pattern: /contact.*archived/i, message: "This supplier's Xero contact is archived. Restore it in Xero or relink the supplier, then retry." },
  { pattern: /(lock date|period.*locked|locked period)/i, message: "Xero is locked for this invoice date. Change the invoice date or ask your accountant to move the lock date, then retry." },
  { pattern: /(invoice #|invoice number).*(must be unique|already)/i, message: "Xero already has a bill with this invoice number for this supplier. Check Xero for a duplicate before retrying." },
  { pattern: /contact name .* already (assigned|exists)/i, message: "A contact with this name already exists in Xero. Link the supplier to it instead of creating a new one." },
  { pattern: /(organisation|subscription).*(not active|expired|cancelled)/i, message: "The connected Xero organisation is not active. Check the Xero subscription, then retry." },
];

export function xeroValidationMessages(body: unknown): string[] {
  const out: string[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 6 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((n) => visit(n, depth + 1));
      return;
    }
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.ValidationErrors)) {
      for (const v of obj.ValidationErrors) {
        const m = (v as { Message?: unknown } | null)?.Message;
        if (typeof m === "string") out.push(m);
      }
    }
    for (const [k, v] of Object.entries(obj)) if (k !== "ValidationErrors") visit(v, depth + 1);
  };
  visit(body, 0);
  if (out.length === 0 && body && typeof body === "object" && typeof (body as { Message?: unknown }).Message === "string") {
    out.push((body as { Message: string }).Message);
  }
  return [...new Set(out)];
}

export function toUserMessage(xeroMessage: string): string {
  const hit = XERO_ERROR_CATALOGUE.find((e) => e.pattern.test(xeroMessage));
  return hit ? hit.message : `Xero rejected this: ${xeroMessage}`;
}

export function fixableError(message: string, detail: unknown = null): ClassifiedError {
  return { errorClass: "fixable", message, detail, retryAfterSec: null };
}

export function classifyXeroFailure(f: XeroFailure): ClassifiedError {
  const detail = { status: f.status, body: f.body, networkError: f.networkError ?? null };
  if (f.status === 0) return { errorClass: "transient", message: "Couldn't reach Xero. Manuva will retry automatically.", detail, retryAfterSec: null };
  if (f.status === 429) {
    const daily = (f.rate.problem ?? "").toLowerCase().includes("day");
    return daily
      ? { errorClass: "daily_limit", message: "Xero's daily limit for this organisation was reached. Manuva will continue when it resets.", detail, retryAfterSec: f.rate.retryAfterSec }
      : { errorClass: "transient", message: "Xero asked Manuva to slow down. Retrying shortly.", detail, retryAfterSec: f.rate.retryAfterSec };
  }
  if (f.status >= 500) return { errorClass: "transient", message: "Xero had a problem. Manuva will retry automatically.", detail, retryAfterSec: f.rate.retryAfterSec };
  if (f.status === 401) return { errorClass: "auth", message: "Xero no longer accepts Manuva's connection. An admin needs to reconnect Xero.", detail, retryAfterSec: null };
  if (f.status === 403) return { errorClass: "auth", message: "Manuva doesn't have permission for this in Xero. An admin needs to reconnect Xero and approve the requested access.", detail, retryAfterSec: null };
  if (f.status === 404) return fixableError("Xero couldn't find this record. It may have been deleted in Xero.", detail);
  const messages = xeroValidationMessages(f.body);
  return fixableError(messages.length ? toUserMessage(messages[0]) : `Xero rejected this request (HTTP ${f.status}).`, detail);
}
```

```ts
// src/lib/accounting/outbox/backoff.ts
export const BACKOFF_MINUTES = [1, 5, 15, 60, 180, 360, 720] as const;
export const GIVE_UP_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * attemptsMade counts the attempt that just failed (1 after the first failure).
 * Returns null when the job should give up.
 */
export function nextAttemptAt(attemptsMade: number, firstAttemptAt: Date, now: Date, retryAfterSec: number | null): Date | null {
  const idx = Math.min(Math.max(attemptsMade, 1), BACKOFF_MINUTES.length) - 1;
  const delayMs = retryAfterSec !== null && retryAfterSec > 0 ? retryAfterSec * 1000 : BACKOFF_MINUTES[idx] * 60_000;
  const next = new Date(now.getTime() + delayMs);
  if (next.getTime() - firstAttemptAt.getTime() > GIVE_UP_AFTER_MS) return null;
  return next;
}

export function nextUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/lib/accounting/xero/errors.test.ts src/lib/accounting/outbox/backoff.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/accounting/xero/errors.ts src/lib/accounting/xero/errors.test.ts src/lib/accounting/outbox/backoff.ts src/lib/accounting/outbox/backoff.test.ts
git commit -m "MANUVA-34 feat(xero): error classes, plain-English catalogue, backoff"
```

### Task 7: Supplier-invoice maths and draft parsing

**Files:**
- Create: `src/lib/accounting/supplier-invoice/terms.ts`, `calc.ts`, `draft.ts`
- Test: `terms.test.ts`, `calc.test.ts`, `draft.test.ts` in the same folder

**Interfaces:**
- Produces from `terms.ts`:
  - `dueDateFromTerms(invoiceDate: string, terms: string | null | undefined): string`
  - `DEFAULT_TERM_DAYS = 30`
- Produces from `calc.ts`:
  - `type AmountsMode = "inclusive" | "exclusive"`
  - `round2`, `round4`
  - `lineAmounts(line: { quantity: number; unitAmount: number; taxRatePercent: number }, mode): { lineAmount: number; taxAmount: number; exTaxUnitAmount: number }`
  - `invoiceTotals(lines: { lineAmount: number; taxAmount: number }[], mode): { subtotal: number; taxTotal: number; total: number }`
  - `lineVariance({ quantity, exTaxUnitAmount, receivedQty, poUnitCost }): { qtyVariance: number; priceVariance: number | null }`
  - `TOTAL_TOLERANCE = 0.05`, `totalMismatch(computed, entered): boolean`
  - `isInvoiceableReceipt(r: { stock_in_reason: string | null; supplier_id: string | null }, supplierId: string): boolean`
  - `FALLBACK_TAX_OPTIONS: { taxType: null; name: string; rate: number }[]`
- Produces from `draft.ts`:
  - `type DraftLine = { kind: "stock" | "other"; deliveryReceiptLineId: string | null; componentId: string | null; description: string; quantity: number; unitAmount: number; taxType: string | null; taxRatePercent: number; accountCode: string | null }`
  - `type DraftPayload = { id: string | null; supplierId: string; purchaseOrderId: string | null; invoiceNumber: string; invoiceDate: string; dueDate: string; amountsMode: AmountsMode; enteredTotal: number | null; currency: string; lines: DraftLine[] }`
  - `parseDraftPayload(raw: unknown): { ok: true; value: DraftPayload } | { ok: false; error: string }`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/accounting/supplier-invoice/terms.test.ts
import { describe, expect, it } from "vitest";
import { dueDateFromTerms } from "./terms";

describe("dueDateFromTerms", () => {
  it.each([
    ["Net 30", "2026-10-31"],
    ["30 days", "2026-10-31"],
    ["14", "2026-10-15"],
    ["EOM", "2026-10-31"],
    ["30 EOM", "2026-11-30"],
    ["20 days EOM", "2026-11-20"],
    ["COD", "2026-10-31"],
    [null, "2026-10-31"],
  ])("%s from 2026-10-01 → %s", (terms, due) => {
    expect(dueDateFromTerms("2026-10-01", terms)).toBe(due);
  });
  it("handles month ends and leap years", () => {
    expect(dueDateFromTerms("2028-02-10", "EOM")).toBe("2028-02-29");
    expect(dueDateFromTerms("2026-01-31", "Net 30")).toBe("2026-03-02");
  });
});
```

```ts
// src/lib/accounting/supplier-invoice/calc.test.ts
import { describe, expect, it } from "vitest";
import { invoiceTotals, isInvoiceableReceipt, lineAmounts, lineVariance, totalMismatch } from "./calc";

describe("lineAmounts", () => {
  it("exclusive: tax on top", () => {
    expect(lineAmounts({ quantity: 10, unitAmount: 1.2345, taxRatePercent: 10 }, "exclusive")).toEqual({ lineAmount: 12.35, taxAmount: 1.24, exTaxUnitAmount: 1.2345 });
  });
  it("inclusive: tax inside", () => {
    expect(lineAmounts({ quantity: 1, unitAmount: 110, taxRatePercent: 10 }, "inclusive")).toEqual({ lineAmount: 110, taxAmount: 10, exTaxUnitAmount: 100 });
  });
  it("keeps sub-cent unit costs to 4dp", () => {
    expect(lineAmounts({ quantity: 10000, unitAmount: 0.0125, taxRatePercent: 0 }, "exclusive").lineAmount).toBe(125);
  });
});

describe("invoiceTotals", () => {
  it("exclusive", () => {
    expect(invoiceTotals([{ lineAmount: 100, taxAmount: 10 }, { lineAmount: 20, taxAmount: 2 }], "exclusive")).toEqual({ subtotal: 120, taxTotal: 12, total: 132 });
  });
  it("inclusive", () => {
    expect(invoiceTotals([{ lineAmount: 110, taxAmount: 10 }], "inclusive")).toEqual({ subtotal: 100, taxTotal: 10, total: 110 });
  });
});

describe("variance and checks", () => {
  it("computes qty and price variance", () => {
    expect(lineVariance({ quantity: 9, exTaxUnitAmount: 2.1, receivedQty: 10, poUnitCost: 2 })).toEqual({ qtyVariance: -1, priceVariance: 0.1 });
    expect(lineVariance({ quantity: 10, exTaxUnitAmount: 2, receivedQty: 10, poUnitCost: null }).priceVariance).toBeNull();
  });
  it("flags printed-total mismatch beyond 5c", () => {
    expect(totalMismatch(100, 100.05)).toBe(false);
    expect(totalMismatch(100, 100.06)).toBe(true);
    expect(totalMismatch(100, null)).toBe(false);
  });
  it("only supplier deliveries from the same supplier are invoiceable", () => {
    expect(isInvoiceableReceipt({ stock_in_reason: "supplier_delivery", supplier_id: "s1" }, "s1")).toBe(true);
    expect(isInvoiceableReceipt({ stock_in_reason: "sample", supplier_id: "s1" }, "s1")).toBe(false);
    expect(isInvoiceableReceipt({ stock_in_reason: "supplier_delivery", supplier_id: null }, "s1")).toBe(false);
  });
});
```

```ts
// src/lib/accounting/supplier-invoice/draft.test.ts
import { describe, expect, it } from "vitest";
import { parseDraftPayload } from "./draft";

const base = {
  id: null, supplierId: "11111111-1111-1111-1111-111111111111", purchaseOrderId: null,
  invoiceNumber: " INV-1 ", invoiceDate: "2026-10-01", dueDate: "2026-10-31",
  amountsMode: "exclusive", enteredTotal: 110, currency: "AUD",
  lines: [{ kind: "stock", deliveryReceiptLineId: "22222222-2222-2222-2222-222222222222", componentId: null, description: "Bolt", quantity: 10, unitAmount: 10, taxType: "INPUT", taxRatePercent: 10, accountCode: "630" }],
};

describe("parseDraftPayload", () => {
  it("accepts a valid draft and trims the invoice number", () => {
    const r = parseDraftPayload(base);
    expect(r.ok && r.value.invoiceNumber).toBe("INV-1");
  });
  it.each([
    [{ invoiceNumber: "  " }, /invoice number/i],
    [{ invoiceDate: "01/10/2026" }, /invoice date/i],
    [{ dueDate: "2026-09-30" }, /due date/i],
    [{ amountsMode: "gross" }, /amounts/i],
    [{ lines: [] }, /at least one line/i],
    [{ supplierId: "nope" }, /supplier/i],
  ])("rejects %j", (patch, re) => {
    const r = parseDraftPayload({ ...base, ...patch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(re);
  });
  it("rejects a stock line without a receipt line and a non-positive quantity", () => {
    expect(parseDraftPayload({ ...base, lines: [{ ...base.lines[0], deliveryReceiptLineId: null }] }).ok).toBe(false);
    expect(parseDraftPayload({ ...base, lines: [{ ...base.lines[0], quantity: 0 }] }).ok).toBe(false);
  });
  it("rejects the same receipt line twice", () => {
    expect(parseDraftPayload({ ...base, lines: [base.lines[0], base.lines[0]] }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/accounting/supplier-invoice`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/accounting/supplier-invoice/terms.ts
export const DEFAULT_TERM_DAYS = 30;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function endOfMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

/** Spec §3.4a. Unparseable terms fall back to +30 days; the due date stays editable. */
export function dueDateFromTerms(invoiceDate: string, terms: string | null | undefined): string {
  const t = (terms ?? "").trim().toLowerCase();
  if (t === "eom") return endOfMonth(invoiceDate);
  let m = t.match(/^(\d{1,3})\s*(?:days?\s*)?eom$/);
  if (m) return addDays(endOfMonth(invoiceDate), Number(m[1]));
  m = t.match(/^(?:net\s*)?(\d{1,3})(?:\s*days?)?$/);
  if (m) return addDays(invoiceDate, Number(m[1]));
  return addDays(invoiceDate, DEFAULT_TERM_DAYS);
}
```

```ts
// src/lib/accounting/supplier-invoice/calc.ts
export type AmountsMode = "inclusive" | "exclusive";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

/** Used when the tenant has no Xero connection: tax types stay null. */
export const FALLBACK_TAX_OPTIONS = [
  { taxType: null, name: "GST 10%", rate: 10 },
  { taxType: null, name: "GST-free", rate: 0 },
] as const;

export function lineAmounts(line: { quantity: number; unitAmount: number; taxRatePercent: number }, mode: AmountsMode) {
  const lineAmount = round2(line.quantity * line.unitAmount);
  const r = line.taxRatePercent / 100;
  const taxAmount = mode === "inclusive" ? round2(lineAmount - lineAmount / (1 + r)) : round2(lineAmount * r);
  const exTaxUnitAmount = mode === "inclusive" ? round4(line.unitAmount / (1 + r)) : round4(line.unitAmount);
  return { lineAmount, taxAmount, exTaxUnitAmount };
}

/** Must match the SQL in post_supplier_invoice (Task 11). */
export function invoiceTotals(lines: { lineAmount: number; taxAmount: number }[], mode: AmountsMode) {
  const amt = round2(lines.reduce((s, l) => s + l.lineAmount, 0));
  const tax = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
  return mode === "inclusive"
    ? { subtotal: round2(amt - tax), taxTotal: tax, total: amt }
    : { subtotal: amt, taxTotal: tax, total: round2(amt + tax) };
}

export function lineVariance(input: { quantity: number; exTaxUnitAmount: number; receivedQty: number; poUnitCost: number | null }) {
  return {
    qtyVariance: round4(input.quantity - input.receivedQty),
    priceVariance: input.poUnitCost === null ? null : round4(input.exTaxUnitAmount - input.poUnitCost),
  };
}

export const TOTAL_TOLERANCE = 0.05;

export function totalMismatch(computedTotal: number, enteredTotal: number | null): boolean {
  return enteredTotal !== null && Math.abs(round2(computedTotal - enteredTotal)) > TOTAL_TOLERANCE;
}

export function isInvoiceableReceipt(r: { stock_in_reason: string | null; supplier_id: string | null }, supplierId: string): boolean {
  return r.stock_in_reason === "supplier_delivery" && r.supplier_id === supplierId;
}
```

```ts
// src/lib/accounting/supplier-invoice/draft.ts
import type { AmountsMode } from "./calc";

export type DraftLine = {
  kind: "stock" | "other";
  deliveryReceiptLineId: string | null;
  componentId: string | null;
  description: string;
  quantity: number;
  unitAmount: number;
  taxType: string | null;
  taxRatePercent: number;
  accountCode: string | null;
};

export type DraftPayload = {
  id: string | null;
  supplierId: string;
  purchaseOrderId: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amountsMode: AmountsMode;
  enteredTotal: number | null;
  currency: string;
  lines: DraftLine[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string => typeof v === "string" && ISO_DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const optUuid = (v: unknown) => v === null || (typeof v === "string" && UUID.test(v));

export function parseDraftPayload(raw: unknown): { ok: true; value: DraftPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invoice data is missing." };
  const r = raw as Record<string, unknown>;
  if (!optUuid(r.id)) return { ok: false, error: "Invalid invoice id." };
  if (typeof r.supplierId !== "string" || !UUID.test(r.supplierId)) return { ok: false, error: "Choose a supplier." };
  if (!optUuid(r.purchaseOrderId)) return { ok: false, error: "Invalid purchase order." };
  const invoiceNumber = typeof r.invoiceNumber === "string" ? r.invoiceNumber.trim() : "";
  if (!invoiceNumber) return { ok: false, error: "Enter the supplier's invoice number." };
  if (invoiceNumber.length > 255) return { ok: false, error: "The invoice number is too long." };
  if (!isDate(r.invoiceDate)) return { ok: false, error: "Enter a valid invoice date." };
  if (!isDate(r.dueDate)) return { ok: false, error: "Enter a valid due date." };
  if (r.dueDate < r.invoiceDate) return { ok: false, error: "The due date can't be before the invoice date." };
  if (r.amountsMode !== "inclusive" && r.amountsMode !== "exclusive") return { ok: false, error: "Choose whether amounts include GST." };
  if (r.enteredTotal !== null && !isNum(r.enteredTotal)) return { ok: false, error: "The printed total must be a number." };
  if (typeof r.currency !== "string" || !/^[A-Z]{3}$/.test(r.currency)) return { ok: false, error: "Invalid currency." };
  if (!Array.isArray(r.lines) || r.lines.length === 0) return { ok: false, error: "Add at least one line." };

  const lines: DraftLine[] = [];
  const seen = new Set<string>();
  for (const [i, l] of (r.lines as Record<string, unknown>[]).entries()) {
    const n = i + 1;
    if (l.kind !== "stock" && l.kind !== "other") return { ok: false, error: `Line ${n}: unknown line type.` };
    if (!optUuid(l.deliveryReceiptLineId) || !optUuid(l.componentId)) return { ok: false, error: `Line ${n}: invalid reference.` };
    if (l.kind === "stock" && !l.deliveryReceiptLineId) return { ok: false, error: `Line ${n}: stock lines must come from a receipt.` };
    if (l.kind === "other" && l.deliveryReceiptLineId) return { ok: false, error: `Line ${n}: other charges can't reference a receipt.` };
    if (typeof l.deliveryReceiptLineId === "string") {
      if (seen.has(l.deliveryReceiptLineId)) return { ok: false, error: `Line ${n}: that receipt line is already on this invoice.` };
      seen.add(l.deliveryReceiptLineId);
    }
    const description = typeof l.description === "string" ? l.description.trim() : "";
    if (!description) return { ok: false, error: `Line ${n}: add a description.` };
    if (!isNum(l.quantity) || l.quantity <= 0) return { ok: false, error: `Line ${n}: quantity must be more than 0.` };
    if (!isNum(l.unitAmount) || l.unitAmount < 0) return { ok: false, error: `Line ${n}: price can't be negative.` };
    if (!isNum(l.taxRatePercent) || l.taxRatePercent < 0 || l.taxRatePercent > 100) return { ok: false, error: `Line ${n}: invalid tax rate.` };
    if (l.taxType !== null && typeof l.taxType !== "string") return { ok: false, error: `Line ${n}: invalid tax type.` };
    if (l.accountCode !== null && typeof l.accountCode !== "string") return { ok: false, error: `Line ${n}: invalid account.` };
    lines.push({
      kind: l.kind,
      deliveryReceiptLineId: (l.deliveryReceiptLineId as string | null) ?? null,
      componentId: (l.componentId as string | null) ?? null,
      description: description.slice(0, 4000),
      quantity: l.quantity,
      unitAmount: l.unitAmount,
      taxType: (l.taxType as string | null) ?? null,
      taxRatePercent: l.taxRatePercent,
      accountCode: (l.accountCode as string | null) ?? null,
    });
  }
  return {
    ok: true,
    value: {
      id: (r.id as string | null) ?? null,
      supplierId: r.supplierId,
      purchaseOrderId: (r.purchaseOrderId as string | null) ?? null,
      invoiceNumber,
      invoiceDate: r.invoiceDate,
      dueDate: r.dueDate,
      amountsMode: r.amountsMode,
      enteredTotal: (r.enteredTotal as number | null) ?? null,
      currency: r.currency,
      lines,
    },
  };
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/lib/accounting/supplier-invoice`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/accounting/supplier-invoice
git commit -m "MANUVA-34 feat(invoices): payment terms, invoice maths, draft validation"
```

### Task 8: Xero organisation reads, setup validation, lock dates

**Files:**
- Create: `src/lib/accounting/xero/org.ts`, `src/lib/accounting/xero/setup.ts`
- Test: `src/lib/accounting/xero/org.test.ts`, `src/lib/accounting/xero/setup.test.ts`

**Interfaces:**
- Consumes: `xeroRequest`, `XeroAccess`, `XeroResult` (Task 5); `AmountsMode` (Task 7).
- Produces from `org.ts`:
  - Types: `XeroAccount`, `XeroTaxRate`, `XeroOrganisation`, `XeroContact`
  - Fetchers: `fetchOrganisation(access, f?)`, `fetchAccounts(access, f?)`, `fetchTaxRates(access, f?)`, `searchContacts(access, term, f?)`, `getContact(access, contactId, f?)`
  - `INVENTORY_ACCOUNT_TYPES`, `OTHER_CHARGE_ACCOUNT_TYPES`
  - `accountOptions(accounts, types): { code: string; name: string; type: string }[]`
  - `purchaseTaxOptions(rates): { taxType: string; name: string; rate: number }[]`
  - `parseXeroDate(v): string | null`
  - `lockDateBlocking(invoiceDate, org): string | null`
- Produces from `setup.ts`:
  - `SALES_SOURCES`, `type SalesSource`, `SALES_SOURCE_LABELS`, `SALES_SOURCE_GUIDANCE`
  - `type SetupInput = { inventoryAccountCode: string; otherChargesAccountCode: string; purchaseTaxType: string; gstFreeTaxType: string; defaultAmountsMode: string; billsStartDate: string; salesSource: string }`
  - `type SetupValue` (validated)
  - `validateSetup(input, accounts, rates): { ok: true; value: SetupValue } | { ok: false; errors: Partial<Record<keyof SetupInput, string>> }`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/accounting/xero/org.test.ts
import { describe, expect, it } from "vitest";
import { accountOptions, INVENTORY_ACCOUNT_TYPES, lockDateBlocking, OTHER_CHARGE_ACCOUNT_TYPES, parseXeroDate, purchaseTaxOptions } from "./org";

const accounts = [
  { AccountID: "a1", Code: "630", Name: "Inventory", Type: "CURRENT", Status: "ACTIVE" },
  { AccountID: "a2", Code: "631", Name: "Tracked inv", Type: "INVENTORY", Status: "ACTIVE" },
  { AccountID: "a3", Code: "425", Name: "Freight", Type: "EXPENSE", Status: "ACTIVE" },
  { AccountID: "a4", Code: "310", Name: "Old COGS", Type: "DIRECTCOSTS", Status: "ARCHIVED" },
  { AccountID: "a5", Name: "No code", Type: "CURRENT", Status: "ACTIVE" },
];

describe("org helpers", () => {
  it("inventory options are active CURRENT accounts with codes, never INVENTORY type", () => {
    expect(accountOptions(accounts, INVENTORY_ACCOUNT_TYPES).map((a) => a.code)).toEqual(["630"]);
  });
  it("other-charge options are active expense-like accounts", () => {
    expect(accountOptions(accounts, OTHER_CHARGE_ACCOUNT_TYPES).map((a) => a.code)).toEqual(["425"]);
  });
  it("purchase tax options exclude inactive and sales-only", () => {
    const rates = [
      { TaxType: "INPUT", Name: "GST on Expenses", Status: "ACTIVE", CanApplyToExpenses: true, EffectiveRate: "10.0000" },
      { TaxType: "OUTPUT", Name: "GST on Income", Status: "ACTIVE", CanApplyToExpenses: false, EffectiveRate: 10 },
      { TaxType: "EXEMPTEXPENSES", Name: "GST Free Expenses", Status: "ACTIVE", CanApplyToExpenses: true, EffectiveRate: 0 },
      { TaxType: "OLD", Name: "Old", Status: "DELETED", CanApplyToExpenses: true, EffectiveRate: 5 },
    ];
    expect(purchaseTaxOptions(rates)).toEqual([
      { taxType: "INPUT", name: "GST on Expenses", rate: 10 },
      { taxType: "EXEMPTEXPENSES", name: "GST Free Expenses", rate: 0 },
    ]);
  });
  it("parses Xero /Date()/ and ISO dates", () => {
    expect(parseXeroDate("/Date(1782777600000+0000)/")).toBe("2026-06-30");
    expect(parseXeroDate("2026-06-30T00:00:00")).toBe("2026-06-30");
    expect(parseXeroDate(null)).toBeNull();
  });
  it("blocks on or before the latest lock date", () => {
    const org = { PeriodLockDate: "/Date(1782777600000+0000)/", EndOfYearLockDate: "/Date(1751241600000+0000)/" };
    expect(lockDateBlocking("2026-06-30", org)).toBe("2026-06-30");
    expect(lockDateBlocking("2026-07-01", org)).toBeNull();
    expect(lockDateBlocking("2026-07-01", {})).toBeNull();
  });
});
```

```ts
// src/lib/accounting/xero/setup.test.ts
import { describe, expect, it } from "vitest";
import { validateSetup } from "./setup";

const accounts = [
  { AccountID: "a1", Code: "630", Name: "Inventory", Type: "CURRENT", Status: "ACTIVE" },
  { AccountID: "a3", Code: "425", Name: "Freight", Type: "EXPENSE", Status: "ACTIVE" },
];
const rates = [
  { TaxType: "INPUT", Name: "GST on Expenses", Status: "ACTIVE", CanApplyToExpenses: true, EffectiveRate: 10 },
  { TaxType: "EXEMPTEXPENSES", Name: "GST Free Expenses", Status: "ACTIVE", CanApplyToExpenses: true, EffectiveRate: 0 },
];
const good = { inventoryAccountCode: "630", otherChargesAccountCode: "425", purchaseTaxType: "INPUT", gstFreeTaxType: "EXEMPTEXPENSES", defaultAmountsMode: "exclusive", billsStartDate: "2026-10-01", salesSource: "a2x" };

describe("validateSetup", () => {
  it("accepts a valid setup", () => {
    expect(validateSetup(good, accounts, rates)).toEqual({ ok: true, value: { ...good, defaultAmountsMode: "exclusive", salesSource: "a2x" } });
  });
  it("rejects an expense account as inventory and every other bad field", () => {
    const r = validateSetup({ ...good, inventoryAccountCode: "425", otherChargesAccountCode: "630", purchaseTaxType: "OUTPUT", gstFreeTaxType: "", defaultAmountsMode: "gross", billsStartDate: "1/10/2026", salesSource: "shopify" }, accounts, rates);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["billsStartDate", "defaultAmountsMode", "gstFreeTaxType", "inventoryAccountCode", "otherChargesAccountCode", "purchaseTaxType", "salesSource"]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/accounting/xero/org.test.ts src/lib/accounting/xero/setup.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/accounting/xero/org.ts
import { xeroRequest, type XeroAccess } from "./client";

export type XeroAccount = { AccountID: string; Code?: string; Name: string; Type: string; Status: string };
export type XeroTaxRate = { TaxType: string; Name: string; Status: string; CanApplyToExpenses?: boolean; EffectiveRate?: number | string };
export type XeroOrganisation = { Name: string; BaseCurrency: string; PeriodLockDate?: string | null; EndOfYearLockDate?: string | null };
export type XeroContact = { ContactID: string; Name: string; ContactStatus?: string; EmailAddress?: string };

type F = typeof fetch;

export const fetchOrganisation = (access: XeroAccess, f: F = fetch) =>
  xeroRequest<{ Organisations: XeroOrganisation[] }>(access, { method: "GET", path: "/Organisation" }, f);
export const fetchAccounts = (access: XeroAccess, f: F = fetch) =>
  xeroRequest<{ Accounts: XeroAccount[] }>(access, { method: "GET", path: "/Accounts", query: { where: 'Status=="ACTIVE"' } }, f);
export const fetchTaxRates = (access: XeroAccess, f: F = fetch) =>
  xeroRequest<{ TaxRates: XeroTaxRate[] }>(access, { method: "GET", path: "/TaxRates", query: { where: 'Status=="ACTIVE"' } }, f);
export const searchContacts = (access: XeroAccess, term: string, f: F = fetch) =>
  xeroRequest<{ Contacts: XeroContact[] }>(access, { method: "GET", path: "/Contacts", query: { searchTerm: term, summaryOnly: "true", page: "1" } }, f);
export const getContact = (access: XeroAccess, contactId: string, f: F = fetch) =>
  xeroRequest<{ Contacts: XeroContact[] }>(access, { method: "GET", path: `/Contacts/${encodeURIComponent(contactId)}` }, f);

/** CURRENT, not INVENTORY: manual journals (the COGS release) cannot post to INVENTORY-type accounts. */
export const INVENTORY_ACCOUNT_TYPES = ["CURRENT"] as const;
export const OTHER_CHARGE_ACCOUNT_TYPES = ["EXPENSE", "DIRECTCOSTS", "OVERHEADS"] as const;

export function accountOptions(accounts: XeroAccount[], types: readonly string[]) {
  return accounts
    .filter((a) => a.Status === "ACTIVE" && !!a.Code && types.includes(a.Type))
    .map((a) => ({ code: a.Code!, name: a.Name, type: a.Type }))
    .sort((x, y) => x.code.localeCompare(y.code));
}

export function purchaseTaxOptions(rates: XeroTaxRate[]) {
  return rates
    .filter((r) => r.Status === "ACTIVE" && r.CanApplyToExpenses !== false)
    .map((r) => ({ taxType: r.TaxType, name: r.Name, rate: Number(r.EffectiveRate ?? 0) }));
}

export function parseXeroDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = value.match(/\/Date\((-?\d+)/);
  if (ms) return new Date(Number(ms[1])).toISOString().slice(0, 10);
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}

/** Returns the lock date that blocks this invoice date, or null. Xero locks dates on or before the lock date. */
export function lockDateBlocking(invoiceDate: string, org: Pick<XeroOrganisation, "PeriodLockDate" | "EndOfYearLockDate">): string | null {
  const dates = [parseXeroDate(org.PeriodLockDate), parseXeroDate(org.EndOfYearLockDate)].filter((d): d is string => !!d).sort();
  const latest = dates[dates.length - 1];
  return latest && invoiceDate <= latest ? latest : null;
}
```

```ts
// src/lib/accounting/xero/setup.ts
import type { AmountsMode } from "../supplier-invoice/calc";
import { accountOptions, INVENTORY_ACCOUNT_TYPES, OTHER_CHARGE_ACCOUNT_TYPES, purchaseTaxOptions, type XeroAccount, type XeroTaxRate } from "./org";

export const SALES_SOURCES = ["a2x", "link_my_books", "xero_shopify", "square", "amaka", "none", "other"] as const;
export type SalesSource = (typeof SALES_SOURCES)[number];

export const SALES_SOURCE_LABELS: Record<SalesSource, string> = {
  a2x: "A2X",
  link_my_books: "Link My Books",
  xero_shopify: "Xero's Shopify integration",
  square: "Square's Xero integration",
  amaka: "Amaka",
  none: "Nothing — we enter sales ourselves",
  other: "Something else",
};

export const SALES_SOURCE_GUIDANCE: Record<SalesSource, string> = {
  a2x: "Keep A2X sending your sales. Manuva never posts sales. When Manuva's cost-of-goods journal arrives, turn off COGS in A2X so it isn't counted twice.",
  link_my_books: "Keep Link My Books sending your sales. Manuva never posts sales. When Manuva's cost-of-goods journal arrives, turn off COGS in Link My Books.",
  xero_shopify: "Keep Xero's Shopify integration sending your sales. Manuva never posts sales, so nothing is counted twice.",
  square: "Keep Square sending your sales to Xero. Manuva never posts sales, so nothing is counted twice.",
  amaka: "Keep Amaka sending your sales. Manuva never posts sales. When Manuva's cost-of-goods journal arrives, turn off COGS in Amaka.",
  none: "Manuva won't send sales to Xero. Keep recording sales in Xero the way you do today.",
  other: "Manuva never posts sales. If that tool also posts cost of goods, it will need turning off when Manuva's cost-of-goods journal arrives.",
};

export type SetupInput = {
  inventoryAccountCode: string;
  otherChargesAccountCode: string;
  purchaseTaxType: string;
  gstFreeTaxType: string;
  defaultAmountsMode: string;
  billsStartDate: string;
  salesSource: string;
};
export type SetupValue = Omit<SetupInput, "defaultAmountsMode" | "salesSource"> & { defaultAmountsMode: AmountsMode; salesSource: SalesSource };

export function validateSetup(input: SetupInput, accounts: XeroAccount[], rates: XeroTaxRate[]):
  | { ok: true; value: SetupValue }
  | { ok: false; errors: Partial<Record<keyof SetupInput, string>> } {
  const errors: Partial<Record<keyof SetupInput, string>> = {};
  const inv = new Set(accountOptions(accounts, INVENTORY_ACCOUNT_TYPES).map((a) => a.code));
  const other = new Set(accountOptions(accounts, OTHER_CHARGE_ACCOUNT_TYPES).map((a) => a.code));
  const tax = new Set(purchaseTaxOptions(rates).map((r) => r.taxType));
  if (!inv.has(input.inventoryAccountCode)) errors.inventoryAccountCode = "Choose an active current-asset account for inventory.";
  if (!other.has(input.otherChargesAccountCode)) errors.otherChargesAccountCode = "Choose an active expense account for freight and other charges.";
  if (!tax.has(input.purchaseTaxType)) errors.purchaseTaxType = "Choose a purchase tax rate from your Xero organisation.";
  if (!tax.has(input.gstFreeTaxType)) errors.gstFreeTaxType = "Choose a GST-free purchase tax rate from your Xero organisation.";
  if (input.defaultAmountsMode !== "inclusive" && input.defaultAmountsMode !== "exclusive") errors.defaultAmountsMode = "Choose whether amounts include GST.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.billsStartDate) || Number.isNaN(Date.parse(`${input.billsStartDate}T00:00:00Z`))) errors.billsStartDate = "Enter a valid start date.";
  if (!(SALES_SOURCES as readonly string[]).includes(input.salesSource)) errors.salesSource = "Tell us what sends your sales to Xero.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { ...input, defaultAmountsMode: input.defaultAmountsMode as AmountsMode, salesSource: input.salesSource as SalesSource } };
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/lib/accounting/xero/org.test.ts src/lib/accounting/xero/setup.test.ts`
Expected: all pass. The fixture epochs are `Date.UTC(2026,5,30)` = 1782777600000 and `Date.UTC(2025,5,30)` = 1751241600000.

- [ ] **Step 5: Commit**

```bash
git add src/lib/accounting/xero/org.ts src/lib/accounting/xero/setup.ts src/lib/accounting/xero/org.test.ts src/lib/accounting/xero/setup.test.ts
git commit -m "MANUVA-34 feat(xero): org reads, setup validation, lock dates"
```

### Task 9: Bill, contact and void payloads

**Files:**
- Create: `src/lib/accounting/xero/bill.ts`
- Test: `src/lib/accounting/xero/bill.test.ts`

**Interfaces:**
- Consumes: `AmountsMode` (Task 7).
- Produces:
  - `type BillLineInput = { description: string; quantity: number; unitAmount: number; accountCode: string; taxType: string }`
  - `type BillInput = { contactId: string; invoiceNumber: string; date: string; dueDate: string; amountsMode: AmountsMode; currencyCode: string; lines: BillLineInput[] }`
  - `buildXeroBill(input): { Invoices: [...] }`
  - `stockLineDescription(p: { sku: string | null; name: string; poNumber: string | null; receiptRef: string | null }): string`
  - `xeroBillUrl(invoiceId: string): string`
  - `existingBillWhere(contactId: string, invoiceNumber: string): string`
  - `type XeroBillState = { InvoiceID: string; Status: string; AmountPaid?: number; AmountCredited?: number; Total?: number }`
  - `type VoidDecision = { kind: "delete" } | { kind: "void" } | { kind: "already" } | { kind: "blocked"; message: string }`
  - `decideVoidAction(b: XeroBillState): VoidDecision`
  - `voidPayload(invoiceId: string, kind: "delete" | "void")`
  - `buildXeroContact(s: { name: string; email: string | null; phone: string | null; address: string | null })`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/accounting/xero/bill.test.ts
import { describe, expect, it } from "vitest";
import { buildXeroBill, buildXeroContact, decideVoidAction, existingBillWhere, stockLineDescription, voidPayload, xeroBillUrl } from "./bill";

const input = {
  contactId: "c-1", invoiceNumber: "INV-9", date: "2026-10-01", dueDate: "2026-10-31",
  amountsMode: "inclusive" as const, currencyCode: "AUD",
  lines: [{ description: "BOLT-1 Bolt · PO-12", quantity: 10000, unitAmount: 0.0125, accountCode: "630", taxType: "INPUT" }],
};

describe("buildXeroBill", () => {
  it("builds a SUBMITTED ACCPAY bill with the supplier number in InvoiceNumber", () => {
    const b = buildXeroBill(input).Invoices[0];
    expect(b).toMatchObject({ Type: "ACCPAY", Contact: { ContactID: "c-1" }, InvoiceNumber: "INV-9", Date: "2026-10-01", DueDate: "2026-10-31", LineAmountTypes: "Inclusive", CurrencyCode: "AUD", Status: "SUBMITTED" });
    expect(b).not.toHaveProperty("Reference");
  });
  it("never sends ItemCode and keeps 4dp unit amounts", () => {
    const line = buildXeroBill(input).Invoices[0].LineItems[0];
    expect(line).toEqual({ Description: "BOLT-1 Bolt · PO-12", Quantity: 10000, UnitAmount: 0.0125, AccountCode: "630", TaxType: "INPUT" });
    expect(line).not.toHaveProperty("ItemCode");
  });
  it("refuses an empty bill", () => {
    expect(() => buildXeroBill({ ...input, lines: [] })).toThrow(/at least one line/);
  });
});

describe("helpers", () => {
  it("describes stock lines", () => {
    expect(stockLineDescription({ sku: "BOLT-1", name: "Bolt", poNumber: "PO-12", receiptRef: "DN 55" })).toBe("BOLT-1 Bolt · PO-12 · receipt DN 55");
    expect(stockLineDescription({ sku: null, name: "Bolt", poNumber: null, receiptRef: null })).toBe("Bolt");
  });
  it("links to the bill", () => {
    expect(xeroBillUrl("abc")).toBe("https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=abc");
  });
  it("escapes quotes in the duplicate search", () => {
    expect(existingBillWhere("c-1", 'A"B')).toBe('Type=="ACCPAY" AND Contact.ContactID==guid("c-1") AND InvoiceNumber=="A\\"B"');
  });
  it.each([
    [{ InvoiceID: "i", Status: "DRAFT" }, "delete"],
    [{ InvoiceID: "i", Status: "SUBMITTED" }, "delete"],
    [{ InvoiceID: "i", Status: "AUTHORISED", AmountPaid: 0 }, "void"],
    [{ InvoiceID: "i", Status: "VOIDED" }, "already"],
    [{ InvoiceID: "i", Status: "DELETED" }, "already"],
    [{ InvoiceID: "i", Status: "AUTHORISED", AmountPaid: 5 }, "blocked"],
    [{ InvoiceID: "i", Status: "PAID" }, "blocked"],
  ])("void decision for %j is %s", (bill, kind) => {
    expect(decideVoidAction(bill).kind).toBe(kind);
  });
  it("builds void and contact payloads", () => {
    expect(voidPayload("i", "void")).toEqual({ Invoices: [{ InvoiceID: "i", Status: "VOIDED" }] });
    expect(voidPayload("i", "delete")).toEqual({ Invoices: [{ InvoiceID: "i", Status: "DELETED" }] });
    expect(buildXeroContact({ name: " Acme ", email: "a@acme.test", phone: null, address: "1 Main St" })).toEqual({
      Contacts: [{ Name: "Acme", EmailAddress: "a@acme.test", Addresses: [{ AddressType: "STREET", AddressLine1: "1 Main St" }] }],
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/accounting/xero/bill.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/accounting/xero/bill.ts
import type { AmountsMode } from "../supplier-invoice/calc";

export type BillLineInput = { description: string; quantity: number; unitAmount: number; accountCode: string; taxType: string };
export type BillInput = {
  contactId: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  amountsMode: AmountsMode;
  currencyCode: string;
  lines: BillLineInput[];
};

/** Xero ignores Reference on ACCPAY, so the PO number travels in line descriptions (stockLineDescription). */
export function buildXeroBill(input: BillInput) {
  if (input.lines.length === 0) throw new Error("A bill needs at least one line");
  return {
    Invoices: [
      {
        Type: "ACCPAY" as const,
        Contact: { ContactID: input.contactId },
        InvoiceNumber: input.invoiceNumber,
        Date: input.date,
        DueDate: input.dueDate,
        LineAmountTypes: input.amountsMode === "inclusive" ? ("Inclusive" as const) : ("Exclusive" as const),
        CurrencyCode: input.currencyCode,
        Status: "SUBMITTED" as const,
        LineItems: input.lines.map((l) => ({
          Description: l.description.slice(0, 4000),
          Quantity: l.quantity,
          UnitAmount: l.unitAmount,
          AccountCode: l.accountCode,
          TaxType: l.taxType,
        })),
      },
    ],
  };
}

export function stockLineDescription(p: { sku: string | null; name: string; poNumber: string | null; receiptRef: string | null }): string {
  const parts = [`${p.sku ? `${p.sku} ` : ""}${p.name}`];
  if (p.poNumber) parts.push(p.poNumber);
  if (p.receiptRef) parts.push(`receipt ${p.receiptRef}`);
  return parts.join(" · ");
}

export function xeroBillUrl(invoiceId: string): string {
  return `https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=${encodeURIComponent(invoiceId)}`;
}

export function existingBillWhere(contactId: string, invoiceNumber: string): string {
  const esc = invoiceNumber.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `Type=="ACCPAY" AND Contact.ContactID==guid("${contactId}") AND InvoiceNumber=="${esc}"`;
}

export type XeroBillState = { InvoiceID: string; Status: string; AmountPaid?: number; AmountCredited?: number; Total?: number };
export type VoidDecision = { kind: "delete" } | { kind: "void" } | { kind: "already" } | { kind: "blocked"; message: string };

export function decideVoidAction(b: XeroBillState): VoidDecision {
  const s = b.Status.toUpperCase();
  if (s === "DELETED" || s === "VOIDED") return { kind: "already" };
  if (s === "PAID" || (b.AmountPaid ?? 0) > 0 || (b.AmountCredited ?? 0) > 0) {
    return { kind: "blocked", message: "This bill has payments or credits in Xero. Remove them in Xero first, then retry." };
  }
  if (s === "DRAFT" || s === "SUBMITTED") return { kind: "delete" };
  if (s === "AUTHORISED") return { kind: "void" };
  return { kind: "blocked", message: `The Xero bill is in status ${b.Status} and Manuva can't void it.` };
}

export function voidPayload(invoiceId: string, kind: "delete" | "void") {
  return { Invoices: [{ InvoiceID: invoiceId, Status: kind === "delete" ? "DELETED" : "VOIDED" }] };
}

export function buildXeroContact(s: { name: string; email: string | null; phone: string | null; address: string | null }) {
  return {
    Contacts: [
      {
        Name: s.name.trim().slice(0, 255),
        ...(s.email ? { EmailAddress: s.email } : {}),
        ...(s.phone ? { Phones: [{ PhoneType: "DEFAULT", PhoneNumber: s.phone }] } : {}),
        ...(s.address ? { Addresses: [{ AddressType: "STREET", AddressLine1: s.address.slice(0, 500) }] } : {}),
      },
    ],
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/accounting/xero/bill.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/accounting/xero/bill.ts src/lib/accounting/xero/bill.test.ts
git commit -m "MANUVA-34 feat(xero): bill, contact and void payloads"
```

---

# Chunk C — Database

### Task 10: Migration — tables, RLS and functions

**Files:**
- Create: `supabase/patches/2026-10-01-xero-supplier-bills.sql`
- Create: `supabase/__tests__/2026-10-01-xero-supplier-bills.verify.sql`

**Interfaces:**
- Consumes: `public.current_tenant_id()`, `public.current_profile_role()`, `public.is_service_role()`, `auth.uid()`, and tables `tenant`, `supplier`, `component`, `purchase_order(_line)`, `delivery_receipt(_line)`.
- Produces:
  - Tables: `accounting_connection`, `accounting_credential`, `accounting_contact_link`, `supplier_invoice`, `supplier_invoice_line`, `accounting_outbox`. Columns are exactly as written below; TypeScript in later tasks uses these names.
  - `post_supplier_invoice(p_invoice_id uuid, p_update_component_costs boolean default true, p_create_contact boolean default false) returns text`. The result is `'queued' | 'not_synced'`.
  - `void_supplier_invoice(p_invoice_id uuid, p_reason text) returns text`. The result is `'queued' | 'not_synced'`.
  - `claim_accounting_jobs(p_connection_id uuid, p_limit int, p_worker text) returns setof accounting_outbox`. Service role only.
  - `claim_accounting_refresh_lease(p_connection_id uuid, p_lease_seconds int) returns setof accounting_credential`. Service role only.

- [ ] **Step 1: Write the verification script first (it fails until the patch exists)**

```sql
-- supabase/__tests__/2026-10-01-xero-supplier-bills.verify.sql
-- Verification for patches/2026-10-01-xero-supplier-bills.sql (MANUVA-34).
-- SCRATCH POSTGRES ONLY: redefines current_tenant_id()/current_profile_role()
-- to read GUCs so one session can play several callers. Never run on prod.
--
--   psql -f supabase/__tests__/scratch-prelude.sql
--   psql -f supabase/schema.sql
--   psql -f supabase/patches/suppliers_module.sql      (and any patch that
--        creates a relation this script reports missing: grep -l
--        "create table.*<name>" supabase/patches)
--   psql -f supabase/patches/2026-10-01-xero-supplier-bills.sql
--   psql -f supabase/__tests__/2026-10-01-xero-supplier-bills.verify.sql
--
-- Expected: every check prints PASS; the script stops on the first FAIL.
\set ON_ERROR_STOP on

create or replace function public.current_tenant_id() returns uuid language sql stable as
$$ select nullif(current_setting('test.tenant', true), '')::uuid $$;
create or replace function public.current_profile_role() returns text language sql stable as
$$ select nullif(current_setting('test.role', true), '') $$;

-- Fixtures: tenant T1 with supplier S1, component C1, PO PO1, two receipts:
-- R1 (supplier_delivery, line L1 qty 10) and R2 (sample, line L2).
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'admin@t1.test') on conflict do nothing;
insert into public.tenant (id, name) values ('11111111-1111-1111-1111-111111111111', 'T1') on conflict do nothing;
insert into public.supplier (id, tenant_id, name) values ('11111111-0000-0000-0000-000000000051', '11111111-1111-1111-1111-111111111111', 'Acme') on conflict do nothing;
insert into public.component (id, tenant_id, name, cost_per_unit) values ('11111111-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111', 'Bolt', 1) on conflict do nothing;
insert into public.location (id, tenant_id, name) values ('11111111-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-111111111111', 'Main') on conflict do nothing;
insert into public.purchase_order (id, tenant_id, supplier_id, po_number) values ('11111111-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', 'PO-1') on conflict do nothing;
insert into public.purchase_order_line (id, tenant_id, purchase_order_id, component_id, quantity, unit_cost) values ('11111111-0000-0000-0000-00000000b101', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000b1', '11111111-0000-0000-0000-0000000000c1', 10, 2.00) on conflict do nothing;
insert into public.delivery_receipt (id, tenant_id, supplier_id, supplier_reference, location_id, stock_in_reason, purchase_order_id) values
  ('11111111-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', 'DN-1', '11111111-0000-0000-0000-0000000000f1', 'supplier_delivery', '11111111-0000-0000-0000-0000000000b1'),
  ('11111111-0000-0000-0000-0000000000d2', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', 'SAMPLE', '11111111-0000-0000-0000-0000000000f1', 'sample', null) on conflict do nothing;
insert into public.delivery_receipt_line (id, tenant_id, delivery_receipt_id, component_id, quantity_delivered, cost_per_unit, purchase_order_line_id) values
  ('11111111-0000-0000-0000-00000000d101', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000d1', '11111111-0000-0000-0000-0000000000c1', 10, 2.00, '11111111-0000-0000-0000-00000000b101'),
  ('11111111-0000-0000-0000-00000000d102', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000d2', '11111111-0000-0000-0000-0000000000c1', 1, 0, null) on conflict do nothing;
insert into public.accounting_connection (id, tenant_id, provider, status, external_org_id, external_connection_id, org_name, base_currency,
  inventory_account_code, other_charges_account_code, purchase_tax_type, gst_free_tax_type, bills_start_date, sales_source, setup_completed_at)
values ('11111111-0000-0000-0000-0000000000e1', '11111111-1111-1111-1111-111111111111', 'xero', 'connected', 'org-1', 'conn-1', 'Acme Pty', 'AUD',
  '630', '425', 'INPUT', 'EXEMPTEXPENSES', '2026-01-01', 'a2x', now()) on conflict do nothing;

select set_config('test.tenant', '11111111-1111-1111-1111-111111111111', false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);

-- Two drafts, both containing L1; A also contains L2 is NOT allowed (sample), tested separately.
insert into public.supplier_invoice (id, tenant_id, supplier_id, purchase_order_id, invoice_number, invoice_date, due_date, amounts_mode, currency) values
  ('11111111-0000-0000-0000-0000000000aa', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', '11111111-0000-0000-0000-0000000000b1', 'INV-A', '2026-10-01', '2026-10-31', 'exclusive', 'AUD'),
  ('11111111-0000-0000-0000-0000000000ab', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', null, 'INV-B', '2026-10-01', '2026-10-31', 'exclusive', 'AUD'),
  ('11111111-0000-0000-0000-0000000000ac', '11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', null, 'INV-C', '2026-10-01', '2026-10-31', 'exclusive', 'AUD');
insert into public.supplier_invoice_line (tenant_id, supplier_invoice_id, line_no, kind, delivery_receipt_line_id, component_id, description, quantity, unit_amount, tax_type, tax_rate, account_code, line_amount, tax_amount) values
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000aa', 1, 'stock', '11111111-0000-0000-0000-00000000d101', '11111111-0000-0000-0000-0000000000c1', 'Bolt', 9, 2.5, 'INPUT', 10, '630', 22.50, 2.25),
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000aa', 2, 'other', null, null, 'Freight', 1, 10, 'INPUT', 10, '425', 10.00, 1.00),
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000ab', 1, 'stock', '11111111-0000-0000-0000-00000000d101', '11111111-0000-0000-0000-0000000000c1', 'Bolt', 10, 2, 'INPUT', 10, '630', 20.00, 2.00),
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-0000000000ac', 1, 'stock', '11111111-0000-0000-0000-00000000d102', '11111111-0000-0000-0000-0000000000c1', 'Sample', 1, 0, 'INPUT', 10, '630', 0, 0);

-- 1. Posting without a contact link and without create_contact is refused.
do $$ begin
  perform public.post_supplier_invoice('11111111-0000-0000-0000-0000000000aa', true, false);
  raise exception 'FAIL 1: posted without a contact link';
exception when sqlstate 'P0001' then raise notice 'PASS 1: contact link required';
end $$;

-- 2. Posting with create_contact queues a contact job and a dependent bill job.
do $$ declare v text; v_contact uuid; v_bill_dep uuid; begin
  v := public.post_supplier_invoice('11111111-0000-0000-0000-0000000000aa', true, true);
  if v <> 'queued' then raise exception 'FAIL 2: expected queued, got %', v; end if;
  select id into v_contact from public.accounting_outbox where operation = 'create_contact' and entity_id = '11111111-0000-0000-0000-000000000051';
  select depends_on into v_bill_dep from public.accounting_outbox where operation = 'create_bill' and entity_id = '11111111-0000-0000-0000-0000000000aa';
  if v_contact is null or v_bill_dep is distinct from v_contact then raise exception 'FAIL 2: bill does not depend on contact job'; end if;
  raise notice 'PASS 2: contact + dependent bill queued';
end $$;

-- 3. Totals, variances and cost write-back.
do $$ declare inv record; l record; begin
  select subtotal, tax_total, total, status into inv from public.supplier_invoice where id = '11111111-0000-0000-0000-0000000000aa';
  if inv.subtotal <> 32.50 or inv.tax_total <> 3.25 or inv.total <> 35.75 or inv.status <> 'posted' then raise exception 'FAIL 3: totals %', inv; end if;
  select qty_variance, price_variance into l from public.supplier_invoice_line where supplier_invoice_id = '11111111-0000-0000-0000-0000000000aa' and line_no = 1;
  if l.qty_variance <> -1 or l.price_variance <> 0.5 then raise exception 'FAIL 3: variance %', l; end if;
  if (select cost_per_unit from public.delivery_receipt_line where id = '11111111-0000-0000-0000-00000000d101') <> 2.5 then raise exception 'FAIL 3: receipt cost not written back'; end if;
  if (select cost_per_unit from public.component where id = '11111111-0000-0000-0000-0000000000c1') <> 2.5 then raise exception 'FAIL 3: component cost not written back'; end if;
  raise notice 'PASS 3: totals, variances, cost write-back';
end $$;

-- 4. Second posting of the same receipt line is refused (Review Focus 4).
do $$ begin
  insert into public.accounting_contact_link (tenant_id, provider, supplier_id, external_contact_id, external_name)
  values ('11111111-1111-1111-1111-111111111111', 'xero', '11111111-0000-0000-0000-000000000051', 'contact-1', 'Acme') on conflict do nothing;
  perform public.post_supplier_invoice('11111111-0000-0000-0000-0000000000ab', true, false);
  raise exception 'FAIL 4: same receipt line posted twice';
exception when unique_violation then raise notice 'PASS 4: second posting of the same receipt line is refused';
end $$;

-- 5. A sample receipt cannot be invoiced.
do $$ begin
  perform public.post_supplier_invoice('11111111-0000-0000-0000-0000000000ac', true, false);
  raise exception 'FAIL 5: sample receipt posted';
exception when sqlstate 'P0001' then raise notice 'PASS 5: only supplier deliveries are invoiceable';
end $$;

-- 6. Invoice numbers are unique per supplier among live invoices.
do $$ begin
  insert into public.supplier_invoice (tenant_id, supplier_id, invoice_number, invoice_date, due_date, amounts_mode, currency)
  values ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000051', 'inv-a', '2026-10-01', '2026-10-31', 'exclusive', 'AUD');
  raise exception 'FAIL 6: duplicate invoice number accepted';
exception when unique_violation then raise notice 'PASS 6: duplicate invoice number refused (case-insensitive)';
end $$;

-- 7. Claiming respects depends_on: only the contact job is claimable.
do $$ declare n int; op text; begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
  select count(*), min(operation) into n, op from public.claim_accounting_jobs('11111111-0000-0000-0000-0000000000e1', 10, 'verify');
  if n <> 1 or op <> 'create_contact' then raise exception 'FAIL 7: claimed % jobs (%)', n, op; end if;
  -- While it is working, nothing else is claimable for this connection.
  select count(*) into n from public.claim_accounting_jobs('11111111-0000-0000-0000-0000000000e1', 10, 'verify-2');
  if n <> 0 then raise exception 'FAIL 7: second worker claimed % jobs', n; end if;
  update public.accounting_outbox set status = 'sent', locked_at = null where operation = 'create_contact';
  select count(*), min(operation) into n, op from public.claim_accounting_jobs('11111111-0000-0000-0000-0000000000e1', 10, 'verify');
  if n <> 1 or op <> 'create_bill' then raise exception 'FAIL 7: bill not claimable after contact sent (% %)', n, op; end if;
  update public.accounting_outbox set status = 'pending', locked_at = null, locked_by = null where operation = 'create_bill';
  perform set_config('request.jwt.claims', '', false);
  raise notice 'PASS 7: dependency and single-worker claiming';
end $$;

-- 8. Claim functions refuse non-service callers.
do $$ begin
  perform public.claim_accounting_jobs('11111111-0000-0000-0000-0000000000e1', 1, 'x');
  raise exception 'FAIL 8: non-service caller claimed jobs';
exception when insufficient_privilege then raise notice 'PASS 8: claim is service-role only';
end $$;

-- 9. Void: members refused; admin cancels the pending bill job.
do $$ declare v text; begin
  perform set_config('test.role', 'member', false);
  begin
    perform public.void_supplier_invoice('11111111-0000-0000-0000-0000000000aa', 'wrong price');
    raise exception 'FAIL 9: member voided';
  exception when insufficient_privilege then null;
  end;
  perform set_config('test.role', 'admin', false);
  v := public.void_supplier_invoice('11111111-0000-0000-0000-0000000000aa', 'wrong price');
  if v <> 'not_synced' then raise exception 'FAIL 9: expected not_synced, got %', v; end if;
  if (select status from public.accounting_outbox where operation = 'create_bill' and entity_id = '11111111-0000-0000-0000-0000000000aa') <> 'cancelled' then raise exception 'FAIL 9: bill job not cancelled'; end if;
  raise notice 'PASS 9: void permissions and pending-job cancel';
end $$;

-- 10. After voiding A, B may now post the freed receipt line.
do $$ begin
  if public.post_supplier_invoice('11111111-0000-0000-0000-0000000000ab', true, false) <> 'queued' then raise exception 'FAIL 10'; end if;
  raise notice 'PASS 10: voiding frees receipt lines';
end $$;

-- 11. authenticated has no access to credentials.
do $$ begin
  set local role authenticated;
  perform count(*) from public.accounting_credential;
  raise exception 'FAIL 11: authenticated can read credentials';
exception when insufficient_privilege then raise notice 'PASS 11: credentials are server-only';
end $$;
reset role;
```

- [ ] **Step 2: Run it against scratch Postgres and watch it fail**

Run the psql sequence from the script header without the new patch.
Expected: an error on `accounting_connection` ("relation does not exist").

- [ ] **Step 3: Write the migration**

```sql
-- supabase/patches/2026-10-01-xero-supplier-bills.sql
-- ---------------------------------------------------------------------
-- MANUVA-34 — Xero supplier bills: tables, RLS, posting/void/claim functions.
-- Spec: docs/superpowers/specs/2026-10-01-xero-supplier-bills-design.md §4, §6.
-- Replaces the never-applied accounting_integration.sql (deleted, MANUVA-45):
-- tokens now live in accounting_credential, which anon/authenticated cannot
-- touch at all.
-- Idempotent. After applying run scripts/probe_anon_rpc_surface.sh.
-- ---------------------------------------------------------------------
begin;

-- 1. Connection (one per tenant per provider) -------------------------
create table if not exists public.accounting_connection (
  id                         uuid primary key default gen_random_uuid(),
  tenant_id                  uuid not null references public.tenant(id) on delete cascade,
  provider                   text not null check (provider in ('xero')),
  status                     text not null default 'connected' check (status in ('connected', 'needs_reconnect', 'disconnected')),
  external_org_id            text not null,
  external_connection_id     text not null,
  org_name                   text not null,
  base_currency              text not null,
  connected_by               uuid references auth.users(id) on delete set null,
  connected_at               timestamptz not null default now(),
  disconnected_at            timestamptz,
  last_refreshed_at          timestamptz,
  last_error                 text,
  last_alert_at              timestamptz,
  inventory_account_code     text,
  other_charges_account_code text,
  purchase_tax_type          text,
  gst_free_tax_type          text,
  default_amounts_mode       text not null default 'exclusive' check (default_amounts_mode in ('inclusive', 'exclusive')),
  bills_start_date           date,
  sales_source               text check (sales_source in ('a2x', 'link_my_books', 'xero_shopify', 'square', 'amaka', 'none', 'other')),
  setup_completed_at         timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (tenant_id, provider)
);

-- 2. Credentials (server only) -----------------------------------------
create table if not exists public.accounting_credential (
  connection_id       uuid primary key references public.accounting_connection(id) on delete cascade,
  access_token_enc    text not null,
  refresh_token_enc   text not null,
  key_version         int  not null,
  access_expires_at   timestamptz not null,
  refresh_expires_at  timestamptz not null,
  refresh_lease_until timestamptz,
  version             int  not null default 1,
  updated_at          timestamptz not null default now()
);

-- 3. Supplier ↔ Xero contact -----------------------------------------
create table if not exists public.accounting_contact_link (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenant(id) on delete cascade,
  provider            text not null check (provider in ('xero')),
  supplier_id         uuid not null references public.supplier(id) on delete cascade,
  external_contact_id text not null,
  external_name       text not null,
  linked_by           uuid references auth.users(id) on delete set null,
  linked_at           timestamptz not null default now(),
  unique (tenant_id, provider, supplier_id)
);

-- 4. Supplier invoices ---------------------------------------------------
create table if not exists public.supplier_invoice (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenant(id) on delete cascade,
  supplier_id       uuid not null references public.supplier(id),
  purchase_order_id uuid references public.purchase_order(id) on delete set null,
  invoice_number    text not null check (length(btrim(invoice_number)) > 0),
  invoice_date      date not null,
  due_date          date not null,
  amounts_mode      text not null check (amounts_mode in ('inclusive', 'exclusive')),
  currency          text not null,
  subtotal          numeric(14,2) not null default 0,
  tax_total         numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  entered_total     numeric(14,2),
  status            text not null default 'draft' check (status in ('draft', 'posted', 'voided')),
  sync_status       text not null default 'not_synced' check (sync_status in ('not_synced', 'queued', 'sent', 'failed', 'voided_in_xero')),
  external_id       text,
  external_url      text,
  posted_by         uuid references auth.users(id) on delete set null,
  posted_at         timestamptz,
  voided_by         uuid references auth.users(id) on delete set null,
  voided_at         timestamptz,
  void_reason       text,
  created_by        uuid references auth.users(id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists supplier_invoice_live_number_uq
  on public.supplier_invoice (tenant_id, supplier_id, lower(invoice_number)) where status <> 'voided';
create index if not exists supplier_invoice_tenant_created_idx on public.supplier_invoice (tenant_id, created_at desc);

create table if not exists public.supplier_invoice_line (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenant(id) on delete cascade,
  supplier_invoice_id      uuid not null references public.supplier_invoice(id) on delete cascade,
  line_no                  int  not null,
  kind                     text not null check (kind in ('stock', 'other')),
  delivery_receipt_line_id uuid references public.delivery_receipt_line(id),
  component_id             uuid references public.component(id),
  description              text not null,
  quantity                 numeric(14,4) not null check (quantity > 0),
  unit_amount              numeric(18,4) not null check (unit_amount >= 0),
  tax_type                 text,
  tax_rate                 numeric(7,4) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  account_code             text,
  line_amount              numeric(14,2) not null default 0,
  tax_amount               numeric(14,2) not null default 0,
  qty_variance             numeric(14,4),
  price_variance           numeric(18,4),
  check ((kind = 'stock') = (delivery_receipt_line_id is not null)),
  unique (supplier_invoice_id, line_no)
);
create index if not exists supplier_invoice_line_receipt_line_idx on public.supplier_invoice_line (delivery_receipt_line_id);

-- 5. Outbox ----------------------------------------------------------------
create table if not exists public.accounting_outbox (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenant(id) on delete cascade,
  connection_id    uuid not null references public.accounting_connection(id) on delete cascade,
  provider         text not null check (provider in ('xero')),
  operation        text not null check (operation in ('create_contact', 'create_bill', 'void_bill')),
  entity_type      text not null check (entity_type in ('supplier', 'supplier_invoice')),
  entity_id        uuid not null,
  status           text not null default 'pending' check (status in ('pending', 'working', 'sent', 'failed', 'gave_up', 'cancelled')),
  attempts         int  not null default 0,
  next_attempt_at  timestamptz not null default now(),
  first_attempt_at timestamptz,
  locked_at        timestamptz,
  locked_by        text,
  depends_on       uuid references public.accounting_outbox(id) on delete set null,
  idempotency_key  text not null,
  external_id      text,
  error_class      text check (error_class in ('transient', 'fixable', 'auth', 'daily_limit')),
  error_message    text,
  error_detail     jsonb,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz
);
create unique index if not exists accounting_outbox_live_uq
  on public.accounting_outbox (entity_type, entity_id, operation) where status in ('pending', 'working', 'failed');
create index if not exists accounting_outbox_due_idx on public.accounting_outbox (connection_id, status, next_attempt_at);
create index if not exists accounting_outbox_tenant_created_idx on public.accounting_outbox (tenant_id, created_at desc);

-- 6. RLS and grants ------------------------------------------------------
alter table public.accounting_connection   enable row level security;
alter table public.accounting_credential   enable row level security;
alter table public.accounting_contact_link enable row level security;
alter table public.supplier_invoice        enable row level security;
alter table public.supplier_invoice_line   enable row level security;
alter table public.accounting_outbox       enable row level security;

revoke all on public.accounting_connection, public.accounting_credential, public.accounting_contact_link,
              public.supplier_invoice, public.supplier_invoice_line, public.accounting_outbox
  from public, anon, authenticated;
grant all on public.accounting_connection, public.accounting_credential, public.accounting_contact_link,
             public.supplier_invoice, public.supplier_invoice_line, public.accounting_outbox
  to service_role;

-- Read-only for tenant members (writes go through server code with the service role).
grant select on public.accounting_connection, public.accounting_contact_link, public.accounting_outbox to authenticated;
drop policy if exists accounting_connection_select on public.accounting_connection;
create policy accounting_connection_select on public.accounting_connection for select to authenticated
  using (tenant_id = public.current_tenant_id());
drop policy if exists accounting_contact_link_select on public.accounting_contact_link;
create policy accounting_contact_link_select on public.accounting_contact_link for select to authenticated
  using (tenant_id = public.current_tenant_id());
drop policy if exists accounting_outbox_select on public.accounting_outbox;
create policy accounting_outbox_select on public.accounting_outbox for select to authenticated
  using (tenant_id = public.current_tenant_id());
-- accounting_credential: no policies and no grants for anon/authenticated, by design.

-- Supplier invoices: members manage drafts; posting/voiding only via functions.
grant select, insert, update, delete on public.supplier_invoice, public.supplier_invoice_line to authenticated;
drop policy if exists supplier_invoice_select on public.supplier_invoice;
create policy supplier_invoice_select on public.supplier_invoice for select to authenticated
  using (tenant_id = public.current_tenant_id());
drop policy if exists supplier_invoice_insert on public.supplier_invoice;
create policy supplier_invoice_insert on public.supplier_invoice for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and status = 'draft' and sync_status = 'not_synced' and external_id is null);
drop policy if exists supplier_invoice_update on public.supplier_invoice;
create policy supplier_invoice_update on public.supplier_invoice for update to authenticated
  using (tenant_id = public.current_tenant_id() and status = 'draft')
  with check (tenant_id = public.current_tenant_id() and status = 'draft' and sync_status = 'not_synced' and external_id is null);
drop policy if exists supplier_invoice_delete on public.supplier_invoice;
create policy supplier_invoice_delete on public.supplier_invoice for delete to authenticated
  using (tenant_id = public.current_tenant_id() and status = 'draft');

drop policy if exists supplier_invoice_line_select on public.supplier_invoice_line;
create policy supplier_invoice_line_select on public.supplier_invoice_line for select to authenticated
  using (tenant_id = public.current_tenant_id());
drop policy if exists supplier_invoice_line_write on public.supplier_invoice_line;
create policy supplier_invoice_line_write on public.supplier_invoice_line for all to authenticated
  using (tenant_id = public.current_tenant_id()
         and exists (select 1 from public.supplier_invoice si where si.id = supplier_invoice_id and si.status = 'draft'))
  with check (tenant_id = public.current_tenant_id()
              and exists (select 1 from public.supplier_invoice si
                           where si.id = supplier_invoice_id and si.tenant_id = public.current_tenant_id() and si.status = 'draft'));

-- 7. post_supplier_invoice -------------------------------------------------
create or replace function public.post_supplier_invoice(
  p_invoice_id uuid,
  p_update_component_costs boolean default true,
  p_create_contact boolean default false
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant      uuid := public.current_tenant_id();
  v_inv         public.supplier_invoice%rowtype;
  v_conn        public.accounting_connection%rowtype;
  v_contact_job uuid;
  v_sync        text := 'not_synced';
begin
  if v_tenant is null then
    raise exception 'not signed in to a workspace' using errcode = '42501';
  end if;

  select * into v_inv from public.supplier_invoice where id = p_invoice_id for update;
  if not found or v_inv.tenant_id <> v_tenant then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'draft' then
    raise exception 'only draft invoices can be posted' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.supplier where id = v_inv.supplier_id and tenant_id = v_tenant) then
    raise exception 'supplier not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.supplier_invoice_line where supplier_invoice_id = p_invoice_id) then
    raise exception 'add at least one line before posting' using errcode = 'P0001';
  end if;

  -- Serialise concurrent posts that share receipt lines (Review Focus 4).
  perform 1
     from public.delivery_receipt_line drl
    where drl.id in (select l.delivery_receipt_line_id
                       from public.supplier_invoice_line l
                      where l.supplier_invoice_id = p_invoice_id and l.delivery_receipt_line_id is not null)
    order by drl.id
      for update;

  if exists (
    select 1
      from public.supplier_invoice_line l
      join public.delivery_receipt_line drl on drl.id = l.delivery_receipt_line_id
      join public.delivery_receipt dr on dr.id = drl.delivery_receipt_id
     where l.supplier_invoice_id = p_invoice_id
       and (dr.tenant_id <> v_tenant
            or dr.stock_in_reason is distinct from 'supplier_delivery'
            or dr.supplier_id is distinct from v_inv.supplier_id)
  ) then
    raise exception 'every stock line must come from a supplier delivery from this supplier' using errcode = 'P0001';
  end if;

  if exists (
    select 1
      from public.supplier_invoice_line l
      join public.supplier_invoice_line other
        on other.delivery_receipt_line_id = l.delivery_receipt_line_id
       and other.supplier_invoice_id <> l.supplier_invoice_id
      join public.supplier_invoice oi on oi.id = other.supplier_invoice_id and oi.status = 'posted'
     where l.supplier_invoice_id = p_invoice_id
  ) then
    raise exception 'a receipt line on this invoice is already on another posted invoice' using errcode = '23505';
  end if;

  -- Variances against what was received and the PO price (ex tax).
  update public.supplier_invoice_line l
     set qty_variance   = l.quantity - drl.quantity_delivered,
         price_variance = case when pol.unit_cost is null then null
                               else round(case when v_inv.amounts_mode = 'inclusive'
                                               then l.unit_amount / (1 + l.tax_rate / 100)
                                               else l.unit_amount end, 4) - pol.unit_cost end
    from public.delivery_receipt_line drl
    left join public.purchase_order_line pol on pol.id = drl.purchase_order_line_id
   where l.supplier_invoice_id = p_invoice_id
     and drl.id = l.delivery_receipt_line_id;

  -- Totals: must match invoiceTotals() in src/lib/accounting/supplier-invoice/calc.ts.
  update public.supplier_invoice si
     set tax_total = t.tax,
         subtotal  = case when si.amounts_mode = 'inclusive' then t.amt - t.tax else t.amt end,
         total     = case when si.amounts_mode = 'inclusive' then t.amt else t.amt + t.tax end
    from (select coalesce(sum(line_amount), 0) as amt, coalesce(sum(tax_amount), 0) as tax
            from public.supplier_invoice_line where supplier_invoice_id = p_invoice_id) t
   where si.id = p_invoice_id;

  -- The invoiced ex-tax unit cost becomes the receipt line's cost (spec §3.4 step 6).
  update public.delivery_receipt_line drl
     set cost_per_unit = x.ex_unit
    from (select l.delivery_receipt_line_id,
                 round(case when v_inv.amounts_mode = 'inclusive'
                            then l.unit_amount / (1 + l.tax_rate / 100)
                            else l.unit_amount end, 4) as ex_unit
            from public.supplier_invoice_line l
           where l.supplier_invoice_id = p_invoice_id and l.kind = 'stock') x
   where drl.id = x.delivery_receipt_line_id;

  if p_update_component_costs then
    update public.component c
       set cost_per_unit = x.ex_unit
      from (select distinct on (drl.component_id)
                   drl.component_id,
                   round(case when v_inv.amounts_mode = 'inclusive'
                              then l.unit_amount / (1 + l.tax_rate / 100)
                              else l.unit_amount end, 4) as ex_unit
              from public.supplier_invoice_line l
              join public.delivery_receipt_line drl on drl.id = l.delivery_receipt_line_id
             where l.supplier_invoice_id = p_invoice_id and l.kind = 'stock'
             order by drl.component_id, l.line_no desc) x
     where c.id = x.component_id and c.tenant_id = v_tenant;
  end if;

  -- Queue for Xero when connected, set up, and on/after the bills start date.
  select * into v_conn
    from public.accounting_connection
   where tenant_id = v_tenant and provider = 'xero' and status <> 'disconnected';

  if found and v_conn.setup_completed_at is not null and v_inv.invoice_date >= v_conn.bills_start_date then
    if exists (select 1 from public.supplier_invoice_line
                where supplier_invoice_id = p_invoice_id and (tax_type is null or account_code is null)) then
      raise exception 'every line needs a Xero tax rate and account before posting' using errcode = 'P0001';
    end if;

    if not exists (select 1 from public.accounting_contact_link
                    where tenant_id = v_tenant and provider = 'xero' and supplier_id = v_inv.supplier_id) then
      if not p_create_contact then
        raise exception 'link this supplier to a Xero contact, or choose to create one, before posting' using errcode = 'P0001';
      end if;
      insert into public.accounting_outbox (tenant_id, connection_id, provider, operation, entity_type, entity_id, idempotency_key)
      values (v_tenant, v_conn.id, 'xero', 'create_contact', 'supplier', v_inv.supplier_id, 'sup-' || v_inv.supplier_id || '-contact')
      on conflict (entity_type, entity_id, operation) where status in ('pending', 'working', 'failed') do nothing
      returning id into v_contact_job;
      if v_contact_job is null then
        select id into v_contact_job
          from public.accounting_outbox
         where entity_type = 'supplier' and entity_id = v_inv.supplier_id and operation = 'create_contact'
           and status in ('pending', 'working', 'failed');
      end if;
    end if;

    insert into public.accounting_outbox (tenant_id, connection_id, provider, operation, entity_type, entity_id, depends_on, idempotency_key)
    values (v_tenant, v_conn.id, 'xero', 'create_bill', 'supplier_invoice', p_invoice_id, v_contact_job, 'si-' || p_invoice_id || '-create');
    v_sync := 'queued';
  end if;

  update public.supplier_invoice
     set status = 'posted', sync_status = v_sync, posted_by = auth.uid(), posted_at = now(), updated_at = now()
   where id = p_invoice_id;

  return v_sync;
end;
$$;

-- 8. void_supplier_invoice -------------------------------------------------
create or replace function public.void_supplier_invoice(p_invoice_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_inv     public.supplier_invoice%rowtype;
  v_job     public.accounting_outbox%rowtype;
  v_conn_id uuid;
  v_sync    text;
begin
  if v_tenant is null then
    raise exception 'not signed in to a workspace' using errcode = '42501';
  end if;
  if coalesce(public.current_profile_role(), '') not in ('admin', 'super_admin') then
    raise exception 'only admins can void supplier invoices' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'enter a reason for voiding' using errcode = 'P0001';
  end if;

  select * into v_inv from public.supplier_invoice where id = p_invoice_id for update;
  if not found or v_inv.tenant_id <> v_tenant then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'posted' then
    raise exception 'only posted invoices can be voided' using errcode = 'P0001';
  end if;

  select * into v_job
    from public.accounting_outbox
   where entity_type = 'supplier_invoice' and entity_id = p_invoice_id and operation = 'create_bill'
     and status in ('pending', 'working', 'failed')
     for update;

  if found and v_job.status = 'working' then
    raise exception 'this invoice is being sent to Xero right now; try again in a minute' using errcode = '55P03';
  elsif found then
    update public.accounting_outbox
       set status = 'cancelled', completed_at = now(), locked_at = null, locked_by = null,
           error_message = 'Invoice voided before it reached Xero'
     where id = v_job.id;
    v_sync := 'not_synced';
  elsif v_inv.external_id is not null then
    select id into v_conn_id
      from public.accounting_connection
     where tenant_id = v_tenant and provider = 'xero' and status <> 'disconnected';
    if v_conn_id is null then
      raise exception 'Xero is disconnected. Reconnect Xero to void this bill.' using errcode = 'P0001';
    end if;
    insert into public.accounting_outbox (tenant_id, connection_id, provider, operation, entity_type, entity_id, idempotency_key)
    values (v_tenant, v_conn_id, 'xero', 'void_bill', 'supplier_invoice', p_invoice_id, 'si-' || p_invoice_id || '-void');
    v_sync := 'queued';
  else
    v_sync := 'not_synced';
  end if;

  update public.supplier_invoice
     set status = 'voided', sync_status = v_sync, voided_by = auth.uid(), voided_at = now(),
         void_reason = btrim(p_reason), updated_at = now()
   where id = p_invoice_id;

  return v_sync;
end;
$$;

-- 9. Job and lease claiming (service role only) ----------------------------
create or replace function public.claim_accounting_jobs(p_connection_id uuid, p_limit int, p_worker text)
returns setof public.accounting_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_service_role() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  update public.accounting_outbox o
     set status = 'working', locked_at = now(), locked_by = p_worker,
         first_attempt_at = coalesce(o.first_attempt_at, now())
   where o.id in (
     select j.id
       from public.accounting_outbox j
       join public.accounting_connection c on c.id = j.connection_id and c.status = 'connected'
       left join public.accounting_outbox dep on dep.id = j.depends_on
      where j.connection_id = p_connection_id
        and j.next_attempt_at <= now()
        and (j.status = 'pending'
             or (j.status = 'failed' and j.error_class in ('transient', 'daily_limit'))
             or (j.status = 'working' and j.locked_at < now() - interval '5 minutes'))
        and (j.depends_on is null or dep.status = 'sent')
        and not exists (select 1 from public.accounting_outbox w
                         where w.connection_id = p_connection_id and w.status = 'working'
                           and w.locked_at >= now() - interval '5 minutes' and w.id <> j.id)
      order by j.created_at
      limit p_limit
        for update of j skip locked
   )
  returning o.*;
end;
$$;

create or replace function public.claim_accounting_refresh_lease(p_connection_id uuid, p_lease_seconds int)
returns setof public.accounting_credential
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_service_role() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  update public.accounting_credential
     set refresh_lease_until = now() + make_interval(secs => p_lease_seconds)
   where connection_id = p_connection_id
     and (refresh_lease_until is null or refresh_lease_until < now())
  returning *;
end;
$$;

-- 10. Function grants: CREATE FUNCTION grants EXECUTE to PUBLIC by default.
revoke all on function public.post_supplier_invoice(uuid, boolean, boolean) from public, anon;
revoke all on function public.void_supplier_invoice(uuid, text) from public, anon;
revoke all on function public.claim_accounting_jobs(uuid, int, text) from public, anon, authenticated;
revoke all on function public.claim_accounting_refresh_lease(uuid, int) from public, anon, authenticated;
grant execute on function public.post_supplier_invoice(uuid, boolean, boolean) to authenticated, service_role;
grant execute on function public.void_supplier_invoice(uuid, text) to authenticated, service_role;
grant execute on function public.claim_accounting_jobs(uuid, int, text) to service_role;
grant execute on function public.claim_accounting_refresh_lease(uuid, int) to service_role;

commit;
```

- [ ] **Step 4: Run the verification and watch it pass**

Run the full psql sequence from the verify header against a fresh scratch database.
Expected: `PASS 1` through `PASS 11` notices, and no `FAIL`.

If a fixture insert fails on a column the scratch schema lacks, add the patch that creates it (`grep -l "<column>" supabase/patches/*.sql`) to the sequence, list it in the script header, and re-run. Do **not** remove a check to make it pass.

- [ ] **Step 5: Commit (do not apply to prod yet; Task 22 applies it)**

```bash
git add supabase/patches/2026-10-01-xero-supplier-bills.sql supabase/__tests__/2026-10-01-xero-supplier-bills.verify.sql
git commit -m "MANUVA-34 feat(db): accounting tables, supplier invoices, outbox, post/void/claim"
```

### Task 11: Migration — repoint the super-admin vitals at the new tables

**Files:**
- Create: `supabase/patches/2026-10-01-xero-vitals-repoint.sql`

**Interfaces:**
- Consumes: the Task 1 versions of `get_tenant_vitals` / `get_tenant_health_indicators` (deployed), and the Task 10 tables.
- Produces: unchanged signatures, with accounting columns fed from `accounting_connection`, `accounting_credential` and `accounting_outbox`.

- [ ] **Step 1: Dump the deployed definitions (post-Task 1)**

Use the same `pg_get_functiondef` query as Task 1 Step 1. Paste both bodies into the new file under a header:

```sql
-- ---------------------------------------------------------------------
-- MANUVA-34 — repoint super-admin vitals/health at the rebuilt accounting
-- tables. Generated from pg_get_functiondef after MANUVA-44; the ONLY edits
-- are the accounting reads. Apply AFTER 2026-10-01-xero-supplier-bills.sql.
-- Idempotent.
-- ---------------------------------------------------------------------
```

- [ ] **Step 2: Edit the vitals body**

Replace `  v_acct_conn_id := null;` (and its MANUVA-44 comment line) with:

```sql
  select ac.id into v_acct_conn_id
  from   public.accounting_connection ac
  where  ac.tenant_id = p_tenant_id
    and  ac.status <> 'disconnected'
  order  by ac.connected_at desc
  limit  1;
```

Replace the six `null::…`/`0` accounting column lines with:

```sql
    ac.provider                                                            as accounting_provider,
    ac.org_name                                                            as accounting_account_name,
    cr.refresh_expires_at                                                  as accounting_token_expires_at,
    (ac.status = 'needs_reconnect' or cr.refresh_expires_at < now())       as accounting_token_expired,

    (select count(*)::int
     from   public.accounting_outbox o
     where  o.connection_id = v_acct_conn_id
       and  o.status = 'sent'
       and  o.completed_at >= now() - interval '30 days')                 as accounting_thirty_day_synced,

    (select count(*)::int
     from   public.accounting_outbox o
     where  o.connection_id = v_acct_conn_id
       and  o.status in ('failed', 'gave_up')
       and  o.created_at >= now() - interval '30 days')                   as accounting_thirty_day_failed
```

Change the `from` tail to:

```sql
  from       (select 1) dummy
  left join  public.shopify_store         ss  on ss.tenant_id = p_tenant_id
  left join  public.accounting_connection ac  on ac.id = v_acct_conn_id
  left join  public.accounting_credential cr  on cr.connection_id = v_acct_conn_id;
```

- [ ] **Step 3: Edit the health body**

Replace `      null::timestamptz                       as acct_token_expires_at,` with:

```sql
      (
        select case when ac.status = 'needs_reconnect' then now() - interval '1 second'
                    else cr.refresh_expires_at end
        from   public.accounting_connection ac
        left   join public.accounting_credential cr on cr.connection_id = ac.id
        where  ac.tenant_id = t.id
          and  ac.status <> 'disconnected'
        order  by ac.connected_at desc
        limit  1
      )                                       as acct_token_expires_at,
```

The existing CASE arms then report "Accounting token expired" for `needs_reconnect`, and "expiring" within 7 days.

- [ ] **Step 4: Check the diff, then commit (it is applied in Task 22)**

```bash
git diff --no-index --stat supabase/patches/2026-10-01-manuva-44-vitals-without-accounting.sql supabase/patches/2026-10-01-xero-vitals-repoint.sql
git add supabase/patches/2026-10-01-xero-vitals-repoint.sql
git commit -m "MANUVA-34 feat(super-admin): vitals read the rebuilt accounting tables"
```

Expected: only the header and the three blocks above differ.

---

# Chunk D — Connection lifecycle

### Task 12: Token manager

**Files:**
- Create: `src/lib/accounting/xero/tokens.ts`, `src/lib/accounting/xero/access.ts`
- Test: `src/lib/accounting/xero/tokens.test.ts`

**Interfaces:**
- Consumes: `TokenKey`, `encryptToken`, `decryptToken` (Task 4); `TokenResult`, `refreshTokens` (Task 5); `getXeroConfig` (Task 5); `assertNoError`.
- Produces from `tokens.ts`:
  - `type CredentialRow = { connection_id: string; access_token_enc: string; refresh_token_enc: string; key_version: number; access_expires_at: string; refresh_expires_at: string; refresh_lease_until: string | null; version: number }`
  - `type SealedCredential = Pick<CredentialRow, "access_token_enc" | "refresh_token_enc" | "key_version" | "access_expires_at" | "refresh_expires_at">`
  - `type CredentialStore` (methods `read`, `claimLease`, `writeRefreshed`, `releaseLease`, `markNeedsReconnect`, `markRefreshed`)
  - `class XeroAuthError extends Error`
  - `sealTokens(tokens: XeroTokenSet, key: TokenKey, nowMs: number): SealedCredential`
  - `getXeroAccessToken(connectionId, deps: TokenDeps, opts?: { forceRefresh?: boolean }): Promise<string>`
  - `supabaseCredentialStore(db: SupabaseClient): CredentialStore`
- Produces from `access.ts`:
  - `xeroAccessFor(db: SupabaseClient, connection: { id: string; external_org_id: string }, opts?: { forceRefresh?: boolean }): Promise<XeroAccess>`
  - `readRefreshToken(db: SupabaseClient, connectionId: string): Promise<string | null>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/accounting/xero/tokens.test.ts
import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptToken, decryptToken } from "@/lib/security/token-crypto";
import { getXeroAccessToken, XeroAuthError, type CredentialRow, type CredentialStore } from "./tokens";

const key = { key: randomBytes(32), version: 1 };
const T0 = Date.parse("2026-10-01T00:00:00Z");

function setup(opts: { accessExpiresInMs: number; leaseHeldUntil?: number }) {
  let clock = T0;
  let row: CredentialRow = {
    connection_id: "conn",
    access_token_enc: encryptToken("access-old", key),
    refresh_token_enc: encryptToken("refresh-old", key),
    key_version: 1,
    access_expires_at: new Date(T0 + opts.accessExpiresInMs).toISOString(),
    refresh_expires_at: new Date(T0 + 50 * 86_400_000).toISOString(),
    refresh_lease_until: opts.leaseHeldUntil ? new Date(opts.leaseHeldUntil).toISOString() : null,
    version: 1,
  };
  const needsReconnect: string[] = [];
  const store: CredentialStore = {
    async read() { return { ...row }; },
    async claimLease(_id, secs) {
      if (row.refresh_lease_until && Date.parse(row.refresh_lease_until) > clock) return null;
      row = { ...row, refresh_lease_until: new Date(clock + secs * 1000).toISOString() };
      return { ...row };
    },
    async writeRefreshed(_id, expected, next) {
      if (row.version !== expected) return false;
      row = { ...row, ...next, version: expected + 1, refresh_lease_until: null };
      return true;
    },
    async releaseLease() { row = { ...row, refresh_lease_until: null }; },
    async markNeedsReconnect(_id, reason) { needsReconnect.push(reason); },
    async markRefreshed() {},
  };
  return {
    store,
    needsReconnect,
    get row() { return row; },
    set row(r: CredentialRow) { row = r; },
    now: () => clock,
    advance: (ms: number) => { clock += ms; },
  };
}

const okRefresh = vi.fn(async () => ({ ok: true as const, tokens: { accessToken: "access-new", refreshToken: "refresh-new", expiresInSec: 1800 } }));

describe("getXeroAccessToken", () => {
  it("returns the stored token when it has more than 2 minutes left", async () => {
    const s = setup({ accessExpiresInMs: 10 * 60_000 });
    const refresh = vi.fn();
    expect(await getXeroAccessToken("conn", { store: s.store, key, refresh, now: s.now })).toBe("access-old");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes an expiring token and stores the rotated refresh token encrypted", async () => {
    const s = setup({ accessExpiresInMs: 60_000 });
    expect(await getXeroAccessToken("conn", { store: s.store, key, refresh: okRefresh, now: s.now })).toBe("access-new");
    expect(s.row.version).toBe(2);
    expect(decryptToken(s.row.refresh_token_enc, key)).toBe("refresh-new");
    expect(s.row.refresh_token_enc).not.toContain("refresh-new");
  });

  it("a lease loser waits and uses the winner's token", async () => {
    const s = setup({ accessExpiresInMs: 0 });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const refresh = vi.fn(async () => {
      await gate;
      return { ok: true as const, tokens: { accessToken: "access-new", refreshToken: "refresh-new", expiresInSec: 1800 } };
    });
    const sleep = async (ms: number) => {
      s.advance(ms);
      release();
      await new Promise((r) => setTimeout(r, 0));
    };
    const deps = { store: s.store, key, refresh, now: s.now, sleep };
    const [a, b] = await Promise.all([getXeroAccessToken("conn", deps), getXeroAccessToken("conn", deps)]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(a).toBe("access-new");
    expect(b).toBe("access-new");
  });

  it("marks needs_reconnect and throws XeroAuthError on invalid_grant", async () => {
    const s = setup({ accessExpiresInMs: 0 });
    const refresh = vi.fn(async () => ({ ok: false as const, status: 400, error: "invalid_grant" }));
    await expect(getXeroAccessToken("conn", { store: s.store, key, refresh, now: s.now })).rejects.toBeInstanceOf(XeroAuthError);
    expect(s.needsReconnect).toHaveLength(1);
    expect(s.row.refresh_lease_until).toBeNull();
  });

  it("treats a network failure as transient: plain Error, lease released, no reconnect", async () => {
    const s = setup({ accessExpiresInMs: 0 });
    const refresh = vi.fn(async () => ({ ok: false as const, status: 0, error: "network_error" }));
    const err = await getXeroAccessToken("conn", { store: s.store, key, refresh, now: s.now }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(XeroAuthError);
    expect(s.needsReconnect).toHaveLength(0);
    expect(s.row.refresh_lease_until).toBeNull();
  });

  it("forceRefresh refreshes a still-valid token", async () => {
    const s = setup({ accessExpiresInMs: 20 * 60_000 });
    expect(await getXeroAccessToken("conn", { store: s.store, key, refresh: okRefresh, now: s.now }, { forceRefresh: true })).toBe("access-new");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/accounting/xero/tokens.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `tokens.ts`**

```ts
// src/lib/accounting/xero/tokens.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { decryptToken, encryptToken, type TokenKey } from "@/lib/security/token-crypto";
import type { TokenResult, XeroTokenSet } from "./identity";

export type CredentialRow = {
  connection_id: string;
  access_token_enc: string;
  refresh_token_enc: string;
  key_version: number;
  access_expires_at: string;
  refresh_expires_at: string;
  refresh_lease_until: string | null;
  version: number;
};
export type SealedCredential = Pick<CredentialRow, "access_token_enc" | "refresh_token_enc" | "key_version" | "access_expires_at" | "refresh_expires_at">;

export type CredentialStore = {
  read(connectionId: string): Promise<CredentialRow | null>;
  /** Returns the row when this caller won the lease, null when someone else holds it. */
  claimLease(connectionId: string, leaseSeconds: number): Promise<CredentialRow | null>;
  /** Compare-and-swap on version; also clears the lease. */
  writeRefreshed(connectionId: string, expectedVersion: number, next: SealedCredential): Promise<boolean>;
  releaseLease(connectionId: string): Promise<void>;
  markNeedsReconnect(connectionId: string, reason: string): Promise<void>;
  markRefreshed(connectionId: string): Promise<void>;
};

export class XeroAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XeroAuthError";
  }
}

export const ACCESS_SKEW_MS = 2 * 60_000;
export const REFRESH_TOKEN_LIFETIME_MS = 60 * 86_400_000;
const LEASE_SECONDS = 30;
const POLL_MS = 250;

export type TokenDeps = {
  store: CredentialStore;
  key: TokenKey;
  refresh: (refreshToken: string) => Promise<TokenResult>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  waitTimeoutMs?: number;
};

export function sealTokens(tokens: XeroTokenSet, key: TokenKey, nowMs: number): SealedCredential {
  return {
    access_token_enc: encryptToken(tokens.accessToken, key),
    refresh_token_enc: encryptToken(tokens.refreshToken, key),
    key_version: key.version,
    access_expires_at: new Date(nowMs + tokens.expiresInSec * 1000).toISOString(),
    refresh_expires_at: new Date(nowMs + REFRESH_TOKEN_LIFETIME_MS).toISOString(),
  };
}

export async function getXeroAccessToken(
  connectionId: string,
  deps: TokenDeps,
  opts: { forceRefresh?: boolean } = {}
): Promise<string> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const row = await deps.store.read(connectionId);
  if (!row) throw new XeroAuthError("No stored Xero credentials for this connection");
  if (!opts.forceRefresh && Date.parse(row.access_expires_at) - now() > ACCESS_SKEW_MS) {
    return decryptToken(row.access_token_enc, deps.key);
  }

  const leased = await deps.store.claimLease(connectionId, LEASE_SECONDS);
  if (!leased) {
    const deadline = now() + (deps.waitTimeoutMs ?? 10_000);
    while (now() < deadline) {
      await sleep(POLL_MS);
      const fresh = await deps.store.read(connectionId);
      if (fresh && fresh.version !== row.version) return decryptToken(fresh.access_token_enc, deps.key);
    }
    throw new Error("Timed out waiting for another worker to refresh the Xero token");
  }

  // A refresh may have completed between our read and our lease.
  if (!opts.forceRefresh && leased.version !== row.version) {
    await deps.store.releaseLease(connectionId);
    return decryptToken(leased.access_token_enc, deps.key);
  }

  const result = await deps.refresh(decryptToken(leased.refresh_token_enc, deps.key));
  if (!result.ok) {
    await deps.store.releaseLease(connectionId);
    if (result.error === "invalid_grant") {
      await deps.store.markNeedsReconnect(connectionId, "Xero rejected the refresh token (invalid_grant)");
      throw new XeroAuthError("Xero rejected the refresh token");
    }
    throw new Error(`Xero token refresh failed: ${result.error}`);
  }

  const written = await deps.store.writeRefreshed(connectionId, leased.version, sealTokens(result.tokens, deps.key, now()));
  // The rotated refresh token is lost if this write fails; Xero's 30-minute reuse
  // window on the old one lets the next caller recover.
  if (!written) throw new Error("Refreshed Xero token could not be saved (version conflict)");
  await deps.store.markRefreshed(connectionId);
  return result.tokens.accessToken;
}

export function supabaseCredentialStore(db: SupabaseClient): CredentialStore {
  return {
    async read(id) {
      const { data, error } = await db.from("accounting_credential").select("*").eq("connection_id", id).maybeSingle();
      assertNoError(error, "read accounting_credential");
      return (data as CredentialRow | null) ?? null;
    },
    async claimLease(id, secs) {
      const { data, error } = await db.rpc("claim_accounting_refresh_lease", { p_connection_id: id, p_lease_seconds: secs });
      assertNoError(error, "claim_accounting_refresh_lease");
      return ((data ?? []) as CredentialRow[])[0] ?? null;
    },
    async writeRefreshed(id, expected, next) {
      const { data, error } = await db
        .from("accounting_credential")
        .update({ ...next, version: expected + 1, refresh_lease_until: null, updated_at: new Date().toISOString() })
        .eq("connection_id", id)
        .eq("version", expected)
        .select("connection_id");
      assertNoError(error, "write accounting_credential");
      return (data ?? []).length === 1;
    },
    async releaseLease(id) {
      const { error } = await db.from("accounting_credential").update({ refresh_lease_until: null }).eq("connection_id", id);
      assertNoError(error, "release accounting_credential lease");
    },
    async markNeedsReconnect(id, reason) {
      const { error } = await db
        .from("accounting_connection")
        .update({ status: "needs_reconnect", last_error: reason, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "connected");
      assertNoError(error, "mark accounting_connection needs_reconnect");
    },
    async markRefreshed(id) {
      const { error } = await db.from("accounting_connection").update({ last_refreshed_at: new Date().toISOString() }).eq("id", id);
      assertNoError(error, "mark accounting_connection refreshed");
    },
  };
}
```

- [ ] **Step 4: Implement `access.ts`**

```ts
// src/lib/accounting/xero/access.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, loadTokenKey } from "@/lib/security/token-crypto";
import type { XeroAccess } from "./client";
import { getXeroConfig } from "./config";
import { refreshTokens } from "./identity";
import { getXeroAccessToken, supabaseCredentialStore } from "./tokens";

/** Service-role client only. Every Xero call goes through here. */
export async function xeroAccessFor(
  db: SupabaseClient,
  connection: { id: string; external_org_id: string },
  opts: { forceRefresh?: boolean } = {}
): Promise<XeroAccess> {
  const cfg = getXeroConfig();
  if (!cfg.ok) throw new Error(`Xero is not configured: missing ${cfg.missing.join(", ")}`);
  const key = loadTokenKey();
  const accessToken = await getXeroAccessToken(
    connection.id,
    { store: supabaseCredentialStore(db), key, refresh: (rt) => refreshTokens(cfg, rt) },
    opts
  );
  return { accessToken, xeroTenantId: connection.external_org_id };
}

export async function readRefreshToken(db: SupabaseClient, connectionId: string): Promise<string | null> {
  const row = await supabaseCredentialStore(db).read(connectionId);
  return row ? decryptToken(row.refresh_token_enc, loadTokenKey()) : null;
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run src/lib/accounting/xero/tokens.test.ts && npx tsc --noEmit`
Expected: 6 passed, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/accounting/xero/tokens.ts src/lib/accounting/xero/tokens.test.ts src/lib/accounting/xero/access.ts
git commit -m "MANUVA-34 feat(xero): leased single-flight token refresh"
```

### Task 13: Connect, choose organisation, disconnect

**Files:**
- Create: `src/lib/accounting/connection.ts`
- Test: `src/lib/accounting/connection.test.ts`
- Create: `src/app/api/xero/install/route.ts`, `src/app/api/xero/callback/route.ts`
- Create: `src/app/app/settings/integrations/xero/choose/page.tsx`
- Create: `src/app/app/settings/integrations/xero/actions.ts`. This task adds `chooseXeroOrganisation` and `disconnectXeroAction`; Tasks 14 and 17 add more.
- Create: `src/app/app/settings/integrations/xero/xero.module.css`
- Modify: `src/lib/activity/events.ts` (accounting and supplier-invoice events)

**Interfaces:**
- Consumes: Tasks 3, 4, 5, 8 and 12.
- Produces from `connection.ts`:
  - Constants: `STATE_COOKIE = "xero_oauth_nonce"`, `PENDING_COOKIE = "xero_pending"`, `STATE_TTL_MS = 600_000`, `PENDING_TTL_MS = 600_000`
  - `settingsUrl(base: string, xero: string, reason?: string): URL`
  - `type ConnectionRow` (all `accounting_connection` columns)
  - `type PendingOrg = { connectionId: string; tenantId: string; name: string }`
  - `type PendingConnection = { tenantId: string; userId: string; tokens: XeroTokenSet; orgs: PendingOrg[]; exp: number }`
  - `sealPending(p, key): string`, `openPending(sealed, key, now?): PendingConnection | null`
  - `type CallbackCheck = { ok: true; tenantId: string; userId: string } | { ok: false; reason: string }`
  - `validateCallback(input): CallbackCheck`
  - `type ConnectionRepo`, `supabaseConnectionRepo(db): ConnectionRepo`
  - `saveConnection(repo, args): Promise<{ connectionId: string; orgChanged: boolean }>`
  - `finishConnection(repo, args): Promise<{ ok: true; connectionId: string; orgChanged: boolean; orgName: string } | { ok: false; reason: string }>`
  - `disconnectXero(repo, deps): Promise<{ revokedAtXero: boolean }>`
- Produces: activity events `accounting.connected`, `accounting.disconnected`, `accounting.setup_completed`, `accounting.supplier_linked`, `accounting.sync_failed`, `accounting.sync_gave_up`, `supplier_invoice.posted`, `supplier_invoice.voided`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/accounting/connection.test.ts
import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { createSignedState } from "@/lib/security/signed-state";
import { disconnectXero, openPending, saveConnection, sealPending, validateCallback, type ConnectionRepo, type ConnectionRow } from "./connection";

const key = { key: randomBytes(32), version: 1 };
const SECRET = "client-secret";
const NOW = 1_800_000_000_000;
const tokens = { accessToken: "a", refreshToken: "r", expiresInSec: 1800 };

function stateFor(tenantId: string, userId: string, nonce: string, ttl = 600_000) {
  return createSignedState({ tenantId, userId, nonce }, SECRET, ttl, NOW);
}

describe("validateCallback", () => {
  const base = { error: null, code: "c", nonceCookie: "n1", session: { tenantId: "t1", userId: "u1", role: "admin" }, secret: SECRET, now: NOW + 1000 };
  it("accepts a matching admin session", () => {
    expect(validateCallback({ ...base, state: stateFor("t1", "u1", "n1") })).toEqual({ ok: true, tenantId: "t1", userId: "u1" });
  });
  it.each([
    [{ error: "access_denied" }, "xero-denied"],
    [{ session: null }, "no-session"],
    [{ session: { tenantId: "t1", userId: "u1", role: "member" } }, "not-admin"],
    [{ nonceCookie: "other" }, "nonce-mismatch"],
    [{ session: { tenantId: "t2", userId: "u1", role: "admin" } }, "session-mismatch"],
    [{ now: NOW + 600_001 }, "expired"],
    [{ code: null }, "bad-state"],
  ])("rejects %j as %s", (patch, reason) => {
    expect(validateCallback({ ...base, state: stateFor("t1", "u1", "n1"), ...patch })).toEqual({ ok: false, reason });
  });
  it("rejects a forged state", () => {
    const forged = createSignedState({ tenantId: "t1", userId: "u1", nonce: "n1" }, "attacker", 600_000, NOW);
    expect(validateCallback({ ...base, state: forged })).toEqual({ ok: false, reason: "bad-state" });
  });
});

describe("pending cookie", () => {
  it("round-trips and expires", () => {
    const p = { tenantId: "t1", userId: "u1", tokens, orgs: [{ connectionId: "c1", tenantId: "o1", name: "A" }], exp: NOW + 600_000 };
    const sealed = sealPending(p, key);
    expect(sealed).not.toContain("\"r\"");
    expect(openPending(sealed, key, NOW)).toEqual(p);
    expect(openPending(sealed, key, NOW + 600_000)).toBeNull();
    expect(openPending("garbage", key, NOW)).toBeNull();
  });
});

function memoryRepo(existing: Partial<ConnectionRow> | null) {
  const calls: string[] = [];
  let upserted: Record<string, unknown> | null = null;
  const repo: ConnectionRepo = {
    async findByTenant() { return existing as ConnectionRow | null; },
    async upsertConnection(row) { upserted = row; calls.push("upsertConnection"); return (existing?.id as string) ?? "new-id"; },
    async upsertCredential() { calls.push("upsertCredential"); },
    async cancelOpenJobs(_id, reason) { calls.push(`cancelOpenJobs:${reason}`); },
    async deleteContactLinks() { calls.push("deleteContactLinks"); },
    async deleteCredential() { calls.push("deleteCredential"); },
    async markDisconnected() { calls.push("markDisconnected"); },
  };
  return { repo, calls, get upserted() { return upserted; } };
}

describe("saveConnection", () => {
  const args = { tenantId: "t1", userId: "u1", org: { connectionId: "c2", tenantId: "o2", name: "B" }, baseCurrency: "AUD", tokens, key, now: NOW };

  it("keeps setup when reconnecting the same organisation", async () => {
    const m = memoryRepo({ id: "conn-1", external_org_id: "o2" });
    expect(await saveConnection(m.repo, args)).toEqual({ connectionId: "conn-1", orgChanged: false });
    expect(m.upserted).not.toHaveProperty("setup_completed_at");
    expect(m.calls).toEqual(["upsertConnection", "upsertCredential"]);
  });

  it("saveConnection cancels jobs and drops links when the organisation changes", async () => {
    const m = memoryRepo({ id: "conn-1", external_org_id: "o1" });
    expect(await saveConnection(m.repo, args)).toEqual({ connectionId: "conn-1", orgChanged: true });
    expect(m.upserted).toMatchObject({ setup_completed_at: null, inventory_account_code: null, external_org_id: "o2" });
    expect(m.calls).toEqual(["upsertConnection", "upsertCredential", "cancelOpenJobs:Xero organisation changed", "deleteContactLinks"]);
  });
});

describe("disconnectXero", () => {
  it("disconnects locally even when Xero calls fail", async () => {
    const m = memoryRepo({ id: "conn-1" });
    const r = await disconnectXero(m.repo, {
      connection: { id: "conn-1", external_connection_id: "xc-1" },
      getAccessToken: vi.fn().mockRejectedValue(new Error("down")),
      readRefreshToken: vi.fn().mockResolvedValue("rt"),
      revoke: vi.fn().mockResolvedValue(false),
      deleteXeroConnection: vi.fn(),
    });
    expect(r).toEqual({ revokedAtXero: false });
    expect(m.calls).toEqual(["cancelOpenJobs:Xero disconnected", "deleteCredential", "markDisconnected"]);
  });
  it("reports success when Xero revokes", async () => {
    const m = memoryRepo({ id: "conn-1" });
    const deleteXeroConnection = vi.fn().mockResolvedValue(true);
    const r = await disconnectXero(m.repo, {
      connection: { id: "conn-1", external_connection_id: "xc-1" },
      getAccessToken: vi.fn().mockResolvedValue("at"),
      readRefreshToken: vi.fn().mockResolvedValue("rt"),
      revoke: vi.fn().mockResolvedValue(true),
      deleteXeroConnection,
    });
    expect(deleteXeroConnection).toHaveBeenCalledWith("at", "xc-1");
    expect(r).toEqual({ revokedAtXero: true });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/accounting/connection.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `connection.ts`**

```ts
// src/lib/accounting/connection.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { readSignedState } from "@/lib/security/signed-state";
import { decryptToken, encryptToken, type TokenKey } from "@/lib/security/token-crypto";
import { isAdminRole } from "@/lib/tenant/authz";
import type { XeroTokenSet } from "./xero/identity";
import { fetchOrganisation } from "./xero/org";
import { sealTokens, type SealedCredential } from "./xero/tokens";

export const STATE_COOKIE = "xero_oauth_nonce";
export const PENDING_COOKIE = "xero_pending";
export const STATE_TTL_MS = 10 * 60_000;
export const PENDING_TTL_MS = 10 * 60_000;

export function settingsUrl(base: string, xero: string, reason?: string): URL {
  const u = new URL("/app/settings/integrations", base);
  u.searchParams.set("xero", xero);
  if (reason) u.searchParams.set("reason", reason);
  return u;
}

export type ConnectionRow = {
  id: string;
  tenant_id: string;
  provider: "xero";
  status: "connected" | "needs_reconnect" | "disconnected";
  external_org_id: string;
  external_connection_id: string;
  org_name: string;
  base_currency: string;
  connected_by: string | null;
  connected_at: string;
  disconnected_at: string | null;
  last_refreshed_at: string | null;
  last_error: string | null;
  last_alert_at: string | null;
  inventory_account_code: string | null;
  other_charges_account_code: string | null;
  purchase_tax_type: string | null;
  gst_free_tax_type: string | null;
  default_amounts_mode: "inclusive" | "exclusive";
  bills_start_date: string | null;
  sales_source: string | null;
  setup_completed_at: string | null;
};

export type PendingOrg = { connectionId: string; tenantId: string; name: string };
export type PendingConnection = { tenantId: string; userId: string; tokens: XeroTokenSet; orgs: PendingOrg[]; exp: number };

export function sealPending(p: PendingConnection, key: TokenKey): string {
  return encryptToken(JSON.stringify(p), key);
}

export function openPending(sealed: string, key: TokenKey, now: number = Date.now()): PendingConnection | null {
  try {
    const p = JSON.parse(decryptToken(sealed, key)) as PendingConnection;
    return p.exp > now ? p : null;
  } catch {
    return null;
  }
}

export type CallbackCheck = { ok: true; tenantId: string; userId: string } | { ok: false; reason: string };

export function validateCallback(input: {
  error: string | null;
  code: string | null;
  state: string | null;
  nonceCookie: string | null;
  session: { tenantId: string | null; userId: string; role: string } | null;
  secret: string;
  now?: number;
}): CallbackCheck {
  if (input.error) return { ok: false, reason: "xero-denied" };
  if (!input.session) return { ok: false, reason: "no-session" };
  if (!isAdminRole(input.session.role)) return { ok: false, reason: "not-admin" };
  if (!input.code || !input.state) return { ok: false, reason: "bad-state" };
  const read = readSignedState<{ tenantId: string; userId: string; nonce: string }>(input.state, input.secret, input.now);
  if (!read.ok) return { ok: false, reason: read.reason === "expired" ? "expired" : "bad-state" };
  if (!input.nonceCookie || read.payload.nonce !== input.nonceCookie) return { ok: false, reason: "nonce-mismatch" };
  if (read.payload.tenantId !== input.session.tenantId || read.payload.userId !== input.session.userId) {
    return { ok: false, reason: "session-mismatch" };
  }
  return { ok: true, tenantId: read.payload.tenantId, userId: read.payload.userId };
}

export type ConnectionUpsert = Partial<ConnectionRow> & Pick<ConnectionRow, "tenant_id" | "provider" | "status" | "external_org_id" | "external_connection_id" | "org_name" | "base_currency">;

export type ConnectionRepo = {
  findByTenant(tenantId: string): Promise<ConnectionRow | null>;
  upsertConnection(row: ConnectionUpsert): Promise<string>;
  upsertCredential(connectionId: string, cred: SealedCredential): Promise<void>;
  cancelOpenJobs(connectionId: string, reason: string): Promise<void>;
  deleteContactLinks(tenantId: string): Promise<void>;
  deleteCredential(connectionId: string): Promise<void>;
  markDisconnected(connectionId: string): Promise<void>;
};

const SETUP_RESET = {
  inventory_account_code: null,
  other_charges_account_code: null,
  purchase_tax_type: null,
  gst_free_tax_type: null,
  bills_start_date: null,
  sales_source: null,
  setup_completed_at: null,
};

export async function saveConnection(
  repo: ConnectionRepo,
  args: { tenantId: string; userId: string; org: PendingOrg; baseCurrency: string; tokens: XeroTokenSet; key: TokenKey; now?: number }
): Promise<{ connectionId: string; orgChanged: boolean }> {
  const now = args.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const existing = await repo.findByTenant(args.tenantId);
  const orgChanged = !!existing && existing.external_org_id !== args.org.tenantId;
  const connectionId = await repo.upsertConnection({
    tenant_id: args.tenantId,
    provider: "xero",
    status: "connected",
    external_org_id: args.org.tenantId,
    external_connection_id: args.org.connectionId,
    org_name: args.org.name,
    base_currency: args.baseCurrency,
    connected_by: args.userId,
    connected_at: nowIso,
    disconnected_at: null,
    last_refreshed_at: nowIso,
    last_error: null,
    ...(orgChanged ? SETUP_RESET : {}),
  });
  await repo.upsertCredential(connectionId, sealTokens(args.tokens, args.key, now));
  if (orgChanged) {
    // Queued work targets the old organisation and its ContactIDs mean nothing in the new one.
    await repo.cancelOpenJobs(connectionId, "Xero organisation changed");
    await repo.deleteContactLinks(args.tenantId);
  }
  return { connectionId, orgChanged };
}

export async function finishConnection(
  repo: ConnectionRepo,
  args: { tenantId: string; userId: string; org: PendingOrg; tokens: XeroTokenSet; key: TokenKey; fetchImpl?: typeof fetch; now?: number }
): Promise<{ ok: true; connectionId: string; orgChanged: boolean; orgName: string } | { ok: false; reason: string }> {
  const res = await fetchOrganisation({ accessToken: args.tokens.accessToken, xeroTenantId: args.org.tenantId }, args.fetchImpl);
  const org = res.ok ? res.data.Organisations?.[0] : undefined;
  if (!org) return { ok: false, reason: "organisation-read" };
  const name = org.Name || args.org.name;
  const saved = await saveConnection(repo, { ...args, org: { ...args.org, name }, baseCurrency: org.BaseCurrency });
  return { ok: true, ...saved, orgName: name };
}

export async function disconnectXero(
  repo: ConnectionRepo,
  deps: {
    connection: { id: string; external_connection_id: string };
    getAccessToken: () => Promise<string>;
    readRefreshToken: () => Promise<string | null>;
    revoke: (refreshToken: string) => Promise<boolean>;
    deleteXeroConnection: (accessToken: string, connectionId: string) => Promise<boolean>;
  }
): Promise<{ revokedAtXero: boolean }> {
  let revokedAtXero = false;
  try {
    const at = await deps.getAccessToken();
    await deps.deleteXeroConnection(at, deps.connection.external_connection_id);
  } catch (err) {
    console.error("[xero] delete connection failed", err instanceof Error ? err.message : err);
  }
  try {
    const rt = await deps.readRefreshToken();
    if (rt) revokedAtXero = await deps.revoke(rt);
  } catch (err) {
    console.error("[xero] revoke failed", err instanceof Error ? err.message : err);
  }
  await repo.cancelOpenJobs(deps.connection.id, "Xero disconnected");
  await repo.deleteCredential(deps.connection.id);
  await repo.markDisconnected(deps.connection.id);
  return { revokedAtXero };
}

export function supabaseConnectionRepo(db: SupabaseClient): ConnectionRepo {
  return {
    async findByTenant(tenantId) {
      const { data, error } = await db.from("accounting_connection").select("*").eq("tenant_id", tenantId).eq("provider", "xero").maybeSingle();
      assertNoError(error, "read accounting_connection");
      return (data as ConnectionRow | null) ?? null;
    },
    async upsertConnection(row) {
      const { data, error } = await db
        .from("accounting_connection")
        .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,provider" })
        .select("id")
        .single();
      assertNoError(error, "upsert accounting_connection");
      return (data as { id: string }).id;
    },
    async upsertCredential(connectionId, cred) {
      const { error } = await db
        .from("accounting_credential")
        .upsert({ connection_id: connectionId, ...cred, version: 1, refresh_lease_until: null, updated_at: new Date().toISOString() }, { onConflict: "connection_id" });
      assertNoError(error, "upsert accounting_credential");
    },
    async cancelOpenJobs(connectionId, reason) {
      const { error } = await db
        .from("accounting_outbox")
        .update({ status: "cancelled", error_message: reason, completed_at: new Date().toISOString(), locked_at: null, locked_by: null })
        .eq("connection_id", connectionId)
        .in("status", ["pending", "working", "failed"]);
      assertNoError(error, "cancel accounting_outbox jobs");
      const { data: invoices, error: e2 } = await db
        .from("accounting_outbox")
        .select("entity_id")
        .eq("connection_id", connectionId)
        .eq("entity_type", "supplier_invoice")
        .eq("status", "cancelled")
        .eq("error_message", reason);
      assertNoError(e2, "read cancelled outbox jobs");
      const ids = (invoices ?? []).map((r) => (r as { entity_id: string }).entity_id);
      if (ids.length) {
        const { error: e3 } = await db.from("supplier_invoice").update({ sync_status: "not_synced" }).in("id", ids).eq("status", "posted").in("sync_status", ["queued", "failed"]);
        assertNoError(e3, "reset supplier_invoice sync_status");
      }
    },
    async deleteContactLinks(tenantId) {
      const { error } = await db.from("accounting_contact_link").delete().eq("tenant_id", tenantId).eq("provider", "xero");
      assertNoError(error, "delete accounting_contact_link");
    },
    async deleteCredential(connectionId) {
      const { error } = await db.from("accounting_credential").delete().eq("connection_id", connectionId);
      assertNoError(error, "delete accounting_credential");
    },
    async markDisconnected(connectionId) {
      const { error } = await db
        .from("accounting_connection")
        .update({ status: "disconnected", disconnected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", connectionId);
      assertNoError(error, "mark accounting_connection disconnected");
    },
  };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/lib/accounting/connection.test.ts`
Expected: all pass.

- [ ] **Step 5: Add the activity events**

In `src/lib/activity/events.ts`, add a section before `// --- Lifecycle / system ---`:

```ts
  // --- Accounting (Xero) ---
  "accounting.connected": { entityType: "accounting_connection", summary: (m) => `Connected Xero organisation ${s(m.org_name)}`.trim() },
  "accounting.disconnected": { entityType: "accounting_connection", summary: () => `Disconnected Xero` },
  "accounting.setup_completed": { entityType: "accounting_connection", summary: () => `Completed Xero setup` },
  "accounting.supplier_linked": { entityType: "supplier", summary: (m) => `Linked supplier to Xero contact ${s(m.contact_name)}`.trim() },
  "accounting.sync_failed": { entityType: "accounting_outbox", summary: (m) => `Xero sync failed: ${s(m.message, "see sync log")}` },
  "accounting.sync_gave_up": { entityType: "accounting_outbox", summary: (m) => `Xero sync stopped retrying: ${s(m.message, "see sync log")}` },
  "supplier_invoice.posted": { entityType: "supplier_invoice", summary: (m) => `Posted supplier invoice ${s(m.invoice_number)}`.trim() },
  "supplier_invoice.voided": { entityType: "supplier_invoice", summary: (m) => `Voided supplier invoice ${s(m.invoice_number)}`.trim() },
```

Run: `npx vitest run src/lib/activity`
Expected: pass.

- [ ] **Step 6: Write the install route**

```ts
// src/app/api/xero/install/route.ts
import { NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { isAdminRole } from "@/lib/tenant/authz";
import { buildXeroAuthorizeUrl, getXeroConfig, isXeroPilotTenant } from "@/lib/accounting/xero/config";
import { createSignedState, newNonce } from "@/lib/security/signed-state";
import { settingsUrl, STATE_COOKIE, STATE_TTL_MS } from "@/lib/accounting/connection";

export async function GET(req: Request) {
  const ctx = await getServerTenantContext();
  if (!ctx || !ctx.tenantId) return NextResponse.redirect(new URL("/app/auth/login", req.url));
  if (!isAdminRole(ctx.role) || !isXeroPilotTenant(ctx.tenantId)) return NextResponse.redirect(settingsUrl(req.url, "error", "not-admin"));
  const cfg = getXeroConfig();
  if (!cfg.ok) return NextResponse.redirect(settingsUrl(req.url, "not-configured"));

  const nonce = newNonce();
  const state = createSignedState({ tenantId: ctx.tenantId, userId: ctx.userId, nonce }, cfg.clientSecret, STATE_TTL_MS);
  const res = NextResponse.redirect(buildXeroAuthorizeUrl(cfg, state));
  res.cookies.set(STATE_COOKIE, nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/xero", maxAge: STATE_TTL_MS / 1000 });
  return res;
}
```

- [ ] **Step 7: Write the callback route**

```ts
// src/app/api/xero/callback/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerTenantContext } from "@/lib/tenant/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadTokenKey } from "@/lib/security/token-crypto";
import { getXeroConfig } from "@/lib/accounting/xero/config";
import { exchangeCode, listConnections, organisationsForEvent, readAuthEventId } from "@/lib/accounting/xero/identity";
import {
  finishConnection, PENDING_COOKIE, PENDING_TTL_MS, sealPending, settingsUrl,
  STATE_COOKIE, supabaseConnectionRepo, validateCallback,
} from "@/lib/accounting/connection";
import { logActivity } from "@/lib/activity/log";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cfg = getXeroConfig();
  if (!cfg.ok) return NextResponse.redirect(settingsUrl(req.url, "not-configured"));

  const ctx = await getServerTenantContext();
  const jar = await cookies();
  const check = validateCallback({
    error: url.searchParams.get("error"),
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
    nonceCookie: jar.get(STATE_COOKIE)?.value ?? null,
    session: ctx ? { tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role } : null,
    secret: cfg.clientSecret,
  });

  const done = (target: URL) => {
    const res = NextResponse.redirect(target);
    res.cookies.set(STATE_COOKIE, "", { path: "/api/xero", maxAge: 0 });
    return res;
  };
  if (!check.ok) return done(settingsUrl(req.url, "error", check.reason));

  const exchanged = await exchangeCode(cfg, url.searchParams.get("code")!);
  if (!exchanged.ok) return done(settingsUrl(req.url, "error", "token-exchange"));

  let orgs;
  try {
    orgs = organisationsForEvent(await listConnections(exchanged.tokens.accessToken), readAuthEventId(exchanged.tokens.accessToken));
  } catch {
    return done(settingsUrl(req.url, "error", "connections"));
  }
  if (orgs.length === 0) return done(settingsUrl(req.url, "error", "no-organisation"));

  const key = loadTokenKey();
  const pendingOrgs = orgs.map((o) => ({ connectionId: o.id, tenantId: o.tenantId, name: o.tenantName }));

  if (pendingOrgs.length > 1) {
    const res = done(new URL("/app/settings/integrations/xero/choose", req.url));
    res.cookies.set(
      PENDING_COOKIE,
      sealPending({ tenantId: check.tenantId, userId: check.userId, tokens: exchanged.tokens, orgs: pendingOrgs, exp: Date.now() + PENDING_TTL_MS }, key),
      { httpOnly: true, secure: true, sameSite: "lax", path: "/app/settings/integrations/xero", maxAge: PENDING_TTL_MS / 1000 }
    );
    return res;
  }

  const result = await finishConnection(supabaseConnectionRepo(createSupabaseAdminClient()), {
    tenantId: check.tenantId, userId: check.userId, org: pendingOrgs[0], tokens: exchanged.tokens, key,
  });
  if (!result.ok) return done(settingsUrl(req.url, "error", result.reason));
  await logActivity({ event: "accounting.connected", entityId: result.connectionId, metadata: { org_name: result.orgName, org_changed: result.orgChanged } });
  return done(new URL("/app/settings/integrations/xero/setup", req.url));
}
```

- [ ] **Step 8: Write the choose page and the actions**

```ts
// src/app/app/settings/integrations/xero/actions.ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/tenant/authz";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadTokenKey } from "@/lib/security/token-crypto";
import { getXeroConfig } from "@/lib/accounting/xero/config";
import { deleteConnection, revokeRefreshToken } from "@/lib/accounting/xero/identity";
import { readRefreshToken, xeroAccessFor } from "@/lib/accounting/xero/access";
import { disconnectXero, finishConnection, openPending, PENDING_COOKIE, supabaseConnectionRepo } from "@/lib/accounting/connection";
import { logActivity } from "@/lib/activity/log";

export async function chooseXeroOrganisation(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const jar = await cookies();
  const key = loadTokenKey();
  const pending = openPending(jar.get(PENDING_COOKIE)?.value ?? "", key);
  jar.set(PENDING_COOKIE, "", { path: "/app/settings/integrations/xero", maxAge: 0 });
  if (!pending || pending.tenantId !== ctx.tenantId || pending.userId !== ctx.userId) {
    redirect("/app/settings/integrations?xero=error&reason=expired");
  }
  const org = pending.orgs.find((o) => o.connectionId === String(formData.get("connectionId") ?? ""));
  if (!org) redirect("/app/settings/integrations?xero=error&reason=bad-organisation");

  const result = await finishConnection(supabaseConnectionRepo(createSupabaseAdminClient()), {
    tenantId: pending.tenantId, userId: pending.userId, org, tokens: pending.tokens, key,
  });
  if (!result.ok) redirect(`/app/settings/integrations?xero=error&reason=${result.reason}`);
  await logActivity({ event: "accounting.connected", entityId: result.connectionId, metadata: { org_name: result.orgName, org_changed: result.orgChanged } });
  redirect("/app/settings/integrations/xero/setup");
}

export async function disconnectXeroAction(): Promise<void> {
  const ctx = await requireAdmin();
  if (!ctx.tenantId) redirect("/app/settings/integrations");
  const cfg = getXeroConfig();
  const db = createSupabaseAdminClient();
  const repo = supabaseConnectionRepo(db);
  const conn = await repo.findByTenant(ctx.tenantId);
  if (!conn || conn.status === "disconnected") redirect("/app/settings/integrations");

  const result = await disconnectXero(repo, {
    connection: conn,
    getAccessToken: async () => (await xeroAccessFor(db, conn)).accessToken,
    readRefreshToken: () => readRefreshToken(db, conn.id),
    revoke: (rt) => (cfg.ok ? revokeRefreshToken(cfg, rt) : Promise.resolve(false)),
    deleteXeroConnection: (at, id) => deleteConnection(at, id),
  });
  await logActivity({ event: "accounting.disconnected", entityId: conn.id, metadata: { revoked_at_xero: result.revokedAtXero } });
  revalidatePath("/app/settings/integrations");
  redirect(`/app/settings/integrations?xero=${result.revokedAtXero ? "disconnected" : "disconnected-local"}`);
}
```

```tsx
// src/app/app/settings/integrations/xero/choose/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { isAdminRole } from "@/lib/tenant/authz";
import { loadTokenKey } from "@/lib/security/token-crypto";
import { openPending, PENDING_COOKIE } from "@/lib/accounting/connection";
import PageHeader from "../../../../_ui/page-header";
import { chooseXeroOrganisation } from "../actions";
import styles from "../xero.module.css";

export default async function ChooseXeroOrganisationPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (!isAdminRole(ctx.role)) redirect("/app/settings/profile");
  const pending = openPending((await cookies()).get(PENDING_COOKIE)?.value ?? "", loadTokenKey());
  if (!pending || pending.tenantId !== ctx.tenantId) redirect("/app/settings/integrations?xero=error&reason=expired");

  return (
    <section className={styles.page}>
      <PageHeader
        eyebrow="Admin"
        breadcrumbs={[{ label: "Integrations", href: "/app/settings/integrations" }, { label: "Choose Xero organisation" }]}
        title="Choose Xero organisation"
        description="You approved more than one organisation. Pick the one this workspace posts bills to."
      />
      <form action={chooseXeroOrganisation} className={styles.formCard}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>Organisation</legend>
          {pending.orgs.map((o, i) => (
            <label key={o.connectionId} className={styles.radioRow}>
              <input type="radio" name="connectionId" value={o.connectionId} defaultChecked={i === 0} required />
              <span>{o.name}</span>
            </label>
          ))}
        </fieldset>
        <div className={styles.actions}>
          <button type="submit" className={styles.primaryBtn}>Connect this organisation</button>
        </div>
      </form>
    </section>
  );
}
```

```css
/* src/app/app/settings/integrations/xero/xero.module.css */
.page { display: flex; flex-direction: column; gap: 18px; }
.formCard {
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  padding: 18px;
  display: grid;
  gap: 14px;
}
.fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: 8px; }
.label {
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
  color: var(--ink-muted);
}
.radioRow { display: flex; gap: 10px; align-items: center; font-size: var(--fs-base); color: var(--ink-strong); }
.select, .input {
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  color: var(--ink-strong);
  padding: 8px 10px;
  font-size: var(--fs-base);
}
.help { font-size: var(--fs-sm); color: var(--ink-muted); margin: 0; }
.error { font-size: var(--fs-sm); color: var(--danger); margin: 0; }
.steps { display: flex; gap: 8px; font-size: var(--fs-sm); color: var(--ink-faint); }
.stepActive { color: var(--ink-strong); font-weight: var(--fw-semibold); }
.actions { display: flex; gap: 10px; justify-content: flex-end; }
.primaryBtn { composes: primary from "../../../_ui/buttons.module.css"; }
.secondaryBtn { composes: secondary from "../../../_ui/buttons.module.css"; }
```

- [ ] **Step 9: Type-check, lint, test**

```bash
npx tsc --noEmit
npx eslint src/lib/accounting src/app/api/xero src/app/app/settings/integrations/xero
npx vitest run src/lib/accounting src/lib/activity
```

Expected: clean, all green. If `PageHeader` rejects both `eyebrow` and `breadcrumbs` together, keep `breadcrumbs`: the design system says breadcrumbs replace the eyebrow display on detail pages.

- [ ] **Step 10: Commit**

```bash
git add src/lib/accounting/connection.ts src/lib/accounting/connection.test.ts src/app/api/xero src/app/app/settings/integrations/xero src/lib/activity/events.ts
git commit -m "MANUVA-34 feat(xero): signed OAuth connect, organisation picker, real disconnect"
```

---

# Chunk E — Setup and the sync engine

### Task 14: Setup wizard

**Files:**
- Create: `src/app/app/settings/integrations/xero/setup/page.tsx`, `src/app/app/settings/integrations/xero/setup/setup-form.tsx`
- Modify: `src/app/app/settings/integrations/xero/actions.ts` (add `saveXeroSetup`)

**Interfaces:**
- Consumes: `xeroAccessFor` (Task 12); `fetchAccounts`, `fetchTaxRates`, `fetchOrganisation`, `accountOptions`, `purchaseTaxOptions`, `INVENTORY_ACCOUNT_TYPES`, `OTHER_CHARGE_ACCOUNT_TYPES` (Task 8); `validateSetup`, `SALES_SOURCES`, `SALES_SOURCE_LABELS`, `SALES_SOURCE_GUIDANCE`, `SetupInput` (Task 8); `supabaseConnectionRepo` (Task 13).
- Produces:
  - `type SetupState = { errors?: Partial<Record<keyof SetupInput, string>>; message?: string }`
  - `saveXeroSetup(prev: SetupState, formData: FormData): Promise<SetupState>`. It redirects to `/app/settings/integrations?xero=setup-complete` on success.

- [ ] **Step 1: Add the server action**

Append to `src/app/app/settings/integrations/xero/actions.ts`, adding the imports at the top:

```ts
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { fetchAccounts, fetchTaxRates } from "@/lib/accounting/xero/org";
import { validateSetup, type SetupInput } from "@/lib/accounting/xero/setup";

export type SetupState = { errors?: Partial<Record<keyof SetupInput, string>>; message?: string };

const field = (fd: FormData, k: keyof SetupInput) => String(fd.get(k) ?? "").trim();

export async function saveXeroSetup(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const ctx = await requireAdmin();
  if (!ctx.tenantId) return { message: "Choose a workspace first." };
  const db = createSupabaseAdminClient();
  const conn = await supabaseConnectionRepo(db).findByTenant(ctx.tenantId);
  if (!conn || conn.status !== "connected") return { message: "Xero isn't connected. Connect it again from Integrations." };

  const input: SetupInput = {
    inventoryAccountCode: field(formData, "inventoryAccountCode"),
    otherChargesAccountCode: field(formData, "otherChargesAccountCode"),
    purchaseTaxType: field(formData, "purchaseTaxType"),
    gstFreeTaxType: field(formData, "gstFreeTaxType"),
    defaultAmountsMode: field(formData, "defaultAmountsMode"),
    billsStartDate: field(formData, "billsStartDate"),
    salesSource: field(formData, "salesSource"),
  };

  let accounts, rates;
  try {
    const access = await xeroAccessFor(db, conn);
    const [a, t] = await Promise.all([fetchAccounts(access), fetchTaxRates(access)]);
    if (!a.ok || !t.ok) return { message: "Couldn't read accounts and tax rates from Xero. Try again." };
    accounts = a.data.Accounts ?? [];
    rates = t.data.TaxRates ?? [];
  } catch {
    return { message: "Couldn't reach Xero. Try again, or reconnect Xero from Integrations." };
  }

  const v = validateSetup(input, accounts, rates);
  if (!v.ok) return { errors: v.errors };

  const now = new Date().toISOString();
  const { error } = await db
    .from("accounting_connection")
    .update({
      inventory_account_code: v.value.inventoryAccountCode,
      other_charges_account_code: v.value.otherChargesAccountCode,
      purchase_tax_type: v.value.purchaseTaxType,
      gst_free_tax_type: v.value.gstFreeTaxType,
      default_amounts_mode: v.value.defaultAmountsMode,
      bills_start_date: v.value.billsStartDate,
      sales_source: v.value.salesSource,
      setup_completed_at: now,
      updated_at: now,
    })
    .eq("id", conn.id);
  assertNoError(error, "save Xero setup");
  await logActivity({ event: "accounting.setup_completed", entityId: conn.id, metadata: { sales_source: v.value.salesSource } });
  revalidatePath("/app/settings/integrations");
  redirect("/app/settings/integrations?xero=setup-complete");
}
```

- [ ] **Step 2: Write the page**

```tsx
// src/app/app/settings/integrations/xero/setup/page.tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { isAdminRole } from "@/lib/tenant/authz";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseConnectionRepo } from "@/lib/accounting/connection";
import { xeroAccessFor } from "@/lib/accounting/xero/access";
import {
  accountOptions, fetchAccounts, fetchOrganisation, fetchTaxRates,
  INVENTORY_ACCOUNT_TYPES, OTHER_CHARGE_ACCOUNT_TYPES, purchaseTaxOptions,
} from "@/lib/accounting/xero/org";
import { SALES_SOURCES, SALES_SOURCE_GUIDANCE, SALES_SOURCE_LABELS } from "@/lib/accounting/xero/setup";
import PageHeader from "../../../../_ui/page-header";
import EmptyState from "../../../../_ui/empty-state";
import SetupForm from "./setup-form";
import styles from "../xero.module.css";

export default async function XeroSetupPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (!isAdminRole(ctx.role) || !ctx.tenantId) redirect("/app/settings/profile");
  const db = createSupabaseAdminClient();
  const conn = await supabaseConnectionRepo(db).findByTenant(ctx.tenantId);
  if (!conn || conn.status !== "connected") redirect("/app/settings/integrations");

  let data: null | {
    inventory: { value: string; label: string }[];
    other: { value: string; label: string }[];
    tax: { value: string; label: string }[];
    orgName: string;
    baseCurrency: string;
  } = null;
  try {
    const access = await xeroAccessFor(db, conn);
    const [a, t, o] = await Promise.all([fetchAccounts(access), fetchTaxRates(access), fetchOrganisation(access)]);
    if (a.ok && t.ok && o.ok) {
      const accounts = a.data.Accounts ?? [];
      data = {
        inventory: accountOptions(accounts, INVENTORY_ACCOUNT_TYPES).map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` })),
        other: accountOptions(accounts, OTHER_CHARGE_ACCOUNT_TYPES).map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` })),
        tax: purchaseTaxOptions(t.data.TaxRates ?? []).map((x) => ({ value: x.taxType, label: `${x.name} (${x.rate}%)` })),
        orgName: o.data.Organisations?.[0]?.Name ?? conn.org_name,
        baseCurrency: o.data.Organisations?.[0]?.BaseCurrency ?? conn.base_currency,
      };
    }
  } catch (err) {
    console.error("[xero] setup load failed", err instanceof Error ? err.message : err);
  }

  return (
    <section className={styles.page}>
      <PageHeader
        eyebrow="Admin"
        breadcrumbs={[{ label: "Integrations", href: "/app/settings/integrations" }, { label: "Xero setup" }]}
        title="Xero setup"
        description="Tell Manuva where bills go in Xero. Nothing is sent until this is finished."
      />
      {data ? (
        <SetupForm
          orgName={data.orgName}
          baseCurrency={data.baseCurrency}
          inventoryOptions={data.inventory}
          otherOptions={data.other}
          taxOptions={data.tax}
          salesSources={SALES_SOURCES.map((s) => ({ value: s, label: SALES_SOURCE_LABELS[s], guidance: SALES_SOURCE_GUIDANCE[s] }))}
          initial={{
            inventoryAccountCode: conn.inventory_account_code ?? "",
            otherChargesAccountCode: conn.other_charges_account_code ?? "",
            purchaseTaxType: conn.purchase_tax_type ?? "",
            gstFreeTaxType: conn.gst_free_tax_type ?? "",
            defaultAmountsMode: conn.default_amounts_mode,
            billsStartDate: conn.bills_start_date ?? new Date().toISOString().slice(0, 10),
            salesSource: conn.sales_source ?? "",
          }}
        />
      ) : (
        <EmptyState title="Couldn't read your Xero organisation" message="Check the connection on the Integrations page, then try again." />
      )}
    </section>
  );
}
```

- [ ] **Step 3: Write the client form**

```tsx
// src/app/app/settings/integrations/xero/setup/setup-form.tsx
"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import { saveXeroSetup, type SetupState } from "../actions";
import styles from "../xero.module.css";

type Option = { value: string; label: string };
type Props = {
  orgName: string;
  baseCurrency: string;
  inventoryOptions: Option[];
  otherOptions: Option[];
  taxOptions: Option[];
  salesSources: Array<Option & { guidance: string }>;
  initial: Record<string, string>;
};

const STEP_FIELDS: Record<number, string[]> = {
  1: ["inventoryAccountCode", "otherChargesAccountCode", "billsStartDate"],
  2: ["purchaseTaxType", "gstFreeTaxType", "defaultAmountsMode"],
  3: ["salesSource"],
};
const STEP_NAMES = ["Accounts", "Tax", "Sales"];

export default function SetupForm(props: Props) {
  const [state, action, pending] = useActionState<SetupState, FormData>(saveXeroSetup, {});
  const [step, setStep] = useState(1);
  const [values, setValues] = useState<Record<string, string>>(props.initial);
  const set = (k: string) => (e: ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const stepDone = STEP_FIELDS[step].every((k) => !!values[k]);
  const guidance = props.salesSources.find((s) => s.value === values.salesSource)?.guidance;

  const select = (name: string, label: string, options: Option[], help: string) => (
    <>
      <label className={styles.label} htmlFor={name}>{label}</label>
      <select id={name} name={name} className={styles.select} value={values[name] ?? ""} onChange={set(name)}>
        <option value="">Choose…</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <p className={styles.help}>{help}</p>
      {state.errors?.[name as keyof NonNullable<SetupState["errors"]>] ? (
        <p className={styles.error}>{state.errors[name as keyof NonNullable<SetupState["errors"]>]}</p>
      ) : null}
    </>
  );

  return (
    <form action={action} className={styles.formCard}>
      <div className={styles.steps}>
        {STEP_NAMES.map((n, i) => (
          <span key={n} className={i + 1 === step ? styles.stepActive : undefined}>{i + 1}. {n}</span>
        ))}
      </div>
      <p className={styles.help}>Connected to <strong>{props.orgName}</strong>. Bills post in {props.baseCurrency}.</p>
      {state.errors ? <p className={styles.error}>Some choices need fixing: {Object.values(state.errors).join(" ")}</p> : null}

      <fieldset className={styles.fieldset} hidden={step !== 1}>
        {select("inventoryAccountCode", "Inventory asset account", props.inventoryOptions, "A current-asset account. Stock lines on bills are coded here.")}
        {select("otherChargesAccountCode", "Freight and other charges", props.otherOptions, "Used for freight, surcharges and other non-stock lines.")}
        <label className={styles.label} htmlFor="billsStartDate">Send bills dated from</label>
        <input id="billsStartDate" name="billsStartDate" type="date" className={styles.input} value={values.billsStartDate ?? ""} onChange={set("billsStartDate")} />
        <p className={styles.help}>Invoices dated before this are recorded in Manuva but never sent to Xero.</p>
      </fieldset>

      <fieldset className={styles.fieldset} hidden={step !== 2}>
        {select("purchaseTaxType", "Default purchase tax rate", props.taxOptions, "From your Xero organisation. Manuva never creates tax rates.")}
        {select("gstFreeTaxType", "GST-free purchase tax rate", props.taxOptions, "Used for GST-free lines.")}
        <span className={styles.label}>Supplier invoices are usually entered</span>
        <label className={styles.radioRow}>
          <input type="radio" name="defaultAmountsMode" value="exclusive" checked={values.defaultAmountsMode === "exclusive"} onChange={set("defaultAmountsMode")} />
          <span>Excluding GST</span>
        </label>
        <label className={styles.radioRow}>
          <input type="radio" name="defaultAmountsMode" value="inclusive" checked={values.defaultAmountsMode === "inclusive"} onChange={set("defaultAmountsMode")} />
          <span>Including GST</span>
        </label>
      </fieldset>

      <fieldset className={styles.fieldset} hidden={step !== 3}>
        <span className={styles.label}>What sends your sales to Xero?</span>
        {props.salesSources.map((s) => (
          <label key={s.value} className={styles.radioRow}>
            <input type="radio" name="salesSource" value={s.value} checked={values.salesSource === s.value} onChange={set("salesSource")} />
            <span>{s.label}</span>
          </label>
        ))}
        {guidance ? <p className={styles.help}>{guidance}</p> : null}
      </fieldset>

      {state.message ? <p className={styles.error}>{state.message}</p> : null}
      <div className={styles.actions}>
        {step > 1 ? <button type="button" className={styles.secondaryBtn} onClick={() => setStep(step - 1)}>Back</button> : null}
        {step < 3 ? (
          <button type="button" className={styles.primaryBtn} disabled={!stepDone} onClick={() => setStep(step + 1)}>Next</button>
        ) : (
          <button type="submit" className={styles.primaryBtn} disabled={!stepDone || pending}>{pending ? "Saving…" : "Finish setup"}</button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Type-check and lint**

```bash
npx tsc --noEmit
npx eslint src/app/app/settings/integrations/xero
```

Expected: clean. (No unit test here: the rules live in `validateSetup`, which Task 8 covers. The page is exercised in the Task 22 end-to-end run.)

- [ ] **Step 5: Commit**

```bash
git add src/app/app/settings/integrations/xero
git commit -m "MANUVA-34 feat(xero): three-step setup wizard validated against live org data"
```

### Task 15: Outbox job handlers

**Files:**
- Create: `src/lib/accounting/outbox/handlers.ts`
- Test: `src/lib/accounting/outbox/handlers.test.ts`

**Interfaces:**
- Consumes: Tasks 5, 6, 8 and 9.
- Produces:
  - `type OutboxJob = { id: string; tenant_id: string; connection_id: string; operation: "create_contact" | "create_bill" | "void_bill"; entity_type: "supplier" | "supplier_invoice"; entity_id: string; attempts: number; first_attempt_at: string | null; idempotency_key: string; external_id: string | null; depends_on: string | null }`
  - `type HandlerOutcome = { kind: "sent"; externalId: string | null; note?: unknown } | { kind: "error"; error: ClassifiedError }`
  - `type BillSource`
  - `type HandlerStore` (methods `loadBillSource`, `contactLink`, `recordBill`, `loadInvoiceExternal`, `markVoidedInXero`, `loadSupplier`, `saveContactLink`)
  - `type OrgCache`
  - `type JobContext = { store: HandlerStore; access: XeroAccess; fetchImpl: typeof fetch; cache: OrgCache }`
  - `createOrgCache(access, fetchImpl): OrgCache`
  - `handleCreateBill(job, ctx)`, `handleVoidBill(job, ctx)`, `handleCreateContact(job, ctx)`: each returns `Promise<HandlerOutcome>`
  - `supabaseHandlerStore(db: SupabaseClient): HandlerStore`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/accounting/outbox/handlers.test.ts
import { describe, expect, it, vi } from "vitest";
import { createOrgCache, handleCreateBill, handleCreateContact, handleVoidBill, type BillSource, type HandlerStore, type OutboxJob } from "./handlers";

const access = { accessToken: "tok", xeroTenantId: "org-1" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Route = { method: string; path: RegExp; respond: (body: unknown) => Response };
function fakeXero(routes: Route[]) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  const f = vi.fn(async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const r = routes.find((x) => x.method === method && x.path.test(url));
    if (!r) throw new Error(`unexpected ${method} ${url}`);
    return r.respond(body);
  }) as unknown as typeof fetch;
  return { f, calls };
}

const ORG = { method: "GET", path: /\/Organisation$/, respond: () => json({ Organisations: [{ Name: "Acme Pty", BaseCurrency: "AUD", PeriodLockDate: "/Date(1782777600000+0000)/" }] }) };
const ACCOUNTS = { method: "GET", path: /\/Accounts\?/, respond: () => json({ Accounts: [{ AccountID: "a", Code: "630", Name: "Inv", Type: "CURRENT", Status: "ACTIVE" }, { AccountID: "b", Code: "425", Name: "Freight", Type: "EXPENSE", Status: "ACTIVE" }] }) };
const TAX = { method: "GET", path: /\/TaxRates\?/, respond: () => json({ TaxRates: [{ TaxType: "INPUT", Name: "GST", Status: "ACTIVE", CanApplyToExpenses: true, EffectiveRate: 10 }] }) };

const source = (patch: Partial<BillSource["invoice"]> = {}): BillSource => ({
  invoice: { id: "inv-1", tenant_id: "t1", supplier_id: "s1", invoice_number: "INV-9", invoice_date: "2026-10-02", due_date: "2026-11-01", amounts_mode: "exclusive", currency: "AUD", status: "posted", total: 33, external_id: null, po_number: "PO-12", ...patch },
  lines: [
    { kind: "stock", description: "Bolt", quantity: 10, unit_amount: 2, account_code: "630", tax_type: "INPUT", component_name: "Bolt", component_sku: "B-1", receipt_ref: "DN-1" },
    { kind: "other", description: "Freight", quantity: 1, unit_amount: 10, account_code: "425", tax_type: "INPUT", component_name: null, component_sku: null, receipt_ref: null },
  ],
});

function memoryStore(src: BillSource | null, link: string | null = "contact-1") {
  const recorded: unknown[] = [];
  const store: HandlerStore = {
    loadBillSource: async () => src,
    contactLink: async () => link,
    recordBill: async (...args) => { recorded.push(args); },
    loadInvoiceExternal: async () => ({ external_id: "xero-inv-1" }),
    markVoidedInXero: async (id) => { recorded.push(["voided", id]); },
    loadSupplier: async () => ({ name: "Acme", contact_email: null, contact_phone: null, address: null }),
    saveContactLink: async (...args) => { recorded.push(["link", ...args]); },
  };
  return { store, recorded };
}

const job = (patch: Partial<OutboxJob> = {}): OutboxJob => ({
  id: "job-1", tenant_id: "t1", connection_id: "c1", operation: "create_bill", entity_type: "supplier_invoice", entity_id: "inv-1",
  attempts: 0, first_attempt_at: null, idempotency_key: "si-inv-1-create", external_id: null, depends_on: null, ...patch,
});

function ctxFor(f: typeof fetch, store: HandlerStore) {
  return { store, access, fetchImpl: f, cache: createOrgCache(access, f) };
}

describe("handleCreateBill", () => {
  it("creates a SUBMITTED bill with PO in the description and records it", async () => {
    const x = fakeXero([ORG, ACCOUNTS, TAX, { method: "POST", path: /\/Invoices\?unitdp=4&summarizeErrors=false$/, respond: () => json({ Invoices: [{ InvoiceID: "xero-inv-1", Status: "SUBMITTED", Total: 33 }] }) }]);
    const m = memoryStore(source());
    const out = await handleCreateBill(job(), ctxFor(x.f, m.store));
    expect(out).toEqual({ kind: "sent", externalId: "xero-inv-1" });
    const post = x.calls.find((c) => c.method === "POST")!;
    const bill = (post.body as { Invoices: Array<Record<string, unknown>> }).Invoices[0];
    expect(bill).toMatchObject({ Type: "ACCPAY", InvoiceNumber: "INV-9", Status: "SUBMITTED", CurrencyCode: "AUD", Contact: { ContactID: "contact-1" } });
    expect((bill.LineItems as Array<Record<string, unknown>>)[0].Description).toBe("B-1 Bolt · PO-12 · receipt DN-1");
    expect(m.recorded).toEqual([["inv-1", "xero-inv-1", "https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=xero-inv-1", 33]]);
  });

  it("adopts an existing bill on a retry", async () => {
    const x = fakeXero([ORG, ACCOUNTS, TAX, { method: "GET", path: /\/Invoices\?where=/, respond: () => json({ Invoices: [{ InvoiceID: "xero-existing", Status: "AUTHORISED", Total: 33 }] }) }]);
    const m = memoryStore(source());
    const out = await handleCreateBill(job({ attempts: 1 }), ctxFor(x.f, m.store));
    expect(out).toEqual({ kind: "sent", externalId: "xero-existing", note: { adopted: true } });
    expect(x.calls.some((c) => c.method === "POST")).toBe(false);
    expect(m.recorded).toEqual([["inv-1", "xero-existing", "https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=xero-existing", 33]]);
  });

  it("blocks a bill dated on or before the lock date", async () => {
    const x = fakeXero([ORG, ACCOUNTS, TAX]);
    const m = memoryStore(source({ invoice_date: "2026-06-30" }));
    const out = await handleCreateBill(job(), ctxFor(x.f, m.store));
    expect(out.kind).toBe("error");
    if (out.kind === "error") {
      expect(out.error.errorClass).toBe("fixable");
      expect(out.error.message).toMatch(/2026-06-30/);
    }
    expect(x.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it.each([
    ["missing contact link", source(), null, /Link this supplier/],
    ["archived account", { ...source(), lines: [{ ...source().lines[0], account_code: "999" }] }, "contact-1", /Account 999/],
    ["currency mismatch", source({ currency: "NZD" }), "contact-1", /NZD/],
  ])("fails as fixable on %s", async (_n, src, link, re) => {
    const x = fakeXero([ORG, ACCOUNTS, TAX]);
    const m = memoryStore(src as BillSource, link as string | null);
    const out = await handleCreateBill(job(), ctxFor(x.f, m.store));
    expect(out.kind === "error" && out.error.errorClass).toBe("fixable");
    expect(out.kind === "error" && out.error.message).toMatch(re);
  });

  it("maps a 200 with HasErrors to a fixable catalogue message", async () => {
    const x = fakeXero([ORG, ACCOUNTS, TAX, { method: "POST", path: /\/Invoices/, respond: () => json({ Invoices: [{ HasErrors: true, ValidationErrors: [{ Message: "Invoice # must be unique." }] }] }) }]);
    const out = await handleCreateBill(job(), ctxFor(x.f, memoryStore(source()).store));
    expect(out.kind === "error" && out.error.message).toMatch(/already has a bill with this invoice number/);
  });

  it("is a no-op success when the invoice already has a Xero id", async () => {
    const x = fakeXero([]);
    const out = await handleCreateBill(job(), ctxFor(x.f, memoryStore(source({ external_id: "xero-inv-1" })).store));
    expect(out).toEqual({ kind: "sent", externalId: "xero-inv-1" });
  });
});

describe("handleVoidBill", () => {
  const voidJob = job({ operation: "void_bill", idempotency_key: "si-inv-1-void" });
  it("deletes a SUBMITTED bill", async () => {
    const x = fakeXero([
      { method: "GET", path: /\/Invoices\/xero-inv-1$/, respond: () => json({ Invoices: [{ InvoiceID: "xero-inv-1", Status: "SUBMITTED" }] }) },
      { method: "POST", path: /\/Invoices\/xero-inv-1$/, respond: () => json({ Invoices: [{ InvoiceID: "xero-inv-1", Status: "DELETED" }] }) },
    ]);
    const m = memoryStore(source());
    expect(await handleVoidBill(voidJob, ctxFor(x.f, m.store))).toEqual({ kind: "sent", externalId: "xero-inv-1" });
    expect((x.calls[1].body as { Invoices: Array<{ Status: string }> }).Invoices[0].Status).toBe("DELETED");
    expect(m.recorded).toContainEqual(["voided", "inv-1"]);
  });
  it("refuses a paid bill", async () => {
    const x = fakeXero([{ method: "GET", path: /\/Invoices\/xero-inv-1$/, respond: () => json({ Invoices: [{ InvoiceID: "xero-inv-1", Status: "PAID", AmountPaid: 33 }] }) }]);
    const out = await handleVoidBill(voidJob, ctxFor(x.f, memoryStore(source()).store));
    expect(out.kind === "error" && out.error.errorClass).toBe("fixable");
  });
});

describe("handleCreateContact", () => {
  const contactJob = job({ operation: "create_contact", entity_type: "supplier", entity_id: "s1", idempotency_key: "sup-s1-contact" });
  it("skips creation when a link already exists", async () => {
    const x = fakeXero([]);
    expect(await handleCreateContact(contactJob, ctxFor(x.f, memoryStore(null, "contact-9").store))).toEqual({ kind: "sent", externalId: "contact-9" });
  });
  it("creates the contact and saves the link", async () => {
    const x = fakeXero([{ method: "POST", path: /\/Contacts\?summarizeErrors=false$/, respond: () => json({ Contacts: [{ ContactID: "contact-new", Name: "Acme" }] }) }]);
    const m = memoryStore(null, null);
    expect(await handleCreateContact(contactJob, ctxFor(x.f, m.store))).toEqual({ kind: "sent", externalId: "contact-new" });
    expect(m.recorded).toContainEqual(["link", "t1", "s1", "contact-new", "Acme"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/accounting/outbox/handlers.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/accounting/outbox/handlers.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import type { AmountsMode } from "../supplier-invoice/calc";
import { xeroRequest, type XeroAccess } from "../xero/client";
import { classifyXeroFailure, fixableError, type ClassifiedError } from "../xero/errors";
import { fetchAccounts, fetchOrganisation, fetchTaxRates, lockDateBlocking, type XeroAccount, type XeroOrganisation, type XeroTaxRate } from "../xero/org";
import { buildXeroBill, buildXeroContact, decideVoidAction, existingBillWhere, stockLineDescription, voidPayload, xeroBillUrl, type XeroBillState } from "../xero/bill";

export type OutboxJob = {
  id: string;
  tenant_id: string;
  connection_id: string;
  operation: "create_contact" | "create_bill" | "void_bill";
  entity_type: "supplier" | "supplier_invoice";
  entity_id: string;
  attempts: number;
  first_attempt_at: string | null;
  idempotency_key: string;
  external_id: string | null;
  depends_on: string | null;
};

export type HandlerOutcome = { kind: "sent"; externalId: string | null; note?: unknown } | { kind: "error"; error: ClassifiedError };

export type BillSource = {
  invoice: {
    id: string; tenant_id: string; supplier_id: string; invoice_number: string; invoice_date: string; due_date: string;
    amounts_mode: AmountsMode; currency: string; status: string; total: number; external_id: string | null; po_number: string | null;
  };
  lines: Array<{
    kind: "stock" | "other"; description: string; quantity: number; unit_amount: number;
    account_code: string | null; tax_type: string | null;
    component_name: string | null; component_sku: string | null; receipt_ref: string | null;
  }>;
};

export type HandlerStore = {
  loadBillSource(invoiceId: string): Promise<BillSource | null>;
  contactLink(tenantId: string, supplierId: string): Promise<string | null>;
  recordBill(invoiceId: string, xeroId: string, url: string, xeroTotal: number | null): Promise<void>;
  loadInvoiceExternal(invoiceId: string): Promise<{ external_id: string | null } | null>;
  markVoidedInXero(invoiceId: string): Promise<void>;
  loadSupplier(tenantId: string, supplierId: string): Promise<{ name: string | null; contact_email: string | null; contact_phone: string | null; address: string | null } | null>;
  saveContactLink(tenantId: string, supplierId: string, contactId: string, name: string): Promise<void>;
};

type Maybe<T> = T | ClassifiedError;
export type OrgCache = { organisation(): Promise<Maybe<XeroOrganisation>>; accounts(): Promise<Maybe<XeroAccount[]>>; taxRates(): Promise<Maybe<XeroTaxRate[]>> };
export type JobContext = { store: HandlerStore; access: XeroAccess; fetchImpl: typeof fetch; cache: OrgCache };

const isErr = (v: unknown): v is ClassifiedError => !!v && typeof v === "object" && "errorClass" in (v as object);
const fail = (error: ClassifiedError): HandlerOutcome => ({ kind: "error", error });

/** One read of each per processing run: keeps a 25-job batch inside Xero's 60 calls/minute. */
export function createOrgCache(access: XeroAccess, f: typeof fetch): OrgCache {
  let org: Promise<Maybe<XeroOrganisation>> | null = null;
  let accounts: Promise<Maybe<XeroAccount[]>> | null = null;
  let rates: Promise<Maybe<XeroTaxRate[]>> | null = null;
  return {
    organisation: () =>
      (org ??= fetchOrganisation(access, f).then((r) =>
        r.ok ? (r.data.Organisations?.[0] ?? fixableError("Xero didn't return the organisation.")) : classifyXeroFailure(r)
      )),
    accounts: () => (accounts ??= fetchAccounts(access, f).then((r) => (r.ok ? (r.data.Accounts ?? []) : classifyXeroFailure(r)))),
    taxRates: () => (rates ??= fetchTaxRates(access, f).then((r) => (r.ok ? (r.data.TaxRates ?? []) : classifyXeroFailure(r)))),
  };
}

type WithErrors = { HasErrors?: boolean };

export async function handleCreateBill(job: OutboxJob, ctx: JobContext): Promise<HandlerOutcome> {
  const src = await ctx.store.loadBillSource(job.entity_id);
  if (!src || src.invoice.status !== "posted") return fail(fixableError("This invoice is no longer posted in Manuva."));
  const inv = src.invoice;
  if (inv.external_id) return { kind: "sent", externalId: inv.external_id };

  const contactId = await ctx.store.contactLink(inv.tenant_id, inv.supplier_id);
  if (!contactId) return fail(fixableError("Link this supplier to a Xero contact, then retry."));

  const org = await ctx.cache.organisation();
  if (isErr(org)) return fail(org);
  const locked = lockDateBlocking(inv.invoice_date, org);
  if (locked) return fail(fixableError(`Xero is locked up to ${locked}. Change the invoice date or ask your accountant to move the lock date, then retry.`));
  if (inv.currency !== org.BaseCurrency) {
    return fail(fixableError(`This invoice is in ${inv.currency} but Xero's base currency is ${org.BaseCurrency}. Multi-currency bills aren't supported yet.`));
  }
  const accounts = await ctx.cache.accounts();
  if (isErr(accounts)) return fail(accounts);
  const rates = await ctx.cache.taxRates();
  if (isErr(rates)) return fail(rates);
  const activeCodes = new Set(accounts.filter((a) => a.Status === "ACTIVE" && a.Code).map((a) => a.Code!));
  const activeTax = new Set(rates.filter((r) => r.Status === "ACTIVE").map((r) => r.TaxType));
  for (const l of src.lines) {
    if (!l.account_code || !activeCodes.has(l.account_code)) {
      return fail(fixableError(`Account ${l.account_code ?? "(none)"} is archived or missing in Xero. Update Xero setup or the line, then retry.`));
    }
    if (!l.tax_type || !activeTax.has(l.tax_type)) {
      return fail(fixableError(`Tax rate ${l.tax_type ?? "(none)"} can't be used in Xero. Update Xero setup or the line, then retry.`));
    }
  }

  if (job.attempts > 0) {
    // Xero's Idempotency-Key only lasts 6 minutes; after that, look before creating.
    const found = await xeroRequest<{ Invoices: XeroBillState[] }>(
      ctx.access,
      { method: "GET", path: "/Invoices", query: { where: existingBillWhere(contactId, inv.invoice_number) } },
      ctx.fetchImpl
    );
    if (!found.ok) return fail(classifyXeroFailure(found));
    const live = (found.data.Invoices ?? []).find((b) => !["DELETED", "VOIDED"].includes(b.Status.toUpperCase()));
    if (live) {
      await ctx.store.recordBill(inv.id, live.InvoiceID, xeroBillUrl(live.InvoiceID), live.Total ?? null);
      return { kind: "sent", externalId: live.InvoiceID, note: { adopted: true } };
    }
  }

  const payload = buildXeroBill({
    contactId,
    invoiceNumber: inv.invoice_number,
    date: inv.invoice_date,
    dueDate: inv.due_date,
    amountsMode: inv.amounts_mode,
    currencyCode: org.BaseCurrency,
    lines: src.lines.map((l) => ({
      description: l.kind === "stock"
        ? stockLineDescription({ sku: l.component_sku, name: l.component_name ?? l.description, poNumber: inv.po_number, receiptRef: l.receipt_ref })
        : l.description,
      quantity: Number(l.quantity),
      unitAmount: Number(l.unit_amount),
      accountCode: l.account_code!,
      taxType: l.tax_type!,
    })),
  });
  const res = await xeroRequest<{ Invoices: Array<XeroBillState & WithErrors> }>(
    ctx.access,
    { method: "POST", path: "/Invoices", query: { unitdp: "4", summarizeErrors: "false" }, body: payload, idempotencyKey: job.idempotency_key },
    ctx.fetchImpl
  );
  if (!res.ok) return fail(classifyXeroFailure(res));
  const created = res.data.Invoices?.[0];
  if (!created || created.HasErrors || !created.InvoiceID) {
    return fail(classifyXeroFailure({ ok: false, status: 400, body: res.data, rate: res.rate }));
  }
  const xeroTotal = typeof created.Total === "number" ? created.Total : null;
  await ctx.store.recordBill(inv.id, created.InvoiceID, xeroBillUrl(created.InvoiceID), xeroTotal);
  const note = xeroTotal !== null && Math.abs(xeroTotal - Number(inv.total)) >= 0.005 ? { rounding: { manuva: Number(inv.total), xero: xeroTotal } } : undefined;
  return { kind: "sent", externalId: created.InvoiceID, ...(note ? { note } : {}) };
}

export async function handleVoidBill(job: OutboxJob, ctx: JobContext): Promise<HandlerOutcome> {
  const inv = await ctx.store.loadInvoiceExternal(job.entity_id);
  if (!inv?.external_id) {
    await ctx.store.markVoidedInXero(job.entity_id);
    return { kind: "sent", externalId: null };
  }
  const id = inv.external_id;
  const got = await xeroRequest<{ Invoices: XeroBillState[] }>(ctx.access, { method: "GET", path: `/Invoices/${encodeURIComponent(id)}` }, ctx.fetchImpl);
  if (!got.ok) return fail(classifyXeroFailure(got));
  const bill = got.data.Invoices?.[0];
  if (!bill) return fail(fixableError("Xero couldn't find this bill. It may have been deleted in Xero."));
  const decision = decideVoidAction(bill);
  if (decision.kind === "blocked") return fail(fixableError(decision.message));
  if (decision.kind !== "already") {
    const res = await xeroRequest(
      ctx.access,
      { method: "POST", path: `/Invoices/${encodeURIComponent(id)}`, body: voidPayload(id, decision.kind), idempotencyKey: job.idempotency_key },
      ctx.fetchImpl
    );
    if (!res.ok) return fail(classifyXeroFailure(res));
  }
  await ctx.store.markVoidedInXero(job.entity_id);
  return { kind: "sent", externalId: id };
}

export async function handleCreateContact(job: OutboxJob, ctx: JobContext): Promise<HandlerOutcome> {
  const existing = await ctx.store.contactLink(job.tenant_id, job.entity_id);
  if (existing) return { kind: "sent", externalId: existing };
  const sup = await ctx.store.loadSupplier(job.tenant_id, job.entity_id);
  if (!sup) return fail(fixableError("Supplier not found."));
  if (!sup.name?.trim()) return fail(fixableError("This supplier has no name. Add one, then retry."));
  const res = await xeroRequest<{ Contacts: Array<{ ContactID: string; Name: string } & WithErrors> }>(
    ctx.access,
    {
      method: "POST",
      path: "/Contacts",
      query: { summarizeErrors: "false" },
      body: buildXeroContact({ name: sup.name, email: sup.contact_email, phone: sup.contact_phone, address: sup.address }),
      idempotencyKey: job.idempotency_key,
    },
    ctx.fetchImpl
  );
  if (!res.ok) return fail(classifyXeroFailure(res));
  const c = res.data.Contacts?.[0];
  if (!c || c.HasErrors || !c.ContactID) return fail(classifyXeroFailure({ ok: false, status: 400, body: res.data, rate: res.rate }));
  await ctx.store.saveContactLink(job.tenant_id, job.entity_id, c.ContactID, c.Name);
  return { kind: "sent", externalId: c.ContactID };
}

type InvoiceRow = BillSource["invoice"] & { purchase_order: { po_number: string | null } | null };
type LineRow = {
  kind: "stock" | "other"; description: string; quantity: number; unit_amount: number; account_code: string | null; tax_type: string | null;
  component: { name: string | null; sku: string | null } | null;
  receipt_line: { receipt: { supplier_reference: string | null } | null } | null;
};

export function supabaseHandlerStore(db: SupabaseClient): HandlerStore {
  return {
    async loadBillSource(invoiceId) {
      const { data: inv, error } = await db
        .from("supplier_invoice")
        .select("id, tenant_id, supplier_id, invoice_number, invoice_date, due_date, amounts_mode, currency, status, total, external_id, purchase_order:purchase_order_id(po_number)")
        .eq("id", invoiceId)
        .maybeSingle();
      assertNoError(error, "load supplier_invoice");
      if (!inv) return null;
      const { data: lines, error: le } = await db
        .from("supplier_invoice_line")
        .select("kind, description, quantity, unit_amount, account_code, tax_type, component:component_id(name, sku), receipt_line:delivery_receipt_line_id(receipt:delivery_receipt_id(supplier_reference))")
        .eq("supplier_invoice_id", invoiceId)
        .order("line_no");
      assertNoError(le, "load supplier_invoice_line");
      const row = inv as unknown as InvoiceRow;
      return {
        invoice: { ...row, total: Number(row.total), po_number: row.purchase_order?.po_number ?? null },
        lines: ((lines ?? []) as unknown as LineRow[]).map((l) => ({
          kind: l.kind, description: l.description, quantity: Number(l.quantity), unit_amount: Number(l.unit_amount),
          account_code: l.account_code, tax_type: l.tax_type,
          component_name: l.component?.name ?? null, component_sku: l.component?.sku ?? null,
          receipt_ref: l.receipt_line?.receipt?.supplier_reference ?? null,
        })),
      };
    },
    async contactLink(tenantId, supplierId) {
      const { data, error } = await db.from("accounting_contact_link").select("external_contact_id").eq("tenant_id", tenantId).eq("provider", "xero").eq("supplier_id", supplierId).maybeSingle();
      assertNoError(error, "load accounting_contact_link");
      return (data as { external_contact_id: string } | null)?.external_contact_id ?? null;
    },
    async recordBill(invoiceId, xeroId, url, xeroTotal) {
      const { error } = await db
        .from("supplier_invoice")
        .update({ sync_status: "sent", external_id: xeroId, external_url: url, ...(xeroTotal !== null ? { total: xeroTotal } : {}), updated_at: new Date().toISOString() })
        .eq("id", invoiceId);
      assertNoError(error, "record Xero bill");
    },
    async loadInvoiceExternal(invoiceId) {
      const { data, error } = await db.from("supplier_invoice").select("external_id").eq("id", invoiceId).maybeSingle();
      assertNoError(error, "load supplier_invoice external_id");
      return (data as { external_id: string | null } | null) ?? null;
    },
    async markVoidedInXero(invoiceId) {
      const { error } = await db.from("supplier_invoice").update({ sync_status: "voided_in_xero", updated_at: new Date().toISOString() }).eq("id", invoiceId);
      assertNoError(error, "mark supplier_invoice voided_in_xero");
    },
    async loadSupplier(tenantId, supplierId) {
      const { data, error } = await db.from("supplier").select("name, contact_email, contact_phone, address").eq("tenant_id", tenantId).eq("id", supplierId).maybeSingle();
      assertNoError(error, "load supplier");
      return (data as { name: string | null; contact_email: string | null; contact_phone: string | null; address: string | null } | null) ?? null;
    },
    async saveContactLink(tenantId, supplierId, contactId, name) {
      const { error } = await db
        .from("accounting_contact_link")
        .upsert({ tenant_id: tenantId, provider: "xero", supplier_id: supplierId, external_contact_id: contactId, external_name: name, linked_at: new Date().toISOString() }, { onConflict: "tenant_id,provider,supplier_id" });
      assertNoError(error, "save accounting_contact_link");
    },
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/accounting/outbox/handlers.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/accounting/outbox/handlers.ts src/lib/accounting/outbox/handlers.test.ts
git commit -m "MANUVA-34 feat(xero): bill, void and contact handlers with duplicate adoption"
```

### Task 16: Job state machine and outbox processor

**Files:**
- Create: `src/lib/accounting/outbox/state.ts`, `src/lib/accounting/outbox/process.ts`
- Test: `src/lib/accounting/outbox/state.test.ts`, `src/lib/accounting/outbox/process.test.ts`

**Interfaces:**
- Consumes: Tasks 6, 12 and 15; `logSystemActivity`.
- Produces from `state.ts`:
  - `type JobUpdate = { status: "sent" | "failed" | "gave_up" | "pending"; attempts: number; next_attempt_at: string; error_class: ErrorClass | null; error_message: string | null; error_detail: unknown; external_id: string | null; completed_at: string | null; locked_at: null; locked_by: null }`
  - `nextJobState(job: Pick<OutboxJob, "attempts" | "first_attempt_at" | "external_id">, outcome: HandlerOutcome, now: Date): JobUpdate`
  - `invoiceSyncStatusFor(operation: OutboxJob["operation"], update: JobUpdate): "failed" | "queued" | null`. Null means leave it alone.
- Produces from `process.ts`:
  - `type ProcessDeps = { db: SupabaseClient; fetchImpl?: typeof fetch; now?: () => Date; getAccess?: (c: { id: string; external_org_id: string }) => Promise<XeroAccess>; store?: HandlerStore; handlers?: Partial<Record<OutboxJob["operation"], (job: OutboxJob, ctx: JobContext) => Promise<HandlerOutcome>>>; worker?: string }`
  - `type ProcessResult = { claimed: number; sent: number; failed: number }`
  - `processConnectionOutbox(connectionId: string, deps: ProcessDeps, limit?: number): Promise<ProcessResult>`
  - `processDueOutboxes(deps: ProcessDeps, budgetMs?: number): Promise<ProcessResult & { connections: number }>`
  - `kickOutbox(tenantId: string): Promise<void>`. It never throws.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/accounting/outbox/state.test.ts
import { describe, expect, it } from "vitest";
import { invoiceSyncStatusFor, nextJobState } from "./state";

const now = new Date("2026-10-01T00:10:00Z");
const job = { attempts: 0, first_attempt_at: "2026-10-01T00:00:00Z", external_id: null };
const err = (errorClass: "transient" | "fixable" | "auth" | "daily_limit", retryAfterSec: number | null = null) =>
  ({ kind: "error" as const, error: { errorClass, message: "m", detail: null, retryAfterSec } });

describe("nextJobState", () => {
  it("sent completes the job and counts the attempt", () => {
    const u = nextJobState(job, { kind: "sent", externalId: "x", note: { rounding: 1 } }, now);
    expect(u).toMatchObject({ status: "sent", attempts: 1, external_id: "x", completed_at: now.toISOString(), error_class: null, error_detail: { rounding: 1 } });
  });
  it("transient schedules a retry", () => {
    const u = nextJobState(job, err("transient"), now);
    expect(u).toMatchObject({ status: "failed", attempts: 1, error_class: "transient", next_attempt_at: "2026-10-01T00:11:00.000Z" });
  });
  it("transient past 24h gives up", () => {
    const u = nextJobState({ ...job, attempts: 7, first_attempt_at: "2026-09-30T00:20:00Z" }, err("transient"), now);
    expect(u).toMatchObject({ status: "gave_up", completed_at: now.toISOString() });
  });
  it("fixable waits for a human", () => {
    expect(nextJobState(job, err("fixable"), now)).toMatchObject({ status: "failed", attempts: 1, error_class: "fixable" });
  });
  it("auth pauses without spending an attempt", () => {
    expect(nextJobState(job, err("auth"), now)).toMatchObject({ status: "pending", attempts: 0, error_class: "auth" });
  });
  it("daily_limit defers to Retry-After without spending an attempt", () => {
    expect(nextJobState(job, err("daily_limit", 3600), now)).toMatchObject({ status: "failed", attempts: 0, next_attempt_at: "2026-10-01T01:10:00.000Z" });
    expect(nextJobState(job, err("daily_limit"), now).next_attempt_at).toBe("2026-10-02T00:00:00.000Z");
  });
});

describe("invoiceSyncStatusFor", () => {
  it("mirrors failures onto bill invoices only", () => {
    expect(invoiceSyncStatusFor("create_bill", nextJobState(job, err("fixable"), now))).toBe("failed");
    expect(invoiceSyncStatusFor("void_bill", nextJobState(job, err("transient"), now))).toBe("queued");
    expect(invoiceSyncStatusFor("create_bill", nextJobState(job, { kind: "sent", externalId: "x" }, now))).toBeNull();
    expect(invoiceSyncStatusFor("create_contact", nextJobState(job, err("fixable"), now))).toBeNull();
  });
});
```

```ts
// src/lib/accounting/outbox/process.test.ts
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processConnectionOutbox } from "./process";
import { XeroAuthError } from "../xero/tokens";
import type { OutboxJob } from "./handlers";

type Write = { table: string; values: Record<string, unknown>; filters: Array<[string, string, unknown]> };

function fakeDb(opts: { connection: Record<string, unknown> | null; jobs: OutboxJob[] }) {
  const writes: Write[] = [];
  const from = (table: string) => {
    const st = { op: "select", values: {} as Record<string, unknown>, filters: [] as Array<[string, string, unknown]> };
    const b: Record<string, unknown> = {};
    const chain = (name: string) => (c?: string, v?: unknown) => { if (c !== undefined) st.filters.push([name, c, v]); return b; };
    Object.assign(b, {
      select: () => b,
      update: (values: Record<string, unknown>) => { st.op = "update"; st.values = values; return b; },
      insert: (values: Record<string, unknown>) => { st.op = "insert"; st.values = values; return b; },
      eq: chain("eq"), neq: chain("neq"), in: chain("in"), lte: chain("lte"), limit: () => b, order: () => b,
      maybeSingle: async () => ({ data: table === "accounting_connection" ? opts.connection : null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        if (st.op !== "select") writes.push({ table, values: st.values, filters: st.filters });
        resolve({ data: [], error: null });
      },
    });
    return b;
  };
  const db = { from, rpc: vi.fn(async () => ({ data: opts.jobs, error: null })) } as unknown as SupabaseClient;
  return { db, writes };
}

const conn = { id: "c1", tenant_id: "t1", external_org_id: "org-1", status: "connected" };
const job = (id: string): OutboxJob => ({
  id, tenant_id: "t1", connection_id: "c1", operation: "create_bill", entity_type: "supplier_invoice", entity_id: `inv-${id}`,
  attempts: 0, first_attempt_at: "2026-10-01T00:00:00Z", idempotency_key: `si-inv-${id}-create`, external_id: null, depends_on: null,
});
const getAccess = async () => ({ accessToken: "t", xeroTenantId: "org-1" });
const now = () => new Date("2026-10-01T00:05:00Z");

describe("processConnectionOutbox", () => {
  it("records a sent job", async () => {
    const f = fakeDb({ connection: conn, jobs: [job("1")] });
    const create_bill = vi.fn(async () => ({ kind: "sent" as const, externalId: "x1" }));
    const r = await processConnectionOutbox("c1", { db: f.db, getAccess, now, handlers: { create_bill } });
    expect(r).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(f.writes.find((w) => w.table === "accounting_outbox")?.values).toMatchObject({ status: "sent", external_id: "x1" });
  });

  it("stops on an auth error, releases the rest and marks the connection", async () => {
    const f = fakeDb({ connection: conn, jobs: [job("1"), job("2")] });
    const create_bill = vi.fn(async () => ({ kind: "error" as const, error: { errorClass: "auth" as const, message: "reconnect", detail: null, retryAfterSec: null } }));
    await processConnectionOutbox("c1", { db: f.db, getAccess, now, handlers: { create_bill } });
    expect(create_bill).toHaveBeenCalledTimes(1);
    const released = f.writes.find((w) => w.table === "accounting_outbox" && w.filters.some(([op, c, v]) => op === "in" && c === "id" && Array.isArray(v) && v.includes("2")));
    expect(released?.values).toMatchObject({ status: "pending", locked_at: null });
    expect(f.writes.some((w) => w.table === "accounting_connection" && w.values.status === "needs_reconnect")).toBe(true);
  });

  it("pauses every claimed job when the token cannot be obtained", async () => {
    const f = fakeDb({ connection: conn, jobs: [job("1"), job("2")] });
    const r = await processConnectionOutbox("c1", { db: f.db, now, getAccess: async () => { throw new XeroAuthError("dead"); } });
    expect(r.failed).toBe(2);
    expect(f.writes.filter((w) => w.table === "accounting_outbox").every((w) => w.values.status === "pending")).toBe(true);
  });

  it("does nothing for a disconnected connection", async () => {
    const f = fakeDb({ connection: { ...conn, status: "needs_reconnect" }, jobs: [job("1")] });
    expect(await processConnectionOutbox("c1", { db: f.db, getAccess, now })).toEqual({ claimed: 0, sent: 0, failed: 0 });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/accounting/outbox/state.test.ts src/lib/accounting/outbox/process.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `state.ts`**

```ts
// src/lib/accounting/outbox/state.ts
import type { ErrorClass } from "../xero/errors";
import { nextAttemptAt, nextUtcMidnight } from "./backoff";
import type { HandlerOutcome, OutboxJob } from "./handlers";

export type JobUpdate = {
  status: "sent" | "failed" | "gave_up" | "pending";
  attempts: number;
  next_attempt_at: string;
  error_class: ErrorClass | null;
  error_message: string | null;
  error_detail: unknown;
  external_id: string | null;
  completed_at: string | null;
  locked_at: null;
  locked_by: null;
};

export function nextJobState(
  job: Pick<OutboxJob, "attempts" | "first_attempt_at" | "external_id">,
  outcome: HandlerOutcome,
  now: Date
): JobUpdate {
  const iso = now.toISOString();
  const base = { locked_at: null, locked_by: null, external_id: job.external_id } as const;
  if (outcome.kind === "sent") {
    return {
      ...base, status: "sent", attempts: job.attempts + 1, next_attempt_at: iso,
      error_class: null, error_message: null, error_detail: outcome.note ?? null,
      external_id: outcome.externalId ?? job.external_id, completed_at: iso,
    };
  }
  const e = outcome.error;
  const errFields = { error_class: e.errorClass, error_message: e.message, error_detail: e.detail };
  switch (e.errorClass) {
    case "auth":
      return { ...base, ...errFields, status: "pending", attempts: job.attempts, next_attempt_at: iso, completed_at: null };
    case "daily_limit": {
      const next = e.retryAfterSec ? new Date(now.getTime() + e.retryAfterSec * 1000) : nextUtcMidnight(now);
      return { ...base, ...errFields, status: "failed", attempts: job.attempts, next_attempt_at: next.toISOString(), completed_at: null };
    }
    case "fixable":
      return { ...base, ...errFields, status: "failed", attempts: job.attempts + 1, next_attempt_at: iso, completed_at: null };
    case "transient": {
      const attempts = job.attempts + 1;
      const first = job.first_attempt_at ? new Date(job.first_attempt_at) : now;
      const next = nextAttemptAt(attempts, first, now, e.retryAfterSec);
      return next
        ? { ...base, ...errFields, status: "failed", attempts, next_attempt_at: next.toISOString(), completed_at: null }
        : { ...base, ...errFields, status: "gave_up", attempts, next_attempt_at: iso, completed_at: iso };
    }
  }
}

/** Handlers write the success states themselves; this mirrors failures and retries onto the invoice. */
export function invoiceSyncStatusFor(operation: OutboxJob["operation"], update: JobUpdate): "failed" | "queued" | null {
  if (operation === "create_contact" || update.status === "sent") return null;
  if (update.status === "gave_up" || (update.status === "failed" && update.error_class === "fixable")) return "failed";
  return "queued";
}
```

- [ ] **Step 4: Implement `process.ts`**

```ts
// src/lib/accounting/outbox/process.ts
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logSystemActivity } from "@/lib/activity/log";
import { xeroAccessFor } from "../xero/access";
import type { XeroAccess } from "../xero/client";
import { scrubSecrets } from "../xero/scrub";
import { XeroAuthError } from "../xero/tokens";
import {
  createOrgCache, handleCreateBill, handleCreateContact, handleVoidBill, supabaseHandlerStore,
  type HandlerOutcome, type HandlerStore, type JobContext, type OutboxJob,
} from "./handlers";
import { invoiceSyncStatusFor, nextJobState, type JobUpdate } from "./state";

type Handler = (job: OutboxJob, ctx: JobContext) => Promise<HandlerOutcome>;
const HANDLERS: Record<OutboxJob["operation"], Handler> = {
  create_contact: handleCreateContact,
  create_bill: handleCreateBill,
  void_bill: handleVoidBill,
};

export type ProcessDeps = {
  db: SupabaseClient;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  getAccess?: (c: { id: string; external_org_id: string }) => Promise<XeroAccess>;
  store?: HandlerStore;
  handlers?: Partial<Record<OutboxJob["operation"], Handler>>;
  worker?: string;
};
export type ProcessResult = { claimed: number; sent: number; failed: number };

const AUTH_OUTCOME: HandlerOutcome = {
  kind: "error",
  error: { errorClass: "auth", message: "Xero needs reconnecting. An admin can reconnect it from Settings → Integrations.", detail: null, retryAfterSec: null },
};

function thrownOutcome(err: unknown): HandlerOutcome {
  if (err instanceof XeroAuthError) return AUTH_OUTCOME;
  return {
    kind: "error",
    error: {
      errorClass: "transient",
      message: "Something went wrong sending this to Xero. Manuva will retry.",
      detail: scrubSecrets(err instanceof Error ? err.message : String(err)),
      retryAfterSec: null,
    },
  };
}

async function finish(db: SupabaseClient, job: OutboxJob, outcome: HandlerOutcome, now: Date): Promise<JobUpdate> {
  const update = nextJobState(job, outcome, now);
  const { error } = await db.from("accounting_outbox").update(update).eq("id", job.id);
  assertNoError(error, "update accounting_outbox");

  const sync = invoiceSyncStatusFor(job.operation, update);
  if (sync && job.entity_type === "supplier_invoice") {
    const { error: e2 } = await db.from("supplier_invoice").update({ sync_status: sync, updated_at: now.toISOString() }).eq("id", job.entity_id);
    assertNoError(e2, "mirror supplier_invoice sync_status");
  }
  const failedForGood = update.status === "gave_up" || (update.status === "failed" && update.error_class === "fixable");
  if (job.operation === "create_contact" && failedForGood) {
    // Bills waiting on this contact can't go either; show them as failed.
    const { data: dependants, error: e3 } = await db.from("accounting_outbox").select("entity_id").eq("depends_on", job.id).in("status", ["pending", "failed"]);
    assertNoError(e3, "read dependent outbox jobs");
    const ids = (dependants ?? []).map((d) => (d as { entity_id: string }).entity_id);
    if (ids.length) {
      const { error: e4 } = await db.from("supplier_invoice").update({ sync_status: "failed", updated_at: now.toISOString() }).in("id", ids);
      assertNoError(e4, "mark dependent invoices failed");
    }
  }
  if (failedForGood) {
    await logSystemActivity({
      supabase: db, tenantId: job.tenant_id, actorType: "system", actorLabel: "Xero sync",
      event: update.status === "gave_up" ? "accounting.sync_gave_up" : "accounting.sync_failed",
      entityId: job.id, metadata: { operation: job.operation, message: update.error_message },
    });
  }
  return update;
}

async function releaseJobs(db: SupabaseClient, ids: string[], nextAt: string): Promise<void> {
  if (!ids.length) return;
  const { error } = await db.from("accounting_outbox").update({ status: "pending", locked_at: null, locked_by: null, next_attempt_at: nextAt }).in("id", ids);
  assertNoError(error, "release accounting_outbox jobs");
}

async function markNeedsReconnect(db: SupabaseClient, connectionId: string, reason: string): Promise<void> {
  const { error } = await db
    .from("accounting_connection")
    .update({ status: "needs_reconnect", last_error: reason, updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("status", "connected");
  assertNoError(error, "mark accounting_connection needs_reconnect");
}

export async function processConnectionOutbox(connectionId: string, deps: ProcessDeps, limit = 25): Promise<ProcessResult> {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  const result: ProcessResult = { claimed: 0, sent: 0, failed: 0 };

  const { data: conn, error: connErr } = await db.from("accounting_connection").select("id, tenant_id, external_org_id, status").eq("id", connectionId).maybeSingle();
  assertNoError(connErr, "load accounting_connection");
  const c = conn as { id: string; tenant_id: string; external_org_id: string; status: string } | null;
  if (!c || c.status !== "connected") return result;

  const { data: claimed, error } = await db.rpc("claim_accounting_jobs", { p_connection_id: connectionId, p_limit: limit, p_worker: deps.worker ?? `w-${randomUUID()}` });
  assertNoError(error, "claim_accounting_jobs");
  const jobs = (claimed ?? []) as OutboxJob[];
  result.claimed = jobs.length;
  if (!jobs.length) return result;

  let access: XeroAccess;
  try {
    access = await (deps.getAccess ?? ((x) => xeroAccessFor(db, x)))(c);
  } catch (err) {
    const outcome = thrownOutcome(err);
    for (const job of jobs) await finish(db, job, outcome, now());
    result.failed = jobs.length;
    return result;
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const ctx: JobContext = { store: deps.store ?? supabaseHandlerStore(db), access, fetchImpl, cache: createOrgCache(access, fetchImpl) };
  const handlers = { ...HANDLERS, ...deps.handlers };

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    let outcome: HandlerOutcome;
    try {
      outcome = await handlers[job.operation](job, ctx);
    } catch (err) {
      outcome = thrownOutcome(err);
    }
    const update = await finish(db, job, outcome, now());
    if (update.status === "sent") result.sent++;
    else result.failed++;
    if (outcome.kind === "error" && (outcome.error.errorClass === "auth" || outcome.error.errorClass === "daily_limit")) {
      // Nothing else for this organisation can succeed now: return the rest without spending an attempt.
      await releaseJobs(db, jobs.slice(i + 1).map((j) => j.id), update.next_attempt_at);
      if (outcome.error.errorClass === "auth") await markNeedsReconnect(db, connectionId, outcome.error.message);
      break;
    }
  }
  return result;
}

export async function processDueOutboxes(deps: ProcessDeps, budgetMs = 45_000): Promise<ProcessResult & { connections: number }> {
  const started = Date.now();
  const { data, error } = await deps.db
    .from("accounting_outbox")
    .select("connection_id")
    .in("status", ["pending", "failed", "working"])
    .lte("next_attempt_at", new Date().toISOString())
    .limit(1000);
  assertNoError(error, "list due accounting_outbox");
  const ids = [...new Set((data ?? []).map((r) => (r as { connection_id: string }).connection_id))];
  const total = { claimed: 0, sent: 0, failed: 0, connections: 0 };
  for (const id of ids) {
    if (Date.now() - started > budgetMs) break;
    try {
      const r = await processConnectionOutbox(id, deps);
      total.claimed += r.claimed;
      total.sent += r.sent;
      total.failed += r.failed;
      total.connections++;
    } catch (err) {
      console.error("[xero] outbox run failed", id, scrubSecrets(err instanceof Error ? err.message : String(err)));
    }
  }
  return total;
}

/** Called from after() in server actions. Never throws. */
export async function kickOutbox(tenantId: string): Promise<void> {
  try {
    const db = createSupabaseAdminClient();
    const { data, error } = await db.from("accounting_connection").select("id").eq("tenant_id", tenantId).eq("provider", "xero").eq("status", "connected").maybeSingle();
    assertNoError(error, "find connection to kick");
    if (data) await processConnectionOutbox((data as { id: string }).id, { db }, 5);
  } catch (err) {
    console.error("[xero] kickOutbox failed", scrubSecrets(err instanceof Error ? err.message : String(err)));
  }
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run src/lib/accounting/outbox && npx tsc --noEmit`
Expected: all pass, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/accounting/outbox/state.ts src/lib/accounting/outbox/state.test.ts src/lib/accounting/outbox/process.ts src/lib/accounting/outbox/process.test.ts
git commit -m "MANUVA-34 feat(xero): outbox state machine and processor"
```

---

# Chunk F — Supplier invoices

### Task 17: Supplier linking and supplier-invoice server actions

**Files:**
- Create: `src/lib/accounting/supplier-invoice/errors.ts`
- Test: `src/lib/accounting/supplier-invoice/errors.test.ts`
- Create: `src/app/app/purchasing/invoices/actions.ts`
- Modify: `src/app/app/settings/integrations/xero/actions.ts` (add `retryAccountingJob`)

**Interfaces:**
- Consumes: Tasks 7, 8, 12, 13 and 16.
- Produces from `errors.ts`: `dbErrorMessage(error: { code?: string; message?: string } | null, fallback: string): string`.
- Produces from `purchasing/invoices/actions.ts`:
  - `saveSupplierInvoiceDraft(raw: unknown): Promise<{ ok: true; id: string } | { ok: false; message: string }>`
  - `postSupplierInvoice(id: string, opts: { updateComponentCosts: boolean; createContact: boolean }): Promise<{ ok: true; syncStatus: string } | { ok: false; message: string }>`
  - `voidSupplierInvoice(id: string, reason: string): Promise<{ ok: true; syncStatus: string } | { ok: false; message: string }>`
  - `searchXeroContactsAction(term: string): Promise<{ ok: true; contacts: { id: string; name: string }[] } | { ok: false; message: string }>`
  - `linkSupplierToXeroContact(supplierId: string, contactId: string): Promise<{ ok: true; name: string } | { ok: false; message: string }>`
- Produces from `xero/actions.ts`: `retryAccountingJob(jobId: string): Promise<{ ok: boolean; message?: string }>`

- [ ] **Step 1: Write the failing test for the message mapper**

```ts
// src/lib/accounting/supplier-invoice/errors.test.ts
import { describe, expect, it } from "vitest";
import { dbErrorMessage } from "./errors";

describe("dbErrorMessage", () => {
  it("explains a duplicate invoice number", () => {
    expect(dbErrorMessage({ code: "23505", message: 'duplicate key value violates unique constraint "supplier_invoice_live_number_uq"' }, "x"))
      .toBe("This supplier already has an invoice with that number.");
  });
  it("passes through the function's own messages, capitalised", () => {
    expect(dbErrorMessage({ code: "P0001", message: "link this supplier to a Xero contact, or choose to create one, before posting" }, "x"))
      .toBe("Link this supplier to a Xero contact, or choose to create one, before posting.");
    expect(dbErrorMessage({ code: "23505", message: "a receipt line on this invoice is already on another posted invoice" }, "x"))
      .toBe("A receipt line on this invoice is already on another posted invoice.");
  });
  it("hides anything else behind the fallback", () => {
    expect(dbErrorMessage({ code: "XX000", message: "internal detail" }, "Couldn't save.")).toBe("Couldn't save.");
    expect(dbErrorMessage(null, "Couldn't save.")).toBe("Couldn't save.");
  });
});
```

- [ ] **Step 2: Run it and watch it fail, then implement**

Run: `npx vitest run src/lib/accounting/supplier-invoice/errors.test.ts`. Expected: FAIL. Then:

```ts
// src/lib/accounting/supplier-invoice/errors.ts
const USER_CODES = new Set(["P0001", "P0002", "23505", "42501", "55P03"]);

export function dbErrorMessage(error: { code?: string; message?: string } | null, fallback: string): string {
  if (!error) return fallback;
  const msg = (error.message ?? "").trim();
  if (error.code === "23505" && msg.includes("supplier_invoice_live_number_uq")) return "This supplier already has an invoice with that number.";
  if (USER_CODES.has(error.code ?? "") && msg && !msg.startsWith("duplicate key")) {
    const s = msg.charAt(0).toUpperCase() + msg.slice(1);
    return /[.!?]$/.test(s) ? s : `${s}.`;
  }
  return fallback;
}
```

Run it again. Expected: 3 passed.

- [ ] **Step 3: Write the invoice actions**

```ts
// src/app/app/purchasing/invoices/actions.ts
"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { isAdminRole } from "@/lib/tenant/authz";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { logActivity } from "@/lib/activity/log";
import { parseDraftPayload } from "@/lib/accounting/supplier-invoice/draft";
import { invoiceTotals, lineAmounts } from "@/lib/accounting/supplier-invoice/calc";
import { dbErrorMessage } from "@/lib/accounting/supplier-invoice/errors";
import { supabaseConnectionRepo } from "@/lib/accounting/connection";
import { isXeroPilotTenant } from "@/lib/accounting/xero/config";
import { xeroAccessFor } from "@/lib/accounting/xero/access";
import { getContact, searchContacts } from "@/lib/accounting/xero/org";
import { classifyXeroFailure } from "@/lib/accounting/xero/errors";
import { XeroAuthError } from "@/lib/accounting/xero/tokens";
import { kickOutbox } from "@/lib/accounting/outbox/process";

type Fail = { ok: false; message: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateInvoices(id?: string) {
  revalidatePath("/app/purchasing/invoices");
  if (id) revalidatePath(`/app/purchasing/invoices/${id}`);
  revalidatePath("/app/purchasing");
  revalidatePath("/app/goods-inwards");
}

export async function saveSupplierInvoiceDraft(raw: unknown): Promise<{ ok: true; id: string } | Fail> {
  const ctx = await getServerTenantContext();
  if (!ctx?.tenantId) return { ok: false, message: "You're not signed in to a workspace." };
  const parsed = parseDraftPayload(raw);
  if (!parsed.ok) return { ok: false, message: parsed.error };
  const d = parsed.value;

  const lines = d.lines.map((l) => ({ ...l, ...lineAmounts({ quantity: l.quantity, unitAmount: l.unitAmount, taxRatePercent: l.taxRatePercent }, d.amountsMode) }));
  const totals = invoiceTotals(lines, d.amountsMode);
  const header = {
    tenant_id: ctx.tenantId,
    supplier_id: d.supplierId,
    purchase_order_id: d.purchaseOrderId,
    invoice_number: d.invoiceNumber,
    invoice_date: d.invoiceDate,
    due_date: d.dueDate,
    amounts_mode: d.amountsMode,
    currency: d.currency,
    entered_total: d.enteredTotal,
    subtotal: totals.subtotal,
    tax_total: totals.taxTotal,
    total: totals.total,
    updated_at: new Date().toISOString(),
  };

  let id = d.id;
  if (id) {
    const { data, error } = await ctx.supabase.from("supplier_invoice").update(header).eq("id", id).eq("status", "draft").select("id");
    if (error) return { ok: false, message: dbErrorMessage(error, "Couldn't save the invoice.") };
    if (!data?.length) return { ok: false, message: "This invoice can't be edited. It may already be posted." };
    const { error: delErr } = await ctx.supabase.from("supplier_invoice_line").delete().eq("supplier_invoice_id", id);
    if (delErr) return { ok: false, message: dbErrorMessage(delErr, "Couldn't save the invoice lines.") };
  } else {
    const { data, error } = await ctx.supabase.from("supplier_invoice").insert(header).select("id").single();
    if (error) return { ok: false, message: dbErrorMessage(error, "Couldn't save the invoice.") };
    id = (data as { id: string }).id;
  }

  // A draft is not posted, so a failed line write leaves an editable draft; the user saves again.
  const { error: lineErr } = await ctx.supabase.from("supplier_invoice_line").insert(
    lines.map((l, i) => ({
      tenant_id: ctx.tenantId,
      supplier_invoice_id: id,
      line_no: i + 1,
      kind: l.kind,
      delivery_receipt_line_id: l.deliveryReceiptLineId,
      component_id: l.componentId,
      description: l.description,
      quantity: l.quantity,
      unit_amount: l.unitAmount,
      tax_type: l.taxType,
      tax_rate: l.taxRatePercent,
      account_code: l.accountCode,
      line_amount: l.lineAmount,
      tax_amount: l.taxAmount,
    }))
  );
  if (lineErr) return { ok: false, message: dbErrorMessage(lineErr, "Couldn't save the invoice lines.") };
  revalidateInvoices(id!);
  return { ok: true, id: id! };
}

export async function postSupplierInvoice(id: string, opts: { updateComponentCosts: boolean; createContact: boolean }): Promise<{ ok: true; syncStatus: string } | Fail> {
  const ctx = await getServerTenantContext();
  if (!ctx?.tenantId) return { ok: false, message: "You're not signed in to a workspace." };
  if (!UUID.test(id)) return { ok: false, message: "Invoice not found." };
  const { data, error } = await ctx.supabase.rpc("post_supplier_invoice", {
    p_invoice_id: id,
    p_update_component_costs: opts.updateComponentCosts,
    p_create_contact: opts.createContact,
  });
  if (error) return { ok: false, message: dbErrorMessage(error, "Couldn't post the invoice.") };
  const syncStatus = String(data);
  const { data: inv } = await ctx.supabase.from("supplier_invoice").select("invoice_number").eq("id", id).maybeSingle();
  await logActivity({ event: "supplier_invoice.posted", entityId: id, metadata: { invoice_number: (inv as { invoice_number?: string } | null)?.invoice_number, sync_status: syncStatus } });
  const tenantId = ctx.tenantId;
  if (syncStatus === "queued") after(() => kickOutbox(tenantId));
  revalidateInvoices(id);
  return { ok: true, syncStatus };
}

export async function voidSupplierInvoice(id: string, reason: string): Promise<{ ok: true; syncStatus: string } | Fail> {
  const ctx = await getServerTenantContext();
  if (!ctx?.tenantId) return { ok: false, message: "You're not signed in to a workspace." };
  if (!isAdminRole(ctx.role)) return { ok: false, message: "Only admins can void supplier invoices." };
  if (!UUID.test(id)) return { ok: false, message: "Invoice not found." };
  const { data, error } = await ctx.supabase.rpc("void_supplier_invoice", { p_invoice_id: id, p_reason: reason });
  if (error) return { ok: false, message: dbErrorMessage(error, "Couldn't void the invoice.") };
  const syncStatus = String(data);
  const { data: inv } = await ctx.supabase.from("supplier_invoice").select("invoice_number").eq("id", id).maybeSingle();
  await logActivity({ event: "supplier_invoice.voided", entityId: id, metadata: { invoice_number: (inv as { invoice_number?: string } | null)?.invoice_number, reason } });
  const tenantId = ctx.tenantId;
  if (syncStatus === "queued") after(() => kickOutbox(tenantId));
  revalidateInvoices(id);
  return { ok: true, syncStatus };
}

async function connectedXero(tenantId: string) {
  if (!isXeroPilotTenant(tenantId)) return null;
  const db = createSupabaseAdminClient();
  const conn = await supabaseConnectionRepo(db).findByTenant(tenantId);
  return conn && conn.status === "connected" && conn.setup_completed_at ? { db, conn } : null;
}

export async function searchXeroContactsAction(term: string): Promise<{ ok: true; contacts: { id: string; name: string }[] } | Fail> {
  const ctx = await getServerTenantContext();
  if (!ctx?.tenantId) return { ok: false, message: "You're not signed in to a workspace." };
  const q = term.trim().slice(0, 100);
  if (q.length < 2) return { ok: true, contacts: [] };
  const x = await connectedXero(ctx.tenantId);
  if (!x) return { ok: false, message: "Xero isn't connected." };
  try {
    const r = await searchContacts(await xeroAccessFor(x.db, x.conn), q);
    if (!r.ok) return { ok: false, message: classifyXeroFailure(r).message };
    return {
      ok: true,
      contacts: (r.data.Contacts ?? []).filter((c) => c.ContactStatus !== "ARCHIVED").slice(0, 10).map((c) => ({ id: c.ContactID, name: c.Name })),
    };
  } catch (err) {
    return { ok: false, message: err instanceof XeroAuthError ? "Xero needs reconnecting. Ask an admin." : "Couldn't reach Xero. Try again." };
  }
}

export async function linkSupplierToXeroContact(supplierId: string, contactId: string): Promise<{ ok: true; name: string } | Fail> {
  const ctx = await getServerTenantContext();
  if (!ctx?.tenantId) return { ok: false, message: "You're not signed in to a workspace." };
  if (!UUID.test(supplierId) || !UUID.test(contactId)) return { ok: false, message: "Invalid supplier or contact." };
  const { data: sup } = await ctx.supabase.from("supplier").select("id").eq("id", supplierId).maybeSingle();
  if (!sup) return { ok: false, message: "Supplier not found." };
  const x = await connectedXero(ctx.tenantId);
  if (!x) return { ok: false, message: "Xero isn't connected." };

  let name: string;
  try {
    const r = await getContact(await xeroAccessFor(x.db, x.conn), contactId);
    if (!r.ok) return { ok: false, message: classifyXeroFailure(r).message };
    const c = r.data.Contacts?.[0];
    if (!c || c.ContactStatus === "ARCHIVED") return { ok: false, message: "That Xero contact is archived or missing." };
    name = c.Name;
  } catch (err) {
    return { ok: false, message: err instanceof XeroAuthError ? "Xero needs reconnecting. Ask an admin." : "Couldn't reach Xero. Try again." };
  }

  const { error } = await x.db.from("accounting_contact_link").upsert(
    { tenant_id: ctx.tenantId, provider: "xero", supplier_id: supplierId, external_contact_id: contactId, external_name: name, linked_by: ctx.userId, linked_at: new Date().toISOString() },
    { onConflict: "tenant_id,provider,supplier_id" }
  );
  assertNoError(error, "save accounting_contact_link");

  // A queued "create contact" for this supplier is now unnecessary; unblock bills waiting on it.
  const { data: jobs, error: je } = await x.db
    .from("accounting_outbox")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("entity_type", "supplier")
    .eq("entity_id", supplierId)
    .eq("operation", "create_contact")
    .in("status", ["pending", "failed"]);
  assertNoError(je, "find create_contact jobs");
  const ids = (jobs ?? []).map((j) => (j as { id: string }).id);
  if (ids.length) {
    const { error: e1 } = await x.db.from("accounting_outbox").update({ status: "cancelled", completed_at: new Date().toISOString(), error_message: "Supplier linked to an existing Xero contact" }).in("id", ids);
    assertNoError(e1, "cancel create_contact jobs");
    const { error: e2 } = await x.db.from("accounting_outbox").update({ depends_on: null }).in("depends_on", ids);
    assertNoError(e2, "unblock dependent bill jobs");
    const tenantId = ctx.tenantId;
    after(() => kickOutbox(tenantId));
  }
  await logActivity({ event: "accounting.supplier_linked", entityId: supplierId, metadata: { contact_name: name } });
  revalidateInvoices();
  return { ok: true, name };
}
```

- [ ] **Step 4: Add `retryAccountingJob` to the settings actions**

Append to `src/app/app/settings/integrations/xero/actions.ts`, adding `import { after } from "next/server";` and `import { kickOutbox } from "@/lib/accounting/outbox/process";` at the top:

```ts
export async function retryAccountingJob(jobId: string): Promise<{ ok: boolean; message?: string }> {
  const ctx = await requireAdmin();
  if (!ctx.tenantId) return { ok: false, message: "Choose a workspace first." };
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("accounting_outbox")
    .update({ status: "pending", error_class: null, first_attempt_at: null, next_attempt_at: new Date().toISOString(), locked_at: null, locked_by: null })
    .eq("id", jobId)
    .eq("tenant_id", ctx.tenantId)
    .in("status", ["failed", "gave_up"])
    .select("entity_type, entity_id");
  if (error) return { ok: false, message: "Couldn't retry. Another attempt for this item may already be queued." };
  const job = (data ?? [])[0] as { entity_type: string; entity_id: string } | undefined;
  if (!job) return { ok: false, message: "That item can't be retried." };
  if (job.entity_type === "supplier_invoice") {
    const { error: e2 } = await db.from("supplier_invoice").update({ sync_status: "queued", updated_at: new Date().toISOString() }).eq("id", job.entity_id);
    assertNoError(e2, "requeue supplier_invoice");
  }
  const tenantId = ctx.tenantId;
  after(() => kickOutbox(tenantId));
  revalidatePath("/app/settings/integrations");
  revalidatePath("/app/purchasing/invoices");
  return { ok: true };
}
```

`first_attempt_at` is reset so the 24-hour retry window starts again. `attempts` is kept, so the duplicate check in `handleCreateBill` still runs.

- [ ] **Step 5: Type-check, lint, test**

```bash
npx tsc --noEmit
npx eslint src/app/app/purchasing/invoices/actions.ts src/app/app/settings/integrations/xero/actions.ts src/lib/accounting/supplier-invoice
npx vitest run src/lib/accounting
```

Expected: clean and green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/accounting/supplier-invoice/errors.ts src/lib/accounting/supplier-invoice/errors.test.ts src/app/app/purchasing/invoices/actions.ts src/app/app/settings/integrations/xero/actions.ts
git commit -m "MANUVA-34 feat(invoices): draft, post, void, supplier linking actions"
```

### Task 18: Supplier invoice screens, plus PO and receipt status

**Files:**
- Create: `src/lib/accounting/supplier-invoice/labels.ts`
- Test: `src/lib/accounting/supplier-invoice/labels.test.ts`
- Create: `src/app/app/purchasing/invoices/invoices.module.css`, `page.tsx`, `invoice-form.tsx`, `supplier-link.tsx`, `invoice-actions.tsx`, `invoice-status-panel.tsx`, `new/page.tsx`, `[id]/page.tsx`
- Modify: `src/app/app/purchasing/page.tsx` (header link)
- Modify: `src/app/app/purchasing/[id]/page.tsx` (status panel)
- Modify: `src/app/app/goods-inwards/[id]/page.tsx` and `src/app/app/goods-inwards/receipt-detail.tsx` (status panel slot)

**Interfaces:**
- Consumes: Tasks 7, 8, 12, 13 and 17.
- Produces from `labels.ts`:
  - `type BadgeVariant = "default" | "success" | "warning" | "danger" | "info"`
  - `invoiceBadge(status: string, syncStatus: string): { variant: BadgeVariant; label: string }`
  - `jobBadge(status: string, errorClass: string | null): { variant: BadgeVariant; label: string }`
  - `OPERATION_LABELS: Record<string, string>`
  - `INVOICE_TABS: ReadonlyArray<{ key: string; label: string }>`

- [ ] **Step 1: Write the failing label test**

```ts
// src/lib/accounting/supplier-invoice/labels.test.ts
import { describe, expect, it } from "vitest";
import { invoiceBadge, jobBadge } from "./labels";

describe("invoiceBadge", () => {
  it.each([
    ["draft", "not_synced", "Draft", "default"],
    ["posted", "not_synced", "Posted", "default"],
    ["posted", "queued", "Queued for Xero", "info"],
    ["posted", "sent", "Sent to Xero", "success"],
    ["posted", "failed", "Xero sync failed", "danger"],
    ["voided", "queued", "Voiding in Xero", "warning"],
    ["voided", "failed", "Void in Xero failed", "danger"],
    ["voided", "voided_in_xero", "Voided", "default"],
  ])("%s/%s → %s", (status, sync, label, variant) => {
    expect(invoiceBadge(status, sync)).toEqual({ label, variant });
  });
});

describe("jobBadge", () => {
  it.each([
    ["pending", null, "Queued", "info"],
    ["pending", "auth", "Paused: reconnect Xero", "warning"],
    ["working", null, "Sending", "info"],
    ["sent", null, "Sent", "success"],
    ["failed", "fixable", "Needs attention", "danger"],
    ["failed", "transient", "Retrying", "warning"],
    ["failed", "daily_limit", "Waiting for Xero's daily limit", "warning"],
    ["gave_up", "transient", "Stopped retrying", "danger"],
    ["cancelled", null, "Cancelled", "default"],
  ])("%s/%s → %s", (status, cls, label, variant) => {
    expect(jobBadge(status, cls)).toEqual({ label, variant });
  });
});
```

- [ ] **Step 2: Run it and watch it fail, then implement**

Run: `npx vitest run src/lib/accounting/supplier-invoice/labels.test.ts`. Expected: FAIL. Then:

```ts
// src/lib/accounting/supplier-invoice/labels.ts
export type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";
type Badge = { variant: BadgeVariant; label: string };

export function invoiceBadge(status: string, syncStatus: string): Badge {
  if (status === "draft") return { variant: "default", label: "Draft" };
  if (status === "voided") {
    if (syncStatus === "queued") return { variant: "warning", label: "Voiding in Xero" };
    if (syncStatus === "failed") return { variant: "danger", label: "Void in Xero failed" };
    return { variant: "default", label: "Voided" };
  }
  switch (syncStatus) {
    case "sent": return { variant: "success", label: "Sent to Xero" };
    case "queued": return { variant: "info", label: "Queued for Xero" };
    case "failed": return { variant: "danger", label: "Xero sync failed" };
    default: return { variant: "default", label: "Posted" };
  }
}

export function jobBadge(status: string, errorClass: string | null): Badge {
  switch (status) {
    case "pending": return errorClass === "auth" ? { variant: "warning", label: "Paused: reconnect Xero" } : { variant: "info", label: "Queued" };
    case "working": return { variant: "info", label: "Sending" };
    case "sent": return { variant: "success", label: "Sent" };
    case "failed":
      if (errorClass === "fixable") return { variant: "danger", label: "Needs attention" };
      if (errorClass === "daily_limit") return { variant: "warning", label: "Waiting for Xero's daily limit" };
      return { variant: "warning", label: "Retrying" };
    case "gave_up": return { variant: "danger", label: "Stopped retrying" };
    default: return { variant: "default", label: "Cancelled" };
  }
}

export const OPERATION_LABELS: Record<string, string> = { create_bill: "Create bill", void_bill: "Void bill", create_contact: "Create contact" };

export const INVOICE_TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "not_synced", label: "Not synced" },
  { key: "queued", label: "Queued" },
  { key: "sent", label: "Sent" },
  { key: "failed", label: "Failed" },
  { key: "voided", label: "Voided" },
] as const;
```

Run it again. Expected: pass.

- [ ] **Step 3: Add the styles**

```css
/* src/app/app/purchasing/invoices/invoices.module.css */
.page { display: flex; flex-direction: column; gap: 18px; }
.tableCard { composes: tableCard from "../../_ui/table.module.css"; }
.table { composes: table from "../../_ui/table.module.css"; }
.formCard {
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  padding: 18px;
  display: grid;
  gap: 12px;
}
.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.field { display: grid; gap: 4px; font-size: var(--fs-base); color: var(--ink-strong); }
.caps {
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
  color: var(--ink-muted);
}
.input, .select {
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  color: var(--ink-strong);
  padding: 6px 8px;
  font-size: var(--fs-base);
  width: 100%;
}
.num { text-align: right; font-variant-numeric: tabular-nums; }
.variance { color: var(--warning); font-weight: var(--fw-semibold); }
.mismatch { color: var(--warning); font-size: var(--fs-sm); }
.error { color: var(--danger); font-size: var(--fs-sm); margin: 0; }
.help { color: var(--ink-muted); font-size: var(--fs-sm); margin: 0; display: flex; gap: 8px; align-items: center; }
.receiptRow { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: var(--radius-lg); background: var(--surface-1); }
.totals { display: grid; justify-items: end; gap: 4px; font-variant-numeric: tabular-nums; color: var(--ink-strong); }
.tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.tab {
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  font-size: var(--fs-sm);
  color: var(--ink-muted);
  text-decoration: none;
  border: 1px solid var(--stroke-strong);
}
.tabActive { composes: tab; color: var(--ink-strong); background: var(--surface-hover); }
.actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; align-items: center; }
.statusPanel { composes: formCard; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.panelLink { display: inline-flex; gap: 6px; align-items: center; color: var(--ink-strong); text-decoration: none; font-size: var(--fs-sm); }
.link { color: var(--ink-strong); text-decoration: none; font-weight: var(--fw-semibold); }
.backLink { font-size: var(--fs-sm); color: var(--ink-muted); text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
.backLink:hover { color: var(--ink-strong); }
.dialog {
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  padding: 18px;
  width: min(480px, 100%);
}
.primaryBtn { composes: primary from "../../_ui/buttons.module.css"; }
.secondaryBtn { composes: secondary from "../../_ui/buttons.module.css"; }
.dangerBtn { composes: danger from "../../_ui/buttons.module.css"; }
```

- [ ] **Step 4: Status panel (reused on PO and receipt pages)**

```tsx
// src/app/app/purchasing/invoices/invoice-status-panel.tsx
import Link from "next/link";
import StatusBadge from "../../_ui/status-badge";
import { invoiceBadge } from "@/lib/accounting/supplier-invoice/labels";
import styles from "./invoices.module.css";

type Inv = { id: string; invoice_number: string; status: string; sync_status: string };

export default function InvoiceStatusPanel({ invoices, newHref }: { invoices: Inv[]; newHref: string | null }) {
  const live = invoices.filter((i) => i.status !== "voided");
  return (
    <div className={styles.statusPanel}>
      <span className={styles.caps}>Supplier invoice</span>
      {live.length === 0 ? (
        <StatusBadge variant="warning">Not invoiced</StatusBadge>
      ) : (
        live.map((i) => {
          const b = invoiceBadge(i.status, i.sync_status);
          return (
            <Link key={i.id} href={`/app/purchasing/invoices/${i.id}`} className={styles.panelLink}>
              {i.invoice_number} <StatusBadge variant={b.variant}>{b.label}</StatusBadge>
            </Link>
          );
        })
      )}
      {newHref ? <Link href={newHref} className={styles.secondaryBtn}>Enter supplier invoice</Link> : null}
    </div>
  );
}
```

- [ ] **Step 5: Supplier link control**

```tsx
// src/app/app/purchasing/invoices/supplier-link.tsx
"use client";

import { useState, useTransition } from "react";
import { linkSupplierToXeroContact, searchXeroContactsAction } from "./actions";
import styles from "./invoices.module.css";

type Props = { supplierId: string; supplierName: string; linkedName: string | null; onLinked: (name: string) => void };

export default function SupplierLink({ supplierId, supplierName, linkedName, onLinked }: Props) {
  const [editing, setEditing] = useState(!linkedName);
  const [term, setTerm] = useState(supplierName);
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (linkedName && !editing) {
    return (
      <div className={styles.receiptRow}>
        <span className={styles.caps}>Xero contact</span>
        <span>{linkedName}</span>
        <button type="button" className={styles.secondaryBtn} onClick={() => setEditing(true)}>Change</button>
      </div>
    );
  }

  const search = () =>
    start(async () => {
      setMessage(null);
      const r = await searchXeroContactsAction(term);
      if (!r.ok) return setMessage(r.message);
      setResults(r.contacts);
      if (r.contacts.length === 0) setMessage("No matching contacts in Xero.");
    });

  const link = (id: string) =>
    start(async () => {
      const r = await linkSupplierToXeroContact(supplierId, id);
      if (!r.ok) return setMessage(r.message);
      onLinked(r.name);
      setEditing(false);
      setResults([]);
    });

  return (
    <div className={styles.field}>
      <span className={styles.caps}>Link {supplierName} to a Xero contact</span>
      <div className={styles.actions}>
        <input className={styles.input} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search Xero contacts" aria-label="Search Xero contacts" />
        <button type="button" className={styles.secondaryBtn} disabled={pending} onClick={search}>Search</button>
      </div>
      {results.map((c) => (
        <button key={c.id} type="button" className={styles.secondaryBtn} disabled={pending} onClick={() => link(c.id)}>Link to {c.name}</button>
      ))}
      {message ? <p className={styles.help}>{message}</p> : null}
    </div>
  );
}
```

- [ ] **Step 6: Invoice form (client)**

```tsx
// src/app/app/purchasing/invoices/invoice-form.tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dueDateFromTerms } from "@/lib/accounting/supplier-invoice/terms";
import { invoiceTotals, lineAmounts, lineVariance, totalMismatch, type AmountsMode } from "@/lib/accounting/supplier-invoice/calc";
import type { DraftLine } from "@/lib/accounting/supplier-invoice/draft";
import { postSupplierInvoice, saveSupplierInvoiceDraft } from "./actions";
import SupplierLink from "./supplier-link";
import styles from "./invoices.module.css";

export type ReceiptLineOption = { id: string; componentId: string; name: string; sku: string | null; received: number; cost: number; poUnitCost: number | null; taken: boolean };
export type ReceiptOption = { id: string; label: string; lines: ReceiptLineOption[] };
export type TaxOption = { taxType: string | null; name: string; rate: number };
export type AccountOption = { code: string; name: string };
export type XeroDefaults = {
  inventoryAccountCode: string; otherChargesAccountCode: string; purchaseTaxType: string;
  defaultAmountsMode: AmountsMode; contactName: string | null;
};
export type DraftInit = { id: string; invoiceNumber: string; invoiceDate: string; dueDate: string; amountsMode: AmountsMode; enteredTotal: number | null; lines: DraftLine[] };

type Props = {
  supplier: { id: string; name: string; paymentTerms: string | null; currency: string | null };
  purchaseOrderId: string | null;
  receipts: ReceiptOption[];
  preselectedReceiptIds: string[];
  currency: string;
  taxOptions: TaxOption[];
  accountOptions: AccountOption[];
  xeroLoadError: boolean;
  xero: XeroDefaults | null;
  draft: DraftInit | null;
};

type Row = DraftLine & { key: string };
const taxKey = (t: { taxType: string | null; rate: number }) => t.taxType ?? `rate:${t.rate}`;
const today = () => new Date().toLocaleDateString("en-CA"); // local date: the UTC date is yesterday before ~10am in AU
const strip = ({ key, ...line }: Row): DraftLine => { void key; return line; };

export default function InvoiceForm(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [draftId, setDraftId] = useState<string | null>(p.draft?.id ?? null);
  const [invoiceNumber, setInvoiceNumber] = useState(p.draft?.invoiceNumber ?? "");
  const [invoiceDate, setInvoiceDate] = useState(p.draft?.invoiceDate ?? today());
  const [dueDate, setDueDate] = useState(p.draft?.dueDate ?? dueDateFromTerms(today(), p.supplier.paymentTerms));
  const [dueTouched, setDueTouched] = useState(!!p.draft);
  const [mode, setMode] = useState<AmountsMode>(p.draft?.amountsMode ?? p.xero?.defaultAmountsMode ?? "exclusive");
  const [enteredTotal, setEnteredTotal] = useState(p.draft?.enteredTotal?.toString() ?? "");
  const [updateCosts, setUpdateCosts] = useState(true);
  const [createContact, setCreateContact] = useState(false);
  const [contactName, setContactName] = useState<string | null>(p.xero?.contactName ?? null);

  const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: p.currency }).format(n);
  const defaultTax = p.taxOptions.find((t) => t.taxType === p.xero?.purchaseTaxType) ?? p.taxOptions[0];
  const receiptLines = useMemo(() => new Map(p.receipts.flatMap((r) => r.lines.map((l) => [l.id, l] as const))), [p.receipts]);

  const stockRowsFor = (receiptId: string): Row[] =>
    (p.receipts.find((r) => r.id === receiptId)?.lines ?? [])
      .filter((l) => !l.taken)
      .map((l) => ({
        key: l.id, kind: "stock", deliveryReceiptLineId: l.id, componentId: l.componentId,
        description: l.sku ? `${l.sku} ${l.name}` : l.name, quantity: l.received, unitAmount: l.cost,
        taxType: defaultTax?.taxType ?? null, taxRatePercent: defaultTax?.rate ?? 0, accountCode: p.xero?.inventoryAccountCode ?? null,
      }));

  const [selected, setSelected] = useState<Set<string>>(() => {
    if (!p.draft) return new Set(p.preselectedReceiptIds);
    const ids = new Set(p.draft.lines.map((l) => l.deliveryReceiptLineId).filter(Boolean));
    return new Set(p.receipts.filter((r) => r.lines.some((l) => ids.has(l.id))).map((r) => r.id));
  });
  const [rows, setRows] = useState<Row[]>(() =>
    p.draft
      ? p.draft.lines.map((l, i) => ({ ...l, key: l.deliveryReceiptLineId ?? `other-${i}` }))
      : p.preselectedReceiptIds.flatMap(stockRowsFor)
  );

  function toggleReceipt(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
      const ids = new Set(p.receipts.find((r) => r.id === id)?.lines.map((l) => l.id));
      setRows((rs) => rs.filter((r) => !r.deliveryReceiptLineId || !ids.has(r.deliveryReceiptLineId)));
    } else {
      next.add(id);
      setRows((rs) => [...rs, ...stockRowsFor(id)]);
    }
    setSelected(next);
  }
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addOther = () =>
    setRows((rs) => [
      ...rs,
      {
        key: `other-${rs.length}-${invoiceNumber.length}-${Math.random().toString(36).slice(2, 8)}`,
        kind: "other", deliveryReceiptLineId: null, componentId: null, description: "Freight", quantity: 1, unitAmount: 0,
        taxType: defaultTax?.taxType ?? null, taxRatePercent: defaultTax?.rate ?? 0, accountCode: p.xero?.otherChargesAccountCode ?? null,
      },
    ]);

  const computed = rows.map((row) => ({ row, ...lineAmounts({ quantity: row.quantity, unitAmount: row.unitAmount, taxRatePercent: row.taxRatePercent }, mode) }));
  const totals = invoiceTotals(computed, mode);
  const printed = enteredTotal.trim() === "" || Number.isNaN(Number(enteredTotal)) ? null : Number(enteredTotal);
  const mismatch = totalMismatch(totals.total, printed);

  function save(thenPost: boolean) {
    setMessage(null);
    start(async () => {
      const saved = await saveSupplierInvoiceDraft({
        id: draftId, supplierId: p.supplier.id, purchaseOrderId: p.purchaseOrderId, invoiceNumber, invoiceDate, dueDate,
        amountsMode: mode, enteredTotal: printed, currency: p.currency, lines: rows.map(strip),
      });
      if (!saved.ok) return setMessage({ text: saved.message, ok: false });
      setDraftId(saved.id);
      if (!thenPost) {
        router.replace(`/app/purchasing/invoices/new?draft=${saved.id}`);
        return setMessage({ text: "Draft saved.", ok: true });
      }
      const posted = await postSupplierInvoice(saved.id, { updateComponentCosts: updateCosts, createContact });
      if (!posted.ok) {
        router.replace(`/app/purchasing/invoices/new?draft=${saved.id}`);
        return setMessage({ text: posted.message, ok: false });
      }
      router.push(`/app/purchasing/invoices/${saved.id}`);
    });
  }

  return (
    <>
      <div className={styles.formCard}>
        <div className={styles.fields}>
          <div className={styles.field}><span className={styles.caps}>Supplier</span><span>{p.supplier.name}</span></div>
          <label className={styles.field}>
            <span className={styles.caps}>Supplier invoice number</span>
            <input className={styles.input} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} required />
          </label>
          <label className={styles.field}>
            <span className={styles.caps}>Invoice date</span>
            <input type="date" className={styles.input} value={invoiceDate} onChange={(e) => {
              setInvoiceDate(e.target.value);
              if (!dueTouched && e.target.value) setDueDate(dueDateFromTerms(e.target.value, p.supplier.paymentTerms));
            }} />
          </label>
          <label className={styles.field}>
            <span className={styles.caps}>Due date</span>
            <input type="date" className={styles.input} value={dueDate} onChange={(e) => { setDueDate(e.target.value); setDueTouched(true); }} />
          </label>
          <label className={styles.field}>
            <span className={styles.caps}>Amounts are</span>
            <select className={styles.select} value={mode} onChange={(e) => setMode(e.target.value as AmountsMode)}>
              <option value="exclusive">Excluding GST</option>
              <option value="inclusive">Including GST</option>
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.caps}>Total printed on the invoice</span>
            <input inputMode="decimal" className={styles.input} value={enteredTotal} onChange={(e) => setEnteredTotal(e.target.value)} placeholder="Optional cross-check" />
          </label>
        </div>
        {p.xero ? (
          <SupplierLink supplierId={p.supplier.id} supplierName={p.supplier.name} linkedName={contactName} onLinked={(n) => { setContactName(n); setCreateContact(false); }} />
        ) : null}
        {p.xero && !contactName ? (
          <label className={styles.help}>
            <input type="checkbox" checked={createContact} onChange={(e) => setCreateContact(e.target.checked)} />
            Create {p.supplier.name} as a new contact in Xero when posting
          </label>
        ) : null}
        {p.supplier.currency && p.supplier.currency !== p.currency ? (
          <p className={styles.mismatch}>This supplier is set to {p.supplier.currency}. The bill will post in {p.currency}; multi-currency isn&apos;t supported yet.</p>
        ) : null}
        {p.xeroLoadError ? <p className={styles.error}>Couldn&apos;t load tax rates and accounts from Xero. You can save a draft and post once Xero responds.</p> : null}
      </div>

      <div className={styles.formCard}>
        <span className={styles.caps}>Receipts from {p.supplier.name}</span>
        {p.receipts.length === 0 ? (
          <p className={styles.help}>No supplier deliveries recorded for this supplier yet.</p>
        ) : (
          p.receipts.map((r) => {
            const open = r.lines.filter((l) => !l.taken).length;
            return (
              <label key={r.id} className={styles.receiptRow}>
                <input type="checkbox" checked={selected.has(r.id)} disabled={open === 0 && !selected.has(r.id)} onChange={() => toggleReceipt(r.id)} />
                <span>{r.label}</span>
                <span className={styles.help}>{open === 0 ? "Fully invoiced" : `${open} line${open === 1 ? "" : "s"} to invoice`}</span>
              </label>
            );
          })
        )}
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Description</th><th className={styles.num}>Qty</th><th className={styles.num}>Unit price</th><th>Tax</th>
              {p.accountOptions.length ? <th>Account</th> : null}
              <th className={styles.num}>Amount</th><th className={styles.num}>Qty vs received</th><th className={styles.num}>Price vs PO</th><th />
            </tr>
          </thead>
          <tbody>
            {computed.map(({ row, lineAmount, exTaxUnitAmount }) => {
              const src = row.deliveryReceiptLineId ? receiptLines.get(row.deliveryReceiptLineId) : undefined;
              const v = src ? lineVariance({ quantity: row.quantity, exTaxUnitAmount, receivedQty: src.received, poUnitCost: src.poUnitCost }) : null;
              return (
                <tr key={row.key}>
                  <td><input className={styles.input} value={row.description} onChange={(e) => update(row.key, { description: e.target.value })} aria-label="Description" /></td>
                  <td className={styles.num}><input type="number" step="any" min="0" className={styles.input} value={row.quantity} onChange={(e) => update(row.key, { quantity: Number(e.target.value) })} aria-label="Quantity" /></td>
                  <td className={styles.num}><input type="number" step="any" min="0" className={styles.input} value={row.unitAmount} onChange={(e) => update(row.key, { unitAmount: Number(e.target.value) })} aria-label="Unit price" /></td>
                  <td>
                    <select className={styles.select} value={taxKey({ taxType: row.taxType, rate: row.taxRatePercent })} aria-label="Tax rate"
                      onChange={(e) => { const t = p.taxOptions.find((o) => taxKey(o) === e.target.value); if (t) update(row.key, { taxType: t.taxType, taxRatePercent: t.rate }); }}>
                      {p.taxOptions.map((t) => <option key={taxKey(t)} value={taxKey(t)}>{t.name}</option>)}
                    </select>
                  </td>
                  {p.accountOptions.length ? (
                    <td>
                      <select className={styles.select} value={row.accountCode ?? ""} aria-label="Account" onChange={(e) => update(row.key, { accountCode: e.target.value || null })}>
                        {p.accountOptions.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
                      </select>
                    </td>
                  ) : null}
                  <td className={styles.num}>{money(lineAmount)}</td>
                  <td className={`${styles.num} ${v && v.qtyVariance !== 0 ? styles.variance : ""}`}>{v ? (v.qtyVariance === 0 ? "—" : v.qtyVariance > 0 ? `+${v.qtyVariance}` : v.qtyVariance) : ""}</td>
                  <td className={`${styles.num} ${v?.priceVariance ? styles.variance : ""}`}>{v ? (v.priceVariance ? money(v.priceVariance) : "—") : ""}</td>
                  <td>{row.kind === "other" ? <button type="button" className={styles.secondaryBtn} onClick={() => setRows((rs) => rs.filter((x) => x.key !== row.key))}>Remove</button> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.formCard}>
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} onClick={addOther}>Add freight or other charge</button>
        </div>
        <div className={styles.totals}>
          <span>Subtotal {money(totals.subtotal)}</span>
          <span>GST {money(totals.taxTotal)}</span>
          <strong>Total {money(totals.total)}</strong>
          {mismatch && printed !== null ? (
            <span className={styles.mismatch}>Differs from the printed total ({money(printed)}) by {money(Math.abs(totals.total - printed))}.</span>
          ) : null}
        </div>
        <label className={styles.help}>
          <input type="checkbox" checked={updateCosts} onChange={(e) => setUpdateCosts(e.target.checked)} />
          Update component costs to the invoiced price
        </label>
        {message ? <p className={message.ok ? styles.help : styles.error} role="status">{message.text}</p> : null}
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} disabled={pending} onClick={() => save(false)}>Save draft</button>
          <button type="button" className={styles.primaryBtn} disabled={pending || rows.length === 0} onClick={() => save(true)}>
            {pending ? "Working…" : "Post invoice"}
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 7: The "new / edit draft" page**

```tsx
// src/app/app/purchasing/invoices/new/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FALLBACK_TAX_OPTIONS, type AmountsMode } from "@/lib/accounting/supplier-invoice/calc";
import type { DraftLine } from "@/lib/accounting/supplier-invoice/draft";
import { isXeroPilotTenant } from "@/lib/accounting/xero/config";
import { supabaseConnectionRepo } from "@/lib/accounting/connection";
import { xeroAccessFor } from "@/lib/accounting/xero/access";
import { accountOptions, fetchAccounts, fetchTaxRates, INVENTORY_ACCOUNT_TYPES, OTHER_CHARGE_ACCOUNT_TYPES, purchaseTaxOptions } from "@/lib/accounting/xero/org";
import PageHeader from "../../../_ui/page-header";
import EmptyState from "../../../_ui/empty-state";
import InvoiceForm, { type AccountOption, type ReceiptOption, type TaxOption } from "../invoice-form";
import styles from "../invoices.module.css";

type Props = { searchParams?: Promise<{ po?: string; receipt?: string; draft?: string }> };
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export default async function NewSupplierInvoicePage({ searchParams }: Props) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (!ctx.tenantId) redirect("/app");
  const sp = (await searchParams) ?? {};
  const { supabase, tenantId } = ctx;

  type DraftRow = {
    id: string; supplier_id: string; purchase_order_id: string | null; invoice_number: string; invoice_date: string; due_date: string;
    amounts_mode: AmountsMode; entered_total: number | null; status: string;
    supplier_invoice_line: Array<{ line_no: number; kind: "stock" | "other"; delivery_receipt_line_id: string | null; component_id: string | null; description: string; quantity: number; unit_amount: number; tax_type: string | null; tax_rate: number; account_code: string | null }>;
  };
  let draft: DraftRow | null = null;
  if (sp.draft) {
    const { data } = await supabase
      .from("supplier_invoice")
      .select("id, supplier_id, purchase_order_id, invoice_number, invoice_date, due_date, amounts_mode, entered_total, status, supplier_invoice_line(line_no, kind, delivery_receipt_line_id, component_id, description, quantity, unit_amount, tax_type, tax_rate, account_code)")
      .eq("id", sp.draft)
      .maybeSingle();
    if (!data) redirect("/app/purchasing/invoices");
    if ((data as DraftRow).status !== "draft") redirect(`/app/purchasing/invoices/${sp.draft}`);
    draft = data as DraftRow;
  }

  let supplierId = draft?.supplier_id ?? null;
  let poId = draft?.purchase_order_id ?? sp.po ?? null;
  const preselect: string[] = [];
  if (!supplierId && sp.receipt) {
    const { data } = await supabase.from("delivery_receipt").select("id, supplier_id, purchase_order_id, stock_in_reason").eq("id", sp.receipt).maybeSingle();
    const r = data as { id: string; supplier_id: string | null; purchase_order_id: string | null; stock_in_reason: string | null } | null;
    if (r && r.stock_in_reason === "supplier_delivery") {
      supplierId = r.supplier_id;
      poId = poId ?? r.purchase_order_id;
      preselect.push(r.id);
    }
  }
  if (!supplierId && sp.po) {
    const { data } = await supabase.from("purchase_order").select("supplier_id").eq("id", sp.po).maybeSingle();
    supplierId = (data as { supplier_id: string } | null)?.supplier_id ?? null;
  }

  const header = (
    <PageHeader
      eyebrow="Operations"
      breadcrumbs={[{ label: "Supplier invoices", href: "/app/purchasing/invoices" }, { label: draft ? draft.invoice_number : "New" }]}
      title={draft ? `Edit draft ${draft.invoice_number}` : "Enter supplier invoice"}
      description="Record the supplier's tax invoice against what was received."
    />
  );
  if (!supplierId) {
    return (
      <section className={styles.page}>
        {header}
        <EmptyState title="Start from a purchase order or goods receipt" message="Open a PO or a supplier delivery and choose “Enter supplier invoice”." />
      </section>
    );
  }

  const [{ data: supplier }, { data: receiptRows }, { data: conn }, { data: link }, { data: tenant }] = await Promise.all([
    supabase.from("supplier").select("id, name, payment_terms, default_currency").eq("id", supplierId).maybeSingle(),
    supabase
      .from("delivery_receipt")
      .select("id, supplier_reference, received_at, purchase_order_id, purchase_order:purchase_order_id(po_number), delivery_receipt_line(id, component_id, quantity_delivered, cost_per_unit, component:component_id(name, sku), purchase_order_line:purchase_order_line_id(unit_cost))")
      .eq("supplier_id", supplierId)
      .eq("stock_in_reason", "supplier_delivery")
      .order("received_at", { ascending: false })
      .limit(50),
    supabase.from("accounting_connection").select("status, setup_completed_at, base_currency, inventory_account_code, other_charges_account_code, purchase_tax_type, default_amounts_mode").eq("provider", "xero").maybeSingle(),
    supabase.from("accounting_contact_link").select("external_name").eq("provider", "xero").eq("supplier_id", supplierId).maybeSingle(),
    supabase.from("tenant").select("currency").eq("id", tenantId).maybeSingle(),
  ]);
  if (!supplier) redirect("/app/purchasing/invoices");

  type RLine = { id: string; component_id: string; quantity_delivered: number; cost_per_unit: number | null; component: unknown; purchase_order_line: unknown };
  type RRow = { id: string; supplier_reference: string | null; received_at: string | null; purchase_order_id: string | null; purchase_order: unknown; delivery_receipt_line: RLine[] };
  const rows = (receiptRows ?? []) as RRow[];
  if (poId) for (const r of rows) if (r.purchase_order_id === poId && !preselect.includes(r.id)) preselect.push(r.id);

  const lineIds = rows.flatMap((r) => r.delivery_receipt_line.map((l) => l.id));
  const { data: taken } = lineIds.length
    ? await supabase.from("supplier_invoice_line").select("delivery_receipt_line_id, supplier_invoice:supplier_invoice_id(id, status)").in("delivery_receipt_line_id", lineIds)
    : { data: [] as unknown[] };
  const takenSet = new Set(
    ((taken ?? []) as Array<{ delivery_receipt_line_id: string; supplier_invoice: unknown }>)
      .filter((t) => { const si = one(t.supplier_invoice as { id: string; status: string } | null); return si?.status === "posted" && si.id !== draft?.id; })
      .map((t) => t.delivery_receipt_line_id)
  );

  const receipts: ReceiptOption[] = rows.map((r) => ({
    id: r.id,
    label: [r.supplier_reference ?? "Receipt", one(r.purchase_order as { po_number: string | null } | null)?.po_number, r.received_at?.slice(0, 10)].filter(Boolean).join(" · "),
    lines: r.delivery_receipt_line.map((l) => {
      const c = one(l.component as { name: string; sku: string | null } | null);
      return {
        id: l.id, componentId: l.component_id, name: c?.name ?? "Component", sku: c?.sku ?? null,
        received: Number(l.quantity_delivered), cost: Number(l.cost_per_unit ?? 0),
        poUnitCost: one(l.purchase_order_line as { unit_cost: number | null } | null)?.unit_cost ?? null,
        taken: takenSet.has(l.id),
      };
    }),
  }));

  const c = conn as { status: string; setup_completed_at: string | null; base_currency: string; inventory_account_code: string; other_charges_account_code: string; purchase_tax_type: string; default_amounts_mode: AmountsMode } | null;
  const xeroOn = isXeroPilotTenant(tenantId) && c?.status === "connected" && !!c.setup_completed_at;
  let taxOptions: TaxOption[] = FALLBACK_TAX_OPTIONS.map((t) => ({ ...t }));
  let accounts: AccountOption[] = [];
  let xeroLoadError = false;
  if (xeroOn) {
    try {
      const db = createSupabaseAdminClient();
      const full = await supabaseConnectionRepo(db).findByTenant(tenantId);
      const access = await xeroAccessFor(db, full!);
      const [t, a] = await Promise.all([fetchTaxRates(access), fetchAccounts(access)]);
      if (t.ok && a.ok) {
        taxOptions = purchaseTaxOptions(t.data.TaxRates ?? []);
        accounts = [...accountOptions(a.data.Accounts ?? [], INVENTORY_ACCOUNT_TYPES), ...accountOptions(a.data.Accounts ?? [], OTHER_CHARGE_ACCOUNT_TYPES)].map((x) => ({ code: x.code, name: x.name }));
      } else xeroLoadError = true;
    } catch {
      xeroLoadError = true;
    }
  }

  const s = supplier as { id: string; name: string | null; payment_terms: string | null; default_currency: string | null };
  return (
    <section className={styles.page}>
      {header}
      <InvoiceForm
        supplier={{ id: s.id, name: s.name ?? "Supplier", paymentTerms: s.payment_terms, currency: s.default_currency }}
        purchaseOrderId={poId}
        receipts={receipts}
        preselectedReceiptIds={preselect}
        currency={c?.base_currency ?? (tenant as { currency: string | null } | null)?.currency ?? "AUD"}
        taxOptions={taxOptions}
        accountOptions={accounts}
        xeroLoadError={xeroLoadError}
        xero={xeroOn && c ? {
          inventoryAccountCode: c.inventory_account_code, otherChargesAccountCode: c.other_charges_account_code,
          purchaseTaxType: c.purchase_tax_type, defaultAmountsMode: c.default_amounts_mode,
          contactName: (link as { external_name: string } | null)?.external_name ?? null,
        } : null}
        draft={draft ? {
          id: draft.id, invoiceNumber: draft.invoice_number, invoiceDate: draft.invoice_date, dueDate: draft.due_date,
          amountsMode: draft.amounts_mode, enteredTotal: draft.entered_total === null ? null : Number(draft.entered_total),
          lines: [...draft.supplier_invoice_line].sort((a, b) => a.line_no - b.line_no).map((l): DraftLine => ({
            kind: l.kind, deliveryReceiptLineId: l.delivery_receipt_line_id, componentId: l.component_id, description: l.description,
            quantity: Number(l.quantity), unitAmount: Number(l.unit_amount), taxType: l.tax_type, taxRatePercent: Number(l.tax_rate), accountCode: l.account_code,
          })),
        } : null}
      />
      <Link href="/app/purchasing/invoices" className={styles.backLink}>← Back to supplier invoices</Link>
    </section>
  );
}
```

- [ ] **Step 8: Detail page and its client actions**

```tsx
// src/app/app/purchasing/invoices/invoice-actions.tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { voidSupplierInvoice } from "./actions";
import { retryAccountingJob } from "../../settings/integrations/xero/actions";
import styles from "./invoices.module.css";

export default function InvoiceActions({ invoiceId, canVoid, retryJobId }: { invoiceId: string; canVoid: boolean; retryJobId: string | null }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const doVoid = () =>
    start(async () => {
      const r = await voidSupplierInvoice(invoiceId, reason);
      if (!r.ok) return setMessage(r.message);
      dialog.current?.close();
      router.refresh();
    });
  const doRetry = () =>
    start(async () => {
      const r = await retryAccountingJob(retryJobId!);
      if (!r.ok) return setMessage(r.message ?? "Couldn't retry.");
      router.refresh();
    });

  if (!canVoid && !retryJobId) return null;
  return (
    <div className={styles.actions}>
      {message ? <p className={styles.error} role="status">{message}</p> : null}
      {retryJobId ? <button type="button" className={styles.secondaryBtn} disabled={pending} onClick={doRetry}>Retry sending to Xero</button> : null}
      {canVoid ? <button type="button" className={styles.dangerBtn} onClick={() => dialog.current?.showModal()}>Void invoice</button> : null}
      <dialog ref={dialog} className={styles.dialog}>
        <div className={styles.field}>
          <label className={styles.caps} htmlFor="void-reason">Reason for voiding</label>
          <textarea id="void-reason" className={styles.input} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className={styles.help}>The bill is deleted or voided in Xero, and the receipt lines can be invoiced again.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="button" className={styles.dangerBtn} disabled={pending || !reason.trim()} onClick={doVoid}>Void invoice</button>
        </div>
      </dialog>
    </div>
  );
}
```

```tsx
// src/app/app/purchasing/invoices/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { isAdminRole } from "@/lib/tenant/authz";
import { invoiceBadge, jobBadge, OPERATION_LABELS } from "@/lib/accounting/supplier-invoice/labels";
import PageHeader from "../../../_ui/page-header";
import StatusBadge from "../../../_ui/status-badge";
import InvoiceActions from "../invoice-actions";
import styles from "../invoices.module.css";

type Props = { params: Promise<{ id: string }> };
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export default async function SupplierInvoicePage({ params }: Props) {
  const { id } = await params;
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  const { supabase } = ctx;
  const { data } = await supabase
    .from("supplier_invoice")
    .select("id, invoice_number, invoice_date, due_date, amounts_mode, currency, subtotal, tax_total, total, entered_total, status, sync_status, external_url, posted_at, voided_at, void_reason, purchase_order_id, supplier:supplier_id(name), purchase_order:purchase_order_id(po_number), supplier_invoice_line(line_no, kind, description, quantity, unit_amount, tax_type, tax_rate, account_code, line_amount, tax_amount, qty_variance, price_variance)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const inv = data as Record<string, unknown> & {
    invoice_number: string; status: string; sync_status: string; currency: string; external_url: string | null;
    supplier_invoice_line: Array<Record<string, unknown> & { line_no: number }>;
  };
  if (inv.status === "draft") redirect(`/app/purchasing/invoices/new?draft=${id}`);

  const { data: jobs } = await supabase
    .from("accounting_outbox")
    .select("id, operation, status, error_class, error_message, created_at")
    .eq("entity_type", "supplier_invoice")
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(5);
  const latest = ((jobs ?? []) as Array<{ id: string; operation: string; status: string; error_class: string | null; error_message: string | null }>)[0];
  const admin = isAdminRole(ctx.role);
  const money = (n: unknown) => new Intl.NumberFormat("en-AU", { style: "currency", currency: inv.currency }).format(Number(n ?? 0));
  const badge = invoiceBadge(inv.status, inv.sync_status);
  const supplierName = one(inv.supplier as { name: string | null } | null)?.name ?? "Supplier";
  const poNumber = one(inv.purchase_order as { po_number: string | null } | null)?.po_number;
  const lines = [...inv.supplier_invoice_line].sort((a, b) => a.line_no - b.line_no);

  return (
    <section className={styles.page}>
      <PageHeader
        eyebrow="Operations"
        breadcrumbs={[{ label: "Supplier invoices", href: "/app/purchasing/invoices" }, { label: inv.invoice_number }]}
        title={`${supplierName} · ${inv.invoice_number}`}
        actions={inv.external_url ? <a href={inv.external_url} target="_blank" rel="noreferrer" className={styles.secondaryBtn}>View in Xero ↗</a> : undefined}
      />
      <div className={styles.formCard}>
        <div className={styles.fields}>
          <div className={styles.field}><span className={styles.caps}>Status</span><StatusBadge variant={badge.variant}>{badge.label}</StatusBadge></div>
          <div className={styles.field}><span className={styles.caps}>Purchase order</span>{poNumber && inv.purchase_order_id ? <Link className={styles.link} href={`/app/purchasing/${inv.purchase_order_id as string}`}>{poNumber}</Link> : <span>—</span>}</div>
          <div className={styles.field}><span className={styles.caps}>Invoice date</span><span>{String(inv.invoice_date)}</span></div>
          <div className={styles.field}><span className={styles.caps}>Due date</span><span>{String(inv.due_date)}</span></div>
          <div className={styles.field}><span className={styles.caps}>Amounts</span><span>{inv.amounts_mode === "inclusive" ? "Including GST" : "Excluding GST"}</span></div>
          <div className={styles.field}><span className={styles.caps}>Total</span><span>{money(inv.total)}</span></div>
        </div>
        {inv.void_reason ? <p className={styles.help}>Voided: {String(inv.void_reason)}</p> : null}
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr><th>Description</th><th className={styles.num}>Qty</th><th className={styles.num}>Unit price</th><th>Tax</th><th>Account</th><th className={styles.num}>Amount</th><th className={styles.num}>Qty vs received</th><th className={styles.num}>Price vs PO</th></tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.line_no}>
                <td>{String(l.description)}</td>
                <td className={styles.num}>{Number(l.quantity)}</td>
                <td className={styles.num}>{money(l.unit_amount)}</td>
                <td>{(l.tax_type as string | null) ?? `${Number(l.tax_rate)}%`}</td>
                <td>{(l.account_code as string | null) ?? "—"}</td>
                <td className={styles.num}>{money(l.line_amount)}</td>
                <td className={`${styles.num} ${Number(l.qty_variance ?? 0) !== 0 ? styles.variance : ""}`}>{l.qty_variance === null ? "" : Number(l.qty_variance) === 0 ? "—" : Number(l.qty_variance)}</td>
                <td className={`${styles.num} ${Number(l.price_variance ?? 0) !== 0 ? styles.variance : ""}`}>{l.price_variance === null ? "" : Number(l.price_variance) === 0 ? "—" : money(l.price_variance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {latest ? (
        <div className={styles.formCard}>
          <span className={styles.caps}>Xero</span>
          <div className={styles.receiptRow}>
            <span>{OPERATION_LABELS[latest.operation] ?? latest.operation}</span>
            <StatusBadge variant={jobBadge(latest.status, latest.error_class).variant}>{jobBadge(latest.status, latest.error_class).label}</StatusBadge>
            {latest.error_message ? <span className={styles.help}>{latest.error_message}</span> : null}
          </div>
        </div>
      ) : null}

      <InvoiceActions
        invoiceId={id}
        canVoid={admin && inv.status === "posted"}
        retryJobId={admin && latest && (latest.status === "gave_up" || (latest.status === "failed" && latest.error_class === "fixable")) ? latest.id : null}
      />
      <Link href="/app/purchasing/invoices" className={styles.backLink}>← Back to supplier invoices</Link>
    </section>
  );
}
```

- [ ] **Step 9: List page**

```tsx
// src/app/app/purchasing/invoices/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { INVOICE_TABS, invoiceBadge } from "@/lib/accounting/supplier-invoice/labels";
import PageHeader from "../../_ui/page-header";
import StatusBadge from "../../_ui/status-badge";
import EmptyState from "../../_ui/empty-state";
import styles from "./invoices.module.css";

type Props = { searchParams?: Promise<{ tab?: string }> };
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export default async function SupplierInvoicesPage({ searchParams }: Props) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  const tab = INVOICE_TABS.some((t) => t.key === (await searchParams)?.tab) ? (await searchParams)!.tab! : "all";

  let q = ctx.supabase
    .from("supplier_invoice")
    .select("id, invoice_number, invoice_date, due_date, total, currency, status, sync_status, external_url, purchase_order_id, supplier:supplier_id(name), purchase_order:purchase_order_id(po_number)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (tab === "draft" || tab === "voided") q = q.eq("status", tab);
  else if (tab !== "all") q = q.eq("status", "posted").eq("sync_status", tab);
  const { data } = await q;
  const rows = (data ?? []) as Array<Record<string, unknown> & { id: string; status: string; sync_status: string; currency: string; external_url: string | null; purchase_order_id: string | null }>;

  return (
    <section className={styles.page}>
      <PageHeader eyebrow="Operations" title="Supplier invoices" description="Supplier tax invoices recorded against goods receipts, and their bills in Xero." />
      <nav className={styles.tabs} aria-label="Filter invoices">
        {INVOICE_TABS.map((t) => (
          <Link key={t.key} href={t.key === "all" ? "/app/purchasing/invoices" : `/app/purchasing/invoices?tab=${t.key}`} className={t.key === tab ? styles.tabActive : styles.tab}>{t.label}</Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="No supplier invoices here" message="Open a purchase order or a supplier delivery and choose “Enter supplier invoice”." />
      ) : (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr><th>Invoice</th><th>Supplier</th><th>PO</th><th>Invoice date</th><th>Due</th><th className={styles.num}>Total</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const b = invoiceBadge(r.status, r.sync_status);
                return (
                  <tr key={r.id}>
                    <td><Link className={styles.link} href={`/app/purchasing/invoices/${r.id}`}>{String(r.invoice_number)}</Link></td>
                    <td>{one(r.supplier as { name: string | null } | null)?.name ?? "—"}</td>
                    <td>{one(r.purchase_order as { po_number: string | null } | null)?.po_number ?? "—"}</td>
                    <td>{String(r.invoice_date)}</td>
                    <td>{String(r.due_date)}</td>
                    <td className={styles.num}>{new Intl.NumberFormat("en-AU", { style: "currency", currency: r.currency }).format(Number(r.total))}</td>
                    <td><StatusBadge variant={b.variant}>{b.label}</StatusBadge></td>
                    <td>{r.external_url ? <a className={styles.link} href={r.external_url} target="_blank" rel="noreferrer">Xero ↗</a> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 10: Wire the entry points**

1. **Purchasing list.** In `src/app/app/purchasing/page.tsx`, inside the existing `<div className={styles.headerActions}>` in `PageHeader actions`, add as the first child:

```tsx
<Link href="/app/purchasing/invoices" className={styles.secondary}>Supplier invoices</Link>
```

Check that `Link` is imported, and that `styles.secondary` exists in `purchasing.module.css`. It is used on the PO detail page; if it is missing there, add `.secondary { composes: secondary from "../_ui/buttons.module.css"; }`.

2. **PO detail.** In `src/app/app/purchasing/[id]/page.tsx`, after the receipts query, add:

```tsx
const { data: poInvoices } = await supabase
  .from("supplier_invoice")
  .select("id, invoice_number, status, sync_status")
  .eq("purchase_order_id", id)
  .order("created_at");
```

Directly after the closing `/>` of `<PageHeader … />`, render:

```tsx
<InvoiceStatusPanel invoices={(poInvoices ?? []) as Array<{ id: string; invoice_number: string; status: string; sync_status: string }>} newHref={`/app/purchasing/invoices/new?po=${id}`} />
```

Import: `import InvoiceStatusPanel from "../invoices/invoice-status-panel";`.

3. **Receipt detail.** In `src/app/app/goods-inwards/receipt-detail.tsx`:
   - Add `invoiceSlot` to the props destructuring: `invoiceSlot,` and in the type `invoiceSlot?: React.ReactNode;`.
   - Render `{invoiceSlot}` as the first child of the component's outermost returned element.

   In `src/app/app/goods-inwards/[id]/page.tsx`, before `return`, add:

```tsx
const lineIds = ((receipt.delivery_receipt_line ?? []) as Array<{ id: string }>).map((l) => l.id);
const { data: invLines } = lineIds.length
  ? await supabase.from("supplier_invoice_line").select("supplier_invoice:supplier_invoice_id(id, invoice_number, status, sync_status)").in("delivery_receipt_line_id", lineIds)
  : { data: [] as unknown[] };
const receiptInvoices = [...new Map(
  ((invLines ?? []) as Array<{ supplier_invoice: unknown }>)
    .map((r) => (Array.isArray(r.supplier_invoice) ? r.supplier_invoice[0] : r.supplier_invoice) as { id: string; invoice_number: string; status: string; sync_status: string } | null)
    .filter((x): x is { id: string; invoice_number: string; status: string; sync_status: string } => !!x)
    .map((x) => [x.id, x] as const)
).values()];
const invoiceable = receipt.stock_in_reason === "supplier_delivery" && !!receipt.supplier_id;
```

   Then pass:

```tsx
invoiceSlot={invoiceable || receiptInvoices.length ? <InvoiceStatusPanel invoices={receiptInvoices} newHref={invoiceable ? `/app/purchasing/invoices/new?receipt=${receipt.id}` : null} /> : null}
```

   Import: `import InvoiceStatusPanel from "../../purchasing/invoices/invoice-status-panel";`. If that page names its Supabase client differently, use whatever name it declares. If `delivery_receipt_line` isn't in its select, add `delivery_receipt_line(id)` to it.

- [ ] **Step 11: Verify**

```bash
npx tsc --noEmit
npx eslint src/app/app/purchasing src/app/app/goods-inwards src/lib/accounting/supplier-invoice
npm test
```

Expected: clean and green. Then run the app (`npm run dev`) and walk the flow on a tenant **without** Xero:
1. Open a PO with a supplier delivery → "Enter supplier invoice" → receipt preselected → set an invoice number → Post.
2. Expect status "Posted", with receipt line cost updated.
3. Re-enter the same number for the same supplier → "This supplier already has an invoice with that number."

Do this with the browser tools and record the result in the commit body.

- [ ] **Step 12: Commit**

```bash
git add src/lib/accounting/supplier-invoice/labels.ts src/lib/accounting/supplier-invoice/labels.test.ts src/app/app/purchasing src/app/app/goods-inwards/receipt-detail.tsx "src/app/app/goods-inwards/[id]/page.tsx"
git commit -m "MANUVA-34 feat(invoices): supplier invoice screens with PO and receipt status"
```

---

# Chunk G — Scheduling, health and surfaces

### Task 19: Cron routes, token maintenance, alert email, schedule

**Files:**
- Create: `src/lib/accounting/maintenance.ts`
- Test: `src/lib/accounting/maintenance.test.ts`
- Create: `src/lib/accounting/alerts.tsx`, `src/lib/email/templates/xero-attention.tsx`
- Create: `src/app/api/cron/accounting-outbox/route.ts`, `src/app/api/cron/accounting-maintenance/route.ts`
- Create: `supabase/patches/2026-10-01-xero-cron-schedule.sql`

**Interfaces:**
- Consumes: `processDueOutboxes` (Task 16), `xeroAccessFor` (Task 12), `sendEmail`.
- Produces:
  - `REFRESH_EVERY_MS`, `ALERT_EVERY_MS`
  - `type MaintenanceConnection = { id: string; tenant_id: string; external_org_id: string; org_name: string; status: string; connected_by: string | null; last_refreshed_at: string | null; last_alert_at: string | null }`
  - `isRefreshDue(c, now): boolean`
  - `alertKind(c, problemJobs, now): "reconnect" | "failed" | null`
  - `type AlertSender = (c: MaintenanceConnection, kind: "reconnect" | "failed", problemJobs: number) => Promise<boolean>`
  - `refreshStaleTokens(db, deps?): Promise<{ refreshed: number; refreshFailed: number }>`
  - `sendDueAlerts(db, deps: { sendAlert: AlertSender; now?: () => Date }): Promise<{ alerted: number }>`
  - `emailAlertSender(db, baseUrl): AlertSender`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/accounting/maintenance.test.ts
import { describe, expect, it } from "vitest";
import { alertKind, isRefreshDue, type MaintenanceConnection } from "./maintenance";

const now = new Date("2026-10-08T00:00:00Z");
const c = (p: Partial<MaintenanceConnection> = {}): MaintenanceConnection => ({
  id: "c1", tenant_id: "t1", external_org_id: "o1", org_name: "Acme", status: "connected", connected_by: "u1",
  last_refreshed_at: "2026-10-07T00:00:00Z", last_alert_at: null, ...p,
});

describe("isRefreshDue", () => {
  it("refreshes connected tokens older than 7 days, or never refreshed", () => {
    expect(isRefreshDue(c(), now)).toBe(false);
    expect(isRefreshDue(c({ last_refreshed_at: "2026-09-30T23:59:00Z" }), now)).toBe(true);
    expect(isRefreshDue(c({ last_refreshed_at: null }), now)).toBe(true);
    expect(isRefreshDue(c({ status: "needs_reconnect", last_refreshed_at: null }), now)).toBe(false);
  });
});

describe("alertKind", () => {
  it("alerts on reconnect or problem jobs, at most once per 24h, only with a recipient", () => {
    expect(alertKind(c({ status: "needs_reconnect" }), 0, now)).toBe("reconnect");
    expect(alertKind(c(), 2, now)).toBe("failed");
    expect(alertKind(c(), 0, now)).toBeNull();
    expect(alertKind(c({ status: "needs_reconnect", last_alert_at: "2026-10-07T12:00:00Z" }), 0, now)).toBeNull();
    expect(alertKind(c({ status: "needs_reconnect", last_alert_at: "2026-10-06T23:00:00Z" }), 0, now)).toBe("reconnect");
    expect(alertKind(c({ status: "needs_reconnect", connected_by: null }), 0, now)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/accounting/maintenance.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement maintenance, alerts and the email template**

```ts
// src/lib/accounting/maintenance.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { xeroAccessFor } from "./xero/access";
import { scrubSecrets } from "./xero/scrub";

export const REFRESH_EVERY_MS = 7 * 86_400_000;
export const ALERT_EVERY_MS = 86_400_000;
const PROBLEM_WINDOW_MS = 7 * 86_400_000;

export type MaintenanceConnection = {
  id: string; tenant_id: string; external_org_id: string; org_name: string; status: string;
  connected_by: string | null; last_refreshed_at: string | null; last_alert_at: string | null;
};
export type AlertSender = (c: MaintenanceConnection, kind: "reconnect" | "failed", problemJobs: number) => Promise<boolean>;

export function isRefreshDue(c: Pick<MaintenanceConnection, "status" | "last_refreshed_at">, now: Date): boolean {
  return c.status === "connected" && (!c.last_refreshed_at || now.getTime() - Date.parse(c.last_refreshed_at) > REFRESH_EVERY_MS);
}

export function alertKind(c: MaintenanceConnection, problemJobs: number, now: Date): "reconnect" | "failed" | null {
  if (!c.connected_by) return null;
  if (c.last_alert_at && now.getTime() - Date.parse(c.last_alert_at) < ALERT_EVERY_MS) return null;
  if (c.status === "needs_reconnect") return "reconnect";
  if (c.status === "connected" && problemJobs > 0) return "failed";
  return null;
}

async function liveConnections(db: SupabaseClient): Promise<MaintenanceConnection[]> {
  const { data, error } = await db
    .from("accounting_connection")
    .select("id, tenant_id, external_org_id, org_name, status, connected_by, last_refreshed_at, last_alert_at")
    .neq("status", "disconnected");
  assertNoError(error, "list accounting connections");
  return (data ?? []) as MaintenanceConnection[];
}

export async function refreshStaleTokens(
  db: SupabaseClient,
  deps: { now?: () => Date; refresh?: (c: MaintenanceConnection) => Promise<void> } = {}
): Promise<{ refreshed: number; refreshFailed: number }> {
  const now = deps.now ?? (() => new Date());
  const refresh = deps.refresh ?? (async (c) => { await xeroAccessFor(db, c, { forceRefresh: true }); });
  const out = { refreshed: 0, refreshFailed: 0 };
  for (const c of await liveConnections(db)) {
    if (!isRefreshDue(c, now())) continue;
    try {
      await refresh(c);
      out.refreshed++;
    } catch (err) {
      // XeroAuthError has already marked the connection needs_reconnect; sendDueAlerts emails about it.
      out.refreshFailed++;
      console.error("[xero] scheduled refresh failed", c.id, scrubSecrets(err instanceof Error ? err.message : String(err)));
    }
  }
  return out;
}

export async function sendDueAlerts(db: SupabaseClient, deps: { sendAlert: AlertSender; now?: () => Date }): Promise<{ alerted: number }> {
  const now = deps.now ?? (() => new Date());
  let alerted = 0;
  for (const c of await liveConnections(db)) {
    const since = new Date(now().getTime() - PROBLEM_WINDOW_MS).toISOString();
    const { count, error } = await db
      .from("accounting_outbox")
      .select("id", { count: "exact", head: true })
      .eq("connection_id", c.id)
      .gte("created_at", since)
      .or("status.eq.gave_up,and(status.eq.failed,error_class.eq.fixable)");
    assertNoError(error, "count problem jobs");
    const kind = alertKind(c, count ?? 0, now());
    if (!kind) continue;
    if (await deps.sendAlert(c, kind, count ?? 0)) {
      const { error: ue } = await db.from("accounting_connection").update({ last_alert_at: now().toISOString() }).eq("id", c.id);
      assertNoError(ue, "record alert sent");
      alerted++;
    }
  }
  return { alerted };
}
```

```tsx
// src/lib/email/templates/xero-attention.tsx
export interface XeroAttentionProps {
  tenantName: string;
  orgName: string;
  kind: "reconnect" | "failed";
  problemCount: number;
  settingsUrl: string;
}

export function XeroAttention({ tenantName, orgName, kind, problemCount, settingsUrl }: XeroAttentionProps) {
  return (
    <div style={wrapper}>
      <h1 style={h1}>{kind === "reconnect" ? "Xero needs reconnecting" : "Some bills didn't reach Xero"}</h1>
      <p style={p}>
        {kind === "reconnect" ? (
          <>Manuva can no longer post to <strong>{orgName}</strong> for <strong>{tenantName}</strong>. Bills are paused, and nothing is lost: they send as soon as an admin reconnects.</>
        ) : (
          <>{problemCount} item{problemCount === 1 ? "" : "s"} for <strong>{tenantName}</strong> couldn&apos;t be sent to <strong>{orgName}</strong>. Each one says what to fix.</>
        )}
      </p>
      <p style={{ margin: "28px 0" }}>
        <a href={settingsUrl} style={button}>Open Integrations →</a>
      </p>
      <p style={small}>You're receiving this because you connected Xero to Manuva. We send at most one of these a day.</p>
    </div>
  );
}

const wrapper: React.CSSProperties = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  maxWidth: 560, margin: "0 auto", padding: "32px 20px", color: "#0F172A", lineHeight: 1.55,
};
const h1: React.CSSProperties = { fontSize: 22, fontWeight: 700, margin: "0 0 16px" };
const p: React.CSSProperties = { fontSize: 15, margin: "0 0 12px" };
const button: React.CSSProperties = { display: "inline-block", padding: "12px 20px", borderRadius: 999, background: "#0F172A", color: "#FFFFFF", textDecoration: "none", fontWeight: 600 };
const small: React.CSSProperties = { fontSize: 13, color: "#64748B" };
```

Before writing `p`, `button` and `small`, copy their exact values from `src/lib/email/templates/trial-expired.tsx` so the two emails match. Inline styles and hex colours are the email convention there; the in-app design system rules don't apply to email HTML.

```tsx
// src/lib/accounting/alerts.tsx
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/send";
import { XeroAttention } from "@/lib/email/templates/xero-attention";
import type { AlertSender } from "./maintenance";

export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://app.manuva.app";
}

export function emailAlertSender(db: SupabaseClient, baseUrl: string): AlertSender {
  return async (c, kind, problemCount) => {
    if (!c.connected_by) return false;
    const { data: u, error } = await db.auth.admin.getUserById(c.connected_by);
    if (error || !u.user?.email) return false;
    const { data: t } = await db.from("tenant").select("name").eq("id", c.tenant_id).maybeSingle();
    const r = await sendEmail({
      to: u.user.email,
      subject: kind === "reconnect" ? "Xero needs reconnecting in Manuva" : "Some bills didn't reach Xero",
      react: (
        <XeroAttention
          tenantName={(t as { name?: string } | null)?.name ?? "your workspace"}
          orgName={c.org_name}
          kind={kind}
          problemCount={problemCount}
          settingsUrl={`${baseUrl}/app/settings/integrations`}
        />
      ),
    });
    if (!r.ok) console.error("[xero] alert email failed", r.error);
    return r.ok;
  };
}
```

- [ ] **Step 4: Cron routes**

```ts
// src/app/api/cron/accounting-outbox/route.ts
// Every 5 minutes, called by Supabase pg_cron + pg_net (see
// supabase/patches/2026-10-01-xero-cron-schedule.sql). The Vercel team is on Hobby, so Vercel Cron can't run this often.
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processDueOutboxes } from "@/lib/accounting/outbox/process";
import { sendDueAlerts } from "@/lib/accounting/maintenance";
import { appBaseUrl, emailAlertSender } from "@/lib/accounting/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const db = createSupabaseAdminClient();
  const outbox = await processDueOutboxes({ db }, 40_000);
  const alerts = await sendDueAlerts(db, { sendAlert: emailAlertSender(db, appBaseUrl()) });
  return NextResponse.json({ ...outbox, ...alerts });
}

export const GET = handle;
export const POST = handle;
```

```ts
// src/app/api/cron/accounting-maintenance/route.ts
// Daily, called by Supabase pg_cron + pg_net. Keeps quiet connections inside Xero's 60-day refresh window.
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { refreshStaleTokens, sendDueAlerts } from "@/lib/accounting/maintenance";
import { appBaseUrl, emailAlertSender } from "@/lib/accounting/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const db = createSupabaseAdminClient();
  const refreshed = await refreshStaleTokens(db);
  const alerts = await sendDueAlerts(db, { sendAlert: emailAlertSender(db, appBaseUrl()) });
  return NextResponse.json({ ...refreshed, ...alerts });
}

export const GET = handle;
export const POST = handle;
```

- [ ] **Step 5: Schedule patch (applied in Task 22, after the Vault secrets exist)**

```sql
-- supabase/patches/2026-10-01-xero-cron-schedule.sql
-- ---------------------------------------------------------------------
-- MANUVA-34 — schedule the accounting outbox (every 5 min) and maintenance
-- (daily 17:00 UTC ≈ 03:00–04:00 AEST/AEDT). Vercel Hobby can't run crons
-- this often, so Postgres calls the app.
--
-- PREREQUISITE (run by a human in the SQL editor; values come from
-- 1Password and are NEVER written to a file):
--   select vault.create_secret('<CRON_SECRET value>', 'accounting_cron_secret');
--   select vault.create_secret('https://app.manuva.app', 'app_base_url');
--
-- Idempotent: cron.schedule replaces a job with the same name.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule('accounting-outbox', '*/5 * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/cron/accounting-outbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'accounting_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);

select cron.schedule('accounting-maintenance', '0 17 * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/cron/accounting-maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'accounting_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);
```

- [ ] **Step 6: Run, type-check, commit**

```bash
npx vitest run src/lib/accounting/maintenance.test.ts
npx tsc --noEmit
npx eslint src/lib/accounting src/app/api/cron src/lib/email/templates/xero-attention.tsx
git add src/lib/accounting/maintenance.ts src/lib/accounting/maintenance.test.ts src/lib/accounting/alerts.tsx src/lib/email/templates/xero-attention.tsx src/app/api/cron/accounting-outbox src/app/api/cron/accounting-maintenance supabase/patches/2026-10-01-xero-cron-schedule.sql
git commit -m "MANUVA-34 feat(xero): scheduled outbox, token maintenance and alert email"
```

Expected: tests pass, tsc and eslint clean.

### Task 20: Xero card, sync log and admin banner

**Files:**
- Create: `src/app/app/settings/integrations/xero-card.tsx`, `src/app/app/settings/integrations/xero-card-actions.tsx`
- Modify: `src/app/app/settings/integrations/page.tsx`
- Create: `src/app/app/_components/accounting-banner.tsx`, `src/app/app/_components/accounting-banner.module.css`
- Modify: `src/app/app/layout.tsx`

**Interfaces:**
- Consumes: `disconnectXeroAction`, `retryAccountingJob` (Tasks 13 and 17); `jobBadge`, `OPERATION_LABELS` (Task 18); `isXeroPilotTenant` (Task 5).
- Produces:
  - `XeroCard({ xeroParam, reason }: { xeroParam?: string; reason?: string })`: an async server component
  - `AccountingBanner({ tenantId, isAdmin }: { tenantId: string | null; isAdmin: boolean })`: an async server component

- [ ] **Step 1: Card actions (client)**

```tsx
// src/app/app/settings/integrations/xero-card-actions.tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectXeroAction, retryAccountingJob } from "./xero/actions";
import styles from "./xero/xero.module.css";

export function DisconnectXeroButton({ orgName }: { orgName: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={styles.secondaryBtn} onClick={() => dialog.current?.showModal()}>Disconnect</button>
      <dialog ref={dialog} className={styles.formCard}>
        <p className={styles.help}>Disconnect {orgName}? Manuva&apos;s access is revoked in Xero and queued bills are cancelled. Bills already in Xero stay there.</p>
        <form action={disconnectXeroAction} className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="submit" className={styles.primaryBtn}>Disconnect</button>
        </form>
      </dialog>
    </>
  );
}

export function RetryJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <>
      <button type="button" className={styles.secondaryBtn} disabled={pending} onClick={() => start(async () => {
        const r = await retryAccountingJob(jobId);
        if (!r.ok) setMessage(r.message ?? "Couldn't retry.");
        router.refresh();
      })}>Retry</button>
      {message ? <span className={styles.error}>{message}</span> : null}
    </>
  );
}
```

- [ ] **Step 2: Card (server)**

```tsx
// src/app/app/settings/integrations/xero-card.tsx
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { jobBadge, OPERATION_LABELS } from "@/lib/accounting/supplier-invoice/labels";
import StatusBadge from "../../_ui/status-badge";
import EmptyState from "../../_ui/empty-state";
import { DisconnectXeroButton, RetryJobButton } from "./xero-card-actions";
import styles from "./integrations.module.css";
import xs from "./xero/xero.module.css";

const MESSAGES: Record<string, { text: string; error: boolean }> = {
  "setup-complete": { text: "Xero is set up. Posted supplier invoices will be sent as bills.", error: false },
  disconnected: { text: "Xero disconnected and Manuva's access revoked.", error: false },
  "disconnected-local": { text: "Disconnected in Manuva. If Manuva still appears in Xero → Settings → Connected apps, remove it there.", error: true },
  "not-configured": { text: "Xero isn't configured on this server yet.", error: true },
  error: { text: "The Xero connection didn't complete.", error: true },
};
const REASONS: Record<string, string> = {
  "xero-denied": "Access was declined in Xero.",
  "no-session": "Your session expired. Sign in and try again.",
  "not-admin": "Only admins can connect Xero.",
  "bad-state": "The connection link was invalid. Start again.",
  expired: "The connection took too long. Start again.",
  "nonce-mismatch": "The connection was started in another browser. Start again.",
  "session-mismatch": "The connection was started by a different user or workspace.",
  "token-exchange": "Xero didn't issue access. Try again.",
  connections: "Couldn't read your Xero organisations. Try again.",
  "no-organisation": "No Xero organisation was chosen.",
  "organisation-read": "Couldn't read the Xero organisation. Try again.",
  "bad-organisation": "Choose one of the listed organisations.",
};

type Job = { id: string; operation: string; entity_type: string; entity_id: string; status: string; error_class: string | null; error_message: string | null; created_at: string; completed_at: string | null };

export default async function XeroCard({ xeroParam, reason }: { xeroParam?: string; reason?: string }) {
  const ctx = await getServerTenantContext();
  if (!ctx) return null;
  const { data: conn } = await ctx.supabase
    .from("accounting_connection")
    .select("id, status, org_name, setup_completed_at, last_error")
    .eq("provider", "xero")
    .maybeSingle();
  const c = conn as { id: string; status: string; org_name: string; setup_completed_at: string | null; last_error: string | null } | null;
  const live = c && c.status !== "disconnected" ? c : null;

  let jobs: Job[] = [];
  const invoiceNumbers = new Map<string, string>();
  if (live) {
    const { data } = await ctx.supabase.from("accounting_outbox").select("id, operation, entity_type, entity_id, status, error_class, error_message, created_at, completed_at").eq("connection_id", live.id).order("created_at", { ascending: false }).limit(50);
    jobs = (data ?? []) as Job[];
    const ids = jobs.filter((j) => j.entity_type === "supplier_invoice").map((j) => j.entity_id);
    if (ids.length) {
      const { data: invs } = await ctx.supabase.from("supplier_invoice").select("id, invoice_number").in("id", ids);
      for (const i of (invs ?? []) as Array<{ id: string; invoice_number: string }>) invoiceNumbers.set(i.id, i.invoice_number);
    }
  }
  const lastSent = jobs.find((j) => j.status === "sent")?.completed_at ?? null;
  const problems = jobs.filter((j) => j.status === "gave_up" || (j.status === "failed" && j.error_class === "fixable")).length;
  const msg = xeroParam ? MESSAGES[xeroParam] : undefined;

  const badge = !live
    ? { variant: "warning" as const, label: "Not connected" }
    : live.status === "needs_reconnect"
      ? { variant: "danger" as const, label: "Needs reconnect" }
      : !live.setup_completed_at
        ? { variant: "warning" as const, label: "Finish setup" }
        : { variant: "success" as const, label: "Connected" };

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleRow}>
          <span className={styles.cardName}>Xero</span>
          <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
        </div>
        <p className={styles.cardDesc}>Send supplier invoices to Xero as bills. Manuva never sends sales.</p>
      </div>
      {msg ? <p className={msg.error ? xs.error : xs.help} role="status">{msg.text}{reason && REASONS[reason] ? ` ${REASONS[reason]}` : ""}</p> : null}
      {live ? (
        <>
          <p className={xs.help}>
            {live.org_name}
            {lastSent ? ` · last sent ${new Date(lastSent).toLocaleString("en-AU")}` : ""}
            {problems ? ` · ${problems} need${problems === 1 ? "s" : ""} attention` : ""}
          </p>
          {live.status === "needs_reconnect" && live.last_error ? <p className={xs.error}>{live.last_error}</p> : null}
          <div className={xs.actions}>
            {live.status === "needs_reconnect" ? <a href="/api/xero/install" className={xs.primaryBtn}>Reconnect Xero</a> : null}
            <Link href="/app/settings/integrations/xero/setup" className={live.setup_completed_at ? xs.secondaryBtn : xs.primaryBtn}>
              {live.setup_completed_at ? "Edit setup" : "Finish setup"}
            </Link>
            <DisconnectXeroButton orgName={live.org_name} />
          </div>
          {jobs.length === 0 ? (
            <EmptyState title="Nothing sent yet" message="Post a supplier invoice and its bill will appear here." />
          ) : (
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead><tr><th>When</th><th>Item</th><th>Action</th><th>Status</th><th>Detail</th><th /></tr></thead>
                <tbody>
                  {jobs.map((j) => {
                    const b = jobBadge(j.status, j.error_class);
                    const retryable = j.status === "gave_up" || (j.status === "failed" && j.error_class === "fixable");
                    return (
                      <tr key={j.id}>
                        <td>{new Date(j.created_at).toLocaleString("en-AU")}</td>
                        <td>{j.entity_type === "supplier_invoice" ? <Link href={`/app/purchasing/invoices/${j.entity_id}`}>{invoiceNumbers.get(j.entity_id) ?? "Invoice"}</Link> : "Supplier contact"}</td>
                        <td>{OPERATION_LABELS[j.operation] ?? j.operation}</td>
                        <td><StatusBadge variant={b.variant}>{b.label}</StatusBadge></td>
                        <td>{j.error_message ?? ""}</td>
                        <td>{retryable ? <RetryJobButton jobId={j.id} /> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className={xs.actions}>
          <a href="/api/xero/install" className={xs.primaryBtn}>Connect Xero</a>
        </div>
      )}
    </div>
  );
}
```

`integrations.module.css` must provide `tableCard` and `table`. If it doesn't, add:

```css
.tableCard { composes: tableCard from "../../_ui/table.module.css"; }
.table { composes: table from "../../_ui/table.module.css"; }
```

The connect and reconnect controls are plain `<a>`, not `Link`: `/api/xero/install` is a route handler that redirects off-site, so it must not be prefetched.

- [ ] **Step 2b: Mount the card**

In `src/app/app/settings/integrations/page.tsx`:
- Add `reason?: string; xero?: string;` back to `searchParams`.
- Import `XeroCard` and `isXeroPilotTenant`.
- Change `const { supabase } = ctx;` to `const { supabase, tenantId } = ctx;`.
- After the Shopify card `</div>`, inside `.grid`, add:

```tsx
{isXeroPilotTenant(tenantId) ? <XeroCard xeroParam={params.xero} reason={params.reason} /> : null}
```

- [ ] **Step 3: Admin banner**

```tsx
// src/app/app/_components/accounting-banner.tsx
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isXeroPilotTenant } from "@/lib/accounting/xero/config";
import styles from "./accounting-banner.module.css";

export async function AccountingBanner({ tenantId, isAdmin }: { tenantId: string | null; isAdmin: boolean }) {
  if (!tenantId || !isAdmin || !isXeroPilotTenant(tenantId)) return null;
  const supabase = await createSupabaseServerClient();
  const { data: conn } = await supabase.from("accounting_connection").select("id, status").eq("provider", "xero").maybeSingle();
  const c = conn as { id: string; status: string } | null;
  if (!c || c.status === "disconnected") return null;
  const { count } = await supabase
    .from("accounting_outbox")
    .select("id", { count: "exact", head: true })
    .eq("connection_id", c.id)
    .or("status.eq.gave_up,and(status.eq.failed,error_class.eq.fixable)");
  const text =
    c.status === "needs_reconnect"
      ? "Xero needs reconnecting. Bills are paused until an admin reconnects it."
      : (count ?? 0) > 0
        ? `${count} item${count === 1 ? "" : "s"} couldn't be sent to Xero.`
        : null;
  if (!text) return null;
  return (
    <div className={styles.banner} role="status">
      <span>{text}</span>
      <Link href="/app/settings/integrations" className={styles.link}>Review in Integrations →</Link>
    </div>
  );
}
```

```css
/* src/app/app/_components/accounting-banner.module.css */
.banner {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1px solid var(--stroke-card);
  border-left: 3px solid var(--warning);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  color: var(--ink-strong);
  font-size: var(--fs-sm);
}
.link { color: var(--ink-strong); font-weight: var(--fw-semibold); text-decoration: none; }
.link:hover { text-decoration: underline; }
```

In `src/app/app/layout.tsx`, import `AccountingBanner` from `./_components/accounting-banner` and `isAdminRole` from `@/lib/tenant/authz`. Directly after `{showPastDueBanner ? <PastDueBanner /> : null}`, add:

```tsx
<AccountingBanner tenantId={profile?.tenant_id ?? null} isAdmin={isAdminRole(profile?.role)} />
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
npx eslint src/app/app/settings/integrations src/app/app/_components/accounting-banner.tsx src/app/app/layout.tsx
npm test
```

Expected: clean and green. With `XERO_PILOT_TENANTS` unset, the Integrations page looks exactly as it does after PR 1, and no banner renders.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/settings/integrations src/app/app/_components/accounting-banner.tsx src/app/app/_components/accounting-banner.module.css src/app/app/layout.tsx
git commit -m "MANUVA-34 feat(xero): integrations card, sync log, admin banner"
```

### Task 21: QA feature test plan

**Files:**
- Modify: `docs/qa-feature-test-plan.md`

- [ ] **Step 1: Replace §16**

Replace the §16 body written in Task 2 with:

```markdown
## 16. Xero / Accounting **(admin)** **(gated: XERO_PILOT_TENANTS)**

Entry: Settings → Integrations → Xero card. Spec: `docs/superpowers/specs/2026-10-01-xero-supplier-bills-design.md`.

Connect
- [ ] Connect Xero (admin) → Xero consent → back to Manuva. One organisation → setup wizard; several → organisation picker
- [ ] A member cannot start the connection ("Only admins can connect Xero")
- [ ] A tampered or expired state, or one started by another user or workspace, is refused with a clear message
- [ ] Missing server config shows "Xero isn't configured" (no broken redirect)
- [ ] Reconnecting to a different organisation clears setup, cancels queued jobs and drops supplier links

Setup
- [ ] Inventory account options list only active current-asset accounts; freight lists expense / direct-cost / overhead accounts
- [ ] Tax options are the organisation's active purchase rates; Manuva never creates a tax rate
- [ ] The sales-source answer shows matching guidance; Manuva never posts sales
- [ ] Nothing is sent to Xero until setup is finished

Bills
- [ ] Posting a supplier invoice dated on or after the start date queues a bill. It appears in Xero as Awaiting Approval with the supplier's invoice number
- [ ] Stock lines carry no item code; the PO number appears in the line description
- [ ] A retry after a lost response does not create a second bill
- [ ] An invoice dated inside a Xero lock period fails with the lock date in the message
- [ ] An archived account, invalid tax rate or archived contact each shows a plain-English error with Retry (admin)
- [ ] Voiding deletes (draft / awaiting approval) or voids (approved) the bill; a paid bill refuses with "Remove them in Xero first"

Connection health
- [ ] Removing Manuva in Xero → the connection shows Needs reconnect, the admin banner appears, and the connecting admin is emailed (at most once per 24 h)
- [ ] Quiet connections are refreshed by the daily job (last refreshed date moves)
- [ ] Disconnect revokes access in Xero and deletes stored tokens; Manuva disappears from Xero → Connected apps

Security
- [ ] `accounting_credential` cannot be read through the REST API by any signed-in user
- [ ] `claim_accounting_jobs` / `claim_accounting_refresh_lease` refuse non-service callers
```

- [ ] **Step 2: Add the supplier-invoice section under Purchasing**

Under the Purchasing domain section, add:

```markdown
### Supplier invoices

Entry: Purchasing → Supplier invoices; PO detail and receipt detail → Enter supplier invoice.

- [ ] Only supplier-delivery receipts from the same supplier can be added; returns, opening stock and samples can't
- [ ] Quantity and price differences against the receipt and PO are highlighted but don't block posting
- [ ] A printed total that differs by more than 5c is highlighted
- [ ] The due date defaults from supplier payment terms (Net 30, 30 EOM, EOM…), otherwise +30 days; it stays editable
- [ ] A duplicate invoice number for the same supplier is refused
- [ ] A receipt line can't be on two posted invoices
- [ ] Posting writes the invoiced ex-GST unit cost back to the receipt line, and to the component when ticked
- [ ] Posted invoices are read-only; Void (admin) needs a reason and frees the receipt lines
- [ ] Works without Xero (status "Posted", not synced)
- [ ] PO and receipt pages show Not invoiced / the invoice with its status
```

- [ ] **Step 3: Changelog and commit**

Append to `## Changelog`, using the actual date of the change:

```markdown
- YYYY-MM-DD — added Supplier invoices + Xero supplier bills (MANUVA-34): supplier tax invoices against receipts; production-grade Xero connect, setup, bill/void sync via outbox; pilot-gated.
```

```bash
git add docs/qa-feature-test-plan.md
git commit -m "MANUVA-34 docs(qa): supplier invoices and Xero bills test plan"
```

---

# Chunk H — Rollout (human-gated)

### Task 22: Register, configure, migrate, schedule, verify, pilot

Every step marked **[user]** needs the user to act or to say yes in this session. Never create a Xero app, generate a secret into the transcript, or apply a migration without that.

- [ ] **Step 1: [user] Register the Xero app**
  - developer.xero.com → New app → Web app.
  - Company/app URL: `https://manuva.app`. Redirect URI: `https://app.manuva.app/api/xero/callback`.
  - The app starts on the free Starter tier (5 organisations).
  - The user copies the client ID and secret straight into 1Password, never into chat.

- [ ] **Step 2: [user] Secrets**
  - Find the project's Environment with the 1Password MCP `list_environments`. Create it if it's missing; the name is the repo name.
  - Generate `ACCOUNTING_TOKEN_KEY` locally, and store it without printing it to chat:
    `! node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))" | clip`
    Then paste it into 1Password.
  - Variables:
    - `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`
    - `XERO_REDIRECT_URI=https://app.manuva.app/api/xero/callback`
    - `ACCOUNTING_TOKEN_KEY`, `ACCOUNTING_TOKEN_KEY_VERSION=1`
    - `XERO_PILOT_TENANTS=<internal test tenant id>`
    - `CRON_SECRET`: already in Vercel. The Vault secret `accounting_cron_secret` (Step 4) must equal it.
    - `NEXT_PUBLIC_APP_URL`: already in Vercel. Confirm it is `https://app.manuva.app` (the alert email links to it).
  - **Warning:** never change `ACCOUNTING_TOKEN_KEY_VERSION` (or the key) without a re-encrypt step. Stored tokens are sealed with the version in their envelope; changing it without re-encrypting every `accounting_credential` row locks every connection out until it is reconnected.
  - Copy the same values into Vercel project `assemblio` (Production). Confirm the names with the Vercel MCP `filter_project_envs`. Never decrypt values.

- [ ] **Step 3: [user] Apply the migrations**
  - Ask: "Apply `2026-10-01-xero-supplier-bills.sql` then `2026-10-01-xero-vitals-repoint.sql` to production?"
  - On yes, apply each with MCP `apply_migration` (names `xero_supplier_bills`, `xero_vitals_repoint`).
  - Then verify:

```sql
select
  to_regclass('public.accounting_outbox') is not null as outbox,
  has_table_privilege('authenticated', 'public.accounting_credential', 'SELECT') as auth_reads_creds,
  has_table_privilege('anon', 'public.accounting_credential', 'SELECT') as anon_reads_creds,
  has_function_privilege('authenticated', 'public.claim_accounting_jobs(uuid,int,text)', 'EXECUTE') as auth_claims,
  position('public.accounting_connection' in pg_get_functiondef('public.get_tenant_vitals(uuid)'::regprocedure)) > 0 as vitals_repointed;
```

  Expected: `outbox = true`, `auth_reads_creds = false`, `anon_reads_creds = false`, `auth_claims = false`, `vitals_repointed = true`.

  Then add the four new functions (`post_supplier_invoice`, `void_supplier_invoice`, `claim_accounting_jobs`, `claim_accounting_refresh_lease`) to `scripts/probe_anon_rpc_surface.sh` as deny probes (anon must be refused), and run `bash scripts/probe_anon_rpc_surface.sh`. Expected: exit 0.

- [ ] **Step 4: [user] Vault secrets and schedule**
  - The user runs the two `vault.create_secret` statements from the header of `2026-10-01-xero-cron-schedule.sql`, pasting `CRON_SECRET` from 1Password.
  - On yes, apply the schedule patch (`xero_cron_schedule`).
  - If `create extension pg_cron` is refused, enable pg_cron and pg_net under Dashboard → Database → Extensions, then re-apply.
  - Verify:

```sql
select jobname, schedule, active from cron.job where jobname like 'accounting-%';
-- after ≥ 5 minutes:
select status_code, created from net._http_response order by created desc limit 5;
```

  Expected: two active jobs, and recent `200` responses (the outbox route returns 200 with zero work).

- [ ] **Step 5: Ship the code**
  - Push `feat/manuva-34-xero-bills` and open the PR, titled `MANUVA-34 Xero supplier bills (MVP)`. The body summarises the chunks, links the spec, and ends with "🤖 Generated with [Claude Code](https://claude.com/claude-code)".
  - Run `/code-review` on the branch before merging.
  - Merge, and confirm the production deployment.

- [ ] **Step 6: End-to-end against Xero's Demo Company (spec §10), on the internal pilot tenant**
  1. Connect with two organisations (the Demo Company plus one other) → picker appears → choose the Demo Company.
  2. Complete the wizard.
  3. Link one supplier; set another to "Create in Xero".
  4. Post an inclusive invoice and an exclusive one, each with a freight line. Bills appear in Xero as Awaiting Approval, with the correct numbers, PO in the description, and no item code.
  5. Force a transient failure with a network failure or a Xero 5xx (for example, block `api.xero.com` from the server briefly), not an archived tax code, which is a fixable error. See Retrying → restore the network → it sends on the next run.
  6. Set a lock date in the Demo Company after an invoice's date → fixable error naming the date → move the lock date in Xero, or void and re-enter, then retry.
  7. Void a SUBMITTED bill (deleted) and an AUTHORISED one (voided).
  8. Pay a bill in Xero → void refuses.
  9. Disconnect → Manuva is gone from Xero → Connected apps; the credential row is deleted.
  10. Set `last_refreshed_at` back 8 days on the test connection → call the maintenance route with the cron secret → it moves forward.

  Record each result as an update on MANUVA-34.

- [ ] **Step 7: Pilot**
  - Add 1–2 real tenants to `XERO_PILOT_TENANTS`.
  - Rollout note: a tenant removed from `XERO_PILOT_TENANTS` while it is set up keeps queueing bill jobs when it posts (from its stored setup). They wait, unsent, until the tenant is added back.
  - After one month of real bills, with their accountant confirming bills match the supplier invoices, set `XERO_PILOT_TENANTS=*` (general release).
  - Update MANUVA-34 at each stage. Set Status = Done after general release, with the PR and commit references, and verify by read-back.
  - Then pick up MANUVA-37: move Shopify tokens onto `src/lib/security/token-crypto.ts` and server-only storage.

---

## Self-review

**Spec coverage** (spec section → task):

| Spec section | Task |
|---|---|
| §1 phased decision | Context only |
| §2 goals | Tasks 13–20 |
| §3.1 connect | Task 13 |
| §3.2 wizard | Task 14 |
| §3.3 supplier linking | Tasks 17 and 18 (`supplier-link.tsx`), Task 15 (`create_contact`) |
| §3.4 enter invoice, matching and terms | Tasks 7, 17 and 18 |
| §3.5 after posting and void | Tasks 10, 15, 17 and 18 |
| §3.6 disconnect | Tasks 13 and 20 |
| §3.7 health, banner and email | Tasks 19 and 20 |
| §4 data model | Task 10 |
| §4.3 vitals repoint | Task 11; activity events in Task 13 |
| §5.1–5.7 Xero app, scopes, OAuth, tokens, client and org reads | Tasks 5, 8, 12, 13 and 22 |
| §6.1 posting and void functions | Task 10 |
| §6.2 triggering | Tasks 16 (`after` / `kickOutbox`) and 19 |
| §6.3 claiming | Tasks 10 and 16 |
| §6.4–6.6 handlers | Task 15 |
| §7 failure classes | Tasks 6 and 16 |
| §8 UI | Tasks 13, 14, 18 and 20 |
| §9 plans and pilot | Tasks 5 and 20. The future `accountingJournals` flag belongs to the COGS release, not here. |
| §10 testing | Every task, plus Task 22 step 6 |
| §11 rollout | Tasks 1, 2 and 22 |
| §12 open items | Vercel resolved. Certification and doc corrections are deferred by the spec. |

**Deviations from the spec**, all recorded in the spec in the same change:
- Tokens are stored as a text envelope, not bytea.
- No `Reference` on bills; the PO number goes in the line description.
- The state HMAC key is `XERO_CLIENT_SECRET`, and Shopify is not refactored during its review.
- The pending-organisation cookie is new.
- `last_alert_at` is new.
- The list page has an extra "All" tab.
- The alert email is checked on every 5-minute run as well as daily, so a dead connection is reported within minutes, not a day.

