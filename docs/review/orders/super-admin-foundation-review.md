# Code Review — `feat/super-admin-foundation`

**Branch:** `feat/super-admin-foundation`  
**Reviewed:** 2026-05-28  
**Scope:** `supabase/patches/super_admin_foundation.sql` + `super_admin_foundation_rollback.sql`  
**Method:** 3-angle multi-agent review (line-by-line, removed-behavior audit, cross-file tracer)

---

## Findings

### 1. 🔴 P0 — `has_tenant_access()` not updated: `platform_observer` view-as is completely blocked

**File:** `supabase/patches/multi_tenant_access_and_super_admin.sql:55`

`has_tenant_access()` still calls `is_super_admin()` — it was never updated to `is_platform_operator()`. `set_active_tenant()` calls `has_tenant_access()` to gate access, so any `platform_observer` who calls `set_active_tenant(uuid)` gets the exception `'No access to tenant'` unconditionally.

**Failure scenario:** `platform_observer` with `NULL tenant_id` tries to enter view-as mode → `has_tenant_access()` → `is_super_admin()` → `false` → exception. Observer cannot switch tenant context at all, which means every business-table RLS policy (`tenant_id = current_tenant_id()`) also fails since `current_tenant_id()` returns `NULL` for them. Zero access to any business data.

**Fix:** Update `has_tenant_access()` to use `is_platform_operator()` instead of (or in addition to) `is_super_admin()`.

---

### 2. 🔴 P0 — `current_tenant_id()` bypass not updated: second independent blocker for `platform_observer`

**File:** `supabase/patches/current_tenant_id_respects_access.sql:27`

Even if finding #1 were fixed, `current_tenant_id()` has its own `is_super_admin()` bypass on line 27. After `set_active_tenant(uuid)` writes `profiles.tenant_id = uuid`, `current_tenant_id()` checks:

1. `is_super_admin()` → `false` for `platform_observer`
2. `exists(profile_tenant_access WHERE profile_id = uid AND tenant_id = p.tenant_id)` → `false` (observer has no `profile_tenant_access` rows)

Both branches fail → function returns `NULL` → all business-table policies deny.

**Failure scenario:** Even after fixing `has_tenant_access()`, observer sets active tenant, then queries `orders` — `current_tenant_id()` returns `NULL`, policy `tenant_id = NULL` is `NULL` (not `TRUE`), zero rows returned.

**Fix:** Add `OR is_platform_operator()` to `current_tenant_id()`, or insert a `profile_tenant_access` row during `set_active_tenant()` for platform operators (and clean it up on exit).

---

### 3. 🟠 P1 — `ALTER TABLE ADD CONSTRAINT` aborts the full migration if any null-tenant non-operator profile exists

**File:** `supabase/patches/super_admin_foundation.sql:5`

```sql
alter table public.profiles
  add constraint profiles_tenant_id_required_for_members
  check (tenant_id is not null or role in ('super_admin', 'platform_observer'));
```

PostgreSQL validates `ADD CONSTRAINT` against every existing row immediately. Any profile with `(tenant_id IS NULL, role = 'member')` — a partially-onboarded user, a failed invite, a legacy test row — will raise a constraint violation and abort the transaction, rolling back all preceding changes (including the `drop not null`).

**Failure scenario:** Production DB has one orphaned profile row with `tenant_id = NULL` and `role = 'member'`. Migration fails, entire patch rolls back silently with a constraint error. No RLS changes are applied.

**Fix:** Add a pre-flight check before the `ALTER TABLE`:
```sql
do $$
begin
  if exists (
    select 1 from public.profiles
    where tenant_id is null
      and role not in ('super_admin', 'platform_observer')
  ) then
    raise exception 'Pre-flight failed: profiles with null tenant_id exist for non-operator roles';
  end if;
end $$;
```
Or use `ADD CONSTRAINT ... NOT VALID` + a separate `VALIDATE CONSTRAINT` step after cleaning up any offending rows.

---

### 4. 🟡 P2 — `get_user_emails()` not updated to `is_platform_operator()`

**File:** `supabase/patches/super_admin_get_user_emails.sql:12`

```sql
where u.id = any(p_ids)
  and public.is_super_admin()   -- ← not updated
```

`platform_observer` calling `get_user_emails()` gets zero rows — no error, just blank emails.

**Failure scenario:** Observer loads a tenant's user list in the admin UI. The component calls `get_user_emails()` to resolve emails. `is_super_admin()` is `false` → empty result → every displayed user shows a blank email address.

**Fix:** Change `and public.is_super_admin()` → `and public.is_platform_operator()`.

---

### 5. 🟡 P2 — `super_admin_audit_log_insert` policy not updated: `platform_observer` actions unaudited at the DB layer

**File:** `supabase/patches/super_admin_v1.sql:40`

```sql
create policy super_admin_audit_log_insert on public.super_admin_audit_log
  for insert with check (public.is_super_admin());   -- ← not updated
```

The SELECT policy was updated to `is_platform_operator()` in the forward migration (section 4), but the INSERT policy was not. Any application code that audits a `platform_observer` action via `INSERT INTO super_admin_audit_log` will be silently blocked under RLS.

**Failure scenario:** Observer views a tenant's billing data; application tries to log `observer_viewed_tenant_invoices`. INSERT is denied by RLS, returns no error, no audit record written. Observer actions are untrackable at the database layer.

**Fix:** Update `super_admin_audit_log_insert` policy to `with check (public.is_platform_operator())`.

---

### 6. 🟢 P3 — Audit marker INSERT (step 5) silently produces zero rows on fresh / CI databases

**File:** `supabase/patches/super_admin_foundation.sql:258`

```sql
insert into public.super_admin_audit_log (actor_id, action, metadata)
select id, 'privacy_model_tightened', jsonb_build_object(...)
from public.profiles
where role = 'super_admin'
limit 1;
```

If no `super_admin` profile exists (fresh DB, CI pipeline, staging before the `super_admin_v1.sql` promotion has run), the `SELECT` returns zero rows, the `INSERT` inserts nothing, and the migration succeeds with no error or notice.

**Failure scenario:** CI applies patches in a fresh database. The `privacy_model_tightened` audit entry is never written. Any monitoring or test assertion checking for that entry finds nothing, or silently never checks.

**Fix:** Add a `RAISE NOTICE` so the absence is visible:
```sql
-- after the insert:
if not found then
  raise notice 'super_admin_foundation: no super_admin profile found — audit marker not written';
end if;
```
Or use a hardcoded `actor_id` (e.g., a sentinel UUID) instead of looking one up.

---

## Items Verified Safe

| Item | Verdict |
|------|---------|
| `"Tenant isolation"` DROP policy name casing (section 3b) | ✅ `%I` preserves case — exact match with `planning_module_schema.sql` |
| Rollback `tenant_read` omits `is_super_admin()` bypass | ✅ Original never had an explicit bypass — `has_tenant_access()` provides it internally |
| `set_active_tenant()` vs `profiles_update_self` RLS | ✅ `SECURITY DEFINER` bypasses RLS — no conflict |
| Write policies for `platform_observer` gated to `is_super_admin()` | ✅ Intentional — observer is read-only by design |
| `"tenant isolation"` lowercase case in section 3c | ✅ Direct string literal match |
