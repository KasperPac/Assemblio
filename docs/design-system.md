# Manuva Design System

Authoritative reference for building pages in the Manuva app. Loaded automatically
into agent context via CLAUDE.md. Covers token rules, canonical page layout,
`_ui/` component usage, and explicit anti-patterns.

---

## 1. Token Rules

### Surface tokens

| Surface | Correct token | Never use |
|---|---|---|
| Card background | `--bg-card` | `--surface-1` |
| Card border | `--stroke-card` | `--stroke-strong` |
| Button / input border | `--stroke-strong` | `--stroke-card` |
| Row / nested item background | `--surface-1` | `--bg-card` |
| Inner divider (table rows, list separators) | `--stroke` | `--stroke-card` |
| Table header background | `--bg-card-alt` | `--surface-1` |
| Hover surface | `--surface-hover` | any hex |

The key distinction: `--bg-card` is the card itself (white in daylight). `--surface-1`
is the slightly off-white used for items *inside* a card — rows, pills, nested panels.

### Status / semantic colour tokens

All status colours must come from the semantic layer — never hardcoded hex:

| Semantic | Token |
|---|---|
| Success / healthy | `--ok` |
| Warning / low stock | `--warning` |
| Error / danger | `--danger` |
| Informational | `--info` |
| Brand / primary action | `--brand-1` |
| Dimmed brand background | `--brand-dim` |

### Typography tokens

| Purpose | Token |
|---|---|
| Body text | `--fs-base` |
| Small / metadata | `--fs-sm` |
| Extra-small caps labels | `--fs-xs` |
| Primary text | `--ink-strong` |
| Muted / secondary text | `--ink-muted` |
| Faint / tertiary text | `--ink-faint` |
| Caps labels weight | `--fw-semibold` |
| Caps letter-spacing | `--ls-caps` |

Caps label pattern — used for table headers, eyebrow text, form field labels:

```css
font-size: var(--fs-xs);
font-weight: var(--fw-semibold);
text-transform: uppercase;
letter-spacing: var(--ls-caps);
color: var(--ink-muted);
```

---

## 2. Page Layout Pattern

Every page follows the same single-column structure. No exceptions.

### Canonical shell

```tsx
<section className={styles.page}>
  <PageHeader eyebrow="Operations" title="Purchase Orders" />
  {/* optional: tabs or filter bar */}
  <div className={styles.tableCard}>
    <table className={styles.table}>
      <thead>…</thead>
      <tbody>…</tbody>
    </table>
  </div>
</section>
```

```css
/* page.module.css */
.page {
  display: flex;
  flex-direction: column;
  gap: 18px;   /* 18px for dense pages, 24px for spacious */
}

.tableCard {
  composes: tableCard from "../_ui/table.module.css";
}

.table {
  composes: table from "../_ui/table.module.css";
}
```

### Eyebrow taxonomy

Every `PageHeader` must have an `eyebrow` that identifies the section:

| Eyebrow | Pages |
|---|---|
| `"Products"` | Components, Bills of Materials |
| `"Operations"` | Production Orders, Purchasing, Inventory, Goods Inwards |
| `"Logistics"` | Suppliers, Locations |
| `"Orders"` | Customer Orders |
| `"Admin"` | Settings, Users |
| `"Audit"` | Activity Log |

### Detail pages

Detail pages (e.g. PO detail, BOM detail) stack `formCard` panels vertically inside
the same `.page` wrapper:

```tsx
<div className={styles.page}>
  <PageHeader
    breadcrumbs={[{ label: "Purchase Orders", href: "/app/purchasing" }, { label: "PO-ABCD1234" }]}
    title="PO-ABCD1234"
    actions={<Link href="/app/goods-inwards/new?po={id}" className={styles.primary}>Receive Goods →</Link>}
  />
  <div className={styles.formCard}>
    {/* info fields */}
  </div>
  <div className={styles.formCard}>
    {/* lines table */}
  </div>
  <Link href="/app/purchasing" className={styles.backLink}>← Back to purchase orders</Link>
</div>
```

`formCard` CSS pattern:

```css
.formCard {
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  padding: 18px;
  display: grid;
  gap: 10px;
}
```

`backLink` CSS pattern (below the last card, not a button):

```css
.backLink {
  font-size: var(--fs-sm);
  color: var(--ink-muted);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.backLink:hover {
  color: var(--ink-strong);
}
```

### Layout rules

- **Single column only** on all list/index pages — no `grid-template-columns` at page level.
- **No embedded create forms** in the page body — create/edit flows go in `<dialog>` modals.
- **Action buttons** (e.g. "New PO") live in `PageHeader`'s `actions` prop — never floating elsewhere.
- **Back links** are small, muted, and sit below the last card — not a button.

---

## 3. `_ui/` Component Reference

These primitives are required — not optional alternatives to hand-writing the same thing.

### PageHeader

**Required on every page.** Always pass both `eyebrow` and `title`.

```tsx
import PageHeader from "../_ui/page-header";

<PageHeader
  eyebrow="Operations"             // required — section name from eyebrow taxonomy
  title="Purchase Orders"          // required — page name
  description="One sentence."      // optional
  breadcrumbs={[                   // optional — for detail pages (replaces eyebrow display)
    { label: "Purchase Orders", href: "/app/purchasing" },
    { label: "PO-ABCD1234" },
  ]}
  actions={<Link …>New PO</Link>}  // optional — primary CTA, right-aligned
/>
```

### StatusBadge

For any status chip, state label, or count badge. Never hardcode colours.

```tsx
import StatusBadge from "../_ui/status-badge";

<StatusBadge variant="success">Open</StatusBadge>
<StatusBadge variant="warning">Low stock</StatusBadge>
<StatusBadge variant="danger">Overdue</StatusBadge>
<StatusBadge variant="info">In transit</StatusBadge>
<StatusBadge>Neutral / default</StatusBadge>
```

### EmptyState

Required when a table or list has zero rows.

```tsx
import EmptyState from "../_ui/empty-state";

<EmptyState
  title="No purchase orders yet"
  message="Create your first PO to start tracking supplier orders."
/>
```

### HelpLink

When a concept benefits from contextual help.

```tsx
import HelpLink from "../_ui/help-link";

<HelpLink slug="purchasing/create-po" label="How do purchase orders work?" />
```

### ListPanel / ListRow

For detail pages with a vertical list of items (BOM lines, receipt lines, PO lines
presented as cards rather than a table row).

```tsx
import { ListPanel, ListRow } from "../_ui/list-panel";
```

### Buttons

All buttons and links styled as buttons must compose from `_ui/buttons.module.css`.
Never hand-write `border-radius: 999px`, `min-height: 42px`, etc. from scratch.

```css
/* In your page's .module.css */
.primaryBtn {
  composes: primary from "../_ui/buttons.module.css";
}

.secondaryBtn {
  composes: secondary from "../_ui/buttons.module.css";
}
```

### Tables

All tables must compose from `_ui/table.module.css`.
Never hand-write table card layout styles from scratch.

```css
/* In your page's .module.css */
.tableCard {
  composes: tableCard from "../_ui/table.module.css";
}

.table {
  composes: table from "../_ui/table.module.css";
}
```

---

## 4. Anti-Patterns

Any of these in a code review is a blocker.

### ❌ Inline styles for layout or colour

```tsx
// Wrong
<div style={{ display: "flex", gap: 24, background: "#fff" }}>

// Right — put it in the CSS module
<div className={styles.infoRow}>
```

**Exception:** Truly dynamic values only — e.g. `style={{ opacity: isDisabled ? 0.45 : 1 }}`.

### ❌ Hardcoded hex colours

```css
/* Wrong */
.dot { background: #4ade80; }

/* Right */
.dot { background: var(--ok); }
```

### ❌ Invented token names

These tokens **do not exist** in the design system — never use them:

| Invented name | Use instead |
|---|---|
| `--border` | `--stroke`, `--stroke-card`, or `--stroke-strong` |
| `--bg-hover` | `--surface-hover` |
| `--ink-base` | `--ink-strong` or `--ink-muted` |
| `--surface-card` | `--bg-card` |
| `--radius-base` | `--radius-lg` or `--radius-xl` |

If unsure whether a token exists, check `C:\dev\manuva-tokens\Manuva Design System\colors_and_type.css`.

### ❌ `--surface-1` on card backgrounds

```css
/* Wrong — surface-1 is for items inside cards, not the card itself */
.myCard { background: var(--surface-1); }

/* Right */
.myCard { background: var(--bg-card); }
```

### ❌ Two-column page layouts

```css
/* Wrong — never at page level */
.page { display: grid; grid-template-columns: 1fr 1fr; }

/* Right */
.page { display: flex; flex-direction: column; gap: 18px; }
```

### ❌ PageHeader without `eyebrow`

```tsx
// Wrong
<PageHeader title="Purchasing" />

// Right
<PageHeader eyebrow="Operations" title="Purchasing" />
```

### ❌ Hand-written card CSS

```css
/* Wrong — reinventing the card */
.myPanel {
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  background: white;
  border: 1px solid #e5e7eb;
}

/* Right — use the established pattern */
.myPanel {
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
}
```

### ❌ Custom table CSS instead of composing

```css
/* Wrong */
.table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }

/* Right */
.table { composes: table from "../_ui/table.module.css"; }
```
