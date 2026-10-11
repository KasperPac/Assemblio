# Codex project reference

This consolidates reference material from the original `AGENTS.MD` and `CLAUDE.md`.
Original Claude instruction files remain in place. The schema and SQL patches are authoritative.

## Domain table map

| Area | Tables and behavior |
| --- | --- |
| Shopify ingestion | `shopify_store`, `shopify_install_tokens`; local catalog in `shopify_product`, `shopify_variant`; order lifecycle webhooks; Shopify locations mapped to `location` |
| BOM management | `product_bom` per variant; lines in `product_bom_component` reference `component`; versioned with one active BOM per variant |
| Inventory | Stocked unit `component`; grouping `component_group`; `inventory_balance` per component/location; append-only `inventory_movement` |
| Allocation | Local `order` and `order_line`; active BOM quantities reserved in `order_component_allocation`; tenant default location; available = on-hand minus reserved |
| Stocktake | `stocktake_session`, `stocktake_line`; applying counts writes movements and updates balances |
| Purchasing | `suppliers`, `purchase_order`, `purchase_order_line`; receiving writes movements and updates balances |
| Observability | `activity_log`, `event_log`; webhook processing is idempotent |

## Brand assets

- `public/Manuva_svg.svg`: full vector logo.
- `public/manuva.svg`: colored mark and dark wordmark.
- `public/manuva-logo.png`: white logo for dark backgrounds, 799 × 179 (4.47:1).
  Preserve aspect ratio; e.g. 170 × 38 for approximately 38 px height.
- Prefer SVG. The original instructions identify only a PNG for the white-on-dark variant.

## Existing references

Read `docs/ARCHITECTURE.MD`, `docs/STACK.MD`, `docs/DATA_MODEL.MD`, `docs/FLOWS.MD`,
`docs/PLANNING.MD`, and relevant `docs/ADR/` records when investigating architecture/domain behavior.
Read relevant `docs/superpowers/specs/`, `docs/superpowers/plans/`, `docs/review/`, and handoff files
before resuming a historical task. Old plans and agent summaries are evidence, not current authorization.

## Legacy Monday scripts

`CLAUDE.monday.md` describes `scripts/task_create.py`, `scripts/task_update.py`, and
`scripts/task_subtask.py`. They exist but predate the current first-class-item/topical-group rules.
Its lifecycle (`Planned → Task Created → Fixing → Awaiting Testing → Done`), groups
(`Build`, `Improvements`, `Bug Fixes`, `New Features`, `Complete`), and subitem behavior are historical.
Do not adopt those as current board structure or migrate existing items without authorization.
The legacy subitem statuses were `Planned`, `Starting`, `Working on it`, and `Done`, with `Planned`
mapping to blank and `Starting` to `Working on it`.

Prefer the authenticated Monday MCP. Check the current board columns and labels before writing.
Do not run legacy scripts that load secrets from `.env` files; inject secrets from 1Password and
adapt scripts explicitly before relying on them. The original notes remain available for diagnosis.
