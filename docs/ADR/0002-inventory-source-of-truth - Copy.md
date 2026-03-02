# ADR 0002 — Inventory source of truth

## Decision
Supabase is the inventory source of truth. Assemblio does not adjust Shopify inventory.

## Context
Component-level reservations and stocktake reconciliation require a ledger and balance model that Shopify does not natively provide for BOM consumption.

## Consequences
- inventory_balance is authoritative
- inventory_movement is append-only and required for any inventory change
- Shopify inventory reads are optional and informational only
- No write_inventory scope unless ADR-approved
