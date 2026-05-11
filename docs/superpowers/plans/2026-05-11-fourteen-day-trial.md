# 14-Day Trial + Self-Serve Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the domain-gated signup flow with self-serve signup that creates a fresh tenant + 14-day Pro-level trial. Add Stripe Checkout / Customer Portal for paid conversion, a paywall when the trial expires, team invitations, and trial-reminder emails.

**Architecture:** All trial state lives in a new `tenant_subscription` table (one row per tenant). Trial expiry is derived from `(status, trial_ends_at)` — no scheduled status flip. Stripe Checkout + Customer Portal handle all payment UI; we just listen to webhooks. Team invitations use a `tenant_invitation` table with magic-link tokens. Reminders run from a daily Vercel Cron.

**Tech Stack:** Next.js 16 App Router (existing), Supabase Postgres + Auth (existing), Stripe Node SDK (new), Resend (already in `package.json`), Vitest (existing), TypeScript.

**Source spec:** `docs/superpowers/specs/2026-05-11-fourteen-day-trial-design.md`

---

## File Structure

### New files

```
src/lib/plans/
├── index.ts                       # PLANS constant + types + effectiveTier/paywallRequired/pastDueSoftLocked
└── plans.test.ts                  # Unit tests for derived helpers

src/lib/subscription/
├── access.ts                      # getSubscriptionAccess, requireActiveSubscription
├── access.test.ts
├── limits.ts                      # assertWithinLimit, countLocations, countTeamMembers
└── limits.test.ts

src/lib/stripe/
├── client.ts                      # stripe SDK singleton, env wiring
├── webhook-events.ts              # event-type → handler dispatcher
├── webhook-events.test.ts
└── price-resolution.ts            # selected_tier ↔ stripe price ID mapping
                                   #   + price-resolution.test.ts

src/lib/email/
├── send.ts                        # Resend wrapper
├── templates/
│   ├── invitation.tsx             # React email template
│   ├── trial-reminder-3.tsx
│   ├── trial-reminder-1.tsx
│   └── trial-expired.tsx
└── send.test.ts

src/lib/invitations/
├── tokens.ts                      # secure random token generation + verification
├── tokens.test.ts
├── actions.ts                     # invite/revoke/resend/accept server actions
└── actions.test.ts

src/app/signup/
├── page.tsx                       # form (suspense-wrapped for ?plan=)
├── signup.module.css
└── actions.ts                     # signUpTenant server action

src/app/app/billing/
├── layout.tsx                     # bypasses requireActiveSubscription
├── paywall/page.tsx
├── paywall/paywall.module.css
├── past-due/page.tsx
├── past-due/past-due.module.css
└── success/page.tsx               # Stripe Checkout return URL

src/app/app/_components/
├── trial-banner.tsx               # rendered conditionally inside shell
├── trial-banner.module.css
├── past-due-banner.tsx
└── past-due-banner.module.css

src/app/app/settings/team/
├── page.tsx                       # members list + pending invitations + invite form
├── team.module.css
└── actions.ts                     # role change, member removal (wraps lib/invitations)

src/app/accept-invite/[token]/
├── page.tsx
├── accept-invite.module.css
└── actions.ts                     # acceptInviteExistingUser, acceptInviteNewUser

src/app/api/billing/
├── checkout/route.ts              # POST → create Stripe Checkout session
└── portal/route.ts                # POST → create Stripe Customer Portal session

src/app/api/webhooks/stripe/route.ts

src/app/api/cron/trial-reminders/route.ts

supabase/patches/
├── tenant_subscription.sql
├── tenant_invitation.sql
├── stripe_event_log.sql
└── trial_email_log.sql
```

### Modified files

```
package.json                                   # add "stripe" dependency
src/app/login/page.tsx                         # remove signup tab; add "New here? Start a free trial →" link
src/app/login/actions.ts                       # delete signUp (kept signIn)
src/app/app/layout.tsx                         # call requireActiveSubscription, render banners
src/app/pricing/_components/pricing-cards.tsx  # CTAs link to /signup?plan=...&billing=...
src/app/page.tsx                               # any root redirect: send unauthed users to /pricing not /login (verify behavior)
vercel.ts (or vercel.json)                     # register /api/cron/trial-reminders schedule
```

### Files NOT touched

- `src/lib/tenant/context.ts` — already correct; no changes needed.
- `src/lib/supabase/{server,admin,client}.ts` — no changes.
- The `tenant_domain` table stays in schema but is no longer read.

---

## Task Map (high level)

| # | Task | Blocks |
|---|---|---|
| 0 | Foundation: Stripe SDK, env, `PLANS` constants, types, helpers | 1–14 |
| 1 | Database migration: 4 new tables + RLS | 2–14 |
| 2 | Subscription access library + limit helpers | 3, 5, 7, 8, 13 |
| 3 | Self-serve signup page + server action | 5, 7, 8 |
| 4 | Pricing-page CTA wiring (`/signup?plan=...`) | — |
| 5 | App shell gating: `requireActiveSubscription` in layout + redirects | 6, 7 |
| 6 | Paywall + past-due pages (UI; Stripe wiring in T8) | 8 |
| 7 | Trial banner + past-due banner | — |
| 8 | Stripe Checkout API + over-limit pre-check | 10 |
| 9 | Stripe Customer Portal API | — |
| 10 | Stripe webhook handler + idempotency | — |
| 11 | Email wrapper (Resend) + four templates | 12, 13 |
| 12 | Trial reminder cron | — |
| 13 | Team invitations: server actions + `/app/settings/team` + accept-invite route | — |
| 14 | Feature gating helpers + apply to bin-management & advanced-BOM as exemplars | — |

---

## Task 0: Foundation — Stripe SDK, env, PLANS, derived helpers

**Goal:** Install Stripe Node SDK and define a single source of truth for tier configuration (limits, features, Stripe price IDs) plus the three derived predicates that everything downstream depends on.

**Files:**
- Create: `src/lib/plans/index.ts`
- Create: `src/lib/plans/plans.test.ts`
- Create: `src/lib/stripe/client.ts`
- Modify: `package.json` (add `stripe` dependency)
- Modify: `.env.example` (or create if missing) — add new env vars

**Acceptance Criteria:**
- [ ] `npm install stripe` adds dependency.
- [ ] `PLANS` exports a `Record<PlanTier, PlanDefinition>` with `starter`, `growth`, `pro`, `enterprise`.
- [ ] `effectiveTier(sub)` returns `'pro'` for active trials, otherwise `sub.selected_tier`.
- [ ] `paywallRequired(sub)` returns `true` for expired trials and `canceled`.
- [ ] `pastDueSoftLocked(sub)` returns `true` only when `status='past_due'` AND `now() - updated_at < 3 days`.
- [ ] `stripeClient()` returns a memoised `Stripe` instance from `STRIPE_SECRET_KEY`.
- [ ] All helper functions have unit tests covering each branch.

**Verify:** `npm test -- src/lib/plans/plans.test.ts` → all tests pass.

**Steps:**

- [ ] **Step 1: Install Stripe SDK**

```bash
npm install stripe@^17
```

(Pin to a major. Stripe ships breaking changes via API versions, not npm majors — `^17` is safe.)

- [ ] **Step 2: Add env vars to `.env.example`**

Append:

```
# Stripe (required for billing routes; safe to leave empty in local dev when not testing checkout)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_WEBHOOK_SECRET_NEXT=   # rotation slot

STRIPE_PRICE_STARTER_MONTHLY=
STRIPE_PRICE_STARTER_ANNUAL=
STRIPE_PRICE_GROWTH_MONTHLY=
STRIPE_PRICE_GROWTH_ANNUAL=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PRO_ANNUAL=

# Resend (already installed; add API key)
RESEND_API_KEY=
RESEND_FROM=Manuva <hello@manuva.app>

# Vercel Cron auth (used by /api/cron/*)
CRON_SECRET=

# Public site URL — used in invitation links and Stripe return URLs
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 3: Write the failing tests for `src/lib/plans/index.ts`**

Create `src/lib/plans/plans.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PLANS,
  effectiveTier,
  paywallRequired,
  pastDueSoftLocked,
  type TenantSubscriptionRow,
} from "./index";

function sub(overrides: Partial<TenantSubscriptionRow>): TenantSubscriptionRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    tenant_id: "00000000-0000-0000-0000-000000000001",
    selected_tier: "growth",
    status: "trialing",
    billing_interval: null,
    trial_started_at: new Date("2026-05-01T00:00:00Z"),
    trial_ends_at: new Date("2026-05-15T00:00:00Z"),
    stripe_customer_id: null,
    stripe_subscription_id: null,
    current_period_end: null,
    created_at: new Date("2026-05-01T00:00:00Z"),
    updated_at: new Date("2026-05-01T00:00:00Z"),
    ...overrides,
  };
}

describe("PLANS", () => {
  it("has all four tiers", () => {
    expect(Object.keys(PLANS).sort()).toEqual(
      ["enterprise", "growth", "pro", "starter"]
    );
  });

  it("starter has limits {locations:1, users:3}", () => {
    expect(PLANS.starter.limits).toEqual({ locations: 1, users: 3 });
  });

  it("growth has 5 locations and unlimited users", () => {
    expect(PLANS.growth.limits.locations).toBe(5);
    expect(PLANS.growth.limits.users).toBe(Infinity);
  });

  it("pro and enterprise are unlimited", () => {
    expect(PLANS.pro.limits).toEqual({ locations: Infinity, users: Infinity });
    expect(PLANS.enterprise.limits).toEqual({ locations: Infinity, users: Infinity });
  });

  it("enterprise has null stripePriceIds (sales-led)", () => {
    expect(PLANS.enterprise.stripePriceIds).toBeNull();
  });
});

describe("effectiveTier", () => {
  const now = new Date("2026-05-10T00:00:00Z");

  it("returns 'pro' for active trial regardless of selected_tier", () => {
    expect(effectiveTier(sub({ selected_tier: "starter" }), now)).toBe("pro");
  });

  it("returns selected_tier for expired trial", () => {
    expect(
      effectiveTier(
        sub({ selected_tier: "starter", trial_ends_at: new Date("2026-05-09T00:00:00Z") }),
        now
      )
    ).toBe("starter");
  });

  it("returns selected_tier for active subscription", () => {
    expect(effectiveTier(sub({ status: "active", selected_tier: "growth" }), now)).toBe("growth");
  });

  it("returns selected_tier for past_due", () => {
    expect(effectiveTier(sub({ status: "past_due", selected_tier: "pro" }), now)).toBe("pro");
  });
});

describe("paywallRequired", () => {
  const now = new Date("2026-05-20T00:00:00Z");

  it("true for expired trialing", () => {
    expect(paywallRequired(sub({ trial_ends_at: new Date("2026-05-15T00:00:00Z") }), now)).toBe(true);
  });

  it("false for active trial", () => {
    expect(paywallRequired(sub({ trial_ends_at: new Date("2026-05-25T00:00:00Z") }), now)).toBe(false);
  });

  it("false for active status", () => {
    expect(paywallRequired(sub({ status: "active" }), now)).toBe(false);
  });

  it("true for canceled status", () => {
    expect(paywallRequired(sub({ status: "canceled" }), now)).toBe(true);
  });

  it("false for past_due status (handled by pastDueSoftLocked)", () => {
    expect(paywallRequired(sub({ status: "past_due" }), now)).toBe(false);
  });
});

describe("pastDueSoftLocked", () => {
  const now = new Date("2026-05-20T00:00:00Z");

  it("true when past_due and updated_at within 3 days", () => {
    expect(
      pastDueSoftLocked(sub({ status: "past_due", updated_at: new Date("2026-05-19T00:00:00Z") }), now)
    ).toBe(true);
  });

  it("false when past_due and updated_at older than 3 days", () => {
    expect(
      pastDueSoftLocked(sub({ status: "past_due", updated_at: new Date("2026-05-15T00:00:00Z") }), now)
    ).toBe(false);
  });

  it("false for non-past_due status", () => {
    expect(pastDueSoftLocked(sub({ status: "active" }), now)).toBe(false);
  });
});
```

- [ ] **Step 4: Run test, expect failure**

```bash
npm test -- src/lib/plans/plans.test.ts
```

Expected: failure — module not found.

- [ ] **Step 5: Implement `src/lib/plans/index.ts`**

```ts
export type PlanTier = "starter" | "growth" | "pro" | "enterprise";
export type BillingInterval = "monthly" | "annual";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export interface PlanLimits {
  locations: number;  // Infinity for unlimited
  users: number;
}

export interface PlanFeatures {
  binManagement: boolean;
  advancedBom: boolean;
  costingModule: boolean;
  reports: boolean;
  capacityPlanning: boolean;
  financialProfitability: boolean;
  exportPdfCsv: boolean;
  apiAccess: boolean;
  multipleShopifyStores: boolean;
}

export interface PlanDefinition {
  name: string;
  limits: PlanLimits;
  features: PlanFeatures;
  stripePriceIds: { monthly: string; annual: string } | null;
}

export interface TenantSubscriptionRow {
  id: string;
  tenant_id: string;
  selected_tier: PlanTier;
  status: SubscriptionStatus;
  billing_interval: BillingInterval | null;
  trial_started_at: Date;
  trial_ends_at: Date;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: Date | null;
  created_at: Date;
  updated_at: Date;
}

function priceIds(monthlyEnv: string, annualEnv: string) {
  return {
    monthly: process.env[monthlyEnv] ?? "",
    annual: process.env[annualEnv] ?? "",
  };
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  starter: {
    name: "Starter",
    limits: { locations: 1, users: 3 },
    features: {
      binManagement: false,
      advancedBom: false,
      costingModule: false,
      reports: false,
      capacityPlanning: false,
      financialProfitability: false,
      exportPdfCsv: false,
      apiAccess: false,
      multipleShopifyStores: false,
    },
    stripePriceIds: priceIds("STRIPE_PRICE_STARTER_MONTHLY", "STRIPE_PRICE_STARTER_ANNUAL"),
  },
  growth: {
    name: "Growth",
    limits: { locations: 5, users: Infinity },
    features: {
      binManagement: true,
      advancedBom: true,
      costingModule: true,
      reports: true,
      capacityPlanning: false,
      financialProfitability: false,
      exportPdfCsv: false,
      apiAccess: false,
      multipleShopifyStores: false,
    },
    stripePriceIds: priceIds("STRIPE_PRICE_GROWTH_MONTHLY", "STRIPE_PRICE_GROWTH_ANNUAL"),
  },
  pro: {
    name: "Pro",
    limits: { locations: Infinity, users: Infinity },
    features: {
      binManagement: true,
      advancedBom: true,
      costingModule: true,
      reports: true,
      capacityPlanning: true,
      financialProfitability: true,
      exportPdfCsv: true,
      apiAccess: true,
      multipleShopifyStores: true,
    },
    stripePriceIds: priceIds("STRIPE_PRICE_PRO_MONTHLY", "STRIPE_PRICE_PRO_ANNUAL"),
  },
  enterprise: {
    name: "Enterprise",
    limits: { locations: Infinity, users: Infinity },
    features: {
      binManagement: true,
      advancedBom: true,
      costingModule: true,
      reports: true,
      capacityPlanning: true,
      financialProfitability: true,
      exportPdfCsv: true,
      apiAccess: true,
      multipleShopifyStores: true,
    },
    stripePriceIds: null,
  },
};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export function effectiveTier(
  sub: Pick<TenantSubscriptionRow, "status" | "selected_tier" | "trial_ends_at">,
  now: Date = new Date()
): PlanTier {
  if (sub.status === "trialing" && now <= sub.trial_ends_at) return "pro";
  return sub.selected_tier;
}

export function paywallRequired(
  sub: Pick<TenantSubscriptionRow, "status" | "trial_ends_at">,
  now: Date = new Date()
): boolean {
  if (sub.status === "canceled") return true;
  if (sub.status === "trialing" && now > sub.trial_ends_at) return true;
  return false;
}

export function pastDueSoftLocked(
  sub: Pick<TenantSubscriptionRow, "status" | "updated_at">,
  now: Date = new Date()
): boolean {
  if (sub.status !== "past_due") return false;
  return now.getTime() - sub.updated_at.getTime() < THREE_DAYS_MS;
}
```

- [ ] **Step 6: Implement `src/lib/stripe/client.ts`**

```ts
import Stripe from "stripe";

let cached: Stripe | null = null;

export function stripeClient(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  cached = new Stripe(key, { apiVersion: "2025-01-27.acacia" });
  return cached;
}
```

- [ ] **Step 7: Run tests, expect pass**

```bash
npm test -- src/lib/plans/plans.test.ts
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .env.example \
        src/lib/plans/index.ts src/lib/plans/plans.test.ts \
        src/lib/stripe/client.ts
git commit -m "feat(billing): add Stripe SDK, PLANS constants, and derived helpers"
```

---

## Task 1: Database migration — `tenant_subscription`, `tenant_invitation`, `stripe_event_log`, `trial_email_log`

**Goal:** Add four new tables with RLS following the existing `current_tenant_id()` pattern.

**Files:**
- Create: `supabase/patches/tenant_subscription.sql`
- Create: `supabase/patches/tenant_invitation.sql`
- Create: `supabase/patches/stripe_event_log.sql`
- Create: `supabase/patches/trial_email_log.sql`

**Acceptance Criteria:**
- [ ] Tables exist with constraints from the spec.
- [ ] RLS enabled on all four tables.
- [ ] `tenant_subscription` and `tenant_invitation` readable by members of `current_tenant_id()`.
- [ ] `stripe_event_log` and `trial_email_log` readable only via service role.
- [ ] Writes on all four tables go through service role.

**Verify:** `mcp__plugin_supabase_supabase__apply_migration` runs each patch without error, then `mcp__plugin_supabase_supabase__list_tables` shows all four.

**Steps:**

- [ ] **Step 1: Write `supabase/patches/tenant_subscription.sql`**

```sql
create table if not exists public.tenant_subscription (
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

create index if not exists idx_tenant_subscription_status on public.tenant_subscription (status);
create index if not exists idx_tenant_subscription_stripe_customer on public.tenant_subscription (stripe_customer_id);

alter table public.tenant_subscription enable row level security;

drop policy if exists "members read tenant_subscription" on public.tenant_subscription;
create policy "members read tenant_subscription"
  on public.tenant_subscription
  for select
  using (public.has_tenant_access(tenant_id));

-- writes are service-role only; no policy means no anon/authenticated access.

create or replace function public.tenant_subscription_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tenant_subscription_updated_at on public.tenant_subscription;
create trigger trg_tenant_subscription_updated_at
  before update on public.tenant_subscription
  for each row execute function public.tenant_subscription_set_updated_at();
```

- [ ] **Step 2: Write `supabase/patches/tenant_invitation.sql`**

```sql
create table if not exists public.tenant_invitation (
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

create unique index if not exists tenant_invitation_pending_unique
  on public.tenant_invitation (tenant_id, lower(email))
  where accepted_at is null;

create index if not exists idx_tenant_invitation_token on public.tenant_invitation (token);

alter table public.tenant_invitation enable row level security;

drop policy if exists "members read tenant_invitation" on public.tenant_invitation;
create policy "members read tenant_invitation"
  on public.tenant_invitation
  for select
  using (public.has_tenant_access(tenant_id));

-- writes are service-role only.
```

- [ ] **Step 3: Write `supabase/patches/stripe_event_log.sql`**

```sql
create table if not exists public.stripe_event_log (
  id           uuid primary key default gen_random_uuid(),
  event_id     text not null unique,
  event_type   text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_event_log enable row level security;
-- no policies: service-role only.
```

- [ ] **Step 4: Write `supabase/patches/trial_email_log.sql`**

```sql
create table if not exists public.trial_email_log (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant(id) on delete cascade,
  kind       text not null check (kind in ('t_minus_3','t_minus_1','expired')),
  sent_at    timestamptz not null default now(),
  unique (tenant_id, kind)
);

alter table public.trial_email_log enable row level security;
-- no policies: service-role only.
```

- [ ] **Step 5: Apply migrations to dev DB**

Use the Supabase MCP tool `apply_migration` to apply each patch in order. Confirm with `list_tables` that all four exist and have RLS on.

- [ ] **Step 6: Smoke-test RLS**

Via the Supabase SQL editor, as the `authenticated` role (impersonating a tenant member), run `select count(*) from public.tenant_subscription` → returns 0 or rows for that tenant only. As service role: returns all rows.

- [ ] **Step 7: Commit**

```bash
git add supabase/patches/tenant_subscription.sql \
        supabase/patches/tenant_invitation.sql \
        supabase/patches/stripe_event_log.sql \
        supabase/patches/trial_email_log.sql
git commit -m "feat(db): tables for trial subscriptions, invitations, and webhook/email idempotency"
```

---

## Task 2: Subscription access library + limit helpers

**Goal:** Pure functions that consumers (layouts, server actions, API routes) use to gate requests. No side effects; takes a Supabase client + tenant ID and returns access state.

**Files:**
- Create: `src/lib/subscription/access.ts`
- Create: `src/lib/subscription/access.test.ts`
- Create: `src/lib/subscription/limits.ts`
- Create: `src/lib/subscription/limits.test.ts`

**Acceptance Criteria:**
- [ ] `getSubscriptionAccess(supabase, tenantId)` returns `{ state, sub, daysLeft? }` where `state ∈ 'ok' | 'paywall' | 'past_due_locked'`.
- [ ] `assertWithinLimit(supabase, tenantId, kind: 'locations' | 'users')` throws `LimitExceededError` when over limit, returns silently otherwise.
- [ ] `countTenantUsage(supabase, tenantId)` returns `{ locations: number; users: number }`.
- [ ] All branches covered by unit tests using a mocked Supabase client.

**Verify:** `npm test -- src/lib/subscription/` → all tests pass.

**Steps:**

- [ ] **Step 1: Write failing tests for `access.ts`**

Create `src/lib/subscription/access.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { getSubscriptionAccess } from "./access";

function mockSupabase(subRow: any) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: subRow, error: null }),
        }),
      }),
    }),
  } as any;
}

const tenantId = "t-1";

describe("getSubscriptionAccess", () => {
  it("returns 'paywall' if no subscription row", async () => {
    const supabase = mockSupabase(null);
    const result = await getSubscriptionAccess(supabase, tenantId);
    expect(result.state).toBe("paywall");
  });

  it("returns 'ok' for active subscription", async () => {
    const supabase = mockSupabase({
      status: "active",
      selected_tier: "growth",
      trial_ends_at: "2026-05-15T00:00:00Z",
      updated_at: "2026-05-10T00:00:00Z",
    });
    const result = await getSubscriptionAccess(supabase, tenantId,
      new Date("2026-05-10T00:00:00Z"));
    expect(result.state).toBe("ok");
  });

  it("returns 'ok' with daysLeft for active trial", async () => {
    const supabase = mockSupabase({
      status: "trialing",
      selected_tier: "growth",
      trial_ends_at: "2026-05-15T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
    });
    const result = await getSubscriptionAccess(supabase, tenantId,
      new Date("2026-05-10T00:00:00Z"));
    expect(result.state).toBe("ok");
    expect(result.daysLeft).toBe(5);
  });

  it("returns 'paywall' for expired trial", async () => {
    const supabase = mockSupabase({
      status: "trialing",
      selected_tier: "growth",
      trial_ends_at: "2026-05-09T00:00:00Z",
      updated_at: "2026-04-25T00:00:00Z",
    });
    const result = await getSubscriptionAccess(supabase, tenantId,
      new Date("2026-05-10T00:00:00Z"));
    expect(result.state).toBe("paywall");
  });

  it("returns 'ok' for past_due within 3 days (soft warn)", async () => {
    const supabase = mockSupabase({
      status: "past_due",
      selected_tier: "growth",
      trial_ends_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-05-09T00:00:00Z",
    });
    const result = await getSubscriptionAccess(supabase, tenantId,
      new Date("2026-05-10T00:00:00Z"));
    expect(result.state).toBe("ok");
  });

  it("returns 'past_due_locked' after 3 days past_due", async () => {
    const supabase = mockSupabase({
      status: "past_due",
      selected_tier: "growth",
      trial_ends_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-05-05T00:00:00Z",
    });
    const result = await getSubscriptionAccess(supabase, tenantId,
      new Date("2026-05-10T00:00:00Z"));
    expect(result.state).toBe("past_due_locked");
  });

  it("returns 'paywall' for canceled", async () => {
    const supabase = mockSupabase({
      status: "canceled",
      selected_tier: "growth",
      trial_ends_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
    });
    const result = await getSubscriptionAccess(supabase, tenantId,
      new Date("2026-05-10T00:00:00Z"));
    expect(result.state).toBe("paywall");
  });
});
```

- [ ] **Step 2: Implement `src/lib/subscription/access.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  paywallRequired,
  pastDueSoftLocked,
  type TenantSubscriptionRow,
} from "@/lib/plans";

export type AccessState = "ok" | "paywall" | "past_due_locked";

export interface AccessResult {
  state: AccessState;
  sub: TenantSubscriptionRow | null;
  daysLeft?: number;
}

function rowToSub(row: any): TenantSubscriptionRow {
  return {
    ...row,
    trial_started_at: new Date(row.trial_started_at),
    trial_ends_at: new Date(row.trial_ends_at),
    current_period_end: row.current_period_end ? new Date(row.current_period_end) : null,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

export async function getSubscriptionAccess(
  supabase: SupabaseClient,
  tenantId: string,
  now: Date = new Date()
): Promise<AccessResult> {
  const { data, error } = await supabase
    .from("tenant_subscription")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { state: "paywall", sub: null };

  const sub = rowToSub(data);

  if (paywallRequired(sub, now)) return { state: "paywall", sub };

  if (sub.status === "past_due") {
    if (pastDueSoftLocked(sub, now)) {
      return { state: "ok", sub };
    }
    return { state: "past_due_locked", sub };
  }

  if (sub.status === "trialing") {
    const daysLeft = Math.max(
      0,
      Math.ceil((sub.trial_ends_at.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    );
    return { state: "ok", sub, daysLeft };
  }

  return { state: "ok", sub };
}
```

- [ ] **Step 3: Run tests, expect pass**

```bash
npm test -- src/lib/subscription/access.test.ts
```

- [ ] **Step 4: Write failing tests for `limits.ts`**

Create `src/lib/subscription/limits.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LimitExceededError, computeLimit } from "./limits";
import { PLANS } from "@/lib/plans";

describe("computeLimit", () => {
  it("returns starter limits when effective tier is starter", () => {
    expect(computeLimit("starter", "locations")).toBe(1);
    expect(computeLimit("starter", "users")).toBe(3);
  });

  it("returns Infinity for unlimited users on growth", () => {
    expect(computeLimit("growth", "users")).toBe(Infinity);
  });
});

describe("LimitExceededError", () => {
  it("carries kind, limit, and current", () => {
    const e = new LimitExceededError("locations", 1, 5, "starter");
    expect(e.kind).toBe("locations");
    expect(e.limit).toBe(1);
    expect(e.current).toBe(5);
    expect(e.tier).toBe("starter");
    expect(e.message).toContain("locations");
  });
});
```

- [ ] **Step 5: Implement `src/lib/subscription/limits.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PLANS,
  effectiveTier,
  type PlanTier,
  type TenantSubscriptionRow,
} from "@/lib/plans";
import { getSubscriptionAccess } from "./access";

export type LimitKind = "locations" | "users";

export class LimitExceededError extends Error {
  constructor(
    public readonly kind: LimitKind,
    public readonly limit: number,
    public readonly current: number,
    public readonly tier: PlanTier
  ) {
    super(
      `Plan limit exceeded: ${kind} (current ${current}, allowed ${limit} on ${tier})`
    );
    this.name = "LimitExceededError";
  }
}

export function computeLimit(tier: PlanTier, kind: LimitKind): number {
  return PLANS[tier].limits[kind];
}

export interface UsageCounts {
  locations: number;
  users: number;
}

export async function countTenantUsage(
  supabase: SupabaseClient,
  tenantId: string
): Promise<UsageCounts> {
  const [{ count: locations }, { count: users }] = await Promise.all([
    supabase
      .from("location")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase
      .from("profile_tenant_access")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
  ]);

  return { locations: locations ?? 0, users: users ?? 0 };
}

export async function assertWithinLimit(
  supabase: SupabaseClient,
  tenantId: string,
  kind: LimitKind
): Promise<void> {
  const access = await getSubscriptionAccess(supabase, tenantId);
  if (!access.sub) {
    throw new LimitExceededError(kind, 0, 0, "starter");
  }
  const tier = effectiveTier(access.sub);
  const limit = computeLimit(tier, kind);
  if (limit === Infinity) return;

  const usage = await countTenantUsage(supabase, tenantId);
  if (usage[kind] >= limit) {
    throw new LimitExceededError(kind, limit, usage[kind], tier);
  }
}
```

> **Note for executor:** confirm the `location` table name during implementation — the spec describes "warehouse locations" and `supabase/patches/locations_manager_schema.sql` exists. Inspect that file or the live schema to use the correct table/column names. Same for any name used to count tenant members; `profile_tenant_access.tenant_id` is the source of truth based on `src/lib/tenant/context.ts:24`.

- [ ] **Step 6: Run tests, expect pass**

```bash
npm test -- src/lib/subscription/
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/subscription/
git commit -m "feat(billing): subscription access + limit-check helpers"
```

---

## Task 3: Self-serve signup page + server action

**Goal:** New `/signup` page with form (company name, email, password, plan selector, billing interval). Server action creates `tenant`, `profiles`, `profile_tenant_access`, `tenant_subscription` rows in a single Postgres transaction; signs the user in; redirects to `/app`.

**Files:**
- Create: `src/app/signup/page.tsx`
- Create: `src/app/signup/signup.module.css`
- Create: `src/app/signup/actions.ts`
- Modify: `src/app/login/actions.ts` (delete `signUp` export)
- Modify: `src/app/login/page.tsx` (remove signup tab, add "Start a free trial →" link to `/signup`)

**Acceptance Criteria:**
- [ ] `/signup?plan=growth&billing=annual` pre-selects Growth + annual.
- [ ] Submitting the form creates all four DB rows.
- [ ] On submission, user is signed in and redirected to `/app`.
- [ ] Invalid plan / billing interval / weak password returns a form error and no rows are created.
- [ ] Any DB-step failure rolls back and deletes the orphaned auth user.
- [ ] The `tenant_domain` lookup is gone from the codebase.

**Verify:**
1. `npm run dev`
2. Browse to `http://localhost:3000/signup?plan=growth&billing=annual`
3. Submit with a brand-new email
4. Land on `/app`
5. In the DB, `tenant`, `profiles`, `profile_tenant_access`, `tenant_subscription` rows all exist with `status='trialing'` and `trial_ends_at` ~ 14 days out.

**Steps:**

- [ ] **Step 1: Implement the server action `src/app/signup/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PLANS, type PlanTier, type BillingInterval } from "@/lib/plans";

type SignUpState = { error?: string; message?: string };

const VALID_PLANS: PlanTier[] = ["starter", "growth", "pro"];
const VALID_INTERVALS: BillingInterval[] = ["monthly", "annual"];

function parsePlan(raw: string | null): PlanTier {
  if (raw && (VALID_PLANS as string[]).includes(raw)) return raw as PlanTier;
  return "growth";
}
function parseInterval(raw: string | null): BillingInterval {
  if (raw && (VALID_INTERVALS as string[]).includes(raw)) return raw as BillingInterval;
  return "annual";
}

export async function signUpTenant(
  _prev: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const companyName = formData.get("company_name")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const plan = parsePlan(formData.get("plan")?.toString() ?? null);
  const billing = parseInterval(formData.get("billing")?.toString() ?? null);

  if (!companyName) return { error: "Company name is required." };
  if (!email) return { error: "Email is required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  if (plan === "enterprise") return { error: "Contact sales for Enterprise." };

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  // Step 1: create the auth user (outside the DB transaction).
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email, password,
  });
  if (signUpError) return { error: signUpError.message };
  const authUser = signUpData.user;
  if (!authUser) {
    return { error: "Unable to create account. Check your email to confirm, then sign in." };
  }

  try {
    // Step 2: insert tenant row.
    const { data: tenantRow, error: tenantError } = await admin
      .from("tenant")
      .insert({ name: companyName })
      .select("id")
      .single();
    if (tenantError || !tenantRow) throw tenantError ?? new Error("tenant insert failed");

    const tenantId = tenantRow.id;
    const now = new Date();
    const trialEnds = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    // Step 3-5: profile, access, subscription, activity_log (parallel-safe).
    const [profile, access, sub, log] = await Promise.all([
      admin.from("profiles").insert({
        id: authUser.id,
        tenant_id: tenantId,
        role: "admin",
      }),
      admin.from("profile_tenant_access").insert({
        profile_id: authUser.id,
        tenant_id: tenantId,
        role: "admin",
      }),
      admin.from("tenant_subscription").insert({
        tenant_id: tenantId,
        selected_tier: plan,
        status: "trialing",
        billing_interval: billing,
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEnds.toISOString(),
      }),
      admin.from("activity_log").insert({
        tenant_id: tenantId,
        event: "tenant.created",
        metadata: { plan, billing },
      }),
    ]);

    for (const r of [profile, access, sub, log]) {
      if (r.error) throw r.error;
    }
  } catch (err) {
    // Rollback: delete the orphaned auth user.
    try {
      await admin.auth.admin.deleteUser(authUser.id);
    } catch (deleteErr) {
      console.error("orphan_auth_user", authUser.id, deleteErr);
    }
    return { error: err instanceof Error ? err.message : "Signup failed." };
  }

  redirect("/app");
}
```

> **Note on atomicity:** Supabase's PostgREST `.insert()` calls cannot share a transaction over HTTP. The `Promise.all` above is best-effort consistency; on any error we roll back by deleting the auth user and rely on `on delete cascade` from `tenant_id` foreign keys to clean child rows IF we got as far as inserting the tenant. **If `tenant` was inserted but a child insert failed**, we leave an empty tenant row. Either (a) accept the rare orphan (rare because we're inserting into 4 tables in parallel, and they fail or succeed together for the common error modes — auth-already-exists, RLS, network), or (b) implement this as a Postgres function (`signup_tenant(...)`) so everything runs in one SQL transaction. **Recommended:** do (b) before shipping; for now, ship (a) and add a TODO. See "Hardening follow-ups" at the bottom.

- [ ] **Step 2: Implement the signup page `src/app/signup/page.tsx`**

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./signup.module.css";
import { signUpTenant } from "./actions";
import { PLANS, type PlanTier, type BillingInterval } from "@/lib/plans";

const initialState = { error: "", message: "" };

const PLAN_OPTIONS: PlanTier[] = ["starter", "growth", "pro"];

function SignupForm() {
  const search = useSearchParams();
  const [state, action] = useActionState(signUpTenant, initialState);

  const initialPlan = (search.get("plan") as PlanTier) ?? "growth";
  const initialBilling = (search.get("billing") as BillingInterval) ?? "annual";

  const [plan, setPlan] = useState<PlanTier>(
    PLAN_OPTIONS.includes(initialPlan) ? initialPlan : "growth"
  );
  const [billing, setBilling] = useState<BillingInterval>(
    initialBilling === "monthly" ? "monthly" : "annual"
  );

  const limits = PLANS[plan].limits;
  const locationsCopy =
    limits.locations === Infinity ? "Unlimited locations" : `${limits.locations} location${limits.locations === 1 ? "" : "s"}`;
  const usersCopy =
    limits.users === Infinity ? "Unlimited team members" : `${limits.users} team member${limits.users === 1 ? "" : "s"}`;

  return (
    <div className={styles.page}>
      <div className={styles.left}>
        <div className={styles.leftInner}>
          <h1>Start your 14-day free trial</h1>
          <p>Full Pro-level access. No credit card required.</p>

          <form className={styles.form} action={action}>
            <input type="hidden" name="plan" value={plan} />
            <input type="hidden" name="billing" value={billing} />

            <label>
              Company name
              <input name="company_name" type="text" placeholder="Acme Manufacturing" autoComplete="organization" required />
            </label>
            <label>
              Work email
              <input name="email" type="email" placeholder="you@company.com" autoComplete="email" required />
            </label>
            <label>
              Password
              <input name="password" type="password" placeholder="At least 8 characters" autoComplete="new-password" required minLength={8} />
            </label>

            <fieldset className={styles.planSelector}>
              <legend>Plan after trial</legend>
              <div className={styles.planChips}>
                {PLAN_OPTIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`${styles.planChip} ${plan === p ? styles.planChipActive : ""}`}
                    onClick={() => setPlan(p)}
                  >
                    {PLANS[p].name}
                  </button>
                ))}
              </div>
              <div className={styles.billingToggle}>
                <label>
                  <input type="radio" name="billingRadio" checked={billing === "annual"} onChange={() => setBilling("annual")} />
                  Annual (save ~20%)
                </label>
                <label>
                  <input type="radio" name="billingRadio" checked={billing === "monthly"} onChange={() => setBilling("monthly")} />
                  Monthly
                </label>
              </div>
            </fieldset>

            <div className={styles.limitsPreview}>
              <strong>{PLANS[plan].name} — after your trial</strong>
              <p>{locationsCopy} · {usersCopy}</p>
            </div>

            {state.error ? <p className={styles.error}>{state.error}</p> : null}

            <button className={styles.primary} type="submit">Start free trial</button>

            <p className={styles.signinLink}>
              Already have an account? <Link href="/login">Sign in</Link>
            </p>
          </form>
        </div>
      </div>

      <aside className={styles.right} aria-hidden="true">
        <Image src="/manuva-logo.png" alt="Manuva" width={170} height={38} priority />
      </aside>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className={styles.page} />}>
      <SignupForm />
    </Suspense>
  );
}
```

- [ ] **Step 3: Add minimal CSS at `src/app/signup/signup.module.css`**

Copy/adapt from `src/app/login/login.module.css` for layout; add `.planSelector`, `.planChips`, `.planChip`, `.planChipActive`, `.billingToggle`, `.limitsPreview` rules consistent with the Manuva design tokens (`--brand-1`, `--bg-card`, `--ink-strong`).

- [ ] **Step 4: Remove the old signup tab and link to `/signup`**

In `src/app/login/page.tsx`, replace the tabs block with a single sign-in form, and below the form add:

```tsx
<p className={styles.signinLink}>
  New here? <Link href="/signup">Start a 14-day free trial →</Link>
</p>
```

Delete the `signUp` export from `src/app/login/actions.ts`. Remove the `tenant_domain` lookup.

- [ ] **Step 5: Verify manually**

```bash
npm run dev
```

Browse `http://localhost:3000/signup?plan=growth&billing=annual` → form pre-fills Growth + annual. Submit with new email → redirected to `/app`. Inspect DB for the 4 expected rows.

- [ ] **Step 6: Commit**

```bash
git add src/app/signup/ src/app/login/page.tsx src/app/login/actions.ts
git commit -m "feat(auth): self-serve signup creates tenant + 14-day trial"
```

---

## Task 4: Pricing-page CTA wiring

**Goal:** Pricing CTAs link to `/signup?plan=<id>&billing=<annual|monthly>`. Enterprise still goes to `/contact` (or wherever it goes today — leave that alone).

**Files:**
- Modify: `src/app/pricing/_components/pricing-cards.tsx`

**Acceptance Criteria:**
- [ ] Clicking the Starter card's CTA on `/pricing` with the annual toggle active lands at `/signup?plan=starter&billing=annual`.
- [ ] Same for Growth and Pro.
- [ ] Enterprise CTA unchanged.

**Verify:** Visual smoke test in browser. Inspect URLs in the rendered HTML.

**Steps:**

- [ ] **Step 1: Read `src/app/pricing/_components/pricing-cards.tsx`** to find the existing CTA `href` construction.

- [ ] **Step 2: Update each non-enterprise card's CTA to `/signup?plan=<tier.id>&billing=<currentBillingPeriod>`**

The component already has access to the current `BillingPeriod` from state. Pass it to the CTA href.

- [ ] **Step 3: Verify manually** at `http://localhost:3000/pricing` — click each tier's CTA in both annual and monthly toggle states.

- [ ] **Step 4: Commit**

```bash
git add src/app/pricing/_components/pricing-cards.tsx
git commit -m "feat(pricing): CTAs carry selected plan + billing to /signup"
```

---

## Task 5: App shell gating

**Goal:** `src/app/app/layout.tsx` calls `requireActiveSubscription()` after the existing tenant context fetch. Expired trials redirect to `/app/billing/paywall`; hard-locked past-due tenants redirect to `/app/billing/past-due`.

**Files:**
- Create: `src/app/app/_lib/require-active-subscription.ts`
- Modify: `src/app/app/layout.tsx`
- Create: `src/app/app/billing/layout.tsx` (so the billing routes bypass the gate)

**Acceptance Criteria:**
- [ ] Member of a tenant with `status='trialing'` and `trial_ends_at` in the past, hitting `/app/inventory`, is redirected to `/app/billing/paywall`.
- [ ] Member with `status='active'` is not redirected.
- [ ] Member with `status='past_due'` and `updated_at < 3 days ago` reaches the page (will see a banner from T7).
- [ ] Member with `status='past_due'` and `updated_at >= 3 days ago` is redirected to `/app/billing/past-due`.
- [ ] `/app/billing/*` routes are reachable from any state.

**Verify:** End-to-end manual smoke test for each state above.

**Steps:**

- [ ] **Step 1: Implement `src/app/app/_lib/require-active-subscription.ts`**

```ts
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSubscriptionAccess } from "@/lib/subscription/access";

export interface ActiveSubResult {
  state: "ok";
  sub: NonNullable<Awaited<ReturnType<typeof getSubscriptionAccess>>["sub"]>;
  daysLeft?: number;
}

export async function requireActiveSubscription(
  supabase: SupabaseClient,
  tenantId: string
): Promise<ActiveSubResult> {
  const access = await getSubscriptionAccess(supabase, tenantId);
  if (access.state === "paywall") redirect("/app/billing/paywall");
  if (access.state === "past_due_locked") redirect("/app/billing/past-due");
  // narrow type
  return access as ActiveSubResult;
}
```

- [ ] **Step 2: Wire into `src/app/app/layout.tsx`**

After the existing profile lookup, add:

```tsx
import { requireActiveSubscription } from "./_lib/require-active-subscription";

// inside the component, after we have `profile?.tenant_id`:
const access = profile?.tenant_id
  ? await requireActiveSubscription(supabase, profile.tenant_id)
  : null;
```

(Pass `access.sub` and `access.daysLeft` down to the banner component added in Task 7.)

- [ ] **Step 3: Create `src/app/app/billing/layout.tsx`** so billing routes bypass the gate.

```tsx
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function BillingLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Render outside the normal app shell — no sidebar, no banner.
  return <div data-billing-shell>{children}</div>;
}
```

> **Important:** Because Next.js layouts nest, `src/app/app/layout.tsx` will still wrap `src/app/app/billing/layout.tsx`. To break that, either move `billing/` *out* of `app/app/` (e.g. to `src/app/(billing)/billing/`) or have `app/app/layout.tsx` detect when the current path starts with `/app/billing` and skip its own gate + chrome. **Recommended:** detect inside `app/layout.tsx` via `headers()` and the `x-pathname` middleware-derived header (or use `next/headers` directly). The simplest concrete path: add a thin Next.js middleware that sets `x-pathname`, then in `app/layout.tsx`:

```tsx
import { headers } from "next/headers";
const pathname = (await headers()).get("x-pathname") ?? "";
const isBillingShell = pathname.startsWith("/app/billing");
```

Skip both the subscription gate and the sidebar chrome when `isBillingShell` is true.

- [ ] **Step 4: Add a minimal `middleware.ts` at repo root if one doesn't exist** to expose pathname.

```ts
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("x-pathname", req.nextUrl.pathname);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

If a middleware already exists, add the header line to it instead.

- [ ] **Step 5: Manually verify each state**

In the DB, hand-edit a tenant's `tenant_subscription`:
- `status='trialing'`, `trial_ends_at = now() - interval '1 day'` → expect redirect to `/app/billing/paywall`.
- `status='past_due'`, `updated_at = now() - interval '5 days'` → expect redirect to `/app/billing/past-due`.
- Reset to `status='active'` → no redirect.

- [ ] **Step 6: Commit**

```bash
git add src/app/app/_lib/require-active-subscription.ts \
        src/app/app/layout.tsx \
        src/app/app/billing/layout.tsx \
        middleware.ts
git commit -m "feat(billing): gate app shell on subscription state"
```

---

## Task 6: Paywall + past-due pages

**Goal:** Static-ish UI shells. Stripe wiring is hooked up in Task 8 (Checkout) and Task 9 (Portal); for now the buttons can be present but inert or wired to placeholder routes. The pages need to render and look right.

**Files:**
- Create: `src/app/app/billing/paywall/page.tsx`
- Create: `src/app/app/billing/paywall/paywall.module.css`
- Create: `src/app/app/billing/past-due/page.tsx`
- Create: `src/app/app/billing/past-due/past-due.module.css`
- Create: `src/app/app/billing/success/page.tsx` (Stripe redirect target)

**Acceptance Criteria:**
- [ ] `/app/billing/paywall` renders three tier cards (Starter/Growth/Pro) with annual/monthly toggle.
- [ ] Pre-selects the tenant's `selected_tier`.
- [ ] Each card's CTA POSTs (via a form) to `/api/billing/checkout` (which doesn't exist until T8 — the form can still be wired).
- [ ] `/app/billing/past-due` renders a "Update your payment method" prompt with a CTA that POSTs to `/api/billing/portal`.
- [ ] `/app/billing/success` says "Welcome! Your subscription is active." and links to `/app`.

**Verify:** Manual visual check at `http://localhost:3000/app/billing/paywall` and `/past-due` while logged in.

**Steps:**

- [ ] **Step 1: Build `src/app/app/billing/paywall/page.tsx`**

Reuse the tier-card visual idea from `src/app/pricing/_components/pricing-cards.tsx`. Read the current `tenant_subscription` row server-side (using `getServerTenantContext`). Render three `<form action="/api/billing/checkout" method="POST">` blocks with hidden `tier`/`billing` inputs.

- [ ] **Step 2: Build `src/app/app/billing/past-due/page.tsx`**

Single-message page + a form pointing at `/api/billing/portal`.

- [ ] **Step 3: Build `src/app/app/billing/success/page.tsx`**

Simple confirmation page. Linked from Stripe Checkout success URL (configured in T8).

- [ ] **Step 4: Commit**

```bash
git add src/app/app/billing/
git commit -m "feat(billing): paywall, past-due, and success pages"
```

---

## Task 7: Trial banner + past-due banner

**Goal:** Two small server components rendered at the top of `<section className={styles.content}>` in the app shell when conditions warrant.

**Files:**
- Create: `src/app/app/_components/trial-banner.tsx`
- Create: `src/app/app/_components/trial-banner.module.css`
- Create: `src/app/app/_components/past-due-banner.tsx`
- Create: `src/app/app/_components/past-due-banner.module.css`
- Modify: `src/app/app/layout.tsx` (render the banners with data from `access`)

**Acceptance Criteria:**
- [ ] When `state='ok' && status='trialing'`, the trial banner shows correct `daysLeft`, current effective tier ("Pro"), and `selected_tier` post-trial.
- [ ] Clicking "Upgrade now" navigates to `/app/billing/paywall`.
- [ ] When `state='ok' && status='past_due' && pastDueSoftLocked`, the past-due banner shows with "Update payment method" CTA to `/app/billing/past-due`.
- [ ] Banners are not rendered for `status='active'`.

**Verify:** Manual visual check in each state.

**Steps:**

- [ ] **Step 1: Build the trial banner**

```tsx
// src/app/app/_components/trial-banner.tsx
import Link from "next/link";
import styles from "./trial-banner.module.css";
import { PLANS, type PlanTier } from "@/lib/plans";

export function TrialBanner({
  daysLeft,
  selectedTier,
}: {
  daysLeft: number;
  selectedTier: PlanTier;
}) {
  return (
    <div className={styles.banner} role="status">
      <span className={styles.text}>
        <strong>{daysLeft} day{daysLeft === 1 ? "" : "s"} left in your free trial.</strong>{" "}
        You're on a Pro trial. After it ends, you'll be on the {PLANS[selectedTier].name} plan.
      </span>
      <Link href="/app/billing/paywall" className={styles.cta}>Upgrade now →</Link>
    </div>
  );
}
```

- [ ] **Step 2: Build the past-due banner** with similar structure linking to `/app/billing/past-due`.

- [ ] **Step 3: Render both in `src/app/app/layout.tsx`**

Inside the `<section className={styles.content}>` block, before `{children}`:

```tsx
{access?.sub?.status === "trialing" && access.daysLeft !== undefined ? (
  <TrialBanner daysLeft={access.daysLeft} selectedTier={access.sub.selected_tier} />
) : null}
{access?.sub?.status === "past_due" ? (
  <PastDueBanner />
) : null}
```

- [ ] **Step 4: Manually verify** each banner state by editing `tenant_subscription` in the DB.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/_components/ src/app/app/layout.tsx
git commit -m "feat(billing): trial and past-due banners in app shell"
```

---

## Task 8: Stripe Checkout API + over-limit pre-check

**Goal:** `POST /api/billing/checkout` validates the chosen `{tier, billing}`, runs the over-limit check, lazily creates a Stripe Customer if needed, creates a Checkout Session, and redirects (303) to the Stripe-hosted URL.

**Files:**
- Create: `src/app/api/billing/checkout/route.ts`
- Create: `src/lib/stripe/price-resolution.ts`
- Create: `src/lib/stripe/price-resolution.test.ts`

**Acceptance Criteria:**
- [ ] POST without auth → 401.
- [ ] POST with `tier=starter&billing=annual`, when usage would exceed Starter limits, returns 400 with a JSON `{ error, kind, limit, current }`.
- [ ] POST with valid tier and within limits creates a Stripe Checkout Session and 303-redirects to its URL.
- [ ] The session is created with `success_url=/app/billing/success?session_id={CHECKOUT_SESSION_ID}` and `cancel_url=/app/billing/paywall`.
- [ ] First successful call writes `stripe_customer_id` onto `tenant_subscription`.
- [ ] Subsequent calls reuse the existing `stripe_customer_id`.

**Verify:** Local manual flow using Stripe test mode + Stripe CLI for webhook forwarding. Sign up → reach paywall → click Growth annual → arrive on Stripe Checkout. Pay with `4242 4242 4242 4242` → land on `/app/billing/success`.

**Steps:**

- [ ] **Step 1: Implement `src/lib/stripe/price-resolution.ts`** — turn `(tier, billing)` into the configured price ID, and the reverse (price ID → `(tier, billing)`) for webhook handling.

```ts
import { PLANS, type PlanTier, type BillingInterval } from "@/lib/plans";

export function priceIdFor(tier: PlanTier, billing: BillingInterval): string {
  const ids = PLANS[tier].stripePriceIds;
  if (!ids) throw new Error(`No Stripe price IDs for tier ${tier}`);
  const id = ids[billing];
  if (!id) throw new Error(`Missing Stripe price for ${tier}/${billing}`);
  return id;
}

export function resolvePriceId(priceId: string): { tier: PlanTier; billing: BillingInterval } | null {
  for (const [tier, plan] of Object.entries(PLANS)) {
    if (!plan.stripePriceIds) continue;
    if (plan.stripePriceIds.monthly === priceId) return { tier: tier as PlanTier, billing: "monthly" };
    if (plan.stripePriceIds.annual === priceId) return { tier: tier as PlanTier, billing: "annual" };
  }
  return null;
}
```

Write `price-resolution.test.ts` that stubs `process.env.STRIPE_PRICE_*` and verifies forward + reverse mapping.

- [ ] **Step 2: Implement `src/app/api/billing/checkout/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { stripeClient } from "@/lib/stripe/client";
import { priceIdFor } from "@/lib/stripe/price-resolution";
import { countTenantUsage, computeLimit, LimitExceededError } from "@/lib/subscription/limits";
import { PLANS, type PlanTier, type BillingInterval } from "@/lib/plans";

const VALID_PLANS = new Set<PlanTier>(["starter", "growth", "pro"]);
const VALID_INTERVALS = new Set<BillingInterval>(["monthly", "annual"]);

export async function POST(req: Request) {
  const ctx = await getServerTenantContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const tier = String(form.get("tier") ?? "") as PlanTier;
  const billing = String(form.get("billing") ?? "") as BillingInterval;

  if (!VALID_PLANS.has(tier) || !VALID_INTERVALS.has(billing)) {
    return NextResponse.json({ error: "invalid plan or billing interval" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: sub } = await admin
    .from("tenant_subscription")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!sub) return NextResponse.json({ error: "no subscription row" }, { status: 400 });

  // Over-limit pre-check (against the requested target tier, not the effective tier).
  const usage = await countTenantUsage(admin, ctx.tenantId);
  for (const kind of ["locations", "users"] as const) {
    const limit = computeLimit(tier, kind);
    if (limit !== Infinity && usage[kind] > limit) {
      return NextResponse.json(
        {
          error: `You have ${usage[kind]} ${kind} but ${PLANS[tier].name} allows ${limit}. Upgrade to a higher tier, or archive ${kind} first.`,
          kind, limit, current: usage[kind],
        },
        { status: 400 }
      );
    }
  }

  const stripe = stripeClient();

  // Lazily create the Stripe customer.
  let customerId = sub.stripe_customer_id;
  if (!customerId) {
    const { data: tenantRow } = await admin
      .from("tenant").select("name").eq("id", ctx.tenantId).maybeSingle();
    // Use the signed-in user's email as the customer email.
    const { data: { user } } = await admin.auth.admin.getUserById(ctx.userId);
    const customer = await stripe.customers.create({
      email: user?.email ?? undefined,
      name: tenantRow?.name ?? undefined,
      metadata: { tenant_id: ctx.tenantId },
    });
    customerId = customer.id;
    await admin
      .from("tenant_subscription")
      .update({ stripe_customer_id: customerId })
      .eq("tenant_id", ctx.tenantId);
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceIdFor(tier, billing), quantity: 1 }],
    success_url: `${baseUrl}/app/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/app/billing/paywall`,
    metadata: { tenant_id: ctx.tenantId, tier, billing },
  });

  if (!session.url) {
    return NextResponse.json({ error: "stripe did not return a session URL" }, { status: 502 });
  }
  return NextResponse.redirect(session.url, 303);
}
```

> **Executor note:** `getServerTenantContext()` returns `{ supabase, tenantId, role }` today, not `userId`. Either widen the helper's return to include `userId` (preferred — it's already read from `auth.getUser()` inside) or fetch the user inline. **Widen the helper.**

- [ ] **Step 3: Update `getServerTenantContext()`** to also return `userId`. Modify `src/lib/tenant/context.ts` and any callers that need it (most won't break since `userId` is additive).

- [ ] **Step 4: Manually verify** the happy path against Stripe test mode using the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# (in another shell)
npm run dev
# Sign up, force trial_ends_at into the past in the DB, hit /app/billing/paywall,
# click Growth annual → arrive on Stripe Checkout.
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/billing/checkout/route.ts \
        src/lib/stripe/price-resolution.ts \
        src/lib/stripe/price-resolution.test.ts \
        src/lib/tenant/context.ts
git commit -m "feat(billing): /api/billing/checkout with over-limit pre-check"
```

---

## Task 9: Stripe Customer Portal API

**Goal:** `POST /api/billing/portal` creates a Stripe Customer Portal session and 303-redirects.

**Files:**
- Create: `src/app/api/billing/portal/route.ts`

**Acceptance Criteria:**
- [ ] POST without auth → 401.
- [ ] POST when tenant has no `stripe_customer_id` → 400 (you can't manage what you've never paid for).
- [ ] POST with valid customer → 303 redirect to a Portal session URL.

**Verify:** From `/app/billing/past-due` or a future "Manage billing" link, the user lands on Stripe Portal.

**Steps:**

- [ ] **Step 1: Implement**

```ts
// src/app/api/billing/portal/route.ts
import { NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { stripeClient } from "@/lib/stripe/client";

export async function POST() {
  const ctx = await getServerTenantContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: sub } = await admin
    .from("tenant_subscription")
    .select("stripe_customer_id")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: "no stripe customer" }, { status: 400 });
  }

  const stripe = stripeClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${baseUrl}/app`,
  });
  return NextResponse.redirect(portal.url, 303);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/billing/portal/route.ts
git commit -m "feat(billing): /api/billing/portal for Stripe Customer Portal"
```

---

## Task 10: Stripe webhook handler + idempotency

**Goal:** `POST /api/webhooks/stripe` verifies the signature against `STRIPE_WEBHOOK_SECRET` (and `STRIPE_WEBHOOK_SECRET_NEXT` for rotation), upserts into `stripe_event_log` for idempotency, and dispatches handlers for the five spec-listed events.

**Files:**
- Create: `src/app/api/webhooks/stripe/route.ts`
- Create: `src/lib/stripe/webhook-events.ts`
- Create: `src/lib/stripe/webhook-events.test.ts`

**Acceptance Criteria:**
- [ ] Invalid signature → 400.
- [ ] First delivery of an event → processed, `stripe_event_log` row inserted, handler runs.
- [ ] Retry of the same event_id → no second run; 200 returned.
- [ ] `checkout.session.completed` transitions `status='active'`, fills `stripe_subscription_id`, `selected_tier` (from completed price), `billing_interval`, `current_period_end`.
- [ ] `invoice.payment_failed` → `status='past_due'`.
- [ ] `invoice.payment_succeeded` (post past_due) → `status='active'`.
- [ ] `customer.subscription.updated` → re-syncs tier/interval/period-end.
- [ ] `customer.subscription.deleted` → `status='canceled'`.

**Verify:**
- Unit tests with fixture event payloads.
- Manual end-to-end via Stripe CLI: trigger `stripe trigger checkout.session.completed`, `stripe trigger invoice.payment_failed`, etc.

**Steps:**

- [ ] **Step 1: Implement the dispatcher**

```ts
// src/lib/stripe/webhook-events.ts
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePriceId } from "./price-resolution";

type Admin = SupabaseClient;

export async function processStripeEvent(admin: Admin, event: Stripe.Event): Promise<void> {
  // Idempotency: try to insert event_id first; if conflict, exit silently.
  const { error: insertError } = await admin
    .from("stripe_event_log")
    .insert({ event_id: event.id, event_type: event.type });
  if (insertError) {
    // Postgres unique-violation = duplicate delivery; ack and skip.
    if ((insertError as any).code === "23505") return;
    throw insertError;
  }

  switch (event.type) {
    case "checkout.session.completed":
      await onCheckoutCompleted(admin, event.data.object as Stripe.Checkout.Session);
      break;
    case "customer.subscription.updated":
      await onSubscriptionUpdated(admin, event.data.object as Stripe.Subscription);
      break;
    case "customer.subscription.deleted":
      await onSubscriptionDeleted(admin, event.data.object as Stripe.Subscription);
      break;
    case "invoice.payment_failed":
      await onInvoiceFailed(admin, event.data.object as Stripe.Invoice);
      break;
    case "invoice.payment_succeeded":
      await onInvoiceSucceeded(admin, event.data.object as Stripe.Invoice);
      break;
    default:
      // ignore unhandled event types
      return;
  }
}

async function onCheckoutCompleted(admin: Admin, session: Stripe.Checkout.Session) {
  const tenantId = session.metadata?.tenant_id;
  if (!tenantId) return;
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!subId) return;

  // Fetch the live subscription to read the price + period.
  const stripeSub = await (await import("./client")).stripeClient().subscriptions.retrieve(subId);
  const priceId = stripeSub.items.data[0]?.price.id ?? "";
  const resolved = resolvePriceId(priceId);
  if (!resolved) return;

  await admin
    .from("tenant_subscription")
    .update({
      status: "active",
      stripe_subscription_id: subId,
      selected_tier: resolved.tier,
      billing_interval: resolved.billing,
      current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
    })
    .eq("tenant_id", tenantId);

  await admin.from("activity_log").insert({
    tenant_id: tenantId,
    event: "subscription.activated",
    metadata: { tier: resolved.tier, billing: resolved.billing },
  });
}

async function onSubscriptionUpdated(admin: Admin, stripeSub: Stripe.Subscription) {
  const priceId = stripeSub.items.data[0]?.price.id ?? "";
  const resolved = resolvePriceId(priceId);
  if (!resolved) return;

  await admin
    .from("tenant_subscription")
    .update({
      selected_tier: resolved.tier,
      billing_interval: resolved.billing,
      current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
    })
    .eq("stripe_subscription_id", stripeSub.id);
}

async function onSubscriptionDeleted(admin: Admin, stripeSub: Stripe.Subscription) {
  await admin
    .from("tenant_subscription")
    .update({ status: "canceled" })
    .eq("stripe_subscription_id", stripeSub.id);
}

async function onInvoiceFailed(admin: Admin, invoice: Stripe.Invoice) {
  const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!subId) return;
  await admin
    .from("tenant_subscription")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", subId);
}

async function onInvoiceSucceeded(admin: Admin, invoice: Stripe.Invoice) {
  const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!subId) return;
  // Only flip past_due → active. If already active, this is a normal renewal — leave alone.
  await admin
    .from("tenant_subscription")
    .update({ status: "active" })
    .eq("stripe_subscription_id", subId)
    .eq("status", "past_due");
}
```

- [ ] **Step 2: Implement the route**

```ts
// src/app/api/webhooks/stripe/route.ts
import { NextResponse } from "next/server";
import { stripeClient } from "@/lib/stripe/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processStripeEvent } from "@/lib/stripe/webhook-events";

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const body = await req.text();
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET_NEXT,
  ].filter(Boolean) as string[];

  const stripe = stripeClient();
  let event;
  let lastErr: unknown = null;
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret);
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!event) return NextResponse.json({ error: "invalid signature" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  try {
    await processStripeEvent(admin, event);
  } catch (err) {
    console.error("stripe webhook handler failed", event.id, err);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
```

- [ ] **Step 3: Write unit tests** in `webhook-events.test.ts` using fixture payloads — at least one per event type, plus a duplicate-delivery test that verifies the second call is a no-op.

- [ ] **Step 4: Manually verify with Stripe CLI**

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
stripe trigger checkout.session.completed
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted
```

After each, inspect `tenant_subscription` for the expected state.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/stripe/ src/lib/stripe/webhook-events.ts src/lib/stripe/webhook-events.test.ts
git commit -m "feat(billing): Stripe webhook handler with idempotent dispatch"
```

---

## Task 11: Email wrapper + four templates

**Goal:** Single `sendEmail()` wrapper using Resend; four React Email templates (invitation, T-3, T-1, expired).

**Files:**
- Create: `src/lib/email/send.ts`
- Create: `src/lib/email/templates/invitation.tsx`
- Create: `src/lib/email/templates/trial-reminder-3.tsx`
- Create: `src/lib/email/templates/trial-reminder-1.tsx`
- Create: `src/lib/email/templates/trial-expired.tsx`
- Create: `src/lib/email/send.test.ts`

**Acceptance Criteria:**
- [ ] `sendEmail({ to, subject, react })` returns `{ ok: true; id: string }` on success or `{ ok: false; error: string }` on failure (does not throw).
- [ ] `RESEND_API_KEY` and `RESEND_FROM` env vars are required.
- [ ] Each template renders to a plain HTML string with the inviter/tenant/days-left interpolated.
- [ ] Unit test stubs Resend's `send` and verifies the wrapper passes the right args.

**Steps:**

- [ ] **Step 1: Implement `src/lib/email/send.ts`**

```ts
import { Resend } from "resend";
import type { ReactElement } from "react";

let cached: Resend | null = null;
function client(): Resend {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
  cached = new Resend(key);
  return cached;
}

export interface SendArgs {
  to: string;
  subject: string;
  react: ReactElement;
}

export async function sendEmail(args: SendArgs): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const from = process.env.RESEND_FROM;
  if (!from) return { ok: false, error: "RESEND_FROM not set" };
  try {
    const res = await client().emails.send({
      from,
      to: args.to,
      subject: args.subject,
      react: args.react,
    });
    if (res.error) return { ok: false, error: res.error.message };
    return { ok: true, id: res.data?.id ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 2: Implement four templates** as plain React components — keep markup simple (Resend will inline styles via `@react-email/components` or you can use plain HTML elements). Templates are co-located in `src/lib/email/templates/`. Examples:

```tsx
// src/lib/email/templates/trial-reminder-3.tsx
export function TrialReminder3({ tenantName }: { tenantName: string }) {
  return (
    <div>
      <h1>3 days left in your Manuva trial</h1>
      <p>Hi from Manuva — your free trial for <strong>{tenantName}</strong> ends in 3 days.</p>
      <p>Add a payment method to keep working without interruption.</p>
      <p><a href="https://manuva.app/app/billing/paywall">Choose a plan →</a></p>
    </div>
  );
}
```

(Repeat shape for T-1, expired, and invitation. Invitation template takes `inviterName`, `tenantName`, `acceptUrl`.)

- [ ] **Step 3: Write `send.test.ts`** stubbing `Resend` via `vi.mock`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/
git commit -m "feat(email): Resend wrapper + invitation and trial-reminder templates"
```

---

## Task 12: Trial reminder cron

**Goal:** `GET/POST /api/cron/trial-reminders` runs daily, walks trialing subscriptions, sends the appropriate email once per tenant per kind. Authorised via `CRON_SECRET`.

**Files:**
- Create: `src/app/api/cron/trial-reminders/route.ts`
- Create: `src/app/api/cron/trial-reminders/route.test.ts` (or co-located unit logic)
- Modify: `vercel.ts` (or `vercel.json`) to register the schedule

**Acceptance Criteria:**
- [ ] Wrong/missing `CRON_SECRET` → 401.
- [ ] For each `trialing` tenant where `days_until_end ∈ {3, 1}` or `(0 ≥ days_until_end ≥ -1)`, the correct email kind is sent and a `trial_email_log` row is inserted.
- [ ] Re-running the same day is a no-op for tenants that already have rows for the matching `kind`.
- [ ] Tenants with `status != 'trialing'` are skipped.

**Verify:** Unit tests using mocked Supabase + mocked `sendEmail`. Manual smoke: insert a fake trialing tenant with `trial_ends_at = now() + interval '1 day'`, then `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/trial-reminders` — verify `trial_email_log` gets a `t_minus_1` row, the email send is invoked, and a second `curl` is a no-op.

**Steps:**

- [ ] **Step 1: Extract the logic into a pure function** for testability:

```ts
// src/lib/subscription/reminders.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { sendEmail } from "@/lib/email/send";

export type ReminderKind = "t_minus_3" | "t_minus_1" | "expired";

export function classifyDaysLeft(daysUntilEnd: number): ReminderKind | null {
  if (daysUntilEnd === 3) return "t_minus_3";
  if (daysUntilEnd === 1) return "t_minus_1";
  if (daysUntilEnd <= 0 && daysUntilEnd >= -1) return "expired";
  return null;
}

export interface ReminderDeps {
  admin: SupabaseClient;
  send: typeof sendEmail;
  now: Date;
  templates: Record<ReminderKind, (args: { tenantName: string; to: string }) => Parameters<typeof sendEmail>[0]>;
}

export async function runReminderSweep(deps: ReminderDeps): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;

  const { data: subs } = await deps.admin
    .from("tenant_subscription")
    .select("tenant_id, trial_ends_at, tenant:tenant_id(name)")
    .eq("status", "trialing");

  for (const sub of subs ?? []) {
    const trialEnds = new Date(sub.trial_ends_at);
    const dayMs = 24 * 60 * 60 * 1000;
    const daysUntilEnd = Math.floor((trialEnds.getTime() - deps.now.getTime()) / dayMs);
    const kind = classifyDaysLeft(daysUntilEnd);
    if (!kind) { skipped++; continue; }

    // Idempotent insert.
    const { error: logError } = await deps.admin
      .from("trial_email_log")
      .insert({ tenant_id: sub.tenant_id, kind });
    if (logError) {
      // 23505 = unique violation = already sent today
      if ((logError as any).code === "23505") { skipped++; continue; }
      skipped++; continue;
    }

    // Look up the admin's email.
    const { data: ownerProfile } = await deps.admin
      .from("profiles")
      .select("id")
      .eq("tenant_id", sub.tenant_id)
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();
    if (!ownerProfile) { skipped++; continue; }

    const { data: { user } } = await deps.admin.auth.admin.getUserById(ownerProfile.id);
    if (!user?.email) { skipped++; continue; }

    const tenantName = (Array.isArray(sub.tenant) ? sub.tenant[0] : sub.tenant)?.name ?? "your workspace";
    const sendArgs = deps.templates[kind]({ tenantName, to: user.email });
    const res = await deps.send(sendArgs);
    if (res.ok) sent++;
    else skipped++;
  }
  return { sent, skipped };
}
```

- [ ] **Step 2: Write unit tests** for `classifyDaysLeft` covering each boundary (4 → null, 3, 2 → null, 1, 0, -1, -2 → null) and a basic test of `runReminderSweep` with mocked deps.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/cron/trial-reminders/route.ts
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { runReminderSweep, type ReminderKind } from "@/lib/subscription/reminders";
import { TrialReminder3 } from "@/lib/email/templates/trial-reminder-3";
import { TrialReminder1 } from "@/lib/email/templates/trial-reminder-1";
import { TrialExpired } from "@/lib/email/templates/trial-expired";

function checkAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

const TEMPLATES: Record<ReminderKind, (args: { tenantName: string; to: string }) => Parameters<typeof sendEmail>[0]> = {
  t_minus_3: ({ tenantName, to }) => ({
    to, subject: "3 days left in your Manuva trial", react: <TrialReminder3 tenantName={tenantName} />,
  }),
  t_minus_1: ({ tenantName, to }) => ({
    to, subject: "Your trial ends tomorrow", react: <TrialReminder1 tenantName={tenantName} />,
  }),
  expired: ({ tenantName, to }) => ({
    to, subject: "Your Manuva trial has ended", react: <TrialExpired tenantName={tenantName} />,
  }),
};

export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const result = await runReminderSweep({ admin, send: sendEmail, now: new Date(), templates: TEMPLATES });
  return NextResponse.json(result);
}
```

- [ ] **Step 4: Register the cron** by adding to `vercel.json` (create if missing):

```json
{
  "crons": [
    { "path": "/api/cron/trial-reminders", "schedule": "0 14 * * *" }
  ]
}
```

(If a `vercel.ts` is preferred per Vercel knowledge update, use it instead. Either works.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/trial-reminders/ src/lib/subscription/reminders.ts \
        src/lib/subscription/reminders.test.ts vercel.json
git commit -m "feat(billing): daily cron for trial-reminder emails"
```

---

## Task 13: Team invitations — server actions, settings page, accept route

**Goal:** Admins can invite teammates by email; invitees accept via magic link and join the existing tenant without starting a new trial.

**Files:**
- Create: `src/lib/invitations/tokens.ts`
- Create: `src/lib/invitations/tokens.test.ts`
- Create: `src/lib/invitations/actions.ts`
- Create: `src/lib/invitations/actions.test.ts`
- Create: `src/app/app/settings/team/page.tsx`
- Create: `src/app/app/settings/team/team.module.css`
- Create: `src/app/app/settings/team/actions.ts`
- Create: `src/app/accept-invite/[token]/page.tsx`
- Create: `src/app/accept-invite/[token]/accept-invite.module.css`
- Create: `src/app/accept-invite/[token]/actions.ts`

**Acceptance Criteria:**
- [ ] Admin at `/app/settings/team` sees a members list, pending invitations list, and an invite form.
- [ ] `inviteTeammate({ email, role })` enforces `assertWithinLimit('users', tenantId)` and either inserts a new `tenant_invitation` row or refreshes the existing pending one (via `lower(email)` partial unique index).
- [ ] Email goes out via Resend with the accept link.
- [ ] `/accept-invite/[token]`:
  - Missing/expired/accepted token → friendly error.
  - Existing auth user → sign in then redirect; on return, link to tenant.
  - New user → minimal form (name + password); on submit, create auth user, profile, `profile_tenant_access`, mark accepted.
- [ ] Member-count check runs both at invite-time and at accept-time.
- [ ] Removing a member deletes their `profile_tenant_access` row for the tenant; if their `profiles.tenant_id` pointed there, switch to next available access row (handled by existing `getServerTenantContext` fallback at `src/lib/tenant/context.ts:33-51`).
- [ ] Non-admins cannot reach the write-actions (server-side role check).

**Verify:**
- Manual: admin invites teammate@example.com → email arrives → open incognito → accept → new user lands on `/app`, sees same tenant.
- Manual: as a Starter post-trial tenant with 3 members, attempt 4th invite → blocked with "user limit reached" error.

**Steps:**

- [ ] **Step 1: `src/lib/invitations/tokens.ts`**

```ts
import { randomBytes } from "node:crypto";
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}
```

Plus a test that asserts `length >= 40` and uniqueness across 1000 generations.

- [ ] **Step 2: `src/lib/invitations/actions.ts`** — three server-callable functions:

```ts
"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerTenantContext } from "@/lib/tenant/context";
import { assertWithinLimit, LimitExceededError } from "@/lib/subscription/limits";
import { generateToken } from "./tokens";
import { sendEmail } from "@/lib/email/send";
import { Invitation } from "@/lib/email/templates/invitation";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function inviteTeammate(input: { email: string; role: "admin" | "member" }) {
  const ctx = await getServerTenantContext();
  if (!ctx) throw new Error("unauthorized");
  if (ctx.role !== "admin" && ctx.role !== "super_admin") throw new Error("forbidden");

  const admin = createSupabaseAdminClient();
  try {
    await assertWithinLimit(admin, ctx.tenantId, "users");
  } catch (err) {
    if (err instanceof LimitExceededError) {
      return { ok: false, error: err.message } as const;
    }
    throw err;
  }

  const email = input.email.trim().toLowerCase();
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS).toISOString();

  // Upsert via partial unique index: try insert; on conflict, refresh token + expiry.
  const { error: insertError } = await admin
    .from("tenant_invitation")
    .insert({
      tenant_id: ctx.tenantId,
      email,
      role: input.role,
      token,
      invited_by: ctx.userId,
      expires_at: expiresAt,
    });

  let finalToken = token;
  if (insertError) {
    if ((insertError as any).code === "23505") {
      // refresh existing pending invite
      const { data: refreshed, error: updateError } = await admin
        .from("tenant_invitation")
        .update({ token, expires_at: expiresAt })
        .eq("tenant_id", ctx.tenantId)
        .ilike("email", email)
        .is("accepted_at", null)
        .select("token")
        .single();
      if (updateError || !refreshed) {
        return { ok: false, error: updateError?.message ?? "failed to refresh invite" } as const;
      }
      finalToken = refreshed.token;
    } else {
      return { ok: false, error: insertError.message } as const;
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const acceptUrl = `${baseUrl}/accept-invite/${finalToken}`;

  // Look up tenant name + inviter name for the email.
  const [{ data: tenantRow }, { data: { user: inviter } }] = await Promise.all([
    admin.from("tenant").select("name").eq("id", ctx.tenantId).single(),
    admin.auth.admin.getUserById(ctx.userId),
  ]);

  await sendEmail({
    to: email,
    subject: `You're invited to join ${tenantRow?.name ?? "a Manuva workspace"}`,
    react: Invitation({
      tenantName: tenantRow?.name ?? "your team",
      inviterEmail: inviter?.email ?? "your teammate",
      acceptUrl,
    }),
  });

  return { ok: true } as const;
}

export async function revokeInvitation(invitationId: string) {
  const ctx = await getServerTenantContext();
  if (!ctx) throw new Error("unauthorized");
  if (ctx.role !== "admin" && ctx.role !== "super_admin") throw new Error("forbidden");
  const admin = createSupabaseAdminClient();
  await admin.from("tenant_invitation").delete().eq("id", invitationId).eq("tenant_id", ctx.tenantId);
}

export async function resendInvitation(invitationId: string) {
  const ctx = await getServerTenantContext();
  if (!ctx) throw new Error("unauthorized");
  if (ctx.role !== "admin" && ctx.role !== "super_admin") throw new Error("forbidden");

  const admin = createSupabaseAdminClient();
  const { data: inv } = await admin
    .from("tenant_invitation")
    .select("email, token, tenant_id, accepted_at")
    .eq("id", invitationId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!inv) return { ok: false, error: "invitation not found" } as const;
  if (inv.accepted_at) return { ok: false, error: "already accepted" } as const;

  // Refresh expiry on resend so users get a full 7-day window.
  await admin
    .from("tenant_invitation")
    .update({ expires_at: new Date(Date.now() + SEVEN_DAYS_MS).toISOString() })
    .eq("id", invitationId);

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const acceptUrl = `${baseUrl}/accept-invite/${inv.token}`;
  const [{ data: tenantRow }, { data: { user: inviter } }] = await Promise.all([
    admin.from("tenant").select("name").eq("id", ctx.tenantId).single(),
    admin.auth.admin.getUserById(ctx.userId),
  ]);
  await sendEmail({
    to: inv.email,
    subject: `You're invited to join ${tenantRow?.name ?? "a Manuva workspace"}`,
    react: Invitation({
      tenantName: tenantRow?.name ?? "your team",
      inviterEmail: inviter?.email ?? "your teammate",
      acceptUrl,
    }),
  });
  return { ok: true } as const;
}
```

- [ ] **Step 3: Build `/app/settings/team/page.tsx`**

Server component:
- Fetch members via `profile_tenant_access` joined to `auth.users` (use admin client for email lookup) for the current tenant.
- Fetch pending invitations (`tenant_invitation where tenant_id=ctx.tenantId and accepted_at is null`).
- Render a form posting to `inviteTeammateAction(formData)` which wraps `inviteTeammate`.

- [ ] **Step 4: Build `/accept-invite/[token]/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { acceptInviteExistingUser, acceptInviteNewUser } from "./actions";

export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();

  const { data: inv } = await admin
    .from("tenant_invitation")
    .select("*, tenant:tenant_id(name)")
    .eq("token", token)
    .maybeSingle();

  if (!inv) return <ErrorMsg>This invitation link is invalid.</ErrorMsg>;
  if (inv.accepted_at) return <ErrorMsg>This invitation has already been used.</ErrorMsg>;
  if (new Date(inv.expires_at) < new Date()) return <ErrorMsg>This invitation has expired. Ask your admin to send a new one.</ErrorMsg>;

  // Check if there's already an auth user with this email.
  const { data: existing } = await admin.auth.admin.listUsers();
  const existingUser = existing?.users.find((u) => u.email?.toLowerCase() === inv.email.toLowerCase());

  const supabase = await createSupabaseServerClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  if (existingUser) {
    if (currentUser?.id === existingUser.id) {
      // Already signed in as the right user — accept inline.
      await acceptInviteExistingUser(token);
      redirect("/app");
    }
    // Ask them to sign in.
    return <SignInPrompt email={inv.email} token={token} />;
  }

  return <NewUserAcceptForm tenantName={inv.tenant?.name ?? ""} email={inv.email} token={token} />;
}

// (ErrorMsg, SignInPrompt, NewUserAcceptForm are small components in this file.)
```

`actions.ts` implements `acceptInviteExistingUser(token)` and `acceptInviteNewUser(token, formData)`, each running `assertWithinLimit('users', tenantId)` before inserting `profile_tenant_access` and marking `accepted_at`.

- [ ] **Step 5: Wire `/app/settings/team` into the existing settings nav**

Look at `src/app/app/settings/` for the pattern; add a new "Team" tab in the nav.

- [ ] **Step 6: Manually verify** the full flow end-to-end with two browser profiles or incognito windows.

- [ ] **Step 7: Commit**

```bash
git add src/lib/invitations/ src/app/app/settings/team/ src/app/accept-invite/
git commit -m "feat(billing): team invitations with magic-link accept flow"
```

---

## Task 14: Feature gating helpers + exemplar applications

**Goal:** Provide a `requireFeature()` helper + a `RequireFeature` server component, and apply gating to two real existing features (bin/aisle management on the Growth+ list, and advanced BOM yield % on Growth+). The point is to prove the pattern end-to-end; remaining features (financial profitability, capacity planning, etc.) are gated by future tasks in their own PRs.

**Files:**
- Create: `src/lib/plans/features.ts`
- Modify: relevant routes for bin/aisle (find via `Grep` for `aisle`) and advanced BOM yield % (find via the `bom_builder_redesign_schema.sql` migration).
- Create: `src/lib/plans/features.test.ts`

**Acceptance Criteria:**
- [ ] `hasFeature(sub, 'binManagement')` returns `true` for trialing, growth, pro, enterprise; `false` for active starter.
- [ ] Visiting a bin-management page as an active-starter tenant shows an inline "Upgrade to Growth" upsell instead of the feature UI.
- [ ] Visiting the same page as a trialing tenant (effective tier Pro) shows the feature normally.
- [ ] Unit tests for `hasFeature`.

**Verify:** Manual smoke at the two gated pages.

**Steps:**

- [ ] **Step 1: Implement `src/lib/plans/features.ts`**

```ts
import { effectiveTier, PLANS, type TenantSubscriptionRow, type PlanFeatures } from "./index";

export function hasFeature(
  sub: Pick<TenantSubscriptionRow, "status" | "selected_tier" | "trial_ends_at">,
  feature: keyof PlanFeatures
): boolean {
  return PLANS[effectiveTier(sub)].features[feature];
}
```

Plus unit tests covering each tier × feature combination relevant.

- [ ] **Step 2: Identify the bin-management route** (run `Grep "bin"` in `src/app/app/warehouse` and `src/app/app/inventory`) and wrap its page server-side:

```tsx
const access = await getSubscriptionAccess(supabase, ctx.tenantId);
if (!access.sub || !hasFeature(access.sub, "binManagement")) {
  return <FeatureUpsell feature="bin management" requiredTier="growth" />;
}
```

- [ ] **Step 3: Same for advanced BOM yield %** in the BOM builder. (Likely just a conditional inside the existing component.)

- [ ] **Step 4: Build a simple `FeatureUpsell` component** that links to `/app/billing/paywall`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plans/features.ts src/lib/plans/features.test.ts \
        <relevant feature pages...>
git commit -m "feat(billing): hasFeature helper + gate bin management and BOM yield %"
```

---

## Hardening follow-ups (out of scope for v1; track separately)

- Convert the multi-row signup writes to a single Postgres function so it's truly transactional (per Task 3 note).
- Reconciliation job for orphaned auth users (signup-transaction failure case).
- Sweep of long-paywalled tenants (>180 days).
- Apply feature gating to the remaining gated features (financial profitability, capacity planning, departments, PDF/CSV export, API access).
- Stripe webhook retry observability (alert on repeated 5xx).
- Multi-currency pricing once we have non-USD customers.
- Annual ↔ monthly proration UX beyond what Stripe Portal handles.

---

## End of plan
