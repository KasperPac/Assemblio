# 14-Day Trial + Self-Serve Signup — Design

**Date:** 2026-05-11
**Status:** Approved design, pending implementation plan

---

## Goal

Let new customers sign up self-serve from the pricing page, get a 14-day Pro-level free trial with no credit card, and convert to a paid Stripe subscription before being locked out at day 15.

This spec covers signup, trial state, gating, Stripe Checkout + Customer Portal, paywall, team invitations, and reminder emails.

---

## Decisions captured

| Decision | Choice |
|---|---|
| Scope | Self-serve signup **and** trial in one design |
| End-of-trial when no card | Locked out behind an "Add payment method" wall |
| Billing provider | Stripe (Checkout + Customer Portal) |
| Tier selection | URL param (`?plan=...`) carried from pricing CTAs, form lets user change |
| Over-limit upgrade | Block at checkout; warn on signup form |
| `tenant_domain` auto-join | Killed — every self-serve signup creates a new tenant |
| Email verification | Off-by-default; verify-email nudged in background, clock starts at signup |
| Team invitations | In scope |
| Trial expiry transition | Derived from `(status, trial_ends_at)` — no scheduled status flip |
| Reminder cron | Daily, fires at 14:00 UTC |
| Email provider | Resend |
| Portal downgrade enforcement | Allow downgrade, surface over-limit banner |
| Past-due grace | 3-day soft lock, then paywall |

---

## Architecture overview

Five new pieces of work plus one scheduled job:

1. **Self-serve signup flow** (`/signup`) — replaces the domain-gated logic in `src/app/login/actions.ts`. Creates `tenant` + `profiles` + `profile_tenant_access` + `tenant_subscription` rows in one transaction.
2. **Subscription/trial data model** — new `tenant_subscription` table; plans defined as TypeScript constants in `src/lib/plans/`.
3. **Trial gating** — `requireActiveSubscription()` helper called from the app shell layout; redirects to `/app/billing/paywall` when derived-expired.
4. **Stripe integration** — `/api/billing/checkout`, `/api/billing/portal`, `/api/webhooks/stripe`.
5. **Team invitations** — `tenant_invitation` table + `/app/settings/team` UI + `/accept-invite/[token]` route.
6. **Reminder cron** — Vercel Cron at `/api/cron/trial-reminders`, fires daily 14:00 UTC.

The existing `tenant_domain` table remains in the schema but is no longer read by the signup path. It can be repurposed later for Enterprise SSO.

---

## Data model

### New table: `tenant_subscription`

```sql
create table public.tenant_subscription (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null unique references public.tenant(id) on delete cascade,
  selected_tier           text not null check (selected_tier in ('starter','growth','pro','enterprise')),
  status                  text not null check (status in ('trialing','active','past_due','canceled')),
  billing_interval        text check (billing_interval in ('monthly','annual')),
  trial_started_at        timestamptz not null,
  trial_ends_at           timestamptz not null,
  stripe_customer_id      text unique,
  stripe_subscription_id  text unique,
  current_period_end      timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
```

**Invariant:** `selected_tier` is the **post-trial** tier. It does not reflect what features the user can access today. Use `effectiveTier(sub)` for access decisions.

### New table: `tenant_invitation`

```sql
create table public.tenant_invitation (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant(id) on delete cascade,
  email        text not null,
  role         text not null default 'member' check (role in ('admin','member')),
  token        text not null unique,
  invited_by   uuid not null references auth.users(id),
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

create unique index tenant_invitation_pending_unique
  on public.tenant_invitation (tenant_id, email)
  where accepted_at is null;
```

### New table: `stripe_event_log` (webhook idempotency)

```sql
create table public.stripe_event_log (
  id           uuid primary key default gen_random_uuid(),
  event_id     text not null unique,
  event_type   text not null,
  processed_at timestamptz not null default now()
);
```

### New table: `trial_email_log` (reminder idempotency)

```sql
create table public.trial_email_log (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant(id) on delete cascade,
  kind       text not null check (kind in ('t_minus_3','t_minus_1','expired')),
  sent_at    timestamptz not null default now(),
  unique (tenant_id, kind)
);
```

### RLS

All new tables follow the existing `current_tenant_id()` pattern: members can read their own tenant's rows; writes go through server actions or webhook handlers using the admin client. `stripe_event_log` is admin-only.

---

## Plan definitions

`src/lib/plans/index.ts`:

```ts
export type PlanTier = 'starter' | 'growth' | 'pro' | 'enterprise';
export type BillingInterval = 'monthly' | 'annual';

export interface PlanDefinition {
  name: string;
  limits: { locations: number; users: number };  // Infinity for unlimited
  features: {
    binManagement: boolean;
    advancedBom: boolean;
    costingModule: boolean;
    reports: boolean;
    capacityPlanning: boolean;
    financialProfitability: boolean;
    exportPdfCsv: boolean;
    apiAccess: boolean;
  };
  stripePriceIds: { monthly: string; annual: string } | null;  // null for enterprise
}

export const PLANS: Record<PlanTier, PlanDefinition> = { /* ... */ };
```

Stripe price IDs are read from env vars (`STRIPE_PRICE_STARTER_MONTHLY`, …, `STRIPE_PRICE_PRO_ANNUAL`).

### Derived helpers

```ts
function effectiveTier(sub: TenantSubscription): PlanTier {
  if (sub.status === 'trialing' && new Date() <= sub.trial_ends_at) return 'pro';
  return sub.selected_tier;
}

function paywallRequired(sub: TenantSubscription): boolean {
  if (sub.status === 'canceled') return true;
  if (sub.status === 'trialing' && new Date() > sub.trial_ends_at) return true;
  return false;
}

function pastDueSoftLocked(sub: TenantSubscription): boolean {
  return sub.status === 'past_due'
    && (Date.now() - sub.updated_at.getTime()) < 3 * 24 * 60 * 60 * 1000;
}
```

---

## Signup flow

### Route: `/signup`

A new page (separate from `/login`). Pricing-page CTAs link to `/signup?plan=growth&billing=annual`. The login page gets a "New here? Start a free trial →" link.

### Form fields

| Field | Source | Required |
|---|---|---|
| Company name | input | yes — becomes `tenant.name` |
| Work email | input | yes |
| Password | input | yes (min 8 chars) |
| Plan | `?plan=` URL param, defaults to `growth`, user-changeable via inline tier selector | yes |
| Billing interval | `?billing=` URL param, defaults to `annual` | yes |

### Limits preview

Below the tier selector, a small card displays the selected tier's post-trial limits, e.g.:

> **Starter — what you'll get after the trial**
> 1 warehouse location · 3 team members · Basic BOM only

Updates live when the user changes tier.

### Server action: `signUp(formData)`

1. Validate inputs; bail on invalid plan / billing interval / weak password.
2. `auth.signUp({ email, password })`. Email confirmation off so the user is signed in immediately.
3. Begin Postgres transaction (admin client):
   - `insert into tenant (name) values (...) returning id`
   - `insert into profiles (id, tenant_id, role='admin')`
   - `insert into profile_tenant_access (profile_id, tenant_id, role='admin')`
   - `insert into tenant_subscription` with `selected_tier`, `billing_interval`, `status='trialing'`, `trial_started_at=now()`, `trial_ends_at=now() + interval '14 days'`
   - `insert into activity_log` (`event='tenant.created'`)
4. Send verification email in background (nudge only; not gated).
5. Redirect to `/app`.

### Failure handling

Any insert failure rolls back the transaction. The auth user (step 2) is not part of the transaction — on rollback, `admin.auth.admin.deleteUser(id)` is called in the catch block. If that itself fails, log `signup.orphan_auth_user` to `activity_log` for later reconciliation.

### Old code removed

`src/app/login/actions.ts:signUp` is deleted. The login page only handles sign-in.

---

## Trial state and gating

### Where the gate runs

A new helper `requireActiveSubscription()` is called at the top of `src/app/app/layout.tsx`, after `getServerTenantContext()` and before page rendering.

```ts
const ctx = await getServerTenantContext();
if (!ctx) redirect('/login');

const access = await getSubscriptionAccess(ctx.supabase, ctx.tenantId);

if (access.state === 'paywall')  redirect('/app/billing/paywall');
if (access.state === 'past_due_locked') redirect('/app/billing/past-due');
```

### `getSubscriptionAccess()` logic

| `status` | Time check | Result |
|---|---|---|
| `active` | — | `{ state: 'ok' }` |
| `trialing` | `now() <= trial_ends_at` | `{ state: 'ok', daysLeft }` |
| `trialing` | `now() > trial_ends_at` | `{ state: 'paywall' }` |
| `past_due` | `now() - updated_at < 3 days` | `{ state: 'ok_soft_warn' }` |
| `past_due` | `now() - updated_at >= 3 days` | `{ state: 'past_due_locked' }` |
| `canceled` | — | `{ state: 'paywall' }` |

### Exempt routes (not gated)

- `/app/billing/*` (paywall, past-due, success-from-checkout)
- `/app/account/logout`

### Trial banner

Shown in the app shell when `state='ok' && status='trialing'`:

> **9 days left in your free trial.** You're on a *Pro* trial. After it ends, you'll be on the *Growth* plan. **Upgrade now →**

The "Upgrade now" CTA posts to `/api/billing/checkout`.

### Feature gating

`<RequireFeature feature="advancedBom">` server component + `usePlan()` server helper, both reading `effectiveTier(sub)` and checking `PLANS[tier].features`. Trial users see all features unlocked (Pro effective). Post-trial Starter sees advanced features hidden or replaced with inline upsells.

### Limit gating

Enforced at create-time only. Server actions for `createLocation`, `inviteTeammate`, etc. call `assertWithinLimit('locations' | 'users', tenantId)`, which counts current rows against `PLANS[effectiveTier].limits.<key>`. Read paths are never limit-gated — over-limit existing data stays accessible after downgrade; only new creation is blocked.

---

## Stripe integration

### Products

Three Stripe products in the dashboard (Starter, Growth, Pro), each with monthly + annual prices. Six price IDs total, configured via env. Enterprise has no Stripe product (sales-led).

### Routes

| Route | Purpose |
|---|---|
| `POST /api/billing/checkout` | Create a Stripe Checkout session for `{tier, billing_interval}`. Lazily creates `stripe_customer_id` on first call. Pre-checks over-limit before opening Stripe. |
| `POST /api/billing/portal` | Create a Stripe Customer Portal session for the tenant's `stripe_customer_id`. |
| `POST /api/webhooks/stripe` | Verify signature with `STRIPE_WEBHOOK_SECRET`, dispatch events, write to `stripe_event_log` for idempotency. |

### Webhook events

| Event | Action |
|---|---|
| `checkout.session.completed` | Set `status='active'`, `stripe_subscription_id`, `current_period_end`, `selected_tier` (from completed price), `billing_interval`. Log `subscription.activated`. |
| `customer.subscription.updated` | Sync tier/interval/period-end if user changed plan via Portal. May result in over-limit banner. |
| `invoice.payment_failed` | Set `status='past_due'`, `updated_at=now()`. |
| `invoice.payment_succeeded` | Set `status='active'` if previously `past_due`. |
| `customer.subscription.deleted` | Set `status='canceled'`. |

### Webhook secret rotation

Two env vars supported: `STRIPE_WEBHOOK_SECRET` and `STRIPE_WEBHOOK_SECRET_NEXT`. Handler tries both signatures.

### Paywall page (`/app/billing/paywall`)

Lockout screen for derived-expired trials / canceled / hard-locked past-due.

1. **Header** — "Your free trial has ended. Choose a plan to keep going."
2. **Tier picker** — three cards (Starter, Growth, Pro). No Enterprise (sales path). Annual/monthly toggle. Pre-selects `selected_tier`. CTA on each posts to `/api/billing/checkout`.
3. **Footer** — Sign out · Contact support.

**Over-limit check** fires server-side in `/api/billing/checkout` before the Stripe session is created. If usage exceeds chosen tier's limits, return an error message: *"You have 5 locations but Starter allows 1. Upgrade to Growth, or archive locations first."*

### Past-due page (`/app/billing/past-due`)

Reached only after the 3-day soft-warn period. Same shape as paywall but copy emphasises "Update your payment method".

### Over-limit after Portal downgrade

Decided: **allow the downgrade, surface a banner**. After a `customer.subscription.updated` event drops the tier below current usage:

- Persistent in-app banner: *"You have 5 locations but Growth allows 5. You can keep existing data, but creating new locations is blocked until you're under the limit. **Resolve →**"*
- `assertWithinLimit` already blocks new creates, so this requires no additional gating logic.

---

## Team invitations

### Settings tab: `/app/settings/team`

Visible to all members; write actions admin-only.

- **Members list** — name/email, role, joined date. Admin can change role (admin ↔ member) and remove members. Removing a member deletes their `profile_tenant_access` row for this tenant; if their primary `tenant_id` pointer becomes invalid, the existing fallback logic in `getServerTenantContext()` switches it to the next available access row.
- **Pending invitations** — invitee email, role, expires-in, Resend, Revoke.
- **Invite teammate form** — email + role dropdown.

### Invitation flow

1. Admin enters email + role → `inviteTeammate()` server action.
2. `assertWithinLimit('users', tenantId)` against `PLANS[effectiveTier].limits.users`.
3. Insert (or upsert on the partial unique index) into `tenant_invitation` with 32-byte url-safe random `token` and `expires_at = now() + 7 days`.
4. Send invite email via the shared Resend wrapper. Link: `https://manuva.app/accept-invite/<token>`. Email body contains inviter name + tenant name.

### Accept flow: `/accept-invite/[token]`

Public route. Server-side:

1. Look up the invitation. If missing / expired / `accepted_at IS NOT NULL` → friendly error.
2. If the email already has an auth account → ask them to sign in (preserve `?next=`), then on return: insert `profile_tenant_access`, mark `accepted_at`, redirect to `/app` switched to that tenant.
3. If new email → minimal signup form (name + password only — no plan, no billing, no company name). On submit: create auth user, create `profiles` (`tenant_id` = invited tenant, `role` = invited role), create `profile_tenant_access`, mark `accepted_at`, sign in, redirect to `/app`.

Invitees never trigger a new tenant or a new trial.

### Limit enforcement (double-check)

`assertWithinLimit('users', tenantId)` runs both before sending the invite AND before allowing accept. Covers the race where multiple invites are sent simultaneously near the limit.

---

## Reminder emails

### Cadence

Three emails per tenant, sent to the admin who signed up:

| When | Subject |
|---|---|
| Day 11 (T-3) | "3 days left in your Manuva trial" |
| Day 13 (T-1) | "Your trial ends tomorrow" |
| Day 14/15 (T+0) | "Your trial has ended" |

Skipped if the user has already upgraded (`status='active'`) by send time.

### Cron: `/api/cron/trial-reminders`

Vercel Cron, schedule `0 14 * * *` (14:00 UTC daily). Authenticated via `Authorization: Bearer ${CRON_SECRET}`.

```
for sub in (select * from tenant_subscription where status='trialing'):
  days_until_end = (sub.trial_ends_at::date - current_date)
  match days_until_end:
    case 3 → send 't_minus_3' if not yet sent
    case 1 → send 't_minus_1' if not yet sent
    case <= 0 and >= -1 → send 'expired' if not yet sent
```

### Idempotency

Insert into `trial_email_log` with `on conflict do nothing`; only call the email API if the insert affected a row. Same-day cron re-runs are safe.

### Email transport

New `src/lib/email/send.ts` Resend wrapper. Templates as React components under `src/lib/email/templates/`. Same wrapper handles invitation emails (Section: Team invitations).

---

## Error handling & edge cases

### Signup transaction fails partway through

Steps 3a–3e share a Postgres transaction; failure rolls back and triggers `admin.auth.admin.deleteUser`. If that fails, log `signup.orphan_auth_user`. A future reconciliation job sweeps these (out of scope for v1, just a logged TODO).

### Webhook arrives before signup completes

Practically impossible (we don't talk to Stripe until first checkout). Handler is defensive: if no `tenant_subscription` row matches the `stripe_customer_id`, log and ack so Stripe doesn't retry forever.

### Duplicate webhook delivery

`stripe_event_log.event_id` unique constraint. Insert before processing; on conflict, ack and skip.

### User clicks "Upgrade" twice

Stripe Checkout sessions are inherently one-shot per completion. Webhook on `checkout.session.completed` is idempotent on `event_id`, and re-applying state is a no-op.

### User signs up, never returns, never pays

Account sits indefinitely in paywall state. A future sweep of long-paywalled tenants is **out of scope for v1**.

### User signs up twice with the same email

Supabase auth returns an error; we surface "Email already in use. Sign in instead?" with a link to `/login`.

### Two admins invite the same person concurrently

Partial unique index `(tenant_id, email) where accepted_at is null` causes one insert to conflict; treat as upsert (refresh token + expiry). One email goes out.

### Invitee already belongs to another tenant

`profile_tenant_access` allows multiple rows. Accept appends another row and switches `profiles.tenant_id` to the new tenant. Existing tenant-switching logic handles this.

### User in past_due adds a card and pays the failed invoice

Stripe fires `invoice.payment_succeeded` → `status='active'`. Soft-lock banner clears on next request.

### Selected tier drift

If a user explicitly upgrades to a different tier than `selected_tier` during the trial, `selected_tier` is updated to match what they actually bought. The pricing-page FAQ's "downgrades to the tier you selected at sign-up" is technically violated, but only by the user's own action.

---

## Testing strategy

### Unit

- `effectiveTier(sub)` — full state × time matrix.
- `getSubscriptionAccess()` — same matrix → correct `state`.
- `assertWithinLimit` — at-limit, over-limit, unlimited (Pro), trial-with-Pro-effective.
- Stripe webhook event dispatcher — fixture payloads for each event type; verifies idempotency via `stripe_event_log`.
- Invitation token generation + verification.

### Integration (Supabase local stack)

- Signup happy path — rows created with correct values; trial banner shows correct days-left.
- Signup rollback — force failure mid-transaction; assert auth user deleted, no orphans.
- Trial expiry derivation — insert `tenant_subscription` with past `trial_ends_at`; hit `/app/*`; assert redirect to paywall.
- Webhook → active — fire `checkout.session.completed`; assert `status='active'`, `stripe_subscription_id` set, banner gone.
- Over-limit upgrade block — Starter signup, create 5 locations during trial, attempt Starter checkout → blocked with expected message before Stripe is called.
- Invitation accept (new user, existing user) — correct row insertions, no new tenant or trial.
- Invitation at user-limit — post-trial Starter with 3 members → 4th invite blocked.
- Past-due soft lock — `status='past_due'` + `updated_at` within 3 days → banner only; after 3 days → paywall redirect.

### Cron / reminders

- For each `(days_until_end, already_sent)` combination, the cron either inserts a `trial_email_log` row + calls the email API or skips.
- Re-running the cron on the same day is a no-op.

### Manual smoke before ship

1. Pricing page → CTA → signup → `/app` with trial banner.
2. Fast-forward `trial_ends_at` → paywall.
3. Stripe test card → checkout → back to `/app`, banner gone.
4. Cancel via Stripe Portal → next request → paywall.
5. Invite teammate → accept in incognito → both users see same tenant.

### Out of scope for v1 tests

End-to-end dunning beyond the `past_due` flip. We trust Stripe's retry behavior; webhook is the source of truth.

---

## Open follow-ups (not v1)

- Reconciliation job for orphaned auth users (signup-transaction rollback edge case).
- Sweep of long-paywalled tenants (>180 days).
- Repurpose `tenant_domain` for Enterprise SSO.
- Multi-currency pricing.
- Annual-to-monthly proration UX beyond what Stripe Portal handles natively.
