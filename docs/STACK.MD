# Stack — Assemblio

This is the approved stack. Do not introduce new core technologies without an ADR.

## Backend
- **Supabase Postgres** (source of truth DB + server-side business logic)
- Authentication: **Supabase Auth** (JWT session + RLS)
- Tenancy: enforced server-side via tenant context

## Frontend (current posture)
- Shopify **Admin embedded app** (current)
- Migrating to **Shopify custom app** soon (still uses Admin API auth model; distribution differs)

Frontend framework is intentionally not locked here (because you may be on WeWeb today),
but any custom frontend must obey:
- uses Supabase-backed app APIs as backend contract
- stores no secrets client-side
- passes authenticated Supabase session only
- does not call Shopify directly with secret tokens in the browser

## Integrations
- Shopify Admin API (read-only for inventory policy)
- Shopify Webhooks -> Assemblio API routes

## Inventory policy (locked)
- Supabase is source of truth
- No Shopify inventory writes
- No `write_inventory` scope unless ADR approved

## Local development (recommended)
- Keep `supabase/schema.sql` as canonical schema
- Keep `supabase/patches/*.sql` for migration patches
- Add `.env.example` for any local tooling (never commit secrets)

## Non-goals (for stack)
- No additional database beyond Supabase Postgres unless ADR-approved
- No unmanaged background workers unless ADR-approved
