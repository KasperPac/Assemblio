# Pre-Launch Review — Resolution Report

**Resolved:** 2026-06-01  
**Reviews covered:** Components, Goods Inwards, Products  

---

## Summary

| Review | Findings resolved | Deferred |
|--------|------------------|---------|
| Components | F-01 – F-19 (all 19) | EW-01 – EW-05 (easy wins, post-launch) |
| Goods Inwards | F-01, F-02, A-01 | F-03 – F-10, A-02 – A-05 |
| Products — Critical (A1, A2, B1) | All 3 | — |
| Products — High priority (A3, A4, B2, B3, C1, C2) | All 6 | — |
| Products — Medium / Low / D-series | 0 | All (post-launch) |
| Reports | 0 | All (not yet scheduled) |
| Locations | 0 | Not yet scheduled |
| Suppliers | 0 | Not yet scheduled |
| Orders | 0 | Not yet scheduled |

---

## Components Review (all 19 findings resolved)

### Navigation gaps

| Finding | Description | Commit |
|---------|-------------|--------|
| F-01 | Purchasing had no sidebar entry | `5cd0c855` |
| F-02 | Inventory had no sidebar entry | `5cd0c855` |
| F-03 | BOM Usage rows linked to generic `/app/bom` instead of specific BOM | `68eae935` |
| F-04 | "Receive Stock" button dropped context — now passes `?component_id=` | `68eae935` |
| F-05 | Movement ref type not linked | `68eae935` |

### Missing content

| Finding | Description | Commit |
|---------|-------------|--------|
| F-06 | No edit for component fields — added edit modal + `updateComponent` action | `f9fba776` |
| F-07 | Component list had no `<h1>` page title | `68eae935` |
| F-08 | No archive/delete — added archive with conflict checks + `archived_at` filter | `7cfad6e9` |
| F-09 | Supplier links couldn't be edited or removed — added inline edit + unlink | `48179a44` |
| F-10 | Location tab had no explanatory copy | `68eae935` |

### Accessibility

| Finding | Description | Commit |
|---------|-------------|--------|
| F-11 | Stat cards had no accessible label association | `aaabf5fe` |
| F-12 | Detail tabs missing ARIA tab roles and state | `aaabf5fe` |
| F-13 | Dialog close button had no accessible label | `aaabf5fe` |
| F-14 | Stock status communicated by colour only | `aaabf5fe` |

### Ease of use

| Finding | Description | Commit |
|---------|-------------|--------|
| F-15 | Date format inconsistency between tabs | `c6a7303e` |
| F-16 | Aisle dropdown required sub-location even when not applicable | `bb56439a` |
| F-17 | Clicking "All" tab lost the active search query | `c6a7303e` |
| F-18 | Ref type column showed raw database enum values | `bb56439a` |
| F-19 | No sort controls on the component list | `bb56439a` |

**Deferred:** Easy wins EW-01 – EW-05 (quick-create PO, inline reorder-point edit, days-remaining stat, group filter chips, image attachment) — not blocking launch.

---

## Goods Inwards Review

### Resolved

| Finding | Description | Commit |
|---------|-------------|--------|
| F-01 | `linkReceiptToPo` server action had no UI trigger — wired to amber banner on receipt detail | `a83e9fc2` |
| F-02 | New receipt form had no PO selection — added PO dropdown with supplier + lines pre-fill | `34c25235` |
| A-01 | No "Receive Goods" shortcut from PO — added PO detail page with CTA + form pre-selection from `?po=` param | `813f0edf` |

### Deferred (post-launch)

| Finding | Description | Priority |
|---------|-------------|----------|
| F-03 | PO detail → receipts section | P2 |
| F-04 | Supplier detail → receipt deep-links | P2 |
| F-05 | Receipt detail → View PO link | P2 |
| F-06 | Colour-only status badges and variance column | P3 |
| F-07 | Cost modal can't be re-triggered after dismiss | P3 |
| F-08 | PDF section silently hidden when API key is missing | P3 |
| F-09 | Empty state on list is bare | P3 |
| F-10 | Modal and dialog ARIA roles + focus trap audit | P4 |
| A-02 | Lot / batch number capture per line | P2 |
| A-03 | Printable Goods Received Note | P2 |
| A-04 | Running receipt value total | P3 |
| A-05 | "Due In" tab — upcoming expected deliveries | P3 |

---

## Products Review — Critical (all 3 resolved)

| Finding | Description | Commits |
|---------|-------------|---------|
| A1 | "Last sync" showed creation date, never the actual sync date — added `last_synced_at` column, stamped on every sync, updated detail header | `0977c44f`, `4b268ce7`, `69c29123` |
| A2 | `{{customer_first_name}}` hardcoded as empty string — fetched from Shopify, stored in `orders`, populated in notification engine, nulled in GDPR redact | `0977c44f`, `4b268ce7`, `5a736f69`, `8af4f3ee` |
| B1 | Products list page had no `<h1>` heading | `370969db` |

---

## Products Review — High Priority (all 6 resolved)

| Finding | Description | Commit |
|---------|-------------|--------|
| A3 | Routing tab showed editable forms for archived BOM versions — archived BOMs now read-only in collapsible `<details>` block | `ef784f70` |
| A4 | "Import Products" button had no feedback — form now passes `returnTo`, success/error banner rendered on redirect | `ec12aa75` |
| B2 | Filter `<select>` never submitted without pressing Enter — extracted `ProductFilters` client component with `requestSubmit()` on change | `ba40a0ce` |
| B3 | Variant coverage table rows were mouse-only — added `tabIndex`, `role="link"`, `onKeyDown` Enter/Space | `e464a46e` |
| C1 | "Save BOM" activated live version with no warning — renamed to "Activate BOM", guarded by confirmation dialog | `bdff19f8` |
| C2 | Discard / Delete draft had no confirmation — both now guarded by a shared confirmation dialog | `3512b3c9` |

### Deferred (post-launch)

| Finding | Description |
|---------|-------------|
| A5 | Orphaned file `product-variant-picker.tsx` with broken CSS reference |
| B4 | Remove buttons icon-only with no accessible label |
| B5 | Mobile product list loses column context when stacked |
| B6 | (and remaining medium/low/D-series findings) |
| C3–C6 | Various medium-priority ease-of-use findings |
| D1–D5 | Export and enhancement features |

---

## Not Yet Scheduled

- **Reports** — 6 bugs, 6 accessibility issues, 8 UX gaps identified in review; no work started
- **Locations** — review written; no work started  
- **Suppliers** — review written; no work started  
- **Orders** — super-admin foundation review written; no work started
