# ADR 0003 — Allocation location + reserve ledger convention

## Decisions
1) Allocation location:
- If Shopify order does not specify a location, allocate from the tenant **default location**.

2) Reserve/release movement convention:
- Reservations are represented in `inventory_movement` using negative deltas.
  - RESERVE: negative
  - RELEASE: positive

## Context
We want deterministic allocation behavior, simple MVP fulfillment assumptions, and a clear ledger representation that supports auditing and rollback.

## Consequences
- Tenant settings must store a default location
- No multi-location splitting for allocations in MVP
- Movement logs can be summed for reservation events if needed