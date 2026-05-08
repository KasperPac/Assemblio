# Manuva UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing dark-first cobalt design with a warm light-default / cool dark dual-theme system using Inter typography and indigo brand.

**Architecture:** Token overhaul in `globals.css` cascades to all components automatically. Structural layout changes are isolated to `shell.module.css`. Component CSS files get targeted passes to remove dark-only patterns (`color-mix`, `rgba(255,255,255,...)` highlights, hardcoded radii) that break in light mode.

**Tech Stack:** Next.js 15 App Router, CSS Modules, `next/font/google` (Inter + IBM Plex Mono)

---

### Task 1: Update globals.css and ThemeProvider — new palette, default theme switch

**Goal:** Replace the cobalt-navy Midnight-default system with an indigo Daylight-default system; update font token to Inter.

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/theme-provider.tsx`

**Acceptance Criteria:**
- [ ] Daylight is the default theme (no stored preference → warm off-white UI with indigo brand)
- [ ] Midnight theme shows cool slate UI with lifted indigo `#818CF8`
- [ ] `--font-body` references `--font-inter` not `--font-space-grotesk`
- [ ] `--shadow-card` token exists in both Daylight and Midnight themes
- [ ] `--ls-caps` token exists in `:root`
- [ ] Old `assemblio-theme` storage key replaced with `manuva-theme`

**Verify:** `npm run dev` → open app with no localStorage entry → should see warm off-white background, not dark slate.

**Steps:**

- [ ] **Step 1: Rewrite `globals.css` — Daylight theme block**

Replace the entire `[data-theme="daylight"]` block and promote it to be the `:root` default. The current `:root, [data-theme="midnight"]` block loses the `:root` prefix.

```css
/* ── Theme: Daylight (default) ───────── */
:root,
[data-theme="daylight"] {
  --bg-page:     #F8F7F5;
  --bg-sidebar:  #F0EEE9;
  --bg-card:     #FFFFFF;
  --bg-card-alt: #F3F2EF;
  --bg-input:    #F3F2EF;

  --ink-strong:    #1A1814;
  --ink-muted:     #6B6560;
  --ink-faint:     #9B9590;
  --ink-on-brand:  #FFFFFF;

  --stroke:        rgba(0, 0, 0, 0.08);
  --stroke-card:   rgba(0, 0, 0, 0.07);
  --stroke-strong: rgba(0, 0, 0, 0.14);

  --surface-0:     #FFFFFF;
  --surface-1:     #F3F2EF;
  --surface-hover: rgba(0, 0, 0, 0.04);

  --brand-1:    #6366F1;
  --brand-2:    #4F46E5;
  --brand-dim:  rgba(99, 102, 241, 0.10);
  --brand-dark: #4338CA;

  --ok:          #16A34A;
  --ok-dim:      rgba(22, 163, 74, 0.10);
  --danger:      #DC2626;
  --danger-dim:  rgba(220, 38, 38, 0.08);
  --warning:     #D97706;
  --warning-dim: rgba(217, 119, 6, 0.10);
  --info:        var(--brand-1);
  --info-dim:    var(--brand-dim);

  --focus-ring:   rgba(99, 102, 241, 0.16);
  --focus-border: rgba(99, 102, 241, 0.50);

  --shadow-sm:    0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-card:  0 1px 3px rgba(0, 0, 0, 0.07), 0 4px 12px rgba(0, 0, 0, 0.05);
  --shadow-md:    0 4px 16px rgba(0, 0, 0, 0.10);
  --shadow-lg:    0 12px 32px rgba(0, 0, 0, 0.14);
  --shadow-focus: 0 0 0 3px rgba(99, 102, 241, 0.16);

  --scrollbar-thumb:       rgba(0, 0, 0, 0.14);
  --scrollbar-thumb-hover: rgba(0, 0, 0, 0.24);
  --logo-filter: none;
}
```

- [ ] **Step 2: Rewrite `globals.css` — Midnight theme block**

Replace the existing `:root, [data-theme="midnight"]` block — remove the `:root` prefix (Daylight is now the default) and update brand from cobalt to indigo.

```css
/* ── Theme: Midnight ─────────────────── */
[data-theme="midnight"] {
  --bg-page:     #0D1117;
  --bg-sidebar:  #10161F;
  --bg-card:     #161D2D;
  --bg-card-alt: #131929;
  --bg-input:    #1C253A;

  --ink-strong:    #E8ECF0;
  --ink-muted:     #8496AA;
  --ink-faint:     #6E7E94;
  --ink-on-brand:  #FFFFFF;

  --stroke:        rgba(255, 255, 255, 0.09);
  --stroke-card:   rgba(255, 255, 255, 0.07);
  --stroke-strong: rgba(255, 255, 255, 0.16);

  --surface-0:     #161D2D;
  --surface-1:     #1C253A;
  --surface-hover: rgba(255, 255, 255, 0.05);

  --brand-1:    #818CF8;
  --brand-2:    #A5B4FC;
  --brand-dim:  rgba(129, 140, 248, 0.14);
  --brand-dark: #6366F1;

  --ok:          #34D399;
  --ok-dim:      rgba(52, 211, 153, 0.14);
  --danger:      #F87171;
  --danger-dim:  rgba(248, 113, 113, 0.14);
  --warning:     #FBBF24;
  --warning-dim: rgba(251, 191, 36, 0.13);
  --info:        var(--brand-1);
  --info-dim:    var(--brand-dim);

  --focus-ring:   rgba(129, 140, 248, 0.25);
  --focus-border: rgba(129, 140, 248, 0.50);

  --shadow-sm:    0 1px 3px rgba(0, 0, 0, 0.35);
  --shadow-card:  0 1px 3px rgba(0, 0, 0, 0.40), 0 4px 12px rgba(0, 0, 0, 0.30);
  --shadow-md:    0 4px 16px rgba(0, 0, 0, 0.45);
  --shadow-lg:    0 12px 36px rgba(0, 0, 0, 0.55);
  --shadow-focus: 0 0 0 3px rgba(129, 140, 248, 0.25);

  --scrollbar-thumb:       rgba(255, 255, 255, 0.10);
  --scrollbar-thumb-hover: rgba(255, 255, 255, 0.18);
  --logo-filter: brightness(0) invert(1);
}
```

- [ ] **Step 3: Update `:root` theme-independent section — font token + missing tokens**

In `globals.css`, update the `/* ── Global design tokens (theme-independent) ──` section:

```css
/* ── Global design tokens (theme-independent) ── */
:root {
  /* Font families — Inter replaces Space Grotesk */
  --font-body: var(--font-inter), system-ui, sans-serif;
  --font-mono: var(--font-plex-mono), 'SF Mono', Menlo, Consolas, monospace;

  /* Type scale */
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
  --ls-normal: 0;
  --ls-caps:   0.08em;

  /* Radius scale */
  --radius-xs:   4px;
  --radius-sm:   6px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-xl:   16px;
  --radius-pill: 999px;

  /* Spacing (4px base) */
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-8:  32px;
  --space-10: 40px;
  --space-12: 48px;

  /* Motion */
  --dur-fast:   120ms;
  --dur-base:   180ms;
  --dur-slow:   280ms;
  --ease-out:   cubic-bezier(0.2, 0.7, 0.2, 1);
  --ease-inout: cubic-bezier(0.4, 0, 0.2, 1);
}
```

- [ ] **Step 4: Update `theme-provider.tsx` — switch default to daylight, rename storage key**

```tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ThemeId = "midnight" | "daylight" | "ocean" | "ember";

const STORAGE_KEY = "manuva-theme";

const ThemeContext = createContext<{
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
}>({
  theme: "daylight",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("daylight");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (stored) {
      setThemeState(stored);
      document.documentElement.setAttribute("data-theme", stored);
    }
    setMounted(true);
  }, []);

  function setTheme(id: ThemeId) {
    setThemeState(id);
    localStorage.setItem(STORAGE_KEY, id);
    document.documentElement.setAttribute("data-theme", id);
  }

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/theme-provider.tsx
git commit -m "feat(design): new token system — indigo brand, warm daylight default, Inter font token"
```

---

### Task 2: Swap Space Grotesk for Inter in layout.tsx

**Goal:** Load Inter via `next/font/google`, remove Space Grotesk, update app metadata title, and update the inline theme-init script storage key.

**Files:**
- Modify: `src/app/layout.tsx`

**Acceptance Criteria:**
- [ ] Inter loads via `next/font/google` with weights 400, 500, 600, 700
- [ ] `--font-space-grotesk` CSS variable is gone; `--font-inter` CSS variable is applied to `<body>`
- [ ] App title is "Manuva" not "Assemblio"
- [ ] Inline theme-init script reads `manuva-theme` from localStorage (not `assemblio-theme`)

**Verify:** `npm run dev` → open DevTools → `document.documentElement.style` shows no `--font-space-grotesk`; body font renders as Inter (geometric, open letterforms vs. Space Grotesk's slightly condensed feel).

**Steps:**

- [ ] **Step 1: Rewrite `layout.tsx`**

```tsx
import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
import ThemeProvider from "./theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Manuva",
  description:
    "BOM, inventory, and allocation operations for Shopify-connected manufacturers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("manuva-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${inter.variable} ${plexMono.variable}`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(design): swap Space Grotesk for Inter, rename app to Manuva"
```

---

### Task 3: Shell layout — sidebar 240px, topbar cleanup

**Goal:** Reduce sidebar from 280px to 240px, clean up the topbar, and remove all hardcoded colors from `shell.module.css`.

**Files:**
- Modify: `src/app/app/shell.module.css`

**Acceptance Criteria:**
- [ ] Sidebar is 240px wide (shell grid + `::before` pseudo)
- [ ] No hardcoded hex or `rgba(255,...)` values — all use tokens
- [ ] Topbar padding is `16px 28px`
- [ ] No decorative gradient overlays on topbar or shell
- [ ] Nav item hover uses `var(--surface-hover)` not a hardcoded rgba

**Verify:** `npm run dev` → navigate to any page → sidebar should be visibly narrower; hover nav items to confirm hover state; switch to Daylight theme to confirm no dark-only artifacts.

**Steps:**

- [ ] **Step 1: Update sidebar width — grid and pseudo-element**

Find and replace both occurrences of `280px`:

```css
/* In .shell */
.shell {
  position: relative;
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 100vh;
  background: var(--bg-page);
  color: var(--ink-strong);
}

/* In .shell::before */
.shell::before {
  content: "";
  position: fixed;
  inset: 0 auto 0 0;
  width: 240px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--stroke);
  pointer-events: none;
  z-index: 0;
}
```

- [ ] **Step 2: Update topbar padding and remove gradient**

```css
.topbar {
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--stroke);
  padding: 16px 28px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
```

Remove any `linear-gradient` or `radial-gradient` declarations from `.topbar` or `.shell` that are purely decorative.

- [ ] **Step 3: Fix `.userGreeting` and avatar — remove dark-only gradient**

```css
.userGreeting {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 10px;
  border-radius: 14px;
  background: var(--surface-1);
  border: 1px solid var(--stroke);
}

.userGreetingAvatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--brand-dim);
  border: 1px solid var(--stroke-strong);
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 14px;
  color: var(--brand-1);
  flex-shrink: 0;
}
```

- [ ] **Step 4: Fix `.topbarAvatar` — remove hardcoded gradient**

```css
.topbarAvatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--brand-dim);
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 14px;
  color: var(--brand-1);
  border: 2px solid var(--stroke);
}
```

- [ ] **Step 5: Fix `.sidebarCallout` — remove hardcoded brand color**

```css
.sidebarCallout {
  display: grid;
  gap: 8px;
  padding: 14px 12px;
  margin: 4px 4px 8px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--stroke);
  background:
    radial-gradient(circle at top right, var(--brand-dim), transparent 42%),
    var(--surface-1);
}
```

- [ ] **Step 6: Fix responsive breakpoint — update 280px reference**

In the `@media (max-width: 1120px)` block, the `::before` display:none doesn't need updating, but ensure the sidebar is not hard-coded elsewhere:

```css
@media (max-width: 1120px) {
  .shell::before {
    display: none;
  }

  .shell {
    grid-template-columns: 1fr;
  }
  /* rest of mobile rules unchanged */
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/app/shell.module.css
git commit -m "feat(design): shell — sidebar 240px, topbar cleanup, token-only colors"
```

---

### Task 4: Shared _ui component CSS

**Goal:** Fix four shared UI component CSS files to remove dark-only hardcoded values and align with the new token system.

**Files:**
- Modify: `src/app/app/_ui/empty-state.module.css`
- Modify: `src/app/app/_ui/list-panel.module.css`
- Modify: `src/app/app/_ui/page-header.module.css`
- Modify: `src/app/app/_ui/status-badge.module.css`

**Acceptance Criteria:**
- [ ] No `rgba(255, 255, 255, ...)` hardcoded values in any of these files
- [ ] No `color-mix()` calls — all replaced with token references
- [ ] `empty-state` renders correctly in both Daylight and Midnight
- [ ] `list-panel` rows render correctly in both themes (no white glows in Daylight)
- [ ] `status-badge` uses `--ok-dim`, `--warning-dim`, `--danger-dim`, `--info-dim`, `--surface-1`

**Verify:** `npm run dev` → navigate to any page with an empty state (e.g. an empty list) → switch themes via Settings → Appearance → confirm no white glows or broken contrast in Daylight.

**Steps:**

- [ ] **Step 1: Rewrite `empty-state.module.css`**

Current issue: `rgba(255, 255, 255, 0.02)` is a dark-only tint that shows as a grey box in Daylight.

```css
.state {
  display: grid;
  gap: 10px;
  padding: 20px 18px;
  border: 1px dashed var(--stroke);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
}

.title {
  font-size: var(--fs-md);
  font-weight: var(--fw-bold);
  color: var(--ink-strong);
  margin: 0;
}

.message {
  font-size: var(--fs-base);
  line-height: var(--lh-normal);
  color: var(--ink-muted);
  margin: 0;
}

.action {
  width: fit-content;
}
```

- [ ] **Step 2: Rewrite `list-panel.module.css`**

Current issue: Uses `color-mix()` for backgrounds and `rgba(255, 255, 255, ...)` for inset highlights — these are dark-only patterns that look bad in Daylight.

```css
.panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
}

.sectionHeader {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
}

.eyebrow {
  margin: 0 0 6px;
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
  color: var(--ink-faint);
}

.title {
  margin: 0;
  color: var(--ink-strong);
  font-size: var(--fs-lg);
}

.description {
  margin: 8px 0 0;
  color: var(--ink-muted);
  font-size: var(--fs-base);
  line-height: var(--lh-snug);
}

.headerAction {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.tableHeader,
.row {
  display: grid;
  gap: 12px;
  align-items: center;
}

.tableHeader {
  padding: 0 6px;
  color: var(--ink-faint);
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
}

.body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  padding: 14px 16px;
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  border: 1px solid var(--stroke-card);
  transition: background var(--dur-base) var(--ease-out);
}

.row:hover {
  background: var(--surface-hover);
}

@media (max-width: 860px) {
  .panel {
    padding: 20px;
  }

  .sectionHeader {
    flex-direction: column;
    align-items: flex-start;
  }

  .tableHeader {
    display: none;
  }

  .row {
    grid-template-columns: 1fr !important;
  }
}
```

- [ ] **Step 3: Verify `page-header.module.css` — no changes needed**

Review the file — it already uses tokens (`var(--brand-dim)`, `var(--brand-1)`, `var(--ink-muted)`). No changes required.

- [ ] **Step 4: Verify `status-badge.module.css` — confirm token alignment**

The file was updated in a previous session. Confirm the full content matches the spec:

```css
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: var(--radius-xs);
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  border: 1px solid transparent;
  white-space: nowrap;
}

.default {
  background: var(--surface-1);
  color: var(--ink-muted);
  border-color: var(--stroke-card);
}

.success {
  background: var(--ok-dim);
  color: var(--ok);
  border-color: var(--ok-dim);
}

.warning {
  background: var(--warning-dim);
  color: var(--warning);
  border-color: var(--warning-dim);
}

.danger {
  background: var(--danger-dim);
  color: var(--danger);
  border-color: var(--danger-dim);
}

.info {
  background: var(--info-dim);
  color: var(--info);
  border-color: var(--info-dim);
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/app/_ui/empty-state.module.css src/app/app/_ui/list-panel.module.css src/app/app/_ui/status-badge.module.css
git commit -m "feat(design): _ui components — token-only CSS, remove dark-only patterns"
```

---

### Task 5: Dashboard and widget CSS

**Goal:** Replace all dark-only CSS patterns in `dashboard.module.css` and `widget.module.css` with token-based equivalents that work in both Daylight and Midnight.

**Files:**
- Modify: `src/app/app/dashboard.module.css`
- Modify: `src/app/app/_dashboard/widget.module.css`

**Acceptance Criteria:**
- [ ] No `color-mix()` calls anywhere in either file
- [ ] No `rgba(255, 255, 255, ...)` values (dark-only bevel highlights)
- [ ] No `rgba(5, 8, 15, ...)` values (dark-only shadow tones)
- [ ] No `transform: translateY(-1px)` on hover (spec: color-shift only)
- [ ] Cards use `var(--shadow-card)` and `var(--bg-card)` consistently
- [ ] Switches cleanly between Daylight and Midnight with no broken contrast

**Verify:** `npm run dev` → open `/app` (dashboard) → switch between Midnight and Daylight via Settings → Appearance → confirm cards visible in both themes, no white glow artifacts in Daylight.

**Steps:**

- [ ] **Step 1: Replace all card background patterns in `dashboard.module.css`**

The current pattern for cards is:
```css
/* OLD — dark-only */
background: linear-gradient(180deg, color-mix(in srgb, var(--surface-1) 88%, var(--bg-card)), color-mix(in srgb, var(--surface-0) 94%, var(--bg-card)));
box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 18px 40px rgba(5, 8, 15, 0.28);
```

Replace every instance of this pattern in `.heroMain`, `.heroAside`, `.card`, `.actionCard`, `.metricCard`, `.chartSummary`, `.alertItem`, `.notificationItem`, `.activityItem`, `.orderRow` with:

```css
/* NEW — token-based */
background: var(--bg-card);
border: 1px solid var(--stroke-card);
box-shadow: var(--shadow-card);
```

- [ ] **Step 2: Fix `.heroMain` — remove radial brand gradient**

```css
.heroMain {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 28px;
  background: var(--bg-card);
}
```

- [ ] **Step 3: Fix `.metricCard` — flat background**

```css
.metricCard {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  border: 1px solid var(--stroke-card);
}
```

- [ ] **Step 4: Fix `.alertItem`, `.notificationItem`, `.activityItem`, `.orderRow` — row backgrounds**

```css
.alertItem,
.notificationItem,
.activityItem,
.orderRow {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  border: 1px solid var(--stroke-card);
}
```

- [ ] **Step 5: Fix hover states — remove `transform: translateY(-1px)`**

Remove every `transform: translateY(-1px)` hover rule. Replace hover background shifts with token-based color changes:

```css
/* Remove this entirely: */
.orderRow:hover,
.actionCard:hover,
.cardHeader a:hover {
  transform: translateY(-1px);
}

/* Replace the card hover: */
.heroMain:hover,
.heroAside:hover,
.card:hover,
.actionCard:hover {
  border-color: var(--stroke-strong);
}
```

- [ ] **Step 6: Fix `.actionIcon` — remove hardcoded `color-mix` with brand**

```css
.actionIcon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
  background: var(--brand-dim);
  color: var(--brand-1);
}
```

- [ ] **Step 7: Fix all `border-radius` hardcoded values in `dashboard.module.css`**

Search for hardcoded radius values and replace:
- `border-radius: 24px` → `border-radius: var(--radius-xl)`
- `border-radius: 20px` → `border-radius: var(--radius-lg)`
- `border-radius: 18px` → `border-radius: var(--radius-lg)`
- `border-radius: 16px` → `border-radius: var(--radius-xl)` (or `--radius-lg` if it's a card)
- `border-radius: 14px` → `border-radius: var(--radius-lg)` (or `--radius-md` for small elements)

- [ ] **Step 8: Fix `.chartSummary`**

```css
.chartSummary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 18px;
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  border: 1px solid var(--stroke-card);
}
```

- [ ] **Step 9: Fix `widget.module.css`** — apply the same patterns. Read the file first, then replace any `color-mix()`, `rgba(255,255,255,...)`, and hardcoded shadow values with their token equivalents following the same rules as Steps 1–8 above.

- [ ] **Step 10: Fix transition on `.orderRow` and `.actionCard`** — remove `transform` from transition list:

```css
.orderRow,
.actionCard {
  transition:
    border-color var(--dur-base) var(--ease-out),
    background var(--dur-base) var(--ease-out);
}
```

- [ ] **Step 11: Commit**

```bash
git add src/app/app/dashboard.module.css src/app/app/_dashboard/widget.module.css
git commit -m "feat(design): dashboard — token-only CSS, theme-safe card patterns"
```

---

### Task 6: Page CSS audit — all remaining module.css files

**Goal:** Apply token-only fixes across all 28 remaining page CSS files that contain hardcoded color values.

**Files (all need the same pattern replacements):**
- Modify: `src/app/app/section.module.css`
- Modify: `src/app/app/overview.module.css`
- Modify: `src/app/app/planning.module.css`
- Modify: `src/app/app/inventory/inventory.module.css`
- Modify: `src/app/app/purchasing/purchasing.module.css`
- Modify: `src/app/app/bom/bom.module.css`
- Modify: `src/app/app/bom/templates/templates.module.css`
- Modify: `src/app/app/components/components.module.css`
- Modify: `src/app/app/components/[componentId]/component-detail.module.css`
- Modify: `src/app/app/orders/orders.module.css`
- Modify: `src/app/app/orders/[orderId]/page.module.css`
- Modify: `src/app/app/suppliers/suppliers.module.css`
- Modify: `src/app/app/suppliers/[supplierId]/supplier-tabs.module.css`
- Modify: `src/app/app/goods-inwards/goods-inwards.module.css`
- Modify: `src/app/app/stocktake/stocktake.module.css`
- Modify: `src/app/app/stocktake/[sessionId]/page.module.css`
- Modify: `src/app/app/warehouse/locations/page.module.css`
- Modify: `src/app/app/activity-log/activity-log.module.css`
- Modify: `src/app/app/help/help.module.css`
- Modify: `src/app/app/trash/trash.module.css`
- Modify: `src/app/app/staff-costings/staff-costings.module.css`
- Modify: `src/app/app/planning/(gated)/floor/floor.module.css`
- Modify: `src/app/app/planning/(gated)/shopfloor/shopfloor.module.css`
- Modify: `src/app/app/planning/upgrade/upgrade.module.css`
- Modify: `src/app/app/products/products.module.css`
- Modify: `src/app/app/products/product-detail.module.css`
- Modify: `src/app/app/products/variant-detail.module.css`
- Modify: `src/app/app/products/bom-editor.module.css`
- Modify: `src/app/app/products/bom-lightbox.module.css`
- Modify: `src/app/app/products/bom-versions-tab.module.css`
- Modify: `src/app/app/reports/reports.module.css`
- Modify: `src/app/app/reports/_components/*.module.css` (5 files)
- Modify: `src/app/app/settings/settings-layout.module.css`
- Modify: `src/app/app/settings/appearance/appearance.module.css`
- Modify: `src/app/app/settings/company/company.module.css`
- Modify: `src/app/app/settings/profile/profile.module.css`
- Modify: `src/app/app/settings/team/team.module.css`
- Modify: `src/app/app/settings/invoices/invoices.module.css`
- Modify: `src/app/app/settings/integrations/integrations.module.css`
- Modify: `src/app/app/settings/locations/locations.module.css`
- Modify: `src/app/app/departments/departments.module.css`

**Acceptance Criteria:**
- [ ] Zero `color-mix()` calls across all listed files
- [ ] Zero `rgba(255, 255, 255, 0.0[1-9])` decorative highlight values (the dark-mode bevels)
- [ ] Zero `rgba(5, 8, 15, ...)` dark-only shadow tints
- [ ] Zero `transform: translateY(...)` on hover states
- [ ] All hardcoded `border-radius` values replaced with `var(--radius-*)` tokens
- [ ] `appearance.module.css`: `var(--fs-h3)` → `var(--fs-md)`, `var(--fs-badge)` → `var(--fs-xs)`
- [ ] App renders without visual breakage in both Daylight and Midnight on every page

**Verify:** `npm run dev` → visit each major section (Inventory, BOMs, Orders, Suppliers, Reports, Settings) → toggle between Midnight and Daylight → no white glows, dark blobs, or broken card backgrounds in Daylight.

**Steps:**

- [ ] **Step 1: Understand the four replacement patterns — apply these to every file**

For every file in the list, read it and apply these four substitutions:

**Pattern A — `color-mix()` backgrounds → flat token**
```css
/* BEFORE */
background: color-mix(in srgb, var(--surface-1) 78%, var(--bg-card));
/* AFTER */
background: var(--surface-1);

/* BEFORE */
background: linear-gradient(180deg, color-mix(...), color-mix(...));
/* AFTER */
background: var(--bg-card);
```

**Pattern B — decorative white inset highlights → remove**
```css
/* REMOVE — these are invisible in Daylight but a white band in some browsers */
box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
/* If a box-shadow has both an inset highlight AND a drop shadow, keep only the drop shadow */
```

**Pattern C — dark-only shadow values → token**
```css
/* BEFORE */
box-shadow: 0 18px 40px rgba(5, 8, 15, 0.28);
/* AFTER */
box-shadow: var(--shadow-card);

/* BEFORE */
0 24px 52px rgba(5, 8, 15, 0.34)
/* AFTER */
var(--shadow-md)
```

**Pattern D — remove `transform` hover lifts**
```css
/* REMOVE any rule like: */
.thing:hover {
  transform: translateY(-1px);
}
/* Replace with border-color or background shift if a hover state is still needed */
.thing:hover {
  border-color: var(--stroke-strong);
}
```

- [ ] **Step 2: Fix `appearance.module.css` — broken token references**

These token names don't exist in the system — replace them:

```css
/* BEFORE */
font-size: var(--fs-h3);
/* AFTER */
font-size: var(--fs-md);

/* BEFORE */
font-size: var(--fs-badge);
/* AFTER */
font-size: var(--fs-xs);
```

Also fix `letter-spacing: var(--ls-caps)` — this is correct; ensure `--ls-caps` is now in `:root` (added in Task 1).

- [ ] **Step 3: Fix hardcoded border-radius values**

For every file, replace hardcoded border-radius:
```css
border-radius: 24px → var(--radius-xl)
border-radius: 20px → var(--radius-lg)
border-radius: 18px → var(--radius-lg)
border-radius: 16px → var(--radius-xl)  /* top-level surface */
border-radius: 14px → var(--radius-lg)  /* card-level */
```
Leave `border-radius: 999px` (pill) and small values (4px, 6px, 8px) if they match existing tokens, or map to `--radius-xs/sm/md`.

- [ ] **Step 4: Process files in batches and commit after each batch**

Batch 1 — Inventory, BOMs, Components:
```bash
git add src/app/app/inventory/ src/app/app/bom/ src/app/app/components/
git commit -m "feat(design): token audit — inventory, BOMs, components CSS"
```

Batch 2 — Orders, Purchasing, Suppliers, Goods-inwards:
```bash
git add src/app/app/orders/ src/app/app/purchasing/ src/app/app/suppliers/ src/app/app/goods-inwards/
git commit -m "feat(design): token audit — orders, purchasing, suppliers CSS"
```

Batch 3 — Products:
```bash
git add src/app/app/products/
git commit -m "feat(design): token audit — products CSS"
```

Batch 4 — Reports:
```bash
git add src/app/app/reports/
git commit -m "feat(design): token audit — reports CSS"
```

Batch 5 — Settings + remaining:
```bash
git add src/app/app/settings/ src/app/app/departments/ src/app/app/planning/ src/app/app/stocktake/ src/app/app/warehouse/ src/app/app/activity-log/ src/app/app/help/ src/app/app/trash/ src/app/app/staff-costings/ src/app/app/overview.module.css src/app/app/section.module.css src/app/app/planning.module.css
git commit -m "feat(design): token audit — settings, planning, misc CSS"
```

---

### Task 7: Sync manuva-tokens reference file

**Goal:** Update the design token reference file at `C:/dev/manuva-tokens/` to match the final `globals.css` so the external design system stays in sync.

**Files:**
- Modify: `C:/dev/manuva-tokens/Manuva Design System/colors_and_type.css`

**Acceptance Criteria:**
- [ ] `colors_and_type.css` Daylight theme matches `globals.css` Daylight theme exactly
- [ ] `colors_and_type.css` Midnight theme matches `globals.css` Midnight theme exactly
- [ ] `--font-body` references `--font-inter` not `--font-space-grotesk`
- [ ] `--shadow-card` exists in both themes
- [ ] `--ls-caps` exists in `:root`

**Verify:** Diff the two files — `globals.css` tokens and `colors_and_type.css` tokens should be identical for Daylight and Midnight (Ocean and Ember are in `globals.css` only and can be ignored for the reference file).

**Steps:**

- [ ] **Step 1: Copy the complete Daylight and Midnight theme blocks from `globals.css` into `colors_and_type.css`**

Read `src/app/globals.css` (final state after all prior tasks). Open `C:/dev/manuva-tokens/Manuva Design System/colors_and_type.css` and replace its Daylight and Midnight theme blocks with the exact values from `globals.css`. Also replace the `:root` theme-independent section.

- [ ] **Step 2: Commit to manuva-tokens repo**

```bash
cd C:/dev/manuva-tokens
git add "Manuva Design System/colors_and_type.css"
git commit -m "sync: mirror Manuva app token changes — indigo brand, warm daylight, Inter"
```

Then return to the Assemblio repo:
```bash
cd C:/dev/Assemblio
```
