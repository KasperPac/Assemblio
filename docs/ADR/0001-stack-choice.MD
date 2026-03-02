# ADR 0001 — Stack & architecture baseline

## Decision
Use Supabase as backend source of truth for data + business logic, with Shopify as the external source for catalog/orders/locations.

## Context
Assemblio requires BOM availability, allocations, stocktake reconciliation, and a full movement ledger. Supabase supports these domain rules with SQL, RLS, and server-side actions.

## Consequences
- Backend contract is defined by Supabase schema and app API routes in repo
- Schema is defined by `supabase/schema.sql` and patches
- Frontend must treat Supabase-backed app APIs as the authoritative API
