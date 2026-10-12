# Bold app bands

Implemented for MANUVA-73 from the October 2 marketing/app handoff; resumed by the user
on October 12. This is a product design reference, not a build-status report.
The source references are at `C:/dev/ManuvaMarketingBold/design_handoff_app_bold/`;
the current local token library is `C:/dev/ManuvaDesignSystem`.

## Page map

| Route | Domain | Title |
| --- | --- | --- |
| `/app` | Navy | Today |
| `/app/inventory` | Inventory / cobalt | Inventory |
| `/app/components` | Inventory / cobalt | Components |
| `/app/stocktake` | Inventory / cobalt | Stocktakes |
| `/app/planning/floor` | Production / flare | Production planning |
| `/app/purchasing` | Purchasing / amber | Purchase orders |
| `/app/products` | Products / violet | Products |
| `/app/templates` | Products / violet | Templates |
| `/app/goods-inwards` | Logistics / mint | Goods inwards |
| `/app/suppliers` | Logistics / mint | Suppliers |
| `/app/warehouse/locations` | Logistics / mint | Locations |
| `/app/reports` | Audit / aqua, cover | Last 90 days in numbers. |
| `/app/activity-log` | Audit / aqua | Activity log |
| `/app/super-admin/audit` | Audit / aqua | Audit log |
| `/app/orders` | Navy | Orders |
| `/app/trash` | Navy | Trash |
| `/app/super-admin` | Navy | Tenants |
| `/app/super-admin/team` | Navy | Platform team |

## Header and shell rules

Index pages explicitly opt into `PageHeader`'s `band`, `domain`, `stat` and `cover`
props. `route-meta.ts` holds the exact index map for the topbar; record details and
other routes retain quiet headers. Trial, payment, view-as and accounting notices
appear above the joined topbar/header band. Existing tables, forms and surface palettes
remain in place; this does not adopt the full graphite/cobalt palette repaint.

Titles and numerals use Archivo, weight 800 and width 118. One lime-highlighted delta
is allowed per screen. Band text is white on cobalt, violet and navy; dark ink on flare,
amber, mint and aqua. Header actions use the shared buttons; dialogs and popovers nested
inside a band restore the selected theme's neutral tokens. Focus remains visible.

## Live metrics

- Inventory: distinct component IDs with at least one loaded balance row below its
  component reorder point, matching the existing row flag. A component in several
  locations counts once. This is not a sum of units or a cross-location stock aggregate.
- Purchasing: exact counts of `open` and `in_transit` purchase orders across the tenant,
  independent of the twelve-row display limit. Arrive-today counts use `expected_date`
  within the tenant's calendar day, including daylight-saving changes. Missing/invalid
  timezone falls back to `Australia/Sydney`; failed reads do not display a false zero.
- Production: distinct order lines with an `active`, `queued` or `blocked` production
  step. A job queued in several departments counts once.
- Reports: the proportion of scheduled PO-linked receipts in `po_linked` or `discrepancy`
  state whose tenant-local receipt date is on/before the PO expected date. Unmatched,
  unprocessed and undated receipts are excluded. Current and preceding 90-day windows
  are compared in percentage points; missing baseline hides the comparison. No eligible
  deliveries displays `—`, not 100%. The two rolling windows have equal lengths of
  90 × 24 hours; eligibility uses tenant-local receipt/expected dates. Receipt and
  production-step queries are paginated and tenant-scoped.

No schema, inventory writes or tenant-enforcement changes are required for these metrics.
