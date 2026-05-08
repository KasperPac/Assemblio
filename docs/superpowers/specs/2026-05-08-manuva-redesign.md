# Manuva UI Redesign — Design Spec

**Date:** 2026-05-08
**Scope:** Option C — tokens + full component audit + layout refresh
**Themes:** Daylight (default light) + Midnight (cool dark)

---

## 1. Design Direction

Warm/elevated light mode paired with a cool slate dark mode. Inspired by Craft, Height, and Linear. The brand accent is indigo, used sparingly — primary actions, active nav, focus rings, and data highlights only.

**Not** a consumer-SaaS aesthetic. Professional, precise, and dense enough for floor managers spending hours in the UI. Cards float visually in light mode (shadow-based elevation); the dark mode is border-based and surgical.

---

## 2. Color Tokens

Both themes share identical token names. Components reference tokens only — no hardcoded hex values anywhere.

### Daylight (default)

| Token | Value | Usage |
|---|---|---|
| `--bg-page` | `#F8F7F5` | Page background |
| `--bg-sidebar` | `#F0EEE9` | Sidebar + topbar chrome |
| `--bg-card` | `#FFFFFF` | Card surfaces |
| `--bg-card-alt` | `#F3F2EF` | Alternate card, table stripe |
| `--bg-input` | `#F3F2EF` | Input fields, recessed |
| `--ink-strong` | `#1A1814` | Primary text, headings |
| `--ink-muted` | `#6B6560` | Secondary text, nav items |
| `--ink-faint` | `#9B9590` | Labels, placeholders, col headers |
| `--ink-on-brand` | `#FFFFFF` | Text on brand-colored surfaces |
| `--brand-1` | `#6366F1` | Primary brand, active states |
| `--brand-2` | `#4F46E5` | Hover/pressed state of brand |
| `--brand-dim` | `rgba(99,102,241,0.10)` | Tinted surfaces, active nav bg |
| `--brand-dark` | `#4338CA` | Deep brand for dark contexts |
| `--stroke` | `rgba(0,0,0,0.08)` | Table dividers, input borders |
| `--stroke-card` | `rgba(0,0,0,0.07)` | Card borders |
| `--stroke-strong` | `rgba(0,0,0,0.14)` | Emphasis borders |
| `--surface-0` | `#FFFFFF` | Highest surface |
| `--surface-1` | `#F3F2EF` | Recessed surface |
| `--surface-hover` | `rgba(0,0,0,0.04)` | Row hover, ghost button hover |
| `--ok` | `#16A34A` | Success — passes WCAG AA on white |
| `--ok-dim` | `rgba(22,163,74,0.10)` | Success badge background |
| `--warning` | `#D97706` | Warning |
| `--warning-dim` | `rgba(217,119,6,0.10)` | Warning badge background |
| `--danger` | `#DC2626` | Error/destructive |
| `--danger-dim` | `rgba(220,38,38,0.08)` | Danger badge background |
| `--info` | `var(--brand-1)` | Info state |
| `--info-dim` | `var(--brand-dim)` | Info badge background |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.06)` | Subtle lift |
| `--shadow-card` | `0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)` | Card elevation |
| `--shadow-md` | `0 4px 16px rgba(0,0,0,0.10)` | Dropdowns, popovers |
| `--shadow-lg` | `0 12px 32px rgba(0,0,0,0.14)` | Modals |
| `--shadow-focus` | `0 0 0 3px rgba(99,102,241,0.16)` | Focus ring |
| `--focus-border` | `rgba(99,102,241,0.50)` | Focus border color |

### Midnight (cool dark)

| Token | Value |
|---|---|
| `--bg-page` | `#0D1117` |
| `--bg-sidebar` | `#10161F` |
| `--bg-card` | `#161D2D` |
| `--bg-card-alt` | `#131929` |
| `--bg-input` | `#1C253A` |
| `--ink-strong` | `#E8ECF0` |
| `--ink-muted` | `#8496AA` |
| `--ink-faint` | `#6E7E94` |
| `--ink-on-brand` | `#FFFFFF` |
| `--brand-1` | `#818CF8` |
| `--brand-2` | `#A5B4FC` |
| `--brand-dim` | `rgba(129,140,248,0.14)` |
| `--brand-dark` | `#6366F1` |
| `--stroke` | `rgba(255,255,255,0.09)` |
| `--stroke-card` | `rgba(255,255,255,0.07)` |
| `--stroke-strong` | `rgba(255,255,255,0.16)` |
| `--surface-0` | `#161D2D` |
| `--surface-1` | `#1C253A` |
| `--surface-hover` | `rgba(255,255,255,0.05)` |
| `--ok` | `#34D399` |
| `--ok-dim` | `rgba(52,211,153,0.14)` |
| `--warning` | `#FBBF24` |
| `--warning-dim` | `rgba(251,191,36,0.13)` |
| `--danger` | `#F87171` |
| `--danger-dim` | `rgba(248,113,113,0.14)` |
| `--info` | `var(--brand-1)` |
| `--info-dim` | `var(--brand-dim)` |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.35)` |
| `--shadow-card` | `0 1px 3px rgba(0,0,0,0.40), 0 4px 12px rgba(0,0,0,0.30)` |
| `--shadow-md` | `0 4px 16px rgba(0,0,0,0.45)` |
| `--shadow-lg` | `0 12px 36px rgba(0,0,0,0.55)` |
| `--shadow-focus` | `0 0 0 3px rgba(129,140,248,0.25)` |
| `--focus-border` | `rgba(129,140,248,0.50)` |

### Theme-independent tokens (`:root`)

```css
/* Typography */
--font-body: var(--font-inter), system-ui, sans-serif;
--font-mono: var(--font-plex-mono), 'SF Mono', Menlo, Consolas, monospace;

--fs-xs:   11px;
--fs-sm:   12px;
--fs-base: 13px;
--fs-md:   14px;
--fs-lg:   16px;
--fs-xl:   20px;
--fs-2xl:  26px;

--fw-regular:  400;
--fw-medium:   500;
--fw-semibold: 600;
--fw-bold:     700;

--lh-tight:  1.2;
--lh-snug:   1.4;
--lh-normal: 1.6;

--ls-tight: -0.015em;
--ls-caps:   0.08em;

/* Radius */
--radius-xs:   4px;   /* badges */
--radius-sm:   6px;   /* buttons, inputs */
--radius-md:   8px;   /* menus, dropdowns */
--radius-lg:   12px;  /* cards, panels */
--radius-xl:   16px;  /* modals, large surfaces */
--radius-pill: 999px; /* status pills */

/* Spacing (4px base) */
--space-1: 4px;  --space-2: 8px;   --space-3: 12px;
--space-4: 16px; --space-5: 20px;  --space-6: 24px;
--space-8: 32px; --space-10: 40px; --space-12: 48px;

/* Motion */
--dur-fast:  120ms;
--dur-base:  180ms;
--dur-slow:  280ms;
--ease-out:  cubic-bezier(0.2, 0.7, 0.2, 1);
--ease-inout: cubic-bezier(0.4, 0, 0.2, 1);
```

---

## 3. Typography

- **Body font**: Inter via `next/font/google` — replaces Space Grotesk entirely
- **Mono font**: IBM Plex Mono — unchanged, used for all SKU codes, IDs, lot numbers, BOM refs
- **Tabular numerals**: `font-feature-settings: "tnum"` on all numeric columns and mono text
- **Layout.tsx**: swap `Space_Grotesk` import for `Inter`; remove `space_grotesk` CSS variable; add `inter` CSS variable

---

## 4. Layout Structure

### Shell grid
```
grid-template-columns: 240px 1fr   (desktop ≥1120px)
grid-template-columns: 1fr         (tablet/mobile <1120px)
```

### Sidebar
- Width: 240px (down from 280px)
- Background: `--bg-sidebar`, `border-right: 1px solid var(--stroke)`
- Nav items: height 34px, padding `8px 10px`, `border-radius: 10px`
- Section labels: Inter 10px uppercase, `--ink-faint`, `letter-spacing: 0.10em`
- Active item: `background: var(--brand-dim)`, `color: var(--brand-1)`, `border: 1px solid var(--brand-dim)`
- No decorative gradients anywhere in the sidebar

### Topbar
- Background: `--bg-sidebar` (unified chrome with sidebar)
- `border-bottom: 1px solid var(--stroke)`
- Padding: `16px 28px`
- Title: Inter 22px weight 700, tracking `-0.02em`
- Subtitle: Inter 12px, `--ink-muted`
- Actions: single row, no wrap, right-aligned
- Remove all decorative gradient overlays

### Content area
- Padding: `28px` desktop, `20px` tablet (`≤1120px`), `16px` mobile (`≤820px`)
- Max content width: `1400px`, centered with `margin: 0 auto`
- Page section gap: `24px`

### Cards (light mode)
- `background: var(--bg-card)`
- `border: 1px solid var(--stroke-card)`
- `border-radius: var(--radius-lg)` (12px)
- `box-shadow: var(--shadow-card)`
- `padding: var(--space-5)` (20px)

### Cards (dark mode)
- Same as above but `box-shadow: none` — border carries the visual weight

### Tables
- Row height: 38px
- Body cells: Inter 12.5px, `--ink-strong`
- Column headers: Inter 10px uppercase, `--ink-faint`, `letter-spacing: 0.08em`
- Row dividers: `1px solid var(--stroke)`
- No alternating row backgrounds

---

## 5. Component Patterns

### Buttons

| Variant | Background | Text | Border | Hover bg |
|---|---|---|---|---|
| Primary | `--brand-1` | `--ink-on-brand` | none | `--brand-2` |
| Secondary | `--bg-card` | `--ink-muted` | `--stroke` | `--surface-1` |
| Danger | `--danger-dim` | `--danger` | `--danger-dim` | `rgba(220,38,38,0.16)` bg |
| Ghost | transparent | `--ink-muted` | none | `--surface-hover` |

All buttons: Inter 13px weight 500, height 34px, `--radius-sm` (6px), transitions on `background` and `color` only at `--dur-base`.

### Inputs
- Height: 34px
- `border-radius: var(--radius-sm)`
- `border: 1px solid var(--stroke)`
- `background: var(--bg-input)`
- Focus: `border-color: var(--brand-1)` + `box-shadow: var(--shadow-focus)`
- Placeholder color: `--ink-faint`

### Form labels
- Inter 11.5px weight 600, `--ink-muted`
- 5px gap between label and input

### Badges
- Inter 10px weight 700, uppercase, `letter-spacing: 0.07em`
- `border-radius: var(--radius-xs)` (4px)
- Height: 20px, padding `2px 7px`
- Variants: `ok`, `warning`, `danger`, `info`, `default`
- All use `-dim` background + full semantic color for text

### Empty states
- Lucide icon: 32px, `--ink-faint`
- Title: 14px weight 600, `--ink-strong`
- Body: 12px, `--ink-muted`, max-width 40ch
- Single primary action button below

---

## 6. Files Changed

| File | Change type |
|---|---|
| `src/app/globals.css` | Full rewrite — new palette, Inter, two themes |
| `src/app/layout.tsx` | Swap `Space_Grotesk` → `Inter` in `next/font` |
| `src/app/app/shell.module.css` | Sidebar 240px, topbar cleanup, remove hardcoded values |
| `src/app/app/_ui/status-badge.module.css` | Verify token alignment (already partially done) |
| `src/app/app/_ui/button.module.css` | New variant system |
| `src/app/app/_ui/input.module.css` | Height, focus ring, label styles |
| `src/app/app/_ui/card.module.css` | Shadow + radius standardisation |
| All page-level `*.module.css` files | Light pass — remove hardcoded colors, wire to tokens |
| `C:/dev/manuva-tokens/.../colors_and_type.css` | Mirror globals.css changes |

---

## 7. Out of Scope

- Page-level layout restructuring (individual page designs)
- New features or nav items
- Mobile-specific navigation patterns
- Animation beyond existing transition tokens
