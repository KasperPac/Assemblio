# Retail Stock Foundation Implementation Plan (MANUVA-27, plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A retail product in Manuva carries real shelf stock, and a fulfilled sale of it decrements `on_hand` exactly once.

**Architecture:** A retail item is a normal `product_variant` whose product has `kind = 'retail'` and whose active BOM is one component at qty 1; the component carries the stock. A new SECURITY DEFINER function `apply_sale_consumption` consumes one order line atomically, with an `order_line_consumption` row as the idempotency key and serialisation point. `reconcileOrderAllocations` calls it for fulfilled retail lines instead of only releasing the reservation. A second function, `create_retail_item`, builds or attaches the scaffold in one transaction.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres (PL/pgSQL), supabase-js, vitest, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-09-25-square-pos-integration-design.md` (sections 1, 2, 5, 6). Plans 2 (Square connector + matching + mapping screen) and 3 (stock loop, write-back, reconcile) follow and depend on this one. The channel-seam tables (`sales_channel`, `square_connection`, `channel_item_link`, `square_webhook_event`, `channel_stock_write`) and the `orders.sales_channel_id` / `external_order_id` columns belong to plan 2, the first plan that reads or writes them.

## Global Constraints

- Task code `MANUVA-27` at the start of every commit subject. Commit with `git commit -F <file>` (backticks break `-m`).
- Branch `feat/square-pos-integration`. **Never `git stash`** in this repo.
- Production is the only Supabase environment (`svhaotzrtfbwmphaacjj`). Nothing in this plan is applied to it until Task 8, and Task 8 needs the user's explicit yes.
- Every new SECURITY DEFINER function: `set search_path = public`, calls `public.assert_tenant_write_access(p_tenant_id)`, checks every referenced row belongs to `p_tenant_id`, and `revoke all ... from public, anon` then `grant execute ... to authenticated, service_role`.
- Every supabase-js `.rpc()` result goes through `assertNoError`. `.rpc()` resolves with `{ data, error }`; it does not throw.
- Sale consumption applies **only** to `product.kind = 'retail'`. Manufacturers' `on_hand` changes only through manual adjustments and stocktakes today; consuming on sale for them would double-count.
- Do not loosen the `greatest(0, …)` clamp on `reserved`. `on_hand` may go negative, but only through a sale.
- UI follows `docs/design-system.md`: tokens only, `PageHeader` with eyebrow, create flows in `<dialog>`, buttons compose `_ui/buttons.module.css`, no inline layout styles.
- `docs/qa-feature-test-plan.md` gets the feature and a dated changelog line in the same change.

## Review Focus

1. **Converting an existing Shopify variant to retail when it already has fulfilled orders.** The next sync re-reconciles those orders; without a baseline they would all consume stock the opening count already excludes. → `create_retail_item` writes baseline `order_line_consumption` rows; pinned in Task 3's verify SQL (case R4).
2. **Two syncs or a sync plus a webhook fulfilling the same order at once.** Expect exactly one `sale` movement. → race script in Task 2.
3. **A fulfilled order containing both retail and manufactured lines.** Retail lines consume, manufactured lines only release, as today. → Task 5 test "mixed order".
4. **A consumption failure inside the Shopify sync.** Today `reconcileOrderAllocations` failures are swallowed by `catch { continue; }`, the same shape as MANUVA-16. Expect a logged error and a non-zero `allocation_errors` in the sync result. → Task 5 test.
5. **Shopify sends `barcode: ""` for variants with no barcode.** Expect `null`, not an empty string, or plan 2's barcode matcher sees false matches between empty barcodes. → Task 6 test.

Out of scope, and listed so nobody assumes it is handled: refunds and returns do not restore stock in this plan.

---

## File map

| File | Responsibility |
|---|---|
| `scripts/scratch-db.sh` (create) | Start/load/reset a throwaway Postgres in Docker for `.verify.sql` runs |
| `supabase/__tests__/scratch-prelude.sql` (create) | Minimal `auth` schema + Supabase roles so `schema.sql` loads on vanilla Postgres |
| `supabase/patches/2026-09-25-retail-stock-foundation.sql` (create) | `product.kind`, `product_variant.barcode`, `order_line_consumption`, `apply_sale_consumption`, `create_retail_item` |
| `supabase/__tests__/2026-09-25-retail-stock-foundation.verify.sql` (create) | Behavioural checks for both functions |
| `scripts/verify-sale-consumption-race.sh` (create) | Two concurrent sessions, one movement |
| `src/lib/supabase/assert-no-error.ts` (create) | `assertNoError` moved out of `sync.ts` so non-Shopify code can use it |
| `src/lib/inventory/sale-consumption.ts` (+ test) (create) | `consumeOrderLineSale` wrapper and `isRetailLine` |
| `src/lib/allocation/reconcile-order.ts` (modify) | Fulfilled retail lines consume instead of clear |
| `src/lib/shopify/sync.ts` (modify) | Fetch + store barcode; stop swallowing reconcile errors |
| `src/lib/shopify/variant-fields.ts` (+ test) (create) | `normaliseBarcode` |
| `src/lib/products/retail-item.ts` (+ test) (create) | `parseRetailItemForm` |
| `src/app/app/products/retail-actions.ts` (create) | `createRetailItem` server action |
| `src/app/app/products/retail-item-dialog.tsx` + `.module.css` (create) | Create/attach dialog |
| `src/app/app/products/page.tsx`, `src/app/app/products/variants/[variantId]/page.tsx` (modify) | Mount the dialog; show the retail badge |
| `supabase/schema.sql`, `docs/qa-feature-test-plan.md` (modify) | Keep the reference schema and QA inventory current |

---

### Task 1: Scratch database harness

The existing `.verify.sql` files assume a scratch Postgres, and none exists on this machine (no `psql`, Docker available). Build one so Tasks 2–3 can be tested without touching production.

**Files:**
- Create: `scripts/scratch-db.sh`
- Create: `supabase/__tests__/scratch-prelude.sql`

**Interfaces:**
- Produces: `bash scripts/scratch-db.sh up` (fresh container loaded with prelude + `schema.sql` + the patch list), `bash scripts/scratch-db.sh sql <file>` (run a file, stop on first error), `bash scripts/scratch-db.sh down`. Container name `manuva-scratch`, host port `55432`.

- [ ] **Step 1: Write the prelude**

```sql
-- supabase/__tests__/scratch-prelude.sql
-- Just enough of Supabase for schema.sql + patches to load on vanilla
-- Postgres. SCRATCH ONLY — never run against prod.
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create schema if not exists storage;
create extension if not exists pgcrypto;
```

- [ ] **Step 2: Write the script**

```bash
#!/usr/bin/env bash
# scripts/scratch-db.sh — throwaway Postgres for supabase/__tests__/*.verify.sql
# SCRATCH ONLY. Never point this at production.
set -euo pipefail
NAME=manuva-scratch
PORT=55432
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Loaded in order after schema.sql. schema.sql lags production; these bring
# the tables this feature touches up to date. Append, never reorder.
PATCHES=(
  inventory_movement_delta_reserved.sql
  product_bom_unique_active.sql
  apply_reserved_movement_rpc.sql
  2026-09-02-tenant-isolation-hardening.sql
)

run_sql() { docker exec -i "$NAME" psql -q -U postgres -d postgres -v ON_ERROR_STOP=1 < "$1"; }

case "${1:-}" in
  up)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" -e POSTGRES_PASSWORD=scratch -p "$PORT:5432" postgres:15 >/dev/null
    until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
    run_sql "$ROOT/supabase/__tests__/scratch-prelude.sql"
    run_sql "$ROOT/supabase/schema.sql"
    for p in "${PATCHES[@]}"; do run_sql "$ROOT/supabase/patches/$p"; done
    echo "scratch db up on :$PORT"
    ;;
  sql) run_sql "$2" ;;
  down) docker rm -f "$NAME" >/dev/null ;;
  *) echo "usage: $0 up|sql <file>|down" >&2; exit 2 ;;
esac
```

- [ ] **Step 3: Bring it up**

Run: `bash scripts/scratch-db.sh up`
Expected: `scratch db up on :55432`.

If a load step fails because `schema.sql` references a missing Supabase object (a role, `auth.*` or `storage.*` function, or extension), add the smallest stub to `scratch-prelude.sql` and re-run. If a patch fails because a table or column it touches is missing, add the patch that creates it to `PATCHES` just before it (`grep -ln "<column>" supabase/patches/*.sql`). Do not edit `schema.sql` or existing patches to make them load.

- [ ] **Step 4: Sanity-check the loaded shape**

Create `$TMP/shape.sql`:
```sql
select count(*) filter (where column_name = 'delta_reserved') as has_delta_reserved,
       count(*) filter (where column_name = 'is_active') as has_is_active
from information_schema.columns
where table_name in ('inventory_movement', 'product_bom');
select proname from pg_proc where proname in ('assert_tenant_write_access','apply_reserved_movement');
```
Run: `bash scripts/scratch-db.sh sql "$TMP/shape.sql"`
Expected: `1 | 1`, and both function names listed.

- [ ] **Step 5: Commit**

```bash
git add scripts/scratch-db.sh supabase/__tests__/scratch-prelude.sql
git commit -F msg.txt   # "MANUVA-27 chore(db): scratch Postgres harness for verify SQL"
```

---

### Task 2: `order_line_consumption` and `apply_sale_consumption`

**Files:**
- Create: `supabase/patches/2026-09-25-retail-stock-foundation.sql`
- Create: `supabase/__tests__/2026-09-25-retail-stock-foundation.verify.sql`
- Create: `scripts/verify-sale-consumption-race.sh`
- Modify: `scripts/scratch-db.sh` (append the new patch to `PATCHES`)

**Interfaces:**
- Produces SQL: `public.apply_sale_consumption(p_tenant_id uuid, p_order_line_id uuid, p_location_id uuid) returns integer`. Returns the number of components consumed, or 0 if the line was already consumed. Raises if the line is not retail or has no active BOM.
- Produces tables and columns: `product.kind text not null default 'manufactured'`, `product_variant.barcode text`, `order_line_consumption(id, tenant_id, order_line_id unique, order_id, location_id, baseline boolean, created_at)`.
- Movement written: `reason = 'sale'`, `reference_type = 'order'`, `reference_id = order_id`, `delta_on_hand = -required`, `delta_reserved = -released`.

- [ ] **Step 1: Write the verify SQL first (it fails: the function does not exist yet)**

```sql
-- supabase/__tests__/2026-09-25-retail-stock-foundation.verify.sql
-- SCRATCH ONLY: redefines current_tenant_id()/is_service_role() to read GUCs.
--   bash scripts/scratch-db.sh up
--   bash scripts/scratch-db.sh sql supabase/__tests__/2026-09-25-retail-stock-foundation.verify.sql
-- Expected: every line prints PASS; the script stops on the first failure.
\set ON_ERROR_STOP on

create or replace function public.current_tenant_id() returns uuid language sql stable as
$$ select nullif(current_setting('test.tenant', true),'')::uuid $$;
create or replace function public.is_service_role() returns boolean language sql stable as
$$ select coalesce(current_setting('test.service_role', true), '') = 'on' $$;
create or replace function public.is_super_admin() returns boolean language sql stable as
$$ select false $$;

create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as
$$ begin if not ok then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;

-- Fixtures: tenant T1 with default location L1, a retail variant VR with a
-- 1-line BOM over component CR, a manufactured variant VM over component CM,
-- and a fulfilled order O1 carrying 3×VR (2 reserved) and 1×VM.
-- Tenant T2 exists only to be refused.
insert into public.tenant (id) values
  ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
insert into public.location (id, tenant_id, name, is_default) values
  ('aaaaaaaa-0000-0000-0000-0000000000l1','11111111-1111-1111-1111-111111111111','Main',true);
insert into public.component (id, tenant_id, name) values
  ('aaaaaaaa-0000-0000-0000-0000000000c1','11111111-1111-1111-1111-111111111111','Shampoo 300ml'),
  ('aaaaaaaa-0000-0000-0000-0000000000c2','11111111-1111-1111-1111-111111111111','Steel tube');
insert into public.product (id, tenant_id, title, kind) values
  ('aaaaaaaa-0000-0000-0000-0000000000p1','11111111-1111-1111-1111-111111111111','Shampoo','retail'),
  ('aaaaaaaa-0000-0000-0000-0000000000p2','11111111-1111-1111-1111-111111111111','Rack','manufactured');
insert into public.product_variant (id, tenant_id, product_id, title) values
  ('aaaaaaaa-0000-0000-0000-0000000000v1','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000p1','300ml'),
  ('aaaaaaaa-0000-0000-0000-0000000000v2','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000p2','Std');
insert into public.product_bom (id, tenant_id, variant_id, version, status, is_active) values
  ('aaaaaaaa-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000v1',1,'active',true),
  ('aaaaaaaa-0000-0000-0000-0000000000b2','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000v2',1,'active',true);
insert into public.product_bom_component (tenant_id, product_bom_id, component_id, quantity) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000b1','aaaaaaaa-0000-0000-0000-0000000000c1',1),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000b2','aaaaaaaa-0000-0000-0000-0000000000c2',4);
insert into public.inventory_balance (tenant_id, component_id, location_id, on_hand, reserved) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000c1','aaaaaaaa-0000-0000-0000-0000000000l1',10,2);
insert into public.orders (id, tenant_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000o1','11111111-1111-1111-1111-111111111111','fulfilled');
insert into public.order_line (id, tenant_id, order_id, variant_id, quantity) values
  ('aaaaaaaa-0000-0000-0000-00000000ol01','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000o1','aaaaaaaa-0000-0000-0000-0000000000v1',3),
  ('aaaaaaaa-0000-0000-0000-00000000ol02','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000o1','aaaaaaaa-0000-0000-0000-0000000000v2',1);
insert into public.order_component_allocation (tenant_id, order_line_id, component_id, quantity) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000ol01','aaaaaaaa-0000-0000-0000-0000000000c1',2);

set test.service_role = 'on';

-- S1: first call consumes 3, releases the 2 reserved.
select pg_temp.check(public.apply_sale_consumption(
  '11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000ol01','aaaaaaaa-0000-0000-0000-0000000000l1') = 1,
  'S1 returns 1 component consumed');
select pg_temp.check((select on_hand = 7 and reserved = 0 from public.inventory_balance
  where component_id = 'aaaaaaaa-0000-0000-0000-0000000000c1'), 'S1 on_hand 10→7, reserved 2→0');
select pg_temp.check((select count(*) = 0 from public.order_component_allocation
  where order_line_id = 'aaaaaaaa-0000-0000-0000-00000000ol01'), 'S1 allocation rows removed');
select pg_temp.check((select count(*) = 1 from public.inventory_movement
  where reason = 'sale' and delta_on_hand = -3 and delta_reserved = -2), 'S1 one sale movement');

-- S2: idempotent.
select pg_temp.check(public.apply_sale_consumption(
  '11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000ol01','aaaaaaaa-0000-0000-0000-0000000000l1') = 0,
  'S2 second call returns 0');
select pg_temp.check((select on_hand = 7 from public.inventory_balance
  where component_id = 'aaaaaaaa-0000-0000-0000-0000000000c1'), 'S2 on_hand unchanged');

-- S3: manufactured line refused, nothing written.
do $$ begin
  perform public.apply_sale_consumption('11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-0000-0000-0000-00000000ol02','aaaaaaaa-0000-0000-0000-0000000000l1');
  raise exception 'FAIL: S3 manufactured line was consumed';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise notice 'PASS: S3 manufactured line refused (%)', sqlerrm;
end $$;
select pg_temp.check((select count(*) = 0 from public.order_line_consumption
  where order_line_id = 'aaaaaaaa-0000-0000-0000-00000000ol02'), 'S3 no consumption row left behind');

-- S4: another tenant's user is refused.
set test.service_role = 'off';
set test.tenant = '22222222-2222-2222-2222-222222222222';
do $$ begin
  perform public.apply_sale_consumption('11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-0000-0000-0000-00000000ol01','aaaaaaaa-0000-0000-0000-0000000000l1');
  raise exception 'FAIL: S4 cross-tenant call succeeded';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise notice 'PASS: S4 cross-tenant refused (%)', sqlerrm;
end $$;
reset test.tenant;

-- S5: anon cannot execute.
select pg_temp.check(not has_function_privilege('anon',
  'public.apply_sale_consumption(uuid,uuid,uuid)', 'execute'), 'S5 anon has no EXECUTE');

-- S6: selling past zero is recorded, on_hand goes negative.
set test.service_role = 'on';
insert into public.orders (id, tenant_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000o2','11111111-1111-1111-1111-111111111111','fulfilled');
insert into public.order_line (id, tenant_id, order_id, variant_id, quantity) values
  ('aaaaaaaa-0000-0000-0000-00000000ol03','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000o2','aaaaaaaa-0000-0000-0000-0000000000v1',9);
select public.apply_sale_consumption('11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-0000-0000-0000-00000000ol03','aaaaaaaa-0000-0000-0000-0000000000l1');
select pg_temp.check((select on_hand = -2 and reserved = 0 from public.inventory_balance
  where component_id = 'aaaaaaaa-0000-0000-0000-0000000000c1'), 'S6 on_hand 7→-2, reserved stays 0');
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bash scripts/scratch-db.sh up && bash scripts/scratch-db.sh sql supabase/__tests__/2026-09-25-retail-stock-foundation.verify.sql`
Expected: FAIL at the `product` fixture insert with `column "kind" of relation "product" does not exist`.

- [ ] **Step 3: Write the patch (schema + `apply_sale_consumption`)**

```sql
-- supabase/patches/2026-09-25-retail-stock-foundation.sql
--
-- MANUVA-27 plan 1: retail items carry shelf stock, and a fulfilled sale of
-- one decrements on_hand exactly once.
--
-- Before this, nothing in the sales path consumed stock: reconcile-order.ts
-- only moved `reserved`, and fulfilment released the reservation. For a
-- manufacturer that is fine (on_hand moves via adjustments and stocktakes).
-- For a pure-resale tenant the sale IS the consumption event.
--
-- Scope is deliberately product.kind = 'retail'. Consuming on sale for
-- manufactured products would double-count against their manual process.
--
-- Idempotent: safe to re-run.

alter table public.product
  add column if not exists kind text not null default 'manufactured';
do $$ begin
  alter table public.product add constraint product_kind_chk
    check (kind in ('manufactured', 'retail'));
exception when duplicate_object then null; end $$;

alter table public.product_variant add column if not exists barcode text;
create index if not exists product_variant_tenant_barcode_idx
  on public.product_variant (tenant_id, barcode) where barcode is not null;

-- One row per order line whose sale has been consumed. The unique key on
-- order_line_id is the serialisation point: two concurrent consumers race
-- on this INSERT, Postgres hands it to exactly one, and the loser writes
-- nothing. MANUVA-20 was this same operation split across round trips.
-- `baseline` rows were never consumed; they mark sales the opening stock
-- count already reflects (written by create_retail_item).
create table if not exists public.order_line_consumption (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  order_line_id uuid not null references public.order_line(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  location_id uuid not null references public.location(id),
  baseline boolean not null default false,
  created_at timestamptz not null default now(),
  constraint order_line_consumption_line_key unique (order_line_id)
);
create index if not exists order_line_consumption_tenant_order_idx
  on public.order_line_consumption (tenant_id, order_id);

alter table public.order_line_consumption enable row level security;
drop policy if exists tenant_isolation_select on public.order_line_consumption;
create policy tenant_isolation_select on public.order_line_consumption
  for select using (tenant_id = current_tenant_id());
-- No insert/update/delete policies: rows are written only by the DEFINER
-- functions below.

create or replace function public.apply_sale_consumption(
  p_tenant_id uuid,
  p_order_line_id uuid,
  p_location_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_kind text;
  v_bom_id uuid;
  v_comp record;
  v_required numeric;
  v_released numeric;
  v_count integer := 0;
begin
  if p_tenant_id is null or p_order_line_id is null or p_location_id is null then
    raise exception 'tenant, order line and location are required';
  end if;

  perform public.assert_tenant_write_access(p_tenant_id);

  select ol.id, ol.order_id, ol.variant_id, ol.quantity
  into v_line
  from public.order_line ol
  where ol.id = p_order_line_id and ol.tenant_id = p_tenant_id;
  if v_line.id is null then
    raise exception 'forbidden: order line does not belong to this tenant'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.location l
    where l.id = p_location_id and l.tenant_id = p_tenant_id
  ) then
    raise exception 'forbidden: location does not belong to this tenant'
      using errcode = '42501';
  end if;

  select p.kind into v_kind
  from public.product_variant v
  join public.product p on p.id = v.product_id
  where v.id = v_line.variant_id;
  if v_kind is distinct from 'retail' then
    raise exception 'sale consumption applies to retail items only';
  end if;

  insert into public.order_line_consumption (tenant_id, order_line_id, order_id, location_id)
  values (p_tenant_id, v_line.id, v_line.order_id, p_location_id)
  on conflict (order_line_id) do nothing;
  if not found then
    return 0;
  end if;

  select b.id into v_bom_id
  from public.product_bom b
  where b.tenant_id = p_tenant_id and b.variant_id = v_line.variant_id and b.is_active;
  if v_bom_id is null then
    raise exception 'retail item has no active BOM';
  end if;

  for v_comp in
    select bc.component_id, sum(bc.quantity) as qty
    from public.product_bom_component bc
    where bc.tenant_id = p_tenant_id and bc.product_bom_id = v_bom_id
    group by bc.component_id
  loop
    v_required := v_line.quantity * v_comp.qty;

    with removed as (
      delete from public.order_component_allocation a
      where a.tenant_id = p_tenant_id
        and a.order_line_id = v_line.id
        and a.component_id = v_comp.component_id
      returning a.quantity
    )
    select coalesce(sum(quantity), 0) into v_released from removed;

    insert into public.inventory_movement (
      tenant_id, component_id, location_id,
      delta_on_hand, delta_in_prod, delta_reserved,
      reason, reference_type, reference_id
    ) values (
      p_tenant_id, v_comp.component_id, p_location_id,
      -v_required, 0, -v_released,
      'sale', 'order', v_line.order_id
    );

    insert into public.inventory_balance (tenant_id, component_id, location_id, on_hand, in_prod, reserved)
    values (p_tenant_id, v_comp.component_id, p_location_id, -v_required, 0, 0)
    on conflict (tenant_id, component_id, location_id) do update
      set on_hand = public.inventory_balance.on_hand - v_required,
          reserved = greatest(0, public.inventory_balance.reserved - v_released),
          updated_at = now();

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.apply_sale_consumption(uuid, uuid, uuid) from public, anon;
grant execute on function public.apply_sale_consumption(uuid, uuid, uuid) to authenticated, service_role;
```

Append `2026-09-25-retail-stock-foundation.sql` as the last entry of `PATCHES` in `scripts/scratch-db.sh`.

- [ ] **Step 4: Run the verify SQL**

Run: `bash scripts/scratch-db.sh up && bash scripts/scratch-db.sh sql supabase/__tests__/2026-09-25-retail-stock-foundation.verify.sql`
Expected: `PASS` notices for S1–S6, no `FAIL`.

- [ ] **Step 5: Mutation-check the idempotency guard**

In a scratch copy of the patch (`$TMP/mutant.sql`), delete the `if not found then return 0; end if;` block. Run `bash scripts/scratch-db.sh up`, then `bash scripts/scratch-db.sh sql "$TMP/mutant.sql"` and the verify file. Expected: `FAIL: S2 second call returns 0`. Delete the mutant, and restore the scratch DB with `up`.

- [ ] **Step 6: Write the race script**

```bash
#!/usr/bin/env bash
# scripts/verify-sale-consumption-race.sh — SCRATCH ONLY.
# Session A consumes the line inside a transaction held open for 2s;
# session B fires 0.5s later and must block on the order_line_consumption
# key, then return 0. Exactly one 'sale' movement may exist afterwards.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="${TMP:-/tmp}"
bash "$ROOT/scripts/scratch-db.sh" up
bash "$ROOT/scripts/scratch-db.sh" sql "$ROOT/supabase/__tests__/2026-09-25-retail-stock-foundation.verify.sql" >/dev/null

setup=$(cat <<'SQL'
set test.service_role = 'on';
insert into public.orders (id, tenant_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000o9','11111111-1111-1111-1111-111111111111','fulfilled');
insert into public.order_line (id, tenant_id, order_id, variant_id, quantity) values
  ('aaaaaaaa-0000-0000-0000-00000000ol09','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000o9','aaaaaaaa-0000-0000-0000-0000000000v1',1);
SQL
)
echo "$setup" | docker exec -i manuva-scratch psql -q -U postgres -v ON_ERROR_STOP=1

call="select public.apply_sale_consumption('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000ol09','aaaaaaaa-0000-0000-0000-0000000000l1');"
( printf "set test.service_role='on'; begin; %s select pg_sleep(2); commit;\n" "$call" \
    | docker exec -i manuva-scratch psql -q -U postgres -At ) > "$TMP/race-a.txt" &
sleep 0.5
printf "set test.service_role='on'; %s\n" "$call" \
  | docker exec -i manuva-scratch psql -q -U postgres -At > "$TMP/race-b.txt"
wait

movements=$(echo "select count(*) from public.inventory_movement where reason='sale' and reference_id='aaaaaaaa-0000-0000-0000-0000000000o9';" \
  | docker exec -i manuva-scratch psql -q -U postgres -At)
echo "A returned: $(head -1 "$TMP/race-a.txt")  B returned: $(head -1 "$TMP/race-b.txt")  movements: $movements"
[ "$movements" = "1" ] && grep -qx 0 "$TMP/race-b.txt" && echo "PASS: race" || { echo "FAIL: race"; exit 1; }
```

- [ ] **Step 7: Run it**

Run: `bash scripts/verify-sale-consumption-race.sh`
Expected: `A returned: 1  B returned: 0  movements: 1` then `PASS: race`.

- [ ] **Step 8: Commit**

```bash
git add supabase/patches/2026-09-25-retail-stock-foundation.sql supabase/__tests__/2026-09-25-retail-stock-foundation.verify.sql scripts/verify-sale-consumption-race.sh scripts/scratch-db.sh
git commit -F msg.txt   # "MANUVA-27 feat(db): consume retail stock on sale, once per order line"
```

---

### Task 3: `create_retail_item`

**Files:**
- Modify: `supabase/patches/2026-09-25-retail-stock-foundation.sql` (append)
- Modify: `supabase/__tests__/2026-09-25-retail-stock-foundation.verify.sql` (append)

**Interfaces:**
- Produces SQL: `public.create_retail_item(p_tenant_id uuid, p_variant_id uuid, p_name text, p_sku text, p_barcode text, p_cost_per_unit numeric, p_supplier_id uuid, p_location_id uuid, p_reorder_point numeric) returns uuid`. Returns the variant id. `p_variant_id` null creates product + variant; non-null attaches to that variant. `p_location_id` null means the tenant's default location.

- [ ] **Step 1: Append the failing checks to the verify SQL**

```sql
-- R1: create from scratch. Call once and capture the id with \gset — a
-- volatile function inside a WHERE runs once per scanned row.
set test.service_role = 'on';
select public.create_retail_item('11111111-1111-1111-1111-111111111111', null,
  'Argan Oil', ' OIL-50 ', '9300000000031', 12.5, null, null, 4) as r1_variant \gset
select pg_temp.check((select count(*) = 1 from public.product_variant v
  join public.product p on p.id = v.product_id
  where v.id = :'r1_variant'
    and p.kind = 'retail' and v.sku = 'OIL-50' and v.barcode = '9300000000031'),
  'R1 product+variant created, retail, sku trimmed');
select pg_temp.check((select count(*) = 1 from public.product_bom_component bc
  join public.product_bom b on b.id = bc.product_bom_id
  join public.product_variant v on v.id = b.variant_id
  join public.component c on c.id = bc.component_id
  where v.sku = 'OIL-50' and b.is_active and bc.quantity = 1
    and c.cost_per_unit = 12.5 and c.reorder_point = 4),
  'R1 one active BOM line qty 1 over a component carrying cost + reorder point');
select pg_temp.check((select count(*) = 1 from public.inventory_balance ib
  join public.component c on c.id = ib.component_id
  where c.sku = 'OIL-50' and ib.location_id = 'aaaaaaaa-0000-0000-0000-0000000000l1' and ib.on_hand = 0),
  'R1 balance row at the default location');

-- R2: attaching to a variant that already has an active BOM is refused.
do $$ begin
  perform public.create_retail_item('11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-0000-0000-0000-0000000000v2', 'Rack', null, null, 0, null, null, 0);
  raise exception 'FAIL: R2 attached over an active BOM';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise notice 'PASS: R2 refused (%)', sqlerrm;
end $$;

-- R3: blank name refused.
do $$ begin
  perform public.create_retail_item('11111111-1111-1111-1111-111111111111', null,
    '   ', null, null, 0, null, null, 0);
  raise exception 'FAIL: R3 blank name accepted';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  raise notice 'PASS: R3 refused (%)', sqlerrm;
end $$;

-- R4: attaching to a Shopify variant with an already-fulfilled order writes a
-- baseline, so the next sync does not consume stock the opening count excludes.
insert into public.product (id, tenant_id, title) values
  ('aaaaaaaa-0000-0000-0000-0000000000p3','11111111-1111-1111-1111-111111111111','Conditioner');
insert into public.product_variant (id, tenant_id, product_id, title, sku) values
  ('aaaaaaaa-0000-0000-0000-0000000000v3','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000p3','300ml','CO-300');
insert into public.orders (id, tenant_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000o3','11111111-1111-1111-1111-111111111111','fulfilled'),
  ('aaaaaaaa-0000-0000-0000-0000000000o4','11111111-1111-1111-1111-111111111111','open');
insert into public.order_line (id, tenant_id, order_id, variant_id, quantity) values
  ('aaaaaaaa-0000-0000-0000-00000000ol04','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000o3','aaaaaaaa-0000-0000-0000-0000000000v3',5),
  ('aaaaaaaa-0000-0000-0000-00000000ol05','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000o4','aaaaaaaa-0000-0000-0000-0000000000v3',1);
select public.create_retail_item('11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-0000-0000-0000-0000000000v3', 'Conditioner 300ml', null, null, 9, null, null, 2);
select pg_temp.check((select kind = 'retail' from public.product
  where id = 'aaaaaaaa-0000-0000-0000-0000000000p3'), 'R4 existing product flipped to retail');
select pg_temp.check((select baseline from public.order_line_consumption
  where order_line_id = 'aaaaaaaa-0000-0000-0000-00000000ol04'), 'R4 fulfilled line baselined');
select pg_temp.check((select count(*) = 0 from public.order_line_consumption
  where order_line_id = 'aaaaaaaa-0000-0000-0000-00000000ol05'), 'R4 open line not baselined');
select pg_temp.check(public.apply_sale_consumption('11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-0000-0000-0000-00000000ol04','aaaaaaaa-0000-0000-0000-0000000000l1') = 0,
  'R4 baselined line never consumes');

-- R5: a tenant with no default location gets a clear error.
set test.tenant = '22222222-2222-2222-2222-222222222222';
set test.service_role = 'off';
do $$ begin
  perform public.create_retail_item('22222222-2222-2222-2222-222222222222', null,
    'Thing', null, null, 0, null, null, 0);
  raise exception 'FAIL: R5 created without a location';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if sqlerrm not like '%default location%' then raise exception 'FAIL: R5 wrong error: %', sqlerrm; end if;
  raise notice 'PASS: R5 %', sqlerrm;
end $$;
reset test.tenant;

select pg_temp.check(not has_function_privilege('anon',
  'public.create_retail_item(uuid,uuid,text,text,text,numeric,uuid,uuid,numeric)', 'execute'),
  'R6 anon has no EXECUTE');
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bash scripts/scratch-db.sh up && bash scripts/scratch-db.sh sql supabase/__tests__/2026-09-25-retail-stock-foundation.verify.sql`
Expected: S1–S6 PASS, then an error at R1: `function public.create_retail_item(...) does not exist`.

- [ ] **Step 3: Append the function to the patch**

```sql
-- Retail item scaffold, one transaction. A retail item is a normal variant
-- whose product has kind = 'retail' and whose active BOM is a single
-- component at qty 1; the component carries cost, supplier, reorder point
-- and the stock. p_variant_id null → create product + variant. Non-null →
-- attach to that variant (a Shopify-imported one, typically).
create or replace function public.create_retail_item(
  p_tenant_id uuid,
  p_variant_id uuid,
  p_name text,
  p_sku text,
  p_barcode text,
  p_cost_per_unit numeric,
  p_supplier_id uuid,
  p_location_id uuid,
  p_reorder_point numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(trim(p_name), '');
  v_sku text := nullif(trim(p_sku), '');
  v_barcode text := nullif(trim(p_barcode), '');
  v_product_id uuid;
  v_variant_id uuid;
  v_component_id uuid;
  v_location_id uuid;
  v_bom_id uuid;
  v_version integer;
begin
  perform public.assert_tenant_write_access(p_tenant_id);

  if v_name is null then
    raise exception 'name is required';
  end if;

  v_location_id := coalesce(
    p_location_id,
    (select l.id from public.location l where l.tenant_id = p_tenant_id and l.is_default limit 1)
  );
  if v_location_id is null then
    raise exception 'no default location: set one in Settings → Locations first';
  end if;
  if not exists (select 1 from public.location l where l.id = v_location_id and l.tenant_id = p_tenant_id) then
    raise exception 'forbidden: location does not belong to this tenant' using errcode = '42501';
  end if;
  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers s where s.id = p_supplier_id and s.tenant_id = p_tenant_id
  ) then
    raise exception 'forbidden: supplier does not belong to this tenant' using errcode = '42501';
  end if;

  if p_variant_id is null then
    insert into public.product (tenant_id, title, source, kind)
    values (p_tenant_id, v_name, 'manual', 'retail')
    returning id into v_product_id;

    insert into public.product_variant (tenant_id, product_id, title, sku, barcode, source)
    values (p_tenant_id, v_product_id, 'Default', v_sku, v_barcode, 'manual')
    returning id into v_variant_id;
  else
    select v.id, v.product_id into v_variant_id, v_product_id
    from public.product_variant v
    where v.id = p_variant_id and v.tenant_id = p_tenant_id
    for update;
    if v_variant_id is null then
      raise exception 'forbidden: variant does not belong to this tenant' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.product_bom b
      where b.tenant_id = p_tenant_id and b.variant_id = v_variant_id and b.is_active
    ) then
      raise exception 'this variant already has an active BOM';
    end if;

    update public.product set kind = 'retail' where id = v_product_id;
    update public.product_variant
      set barcode = coalesce(barcode, v_barcode)
      where id = v_variant_id;
  end if;

  insert into public.component (tenant_id, name, sku, cost_per_unit, supplier_id, location_id, reorder_point)
  values (p_tenant_id, v_name, v_sku, coalesce(p_cost_per_unit, 0), p_supplier_id, v_location_id, coalesce(p_reorder_point, 0))
  returning id into v_component_id;

  insert into public.inventory_balance (tenant_id, component_id, location_id)
  values (p_tenant_id, v_component_id, v_location_id)
  on conflict (tenant_id, component_id, location_id) do nothing;

  select coalesce(max(b.version), 0) + 1 into v_version
  from public.product_bom b
  where b.tenant_id = p_tenant_id and b.variant_id = v_variant_id;

  insert into public.product_bom (tenant_id, variant_id, version, status, is_active)
  values (p_tenant_id, v_variant_id, v_version, 'active', true)
  returning id into v_bom_id;

  insert into public.product_bom_component (tenant_id, product_bom_id, component_id, quantity, yield_pct, position)
  values (p_tenant_id, v_bom_id, v_component_id, 1, 1.0, 0);

  -- Baseline: sales already fulfilled (or imported as historical) before
  -- this variant became retail are reflected in the opening stock count.
  -- Mark them consumed so a later sync never takes them off the shelf again.
  insert into public.order_line_consumption (tenant_id, order_line_id, order_id, location_id, baseline)
  select p_tenant_id, ol.id, ol.order_id, v_location_id, true
  from public.order_line ol
  join public.orders o on o.id = ol.order_id
  where ol.tenant_id = p_tenant_id
    and ol.variant_id = v_variant_id
    and (lower(o.status) = 'fulfilled' or o.historical)
  on conflict (order_line_id) do nothing;

  return v_variant_id;
end;
$$;

revoke all on function public.create_retail_item(uuid, uuid, text, text, text, numeric, uuid, uuid, numeric) from public, anon;
grant execute on function public.create_retail_item(uuid, uuid, text, text, text, numeric, uuid, uuid, numeric) to authenticated, service_role;
```

- [ ] **Step 4: Run the verify SQL**

Run: `bash scripts/scratch-db.sh up && bash scripts/scratch-db.sh sql supabase/__tests__/2026-09-25-retail-stock-foundation.verify.sql && bash scripts/verify-sale-consumption-race.sh`
Expected: S1–S6 and R1–R6 PASS, then `PASS: race`.

- [ ] **Step 5: Mutation-check the baseline**

In `$TMP/mutant.sql`, a copy of the patch, remove the baseline `insert … on conflict (order_line_id) do nothing;` statement. Load it over a fresh `up` and run the verify file. Expected: `FAIL: R4 fulfilled line baselined`. Discard the mutant.

- [ ] **Step 6: Commit**

```bash
git add supabase/patches/2026-09-25-retail-stock-foundation.sql supabase/__tests__/2026-09-25-retail-stock-foundation.verify.sql
git commit -F msg.txt   # "MANUVA-27 feat(db): create_retail_item scaffold with sales baseline"
```

---

### Task 4: `assertNoError` extraction and the consumption wrapper

**Files:**
- Create: `src/lib/supabase/assert-no-error.ts`
- Modify: `src/lib/shopify/sync.ts:76-84` (replace the definition with a re-export)
- Create: `src/lib/inventory/sale-consumption.ts`
- Test: `src/lib/inventory/sale-consumption.test.ts`

**Interfaces:**
- Produces: `assertNoError(error: { message?: string } | null, context: string): void` from `@/lib/supabase/assert-no-error` (`@/lib/shopify/sync` keeps exporting it so `assert-no-error.test.ts` still passes).
- Produces: `consumeOrderLineSale(client: RpcClient, input: { tenantId: string; orderLineId: string; locationId: string }): Promise<number>` and `isRetailLine(line: { variant?: unknown }): boolean`, where `RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/inventory/sale-consumption.test.ts
import { describe, expect, it, vi } from "vitest";
import { consumeOrderLineSale, isRetailLine } from "./sale-consumption";

describe("consumeOrderLineSale", () => {
  it("calls apply_sale_consumption and returns the component count", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const n = await consumeOrderLineSale({ rpc }, { tenantId: "t", orderLineId: "ol", locationId: "l" });
    expect(n).toBe(1);
    expect(rpc).toHaveBeenCalledWith("apply_sale_consumption", {
      p_tenant_id: "t",
      p_order_line_id: "ol",
      p_location_id: "l",
    });
  });

  it("throws when the rpc resolves with an error instead of silently returning 0", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "retail item has no active BOM" } });
    await expect(
      consumeOrderLineSale({ rpc }, { tenantId: "t", orderLineId: "ol", locationId: "l" })
    ).rejects.toThrow("apply_sale_consumption: retail item has no active BOM");
  });
});

describe("isRetailLine", () => {
  it("reads kind through object or array embeds", () => {
    expect(isRetailLine({ variant: { product: { kind: "retail" } } })).toBe(true);
    expect(isRetailLine({ variant: [{ product: [{ kind: "retail" }] }] })).toBe(true);
    expect(isRetailLine({ variant: { product: { kind: "manufactured" } } })).toBe(false);
    expect(isRetailLine({ variant: null })).toBe(false);
    expect(isRetailLine({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/inventory/sale-consumption.test.ts`
Expected: FAIL, `Cannot find module './sale-consumption'`.

- [ ] **Step 3: Implement**

```ts
// src/lib/supabase/assert-no-error.ts
// supabase-js resolves `.rpc()` and query builders with `{ data, error }`;
// it does not throw. An unchecked call looks like success — that is how
// MANUVA-16 reported plan_errors: 0 for months while writing nothing.
export function assertNoError(
  error: { message?: string } | null,
  context: string
) {
  if (!error) return;
  // `||` not `??`: an error object with an empty message is still a failure,
  // and "context: " alone tells a reader nothing.
  throw new Error(`${context}: ${error.message || "Unknown Supabase error"}`);
}
```

In `src/lib/shopify/sync.ts`, delete the `assertNoError` function body at lines 76–84 and add near the imports:
```ts
import { assertNoError } from "@/lib/supabase/assert-no-error";
export { assertNoError };
```

```ts
// src/lib/inventory/sale-consumption.ts
import { assertNoError } from "@/lib/supabase/assert-no-error";

type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

// Consumes one fulfilled retail order line: on_hand down by the BOM
// requirement, its reservation released, one 'sale' movement — atomically
// and at most once per line. See
// supabase/patches/2026-09-25-retail-stock-foundation.sql.
export async function consumeOrderLineSale(
  client: RpcClient,
  input: { tenantId: string; orderLineId: string; locationId: string }
): Promise<number> {
  const { data, error } = await client.rpc("apply_sale_consumption", {
    p_tenant_id: input.tenantId,
    p_order_line_id: input.orderLineId,
    p_location_id: input.locationId,
  });
  assertNoError(error as { message?: string } | null, "apply_sale_consumption");
  return Number(data ?? 0);
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// order_line selected with `variant:variant_id(product:product_id(kind))`.
export function isRetailLine(line: { variant?: unknown }): boolean {
  const variant = first(line.variant as { product?: unknown } | { product?: unknown }[] | null);
  const product = first(variant?.product as { kind?: string } | { kind?: string }[] | null);
  return product?.kind === "retail";
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/inventory/sale-consumption.test.ts src/lib/shopify/assert-no-error.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/assert-no-error.ts src/lib/shopify/sync.ts src/lib/inventory/sale-consumption.ts src/lib/inventory/sale-consumption.test.ts
git commit -F msg.txt   # "MANUVA-27 feat(inventory): consumeOrderLineSale wrapper"
```

---

### Task 5: Fulfilled retail lines consume in reconcile; sync stops swallowing failures

**Files:**
- Modify: `src/lib/allocation/reconcile-order.ts` (the `OrderLineRow` type, both order-line selects, the `shouldClearOnly` branch)
- Modify: `src/lib/shopify/sync.ts` (the `reconcileOrderAllocations` loop, around line 515, and the returned summary)
- Test: `src/lib/allocation/release-order.test.ts` (append)

**Interfaces:**
- Consumes: `consumeOrderLineSale`, `isRetailLine` (Task 4).
- Produces: `ReconcileOrderResult` gains `consumed: number`. Sync result gains `allocation_errors: number`.

- [ ] **Step 1: Write the failing tests** (append to `release-order.test.ts`, reusing its `makeFakeClient`)

```ts
describe("reconcileOrderAllocations — retail consumption", () => {
  const retailLine = { id: "ol-r", variant_id: "v-r", quantity: 3, variant: { product: { kind: "retail" } } };
  const madeLine = { id: "ol-m", variant_id: "v-m", quantity: 1, variant: { product: { kind: "manufactured" } } };

  it("fulfilled retail line → apply_sale_consumption, no reserved release", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const client = makeFakeClient(
      {
        orders: [{ id: "o1", status: "fulfilled", historical: false }],
        location: [{ id: "loc" }],
        order_line: [retailLine],
        order_component_allocation: [{ id: "a1", component_id: "c1", quantity: 3 }],
      },
      rpc
    );
    const result = await reconcileOrderAllocations(client, "t", "o1");
    expect(rpc).toHaveBeenCalledWith("apply_sale_consumption", {
      p_tenant_id: "t", p_order_line_id: "ol-r", p_location_id: "loc",
    });
    expect(rpc).not.toHaveBeenCalledWith("apply_reserved_movement", expect.anything());
    expect(result.consumed).toBe(1);
  });

  it("mixed order: retail line consumes, manufactured line only releases", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const client = makeFakeClient(
      {
        orders: [{ id: "o1", status: "fulfilled", historical: false }],
        location: [{ id: "loc" }],
        order_line: [retailLine, madeLine],
        order_component_allocation: [{ id: "a1", component_id: "c1", quantity: 1 }],
      },
      rpc
    );
    await reconcileOrderAllocations(client, "t", "o1");
    const names = rpc.mock.calls.map((c) => c[0]);
    expect(names.filter((n) => n === "apply_sale_consumption")).toHaveLength(1);
    expect(names).toContain("apply_reserved_movement");
  });

  it("cancelled retail order releases, never consumes", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = makeFakeClient(
      {
        orders: [{ id: "o1", status: "cancelled", historical: false }],
        location: [{ id: "loc" }],
        order_line: [retailLine],
        order_component_allocation: [{ id: "a1", component_id: "c1", quantity: 3 }],
      },
      rpc
    );
    await reconcileOrderAllocations(client, "t", "o1");
    expect(rpc).not.toHaveBeenCalledWith("apply_sale_consumption", expect.anything());
  });

  it("consumption error propagates instead of reporting success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "retail item has no active BOM" } });
    const client = makeFakeClient(
      {
        orders: [{ id: "o1", status: "fulfilled", historical: false }],
        location: [{ id: "loc" }],
        order_line: [retailLine],
      },
      rpc
    );
    await expect(reconcileOrderAllocations(client, "t", "o1")).rejects.toThrow("no active BOM");
  });
});
```

If `makeFakeClient`'s signature differs from `(tableData, rpcMock)`, adapt these calls to match the helper defined earlier in the file. Do not change the helper.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/allocation/release-order.test.ts`
Expected: the four new tests FAIL (no `apply_sale_consumption` call; `consumed` undefined). Existing tests still PASS.

- [ ] **Step 3: Implement in `reconcile-order.ts`**

```ts
import { consumeOrderLineSale, isRetailLine } from "@/lib/inventory/sale-consumption";

type OrderLineRow = {
  id: string;
  variant_id: string;
  quantity: number;
  variant?: unknown;
};

export type ReconcileOrderResult = {
  applied: number;
  skippedMissingBom: number;
  clearedOnly: boolean;
  consumed: number;
};
```

In `reconcileOrderAllocations`, change the order-line select to `"id,variant_id,quantity,variant:variant_id(product:product_id(kind))"`, add `consumed: 0` to each early `return`, and replace the `shouldClearOnly` branch:

```ts
  const status = String(order.status ?? "").toLowerCase();
  const shouldClearOnly = ["fulfilled", "cancelled"].includes(status);
  let applied = 0;
  let skippedMissingBom = 0;
  let consumed = 0;

  for (const line of lines) {
    if (shouldClearOnly) {
      // A fulfilled retail line is a sale off the shelf: consume it (which
      // also releases its reservation, in the same transaction). Everything
      // else keeps today's behaviour — release only.
      if (status === "fulfilled" && isRetailLine(line)) {
        if ((await consumeOrderLineSale(client, { tenantId, orderLineId: line.id, locationId })) > 0) {
          consumed += 1;
        }
        continue;
      }
      applied += await clearLineAllocations(client, tenantId, orderId, locationId, line.id);
      continue;
    }
```

and return `{ applied, skippedMissingBom, clearedOnly: shouldClearOnly, consumed }`. Existing tests that assert the whole result with `toEqual` need `consumed: 0` added. That is the only permitted edit to existing tests; if any other existing assertion fails, the change is wrong. Leave `releaseOrderAllocations` (historical orders) unchanged: historical orders never consume.

- [ ] **Step 4: Stop swallowing reconcile failures in `sync.ts`**

Replace the loop at `src/lib/shopify/sync.ts` (around line 515):

```ts
  let allocationRuns = 0;
  let allocationErrors = 0;
  for (const localOrderId of liveOrderLocalIds) {
    try {
      await reconcileOrderAllocations(admin, tenantId, localOrderId);
      allocationRuns += 1;
    } catch (err) {
      allocationErrors += 1;
      console.error(
        `[shopify-sync] reconcileOrderAllocations failed for ${localOrderId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
```

Then add `allocation_errors: allocationErrors` next to the existing `allocation_runs` / `plan_errors` fields in the object the sync returns and logs (`grep -n "plan_errors" src/lib/shopify/sync.ts` shows each place).

- [ ] **Step 5: Run the tests and type-check**

Run: `npx vitest run src/lib/allocation src/lib/shopify && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Mutation-check**

Temporarily change `status === "fulfilled" && isRetailLine(line)` to `false`. Run `npx vitest run src/lib/allocation/release-order.test.ts`. Expected: "fulfilled retail line" and "mixed order" FAIL. Revert.

- [ ] **Step 7: Commit**

```bash
git add src/lib/allocation/reconcile-order.ts src/lib/allocation/release-order.test.ts src/lib/shopify/sync.ts
git commit -F msg.txt   # "MANUVA-27 feat(allocation): fulfilled retail lines consume stock; sync reports allocation errors"
```

---

### Task 6: Shopify barcode backfill

Plan 2's matcher reads `product_variant.barcode`. Shopify already has it; the sync just never asked.

**Files:**
- Create: `src/lib/shopify/variant-fields.ts`
- Test: `src/lib/shopify/variant-fields.test.ts`
- Modify: `src/lib/shopify/sync.ts:31` (type), `:147` (GraphQL selection), `:374-384` (variant row)

**Interfaces:**
- Produces: `normaliseBarcode(raw: string | null | undefined): string | null`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shopify/variant-fields.test.ts
import { describe, expect, it } from "vitest";
import { normaliseBarcode } from "./variant-fields";

describe("normaliseBarcode", () => {
  it("returns null for missing or blank values so empty barcodes never match each other", () => {
    expect(normaliseBarcode(null)).toBeNull();
    expect(normaliseBarcode(undefined)).toBeNull();
    expect(normaliseBarcode("")).toBeNull();
    expect(normaliseBarcode("   ")).toBeNull();
  });
  it("trims but otherwise preserves the value (leading zeros matter in a GTIN)", () => {
    expect(normaliseBarcode(" 0093000000017 ")).toBe("0093000000017");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/shopify/variant-fields.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement and wire in**

```ts
// src/lib/shopify/variant-fields.ts
// Shopify returns "" for a variant with no barcode. Stored as-is, every
// barcode-less variant would share the value "" and the Square matcher
// (MANUVA-27 plan 2) would treat them as matches.
export function normaliseBarcode(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed === "" ? null : trimmed;
}
```

In `sync.ts`:
- line 31: `variants: { nodes: Array<{ id: string; title: string | null; sku: string | null; barcode: string | null; price: string | null }> };`
- line 147: `nodes { id title sku barcode price }`
- variant row: add `barcode: normaliseBarcode(variant.barcode),` after `sku: variant.sku,`, and import `normaliseBarcode` from `./variant-fields`.

This overwrites a barcode typed in Manuva for a Shopify-sourced variant on every sync. That is intended: for a `source = 'shopify'` variant, Shopify is the system of record for catalog fields, same as `sku` today.

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/lib/shopify && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shopify/variant-fields.ts src/lib/shopify/variant-fields.test.ts src/lib/shopify/sync.ts
git commit -F msg.txt   # "MANUVA-27 feat(shopify): sync variant barcodes"
```

---

### Task 7: `createRetailItem` server action

**Files:**
- Create: `src/lib/products/retail-item.ts`
- Test: `src/lib/products/retail-item.test.ts`
- Create: `src/app/app/products/retail-actions.ts`

**Interfaces:**
- Produces: `parseRetailItemForm(form: FormData): { ok: true; value: RetailItemInput } | { ok: false; error: string }`, where `RetailItemInput = { variantId: string | null; name: string; sku: string | null; barcode: string | null; costPerUnit: number; supplierId: string | null; locationId: string | null; reorderPoint: number }`.
- Produces: `createRetailItem(prev: RetailItemState, form: FormData): Promise<RetailItemState>`, where `RetailItemState = { error?: string; variantId?: string }`. On success, redirects to `/app/products/variants/{variantId}`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/products/retail-item.test.ts
import { describe, expect, it } from "vitest";
import { parseRetailItemForm } from "./retail-item";

function form(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("parseRetailItemForm", () => {
  it("parses a full form", () => {
    const r = parseRetailItemForm(form({
      name: " Argan Oil ", sku: "OIL-50", barcode: "9300000000031",
      cost_per_unit: "12.50", reorder_point: "4", supplier_id: "s1", location_id: "", variant_id: "",
    }));
    expect(r).toEqual({ ok: true, value: {
      variantId: null, name: "Argan Oil", sku: "OIL-50", barcode: "9300000000031",
      costPerUnit: 12.5, supplierId: "s1", locationId: null, reorderPoint: 4,
    }});
  });
  it("requires a name", () => {
    expect(parseRetailItemForm(form({ name: "  " }))).toEqual({ ok: false, error: "Name is required." });
  });
  it("rejects negative or non-numeric cost and reorder point", () => {
    expect(parseRetailItemForm(form({ name: "x", cost_per_unit: "-1" })).ok).toBe(false);
    expect(parseRetailItemForm(form({ name: "x", reorder_point: "abc" })).ok).toBe(false);
  });
  it("treats blank numbers as 0", () => {
    const r = parseRetailItemForm(form({ name: "x", cost_per_unit: "", reorder_point: "" }));
    expect(r.ok && r.value.costPerUnit === 0 && r.value.reorderPoint === 0).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/products/retail-item.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the parser**

```ts
// src/lib/products/retail-item.ts
export type RetailItemInput = {
  variantId: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  costPerUnit: number;
  supplierId: string | null;
  locationId: string | null;
  reorderPoint: number;
};

function text(form: FormData, key: string): string | null {
  const v = form.get(key)?.toString().trim() ?? "";
  return v === "" ? null : v;
}

function nonNegative(form: FormData, key: string): number | null {
  const raw = text(form, key);
  if (raw === null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseRetailItemForm(
  form: FormData
): { ok: true; value: RetailItemInput } | { ok: false; error: string } {
  const name = text(form, "name");
  if (!name) return { ok: false, error: "Name is required." };
  const costPerUnit = nonNegative(form, "cost_per_unit");
  if (costPerUnit === null) return { ok: false, error: "Cost must be a number of 0 or more." };
  const reorderPoint = nonNegative(form, "reorder_point");
  if (reorderPoint === null) return { ok: false, error: "Reorder point must be a number of 0 or more." };
  return {
    ok: true,
    value: {
      variantId: text(form, "variant_id"),
      name,
      sku: text(form, "sku"),
      barcode: text(form, "barcode"),
      costPerUnit,
      supplierId: text(form, "supplier_id"),
      locationId: text(form, "location_id"),
      reorderPoint,
    },
  };
}
```

- [ ] **Step 4: Implement the action**

```ts
// src/app/app/products/retail-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity/log";
import { parseRetailItemForm } from "@/lib/products/retail-item";

export type RetailItemState = { error?: string; variantId?: string };

export async function createRetailItem(
  _prev: RetailItemState,
  form: FormData
): Promise<RetailItemState> {
  const context = await getServerTenantContext();
  if (!context?.tenantId) return { error: "Missing tenant context." };
  if (context.role !== "admin" && context.role !== "super_admin") {
    return { error: "Only admins can create retail items." };
  }

  const parsed = parseRetailItemForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const input = parsed.value;

  // Super-admins viewing as a tenant use the admin client (same rule as
  // requireBomEditor in ./actions.ts); the RPC re-checks tenant access.
  const db = context.role === "super_admin" ? createSupabaseAdminClient() : context.supabase;
  const { data, error } = await db.rpc("create_retail_item", {
    p_tenant_id: context.tenantId,
    p_variant_id: input.variantId,
    p_name: input.name,
    p_sku: input.sku,
    p_barcode: input.barcode,
    p_cost_per_unit: input.costPerUnit,
    p_supplier_id: input.supplierId,
    p_location_id: input.locationId,
    p_reorder_point: input.reorderPoint,
  });
  if (error) return { error: error.message || "Could not create the retail item." };

  const variantId = data as string;
  await logActivity({
    event: input.variantId ? "product.retail_attached" : "product.retail_created",
    metadata: { variant_id: variantId, name: input.name, sku: input.sku },
  });
  revalidatePath("/app/products");
  redirect(`/app/products/variants/${variantId}`);
}
```

Check `logActivity`'s signature in `src/lib/activity/log.ts` before relying on `metadata`. If it takes a different shape, match the existing call sites.

- [ ] **Step 5: Run tests and type-check**

Run: `npx vitest run src/lib/products && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/products/retail-item.ts src/lib/products/retail-item.test.ts src/app/app/products/retail-actions.ts
git commit -F msg.txt   # "MANUVA-27 feat(products): createRetailItem server action"
```

---

### Task 8: Retail item UI, docs, and production rollout

**Files:**
- Create: `src/app/app/products/retail-item-dialog.tsx`, `src/app/app/products/retail-item-dialog.module.css`
- Modify: `src/app/app/products/page.tsx:454-465` (header actions)
- Modify: `src/app/app/products/variants/[variantId]/page.tsx` (variant select ~line 152, top card ~line 562)
- Modify: `supabase/schema.sql`, `docs/qa-feature-test-plan.md`

**Interfaces:**
- Consumes: `createRetailItem`, `RetailItemState` (Task 7).
- Produces: `<RetailItemDialog mode="create" | "attach" variantId? defaultName? defaultSku? suppliers locations />`.

- [ ] **Step 1: Build the dialog**

Open `src/app/app/components/component-create-form.tsx` and follow its `<dialog>` + `useActionState` pattern exactly (ref, `showModal`, close button, error line).

```tsx
// src/app/app/products/retail-item-dialog.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { createRetailItem, type RetailItemState } from "./retail-actions";
import styles from "./retail-item-dialog.module.css";

type Option = { id: string; name: string };

type Props = {
  mode: "create" | "attach";
  variantId?: string;
  defaultName?: string;
  defaultSku?: string | null;
  suppliers: Option[];
  locations: Option[];
};

const initialState: RetailItemState = {};

export default function RetailItemDialog({ mode, variantId, defaultName, defaultSku, suppliers, locations }: Props) {
  const [state, formAction, pending] = React.useActionState(createRetailItem, initialState);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) dialog.showModal();
    else dialog.close();
  }, [open]);

  const title = mode === "create" ? "New retail item" : "Track as retail item";

  return (
    <>
      <button type="button" className={mode === "create" ? styles.primaryBtn : styles.secondaryBtn} onClick={() => setOpen(true)}>
        {title}
      </button>
      <dialog ref={dialogRef} className={styles.dialog} onClose={() => setOpen(false)}>
        <form action={formAction} className={styles.form}>
          <div className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close">×</button>
          </div>
          <p className={styles.hint}>
            A product you buy in and sell unchanged. Manuva tracks its shelf stock and takes it
            off when an order is fulfilled.
          </p>
          {variantId ? <input type="hidden" name="variant_id" value={variantId} /> : null}
          <label className={styles.field}>
            <span className={styles.label}>Name</span>
            <input name="name" required defaultValue={defaultName} className={styles.input} />
          </label>
          {mode === "create" ? (
            <>
              <label className={styles.field}>
                <span className={styles.label}>SKU</span>
                <input name="sku" defaultValue={defaultSku ?? ""} className={styles.input} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Barcode</span>
                <input name="barcode" inputMode="numeric" className={styles.input} />
              </label>
            </>
          ) : null}
          <label className={styles.field}>
            <span className={styles.label}>Unit cost</span>
            <input name="cost_per_unit" type="number" min="0" step="0.01" className={styles.input} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Reorder point</span>
            <input name="reorder_point" type="number" min="0" step="1" className={styles.input} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Supplier</span>
            <select name="supplier_id" className={styles.input} defaultValue="">
              <option value="">—</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Stock location</span>
            <select name="location_id" className={styles.input} defaultValue="">
              <option value="">Default location</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
          <div className={styles.actions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className={styles.primaryBtn} disabled={pending}>
              {pending ? "Saving…" : mode === "create" ? "Create" : "Track stock"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
```

```css
/* src/app/app/products/retail-item-dialog.module.css */
.primaryBtn { composes: primary from "../_ui/buttons.module.css"; }
.secondaryBtn { composes: secondary from "../_ui/buttons.module.css"; }

.dialog {
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  padding: 0;
  width: min(480px, calc(100vw - 32px));
  color: var(--ink-strong);
}
.form { display: grid; gap: 12px; padding: 18px; }
.header { display: flex; justify-content: space-between; align-items: center; }
.title { font-size: var(--fs-base); font-weight: var(--fw-semibold); margin: 0; }
.close { background: none; border: 0; color: var(--ink-muted); font-size: var(--fs-base); cursor: pointer; }
.hint { font-size: var(--fs-sm); color: var(--ink-muted); margin: 0; }
.field { display: grid; gap: 4px; }
.label {
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
  color: var(--ink-muted);
}
.input {
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  color: var(--ink-strong);
  padding: 8px 10px;
  font-size: var(--fs-base);
}
.error { color: var(--danger); font-size: var(--fs-sm); margin: 0; }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
```

Before committing, check every token used here exists in `C:\dev\manuva-tokens\Manuva Design System\colors_and_type.css` (`grep -o "\-\-[a-z0-9-]*" retail-item-dialog.module.css | sort -u`, then grep each one). Replace any that do not exist with the nearest real token.

- [ ] **Step 2: Mount it**

- **Products page:** in `page.tsx`, load `suppliers` (`id,name`) and `location` (`id,name`) for the tenant beside the existing queries. Wrap the header `actions` in a fragment holding `<RetailItemDialog mode="create" suppliers={…} locations={…} />` and the existing Import form. Show the dialog only when the context role is `admin` or `super_admin`.
- **Variant page:** extend the variant select at line 152 to `product:product_id(id,title,kind)`. In the top card (line 562):
  - `kind === 'retail'` → add `<StatusBadge variant="info">Retail item</StatusBadge>` after the SKU line (`import StatusBadge from "@/app/app/_ui/status-badge";`, `import RetailItemDialog from "../../retail-item-dialog";`).
  - Otherwise, when there is no active BOM and the user is admin → render `<RetailItemDialog mode="attach" variantId={variantId} defaultName={`${product.title} ${variantTitle}`} defaultSku={typedVariant.sku} … />`.

- [ ] **Step 3: Update `supabase/schema.sql`**

Add `kind` to `product` and `barcode` to `product_variant`, the `order_line_consumption` table, and both functions, matching the patch exactly. This keeps the reference schema, and so the scratch harness, current.

- [ ] **Step 4: Update `docs/qa-feature-test-plan.md`**

Under `## 2. Products, Variants & Catalog`, add:

```markdown
### Retail items — `/app/products` (New retail item), variant detail (Track as retail item) **(admin)**
- [ ] New retail item creates product + variant + component + active 1-line BOM; lands on the variant page with a "Retail item" badge
- [ ] Track as retail item on a variant with no active BOM attaches a component + BOM; offered only when there is no active BOM
- [ ] Name required; negative cost / reorder point rejected with a message
- [ ] No default location → clear error pointing at Settings → Locations
- [ ] Converting a variant with already-fulfilled orders does not consume stock for those orders on the next sync (baseline)
```

Under `### Allocation engine (reconcile)`, add:

```markdown
- [ ] Fulfilled **retail** line → `apply_sale_consumption`: on_hand down by qty, reservation released, one `sale` movement; re-running is a no-op
- [ ] Fulfilled manufactured line → unchanged (release only); mixed orders handle each line by its product kind
- [ ] Consumption failure → surfaced as `allocation_errors` in the sync result, not swallowed
- [ ] Shopify sync stores variant barcode; blank barcode stored as null
```

Append to `## Changelog`:
`- 2026-09-25 — added Retail items + sale consumption (MANUVA-27 plan 1): retail products carry shelf stock through a one-line BOM, and a fulfilled sale of one decrements on_hand exactly once via apply_sale_consumption. Manufactured products are unchanged. Shopify sync now stores variant barcodes and reports allocation errors instead of swallowing them.`

(Use the actual date the work lands.)

- [ ] **Step 5: Full local check**

Run: `npm test && npx tsc --noEmit && npm run lint && bash scripts/scratch-db.sh up && bash scripts/scratch-db.sh sql supabase/__tests__/2026-09-25-retail-stock-foundation.verify.sql && bash scripts/verify-sale-consumption-race.sh && bash scripts/scratch-db.sh down`
Expected: all green, all PASS.

Then `npm run dev` and in the browser: create a retail item, open its variant page, see the badge. On a Shopify variant with no BOM, run Track as retail item. Capture a screenshot of each.

- [ ] **Step 6: Commit**

```bash
git add src/app/app/products/retail-item-dialog.tsx src/app/app/products/retail-item-dialog.module.css src/app/app/products/page.tsx "src/app/app/products/variants/[variantId]/page.tsx" supabase/schema.sql docs/qa-feature-test-plan.md
git commit -F msg.txt   # "MANUVA-27 feat(products): retail item dialog and badge"
```

- [ ] **Step 7: USER GATE — apply to production**

Stop and ask the user for an explicit yes before this step. Then:
1. Apply `supabase/patches/2026-09-25-retail-stock-foundation.sql` via the Supabase MCP `apply_migration` (name `retail_stock_foundation`).
2. Read back: `select proname, proacl from pg_proc where proname in ('apply_sale_consumption','create_retail_item');` confirms no `anon` / `=X/` (PUBLIC) entry; `select count(*) from product where kind <> 'manufactured';` returns 0.
3. Run `bash scripts/probe_anon_rpc_surface.sh`. Expected: exit 0.
4. Push the branch and open a PR titled `MANUVA-27 Retail stock foundation (Square plan 1/3)`. Merge only on the user's say-so.
