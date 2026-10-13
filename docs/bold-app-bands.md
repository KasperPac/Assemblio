# Index headers and metrics

Initially implemented for MANUVA-73 from the October 2 marketing/app handoff.
Revised for MANUVA-117: balanced D was approved on October 13 after reviewing
Reports, Products and Components. This is a product design reference, not a build-status report.
The source references are at `C:/dev/ManuvaMarketingBold/design_handoff_app_bold/`;
the current local token library is `C:/dev/ManuvaDesignSystem`.

## Page map

| Route | Domain | Title |
| --- | --- | --- |
| `/app` | Theme brand | Today |
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
| `/app/reports` | Audit / aqua | Reports |
| `/app/activity-log` | Audit / aqua | Activity log |
| `/app/super-admin/audit` | Audit / aqua | Audit log |
| `/app/orders` | Theme brand | Orders |
| `/app/trash` | Theme brand | Trash |
| `/app/super-admin` | Theme brand | Tenants |
| `/app/super-admin/team` | Theme brand | Platform team |

## Header and shell rules

Index pages retain the `band`, `domain` and `stat` API with a restrained visual
implementation. `route-meta.ts` holds the exact index map; details retain quiet
headers. Notices stay above the neutral topbar. Tables, forms, filters and surface
palettes remain in place; table headings use a 5% domain tint. Dialogs and menus
restore neutral tokens, including focus and table surfaces.

Headers use an 8% domain tint, narrow accent edge, 32px Archivo title (28px mobile),
width 105 and weight 700. Stats use compact 28px tabular Inter text. No oversized
cover, watermark or lime delta. Reports keeps delivery performance in its report
card rather than repeating it in the header. Navigation uses a 22% domain tint
against the sidebar and a narrow marker; neutral modules use the theme brand.

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
