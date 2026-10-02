# Public Help Centre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public help centre at `app.manuva.app/help` with one manual per Manuva module, replacing the 26 short in-app articles at `/app/help`.

**Architecture:** Manuals are MDX files in `src/content/help/`, listed in a plain TypeScript registry and rendered by public, statically generated Next.js routes under `src/app/help/` (outside the `/app` login proxy). Every `##` heading gets an anchor from one shared `slugify`, so the contents list, search results, in-app help links and old-URL redirects all point at the same ids, and tests fail if any of them stops resolving.

**Tech Stack:** Next.js 16.1.6 App Router, React 19.2.3, `@next/mdx` + `remark-gfm`, CSS Modules on the Manuva design system tokens, vitest (+ `@mdx-js/mdx` to render manuals in tests).

**Spec:** `docs/superpowers/specs/2026-10-02-public-help-centre-design.md`

**Scope of this plan:** spec §7 delivery items 1, 2 and the marketing link (PRs 1–3 and the marketing PR). Item 3, the demo workspace seed, capture script and screenshots (MANUVA-71, MANUVA-72), gets its own plan once PR 3 lands. Its capture list depends on the finished manuals, and its seed needs its own investigation of the database functions.

## Global Constraints

- Next.js `16.1.6`, React `19.2.3`. Routes live in `src/app`. The login middleware is the root `middleware.ts` on `main`; PR #34 moves it to `src/proxy.ts`. Its matcher is `["/app/:path*"]` in both places. Do not change it.
- New dependencies, and no others: `@next/mdx@16.1.6`, `@mdx-js/loader`, `@mdx-js/react`, `remark-gfm` (dependencies); `@mdx-js/mdx`, `@types/mdx` (devDependencies).
- Public routes: `/help` and `/help/<manual>`, outside `/app`, prerendered at build, no login.
- Manual slugs, fixed: `getting-started`, `products-and-boms`, `components-and-templates`, `inventory-and-warehouse`, `stocktake`, `orders-and-shopify`, `purchasing-and-xero`, `suppliers`, `production-planning`, `reports`, `workspace-admin`.
- Canonical base URL: `process.env.NEXT_PUBLIC_APP_URL`, falling back to `https://app.manuva.app`.
- Manuva design system only: tokens from `C:\dev\manuva-tokens\Manuva Design System\colors_and_type.css` (`--bg-card`, `--stroke-card`, `--ink-strong` …). No hex or named colours in CSS or diagrams. Compose `src/app/app/_ui/table.module.css` and `buttons.module.css`. Every page has a `PageHeader` with eyebrow `"Help"`, or breadcrumbs on a manual page.
- MDX manuals contain no `import`/`export` lines and no `#` h1. Their only components are `Callout`, `Screenshot` and `Diagram`. Procedures are plain Markdown ordered lists; tables are GFM Markdown tables.
- `##` headings are plain text (no `` ` `` `*` `_` `[` `]` `<` `>` `{` `}`) and unique within a manual. The first `##` is `How it fits together`.
- Manual prose: plain, second person, Australian English. UI text is quoted exactly as the app spells it, in bold. No invented numbers, timings or limits. A detail the code does not settle is left out.
- Files are UTF-8 with LF line endings.
- Git: run `rm -f .git/index.lock` before every git command (TortoiseGit's cache leaves stale locks). Never `git stash` in this repo. Commit messages start with the task code (`MANUVA-58 feat(help): …`) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commands:
  - tests: `npm test -- <paths>` (vitest);
  - types: `npx tsc --noEmit` (must be clean in `src/`; a stale `.next/dev/types` error is cleared by deleting `.next`);
  - lint: `npx eslint <files>`;
  - build: `npx next build`.
- Production database: none of these tasks touch it.

## Review Focus

- **Old links keep their anchor:** a redirect from `/app/help/<slug>` must land on `/help/<manual>#<anchor>` with a literal `#`, not `%23`. Pinned in Task 15 (unit test on the redirect list, plus a `curl` check of the `Location` header).
- **Signed-out visitors:** `/help` and `/help/<manual>` must return 200 to a signed-out visitor, never a redirect to `/login`. Pinned in Task 3 (a matcher test on whichever of `middleware.ts` / `src/proxy.ts` exists, plus a `curl` check without cookies).
- **Punctuation in headings:** a heading with an apostrophe, an ampersand or a trailing question mark must give the contents link and the rendered `<h2>` the same id. Pinned in Task 1 (`slugify` cases) and Task 2 (a render test comparing ids).
- **Odd search input:** a query of regex metacharacters (`c++ (`), or only spaces, must return results or nothing and never throw. Pinned in Task 1.
- **Dark themes:** help pages and diagrams must stay readable under `data-theme="midnight"`. Pinned in Task 2 (no hex `fill`/`stroke` in any diagram) and Task 3 (a manual check under the midnight theme at 390px width).

## Where this plan departs from the spec

These choices were made while planning. Each keeps the spec's intent.

| Spec | Plan | Why |
|---|---|---|
| §3.2 each MDX file exports `meta` with an `order` | Meta lives in `manuals.ts`; array order is display order | Tests can import the registry without compiling MDX, and one file holds order and titles |
| §3.2 `next.config` gains `pageExtensions` | Not added | Manuals are imported by the `/help` routes, never routed as pages |
| §3.2 no remark plugins | `remark-gfm` only, named as a string | Markdown tables (statuses, roles, errors) need GFM; it is the standard plugin, not a custom one |
| §3.3 `Steps`, `StatusTable`, `RoleTable` components | Markdown ordered lists and GFM tables, styled by `prose.module.css` | Same output, far simpler to write and review. `Callout`, `Screenshot` and `Diagram` stay |
| §2.1 costing and Suppliers placement open | Costing → Production planning; Suppliers stays its own manual | Costing computes planned cost and margin beside departments and actual time; the suppliers module is about 1,600 lines |
| §7 item 3 in this plan | Its own plan after PR 3 | The capture list needs the finished manuals; the seed needs its own database investigation |

---

## Branches and PRs

| PR | Branch | Base | Tasks | Code |
|---|---|---|---|---|
| 1 | `feat/manuva-58-help-centre` (exists, holds the spec) | `main` | 1–4 | MANUVA-58 |
| 2 | `feat/manuva-59-help-manuals-1` | PR 1 branch | 5–9 | MANUVA-59…63 |
| 3 | `feat/manuva-64-help-manuals-2` | PR 2 branch | 10–15 | MANUVA-64…69 |
| — | `ManuvaMarketingBold` repo | its `main` | 16 | MANUVA-70 |

- **Merge order:** PR 1 documents supplier invoices from PR #32, so it merges after #32.
- **Branch moves:** the controller creates each later branch from the previous branch's head before that PR's first task. Pushing and opening PRs happen at the end, through superpowers:finishing-a-development-branch.

---

## PR 1: Platform and the Purchasing & Xero manual (MANUVA-58)

### Task 1: Help library: anchors, search and the manual registry

**Files:**
- Create: `src/lib/help/headings.ts`
- Create: `src/lib/help/headings.test.ts`
- Create: `src/lib/help/search.ts`
- Create: `src/lib/help/search.test.ts`
- Create: `src/lib/help/urls.ts`
- Create: `src/lib/help/urls.test.ts`
- Create: `src/content/help/manuals.ts`
- Create: `src/content/help/manuals.test.ts`

**Interfaces:**
- Produces:
  - `slugify(text: string): string`
  - `type Heading = { text: string; id: string }`
  - `extractHeadings(source: string): Heading[]`
  - `type SearchEntry = { href: string; title: string; manualTitle: string; description?: string; kind: "manual" | "section" }`
  - `type SearchSource = { slug: string; title: string; description: string; headings: Heading[] }`
  - `buildSearchIndex(sources: SearchSource[]): SearchEntry[]`
  - `searchHelp(entries: SearchEntry[], query: string, limit?: number): SearchEntry[]`
  - `helpBaseUrl(env?: string): string`
  - `ALL_MANUAL_SLUGS` (readonly tuple of the 11 slugs)
  - `type ManualSlug`
  - `type Manual = { slug: ManualSlug; title: string; description: string; planGated?: boolean }`
  - `MANUALS: Manual[]`
  - `findManual(slug: string): Manual | undefined`

- [ ] **Step 1: Write the failing tests**

`src/lib/help/headings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { slugify, extractHeadings } from "./headings";

describe("slugify", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugify("Entering a supplier invoice")).toBe("entering-a-supplier-invoice");
  });
  it("spells an ampersand as 'and'", () => {
    expect(slugify("Products & BOMs")).toBe("products-and-boms");
  });
  it("drops apostrophes and trailing punctuation", () => {
    expect(slugify("What's a BOM version?")).toBe("whats-a-bom-version");
    expect(slugify("Why can’t I see the Xero card?")).toBe("why-cant-i-see-the-xero-card");
  });
  it("trims and collapses separators", () => {
    expect(slugify("  Statuses   explained -- ")).toBe("statuses-explained");
  });
});

describe("extractHeadings", () => {
  it("returns the ## headings in order with their ids", () => {
    const source = "Lead.\n\n## How it fits together\n\nText.\n\n## Products & BOMs\n";
    expect(extractHeadings(source)).toEqual([
      { text: "How it fits together", id: "how-it-fits-together" },
      { text: "Products & BOMs", id: "products-and-boms" },
    ]);
  });
  it("ignores h1, h3 and headings inside fenced code", () => {
    const source = "# Title\n\n### Detail\n\n```md\n## Not a heading\n```\n\n## Real\n";
    expect(extractHeadings(source)).toEqual([{ text: "Real", id: "real" }]);
  });
  it("handles CRLF line endings and closing hashes", () => {
    expect(extractHeadings("## One ##\r\n\r\n## Two\r\n").map((h) => h.id)).toEqual(["one", "two"]);
  });
});
```

`src/lib/help/search.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSearchIndex, searchHelp, type SearchSource } from "./search";

const sources: SearchSource[] = [
  {
    slug: "purchasing-and-xero",
    title: "Purchasing & Xero",
    description: "Raise purchase orders, receive goods, enter supplier invoices and send bills to Xero.",
    headings: [
      { text: "How it fits together", id: "how-it-fits-together" },
      { text: "Setting up Xero", id: "setting-up-xero" },
      { text: "Voiding and re-entering an invoice", id: "voiding-and-re-entering-an-invoice" },
    ],
  },
  {
    slug: "stocktake",
    title: "Stocktake",
    description: "Count your stock and commit the results.",
    headings: [{ text: "Running a stocktake", id: "running-a-stocktake" }],
  },
];
const entries = buildSearchIndex(sources);

describe("buildSearchIndex", () => {
  it("makes one entry per manual and one per section, with anchored links", () => {
    expect(entries).toHaveLength(6);
    expect(entries[0]).toEqual({
      href: "/help/purchasing-and-xero",
      title: "Purchasing & Xero",
      manualTitle: "Purchasing & Xero",
      description: sources[0].description,
      kind: "manual",
    });
    expect(entries[2]).toEqual({
      href: "/help/purchasing-and-xero#setting-up-xero",
      title: "Setting up Xero",
      manualTitle: "Purchasing & Xero",
      kind: "section",
    });
  });
});

describe("searchHelp", () => {
  it("returns nothing for an empty or blank query", () => {
    expect(searchHelp(entries, "")).toEqual([]);
    expect(searchHelp(entries, "   ")).toEqual([]);
  });
  it("matches case-insensitively and lists manuals before sections", () => {
    const hits = searchHelp(entries, "XERO");
    expect(hits[0].kind).toBe("manual");
    expect(hits.map((h) => h.title)).toEqual(["Purchasing & Xero", "Setting up Xero"]);
  });
  it("does not return every section of a manual just because the manual title matches", () => {
    expect(searchHelp(entries, "xero").map((h) => h.title)).not.toContain("How it fits together");
  });
  it("matches a section by its own words plus its manual's title", () => {
    expect(searchHelp(entries, "xero void").map((h) => h.href)).toEqual([
      "/help/purchasing-and-xero#voiding-and-re-entering-an-invoice",
    ]);
  });
  it("treats regex metacharacters as plain text", () => {
    expect(() => searchHelp(entries, "c++ (")).not.toThrow();
    expect(searchHelp(entries, "c++ (")).toEqual([]);
  });
  it("caps the number of results", () => {
    expect(searchHelp(entries, "a", 2)).toHaveLength(2);
  });
});
```

`src/lib/help/urls.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { helpBaseUrl } from "./urls";

describe("helpBaseUrl", () => {
  it("uses the configured app URL without a trailing slash", () => {
    expect(helpBaseUrl("https://app.manuva.app/")).toBe("https://app.manuva.app");
  });
  it("falls back to the production app URL", () => {
    expect(helpBaseUrl(undefined)).toBe("https://app.manuva.app");
    expect(helpBaseUrl("")).toBe("https://app.manuva.app");
  });
});
```

`src/content/help/manuals.test.ts`:

```ts
import { existsSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { ALL_MANUAL_SLUGS, MANUALS, findManual } from "./manuals";

const dir = path.join(process.cwd(), "src/content/help");

describe("help manual registry", () => {
  it("lists each manual once, in ALL_MANUAL_SLUGS order", () => {
    const slugs = MANUALS.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual(ALL_MANUAL_SLUGS.filter((s) => slugs.includes(s)));
  });
  it("has an MDX file for every listed manual", () => {
    for (const m of MANUALS) expect(existsSync(path.join(dir, `${m.slug}.mdx`)), m.slug).toBe(true);
  });
  it("gives every manual a title and a one-sentence description", () => {
    for (const m of MANUALS) {
      expect(m.title.trim(), m.slug).not.toBe("");
      expect(m.description.trim(), m.slug).toMatch(/^[A-Z].*\.$/);
    }
  });
  it("finds a manual by slug, and nothing for an unknown slug", () => {
    expect(findManual("not-a-manual")).toBeUndefined();
    for (const m of MANUALS) expect(findManual(m.slug)).toBe(m);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/help src/content/help`
Expected: FAIL. The modules `./headings`, `./search`, `./urls` and `./manuals` cannot be resolved.

- [ ] **Step 3: Write the implementation**

`src/lib/help/headings.ts`:

```ts
export type Heading = { text: string; id: string };

/**
 * The anchor id for a heading. The contents list, the rendered <h2>, search
 * results, in-app help links and old-URL redirects all use this one function,
 * so they cannot disagree.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The `## ` headings of an MDX source, in order, skipping fenced code blocks. */
export function extractHeadings(source: string): Heading[] {
  const headings: Heading[] = [];
  let inFence = false;
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^##[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (match) headings.push({ text: match[1], id: slugify(match[1]) });
  }
  return headings;
}
```

`src/lib/help/search.ts`:

```ts
import type { Heading } from "./headings";

export type SearchEntry = {
  href: string;
  title: string;
  manualTitle: string;
  description?: string;
  kind: "manual" | "section";
};

export type SearchSource = { slug: string; title: string; description: string; headings: Heading[] };

export function buildSearchIndex(sources: SearchSource[]): SearchEntry[] {
  return sources.flatMap((s) => [
    { href: `/help/${s.slug}`, title: s.title, manualTitle: s.title, description: s.description, kind: "manual" as const },
    ...s.headings.map((h) => ({
      href: `/help/${s.slug}#${h.id}`,
      title: h.text,
      manualTitle: s.title,
      kind: "section" as const,
    })),
  ]);
}

/**
 * Entries containing every word of the query, case-insensitively. A section
 * matches when every word is in its own title or its manual's title, and at
 * least one is in its own title, so "xero" finds "Setting up Xero" without
 * listing every section of the Xero manual. Manuals come first. Plain
 * substring matching, so no input can throw.
 */
export function searchHelp(entries: SearchEntry[], query: string, limit = 12): SearchEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const matches = entries.filter((e) => {
    const own = `${e.title} ${e.description ?? ""}`.toLowerCase();
    const all = `${own} ${e.manualTitle.toLowerCase()}`;
    return terms.every((t) => all.includes(t)) && terms.some((t) => own.includes(t));
  });
  return [...matches.filter((e) => e.kind === "manual"), ...matches.filter((e) => e.kind === "section")].slice(0, limit);
}
```

`src/lib/help/urls.ts`:

```ts
const FALLBACK = "https://app.manuva.app";

/** Absolute origin for help-centre canonical URLs and the sitemap. */
export function helpBaseUrl(env: string | undefined = process.env.NEXT_PUBLIC_APP_URL): string {
  return (env && env.trim() !== "" ? env : FALLBACK).replace(/\/+$/, "");
}
```

`src/content/help/manuals.ts`:

```ts
/** Every manual the help centre will carry, in display order (spec §2.1). */
export const ALL_MANUAL_SLUGS = [
  "getting-started",
  "products-and-boms",
  "components-and-templates",
  "inventory-and-warehouse",
  "stocktake",
  "orders-and-shopify",
  "purchasing-and-xero",
  "suppliers",
  "production-planning",
  "reports",
  "workspace-admin",
] as const;

export type ManualSlug = (typeof ALL_MANUAL_SLUGS)[number];

export type Manual = {
  slug: ManualSlug;
  title: string;
  /** One sentence, shown on the index card and as the meta description. */
  description: string;
  /** True for modules that need a plan feature (Production planning). */
  planGated?: boolean;
};

/**
 * Published manuals, in ALL_MANUAL_SLUGS order. A manual is added here in the
 * same change that adds its MDX file to src/content/help/.
 */
export const MANUALS: Manual[] = [];

export function findManual(slug: string): Manual | undefined {
  return MANUALS.find((m) => m.slug === slug);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/help src/content/help`
Expected: PASS. All tests in the four files pass; the registry tests pass trivially with no manuals yet.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint src/lib/help src/content/help
rm -f .git/index.lock
git add src/lib/help src/content/help
git commit -m "MANUVA-58 feat(help): anchors, search and the manual registry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: MDX pipeline and the manual building blocks

**Files:**
- Modify: `package.json`, `package-lock.json` (npm install)
- Modify: `next.config.ts`
- Create: `src/mdx-components.tsx`
- Create: `src/components/help/mdx-map.tsx`
- Create: `src/components/help/mdx-map.test.tsx`
- Create: `src/components/help/prose.module.css`
- Move: `src/app/app/help/_ui/callout.tsx` → `src/components/help/callout.tsx` (and `callout.module.css`, `callout.test.tsx`)
- Modify: every `src/app/app/help/**/page.tsx` that imports `../../_ui/callout`
- Create: `src/lib/help/png-size.ts`, `src/lib/help/png-size.test.ts`
- Create: `src/components/help/screenshot.tsx`, `screenshot.module.css`, `screenshot.test.tsx`
- Create: `src/components/help/diagram.tsx`, `diagram.module.css`, `diagram.test.tsx`
- Create: `src/components/help/diagrams/index.ts`, `src/components/help/diagrams/diagrams.test.tsx`
- Create: `src/content/help/manuals.render.test.tsx`

**Interfaces:**
- Consumes: `slugify`, `extractHeadings` (Task 1); `MANUALS` (Task 1).
- Produces:
  - `helpMdxComponents: MDXComponents`, the map used by Next and by tests;
  - `textContent(node: ReactNode): string`;
  - `Callout({ type?: "tip" | "warning" | "info", children })`;
  - `Screenshot({ src: string; alt: string; caption?: string })`;
  - `Diagram({ name: string; caption: string })`;
  - `DIAGRAMS: Record<string, ComponentType>`, the registry that manual tasks add to;
  - `pngSize(buf: Uint8Array): { width: number; height: number }`;
  - `proseStyles.prose` (class wrapping a rendered manual).

- [ ] **Step 1: Install the MDX packages**

```bash
npm install @next/mdx@16.1.6 @mdx-js/loader @mdx-js/react remark-gfm
npm install -D @mdx-js/mdx @types/mdx
```

Expected: the install completes and `package.json` lists the four dependencies and two devDependencies.

- [ ] **Step 2: Wire MDX into Next**

`next.config.ts`: add the import at the top and wrap the export. Leave the existing `nextConfig` object unchanged.

```ts
import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import path from "path";

const nextConfig: NextConfig = {
  // … existing turbopack, images and headers() config, unchanged …
};

// MDX renders the public help centre (src/content/help/*.mdx), which is imported
// by the /help routes, not routed itself, so pageExtensions stays as it is.
// The plugin is named as a string so the config stays serialisable, which
// Turbopack requires.
const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm"],
  },
});

export default withMDX(nextConfig);
```

If `npx tsc --noEmit` reports a type error on the `remarkPlugins` line, change only that line to
`remarkPlugins: ["remark-gfm"] as unknown as never[],`. The runtime value must stay the string.

`src/mdx-components.tsx`:

```tsx
import type { MDXComponents } from "mdx/types";
import { helpMdxComponents } from "@/components/help/mdx-map";

// Required by @next/mdx in the App Router: every imported .mdx file renders with these.
export function useMDXComponents(components: MDXComponents = {}): MDXComponents {
  return { ...helpMdxComponents, ...components };
}
```

- [ ] **Step 3: Move Callout to the shared help components**

```bash
mkdir -p src/components/help
rm -f .git/index.lock
git mv src/app/app/help/_ui/callout.tsx src/components/help/callout.tsx
git mv src/app/app/help/_ui/callout.module.css src/components/help/callout.module.css
git mv src/app/app/help/_ui/callout.test.tsx src/components/help/callout.test.tsx
grep -rl '"\.\./\.\./_ui/callout"' src/app/app/help | xargs sed -i 's#"\.\./\.\./_ui/callout"#"@/components/help/callout"#'
grep -rn '_ui/callout' src/app/app/help
```

Expected: the last `grep` prints nothing. The old article pages now import `Callout` from `@/components/help/callout`.

- [ ] **Step 4: Write the failing tests**

`src/lib/help/png-size.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pngSize } from "./png-size";

function pngHeader(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(24);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(buf.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return buf;
}

describe("pngSize", () => {
  it("reads width and height from the IHDR chunk", () => {
    expect(pngSize(pngHeader(2880, 1800))).toEqual({ width: 2880, height: 1800 });
  });
  it("rejects anything that is not a PNG", () => {
    expect(() => pngSize(new Uint8Array(24))).toThrow("Not a PNG file");
    expect(() => pngSize(new Uint8Array(4))).toThrow("Not a PNG file");
  });
});
```

`src/components/help/screenshot.test.tsx`:

```tsx
import { afterEach, describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Screenshot } from "./screenshot";

afterEach(() => vi.unstubAllEnvs());

describe("Screenshot", () => {
  it("renders nothing outside development while the image does not exist yet", () => {
    expect(renderToStaticMarkup(<Screenshot src="/help/stocktake/not-captured.png" alt="The count screen" />)).toBe("");
  });
  it("shows a labelled placeholder in development while the image does not exist yet", () => {
    vi.stubEnv("NODE_ENV", "development");
    const html = renderToStaticMarkup(<Screenshot src="/help/stocktake/not-captured.png" alt="The count screen" />);
    expect(html).toContain("Screenshot to come: The count screen");
  });
  it("only accepts PNGs under /help/", () => {
    expect(() => renderToStaticMarkup(<Screenshot src="/logo.png" alt="x" />)).toThrow("/help/<manual>/<name>.png");
    expect(() => renderToStaticMarkup(<Screenshot src="/help/a/b.jpg" alt="x" />)).toThrow("/help/<manual>/<name>.png");
  });
});
```

`src/components/help/diagram.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("./diagrams", () => ({
  DIAGRAMS: { demo: () => <svg role="img" aria-label="Demo flow" /> },
}));

import { Diagram } from "./diagram";

describe("Diagram", () => {
  it("renders the named drawing in a figure with its caption", () => {
    const html = renderToStaticMarkup(<Diagram name="demo" caption="Purchase to payment" />);
    expect(html).toContain("<figure");
    expect(html).toContain('aria-label="Demo flow"');
    expect(html).toContain("<figcaption");
    expect(html).toContain("Purchase to payment");
  });
  it("fails loudly on an unknown drawing", () => {
    expect(() => renderToStaticMarkup(<Diagram name="missing" caption="x" />)).toThrow('Unknown help diagram "missing"');
  });
});
```

`src/components/help/diagrams/diagrams.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DIAGRAMS } from "./index";

describe("help diagram registry", () => {
  it("is a map of drawings", () => {
    expect(typeof DIAGRAMS).toBe("object");
  });
  it.each(Object.entries(DIAGRAMS))("%s is an accessible SVG drawn only with design tokens", (_name, Drawing) => {
    const html = renderToStaticMarkup(<Drawing />);
    expect(html).toMatch(/^<svg[^>]*role="img"/);
    expect(html).toMatch(/aria-label="[^"]+"/);
    expect(html).not.toMatch(/(fill|stroke)="#/);
    expect(html).not.toMatch(/(fill|stroke)="(white|black|red|green|blue|gray|grey)"/);
  });
});
```

If vitest rejects `it.each` with an empty table, replace that `it.each` with a loop inside one
`it("every drawing is an accessible SVG drawn only with design tokens", …)` that iterates
`Object.entries(DIAGRAMS)` and runs the same four expectations per drawing.

`src/components/help/mdx-map.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import * as runtime from "react/jsx-runtime";
import { evaluate, type EvaluateOptions } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import { renderToStaticMarkup } from "react-dom/server";
import { extractHeadings } from "@/lib/help/headings";
import { helpMdxComponents, textContent } from "./mdx-map";

const jsx = runtime as unknown as Pick<EvaluateOptions, "Fragment" | "jsx" | "jsxs">;

async function render(source: string): Promise<string> {
  const { default: Content } = await evaluate(source, { ...jsx, remarkPlugins: [remarkGfm] });
  return renderToStaticMarkup(<Content components={helpMdxComponents} />);
}

describe("textContent", () => {
  it("flattens strings, numbers, arrays and elements", () => {
    expect(textContent(["Step ", 2, <strong key="s">now</strong>])).toBe("Step 2now");
    expect(textContent(null)).toBe("");
  });
});

describe("helpMdxComponents", () => {
  const source = [
    "Lead paragraph.",
    "",
    "## Products & BOMs",
    "",
    "1. Open **Products**.",
    "2. Click **New product**.",
    "",
    "## What's a draft?",
    "",
    "| Status | Meaning |",
    "| --- | --- |",
    "| Draft | Saved, not posted. |",
    "",
    '<Callout type="warning">Posting can\'t be undone.</Callout>',
  ].join("\n");

  it("gives every h2 the same id the contents list uses", async () => {
    const html = await render(source);
    const ids = [...html.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(extractHeadings(source).map((h) => h.id));
    expect(ids).toEqual(["products-and-boms", "whats-a-draft"]);
  });
  it("renders GFM tables inside the shared table card", async () => {
    const html = await render(source);
    expect(html).toContain("<table");
    expect(html).toContain("<td>Draft</td>");
  });
  it("makes Callout available to manuals", async () => {
    expect(await render(source)).toContain("Posting can&#x27;t be undone.");
  });
});
```

`src/content/help/manuals.render.test.tsx`:

```tsx
import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import * as runtime from "react/jsx-runtime";
import { evaluate, type EvaluateOptions } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import { renderToStaticMarkup } from "react-dom/server";
import { extractHeadings } from "@/lib/help/headings";
import { helpMdxComponents } from "@/components/help/mdx-map";
import { MANUALS } from "./manuals";

const jsx = runtime as unknown as Pick<EvaluateOptions, "Fragment" | "jsx" | "jsxs">;
const read = (slug: string) => readFileSync(path.join(process.cwd(), "src/content/help", `${slug}.mdx`), "utf8");

describe("published manuals", () => {
  it("are listed in the registry", () => {
    expect(Array.isArray(MANUALS)).toBe(true);
  });

  for (const { slug } of MANUALS) {
    describe(slug, () => {
      const source = read(slug);

      it("has no import/export lines and no h1", () => {
        expect(source).not.toMatch(/^(import|export)\s/m);
        expect(source).not.toMatch(/^#\s/m);
      });

      it("opens with How it fits together, and its headings are plain and unique", () => {
        const headings = extractHeadings(source);
        expect(headings[0]?.text).toBe("How it fits together");
        for (const h of headings) expect(h.text).toMatch(/^[^`*_[\]<>{}]+$/);
        expect(new Set(headings.map((h) => h.id)).size).toBe(headings.length);
      });

      it("renders with the help components, every h2 carrying its contents-list anchor", async () => {
        const { default: Content } = await evaluate(source, { ...jsx, remarkPlugins: [remarkGfm] });
        const html = renderToStaticMarkup(<Content components={helpMdxComponents} />);
        const ids = [...html.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]);
        expect(ids).toEqual(extractHeadings(source).map((h) => h.id));
      });
    });
  }
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm test -- src/lib/help src/components/help src/content/help`
Expected: FAIL. `./png-size`, `./screenshot`, `./diagram`, `./diagrams/index` and `./mdx-map` cannot be resolved. `callout.test.tsx` passes from its new location.

- [ ] **Step 6: Write the implementation**

`src/lib/help/png-size.ts`:

```ts
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(buf: Uint8Array): { width: number; height: number } {
  if (buf.length < 24 || PNG_SIGNATURE.some((byte, i) => buf[i] !== byte)) throw new Error("Not a PNG file");
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
```

`src/components/help/screenshot.tsx`:

```tsx
import { existsSync, readFileSync } from "fs";
import path from "path";
import Image from "next/image";
import { pngSize } from "@/lib/help/png-size";
import styles from "./screenshot.module.css";

type Props = { src: string; alt: string; caption?: string };

/**
 * A captured screen from public/help/. Until the capture script has produced
 * the file, it renders nothing in production and a labelled placeholder in
 * development, so a manual can name its screenshots before they exist.
 */
export function Screenshot({ src, alt, caption }: Props) {
  if (!/^\/help\/[a-z0-9-]+\/[a-z0-9-]+\.png$/.test(src)) {
    throw new Error(`Screenshot src must be /help/<manual>/<name>.png, got "${src}"`);
  }
  const file = path.join(process.cwd(), "public", src);
  if (!existsSync(file)) {
    if (process.env.NODE_ENV !== "development") return null;
    return (
      <div className={styles.placeholder} role="note">
        Screenshot to come: {alt}
      </div>
    );
  }
  const { width, height } = pngSize(readFileSync(file));
  return (
    <figure className={styles.figure}>
      <Image src={src} alt={alt} width={width} height={height} className={styles.image} />
      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
    </figure>
  );
}
```

`src/components/help/screenshot.module.css`:

```css
.figure {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.image {
  width: 100%;
  height: auto;
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}

.caption {
  font-size: var(--fs-sm);
  color: var(--ink-muted);
}

.placeholder {
  padding: var(--space-4);
  border: 1px dashed var(--stroke-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  color: var(--ink-muted);
  font-size: var(--fs-sm);
}
```

`src/components/help/diagrams/index.ts`:

```ts
import type { ComponentType } from "react";

/**
 * One drawing per manual for its "How it fits together" section, keyed by the
 * manual's slug and used in MDX as <Diagram name="<slug>" caption="…" />.
 * Drawings are SVG components coloured only with design tokens.
 */
export const DIAGRAMS: Record<string, ComponentType> = {};
```

`src/components/help/diagram.tsx`:

```tsx
import { DIAGRAMS } from "./diagrams";
import styles from "./diagram.module.css";

type Props = { name: string; caption: string };

export function Diagram({ name, caption }: Props) {
  const Drawing = DIAGRAMS[name];
  if (!Drawing) throw new Error(`Unknown help diagram "${name}"`);
  return (
    <figure className={styles.figure}>
      <div className={styles.drawing}>
        <Drawing />
      </div>
      <figcaption className={styles.caption}>{caption}</figcaption>
    </figure>
  );
}
```

`src/components/help/diagram.module.css`:

```css
.figure {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.drawing {
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  padding: var(--space-3);
}

.drawing svg {
  display: block;
  width: 100%;
  height: auto;
}

.caption {
  font-size: var(--fs-sm);
  color: var(--ink-muted);
}
```

`src/components/help/mdx-map.tsx`:

```tsx
import type { MDXComponents } from "mdx/types";
import { isValidElement, type ReactNode } from "react";
import { slugify } from "@/lib/help/headings";
import { Callout } from "./callout";
import { Diagram } from "./diagram";
import { Screenshot } from "./screenshot";
import styles from "./prose.module.css";

/** Plain text of a React node, for building an anchor from heading children. */
export function textContent(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textContent(node.props.children);
  return "";
}

/** How MDX elements render in a help manual. Used by Next (src/mdx-components.tsx) and by the tests. */
export const helpMdxComponents: MDXComponents = {
  h2: ({ children }) => (
    <h2 id={slugify(textContent(children))} className={styles.h2}>
      {children}
    </h2>
  ),
  table: ({ children }) => (
    <div className={styles.tableWrap}>
      <table className={styles.table}>{children}</table>
    </div>
  ),
  Callout,
  Diagram,
  Screenshot,
};
```

`src/components/help/prose.module.css`:

```css
/* A rendered help manual. Children are MDX output: p, ol, ul, h2, h3, table, figure. */
.prose {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 760px;
  font-size: var(--fs-md);
  line-height: var(--lh-normal);
  color: var(--ink-strong);
}

.prose > * {
  margin: 0;
}

.h2 {
  margin-top: var(--space-4);
  padding-top: var(--space-5);
  border-top: 1px solid var(--stroke);
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
  line-height: var(--lh-snug);
  scroll-margin-top: var(--space-5);
}

.prose h3 {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
}

.prose ul {
  padding-left: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

/* Procedures are Markdown ordered lists, drawn as numbered steps. */
.prose ol {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  counter-reset: step;
}

.prose ol > li {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: var(--space-3);
  counter-increment: step;
}

.prose ol > li::before {
  content: counter(step);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--brand-1);
  color: var(--ink-on-brand);
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  margin-top: 1px;
}

.prose ol ul,
.prose ol ol {
  margin-top: var(--space-2);
}

.prose code {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  background: var(--surface-1);
  border-radius: var(--radius-xs);
  padding: 1px 4px;
}

.prose a {
  color: var(--brand-1);
}

/* Wide tables scroll inside their card instead of widening the page. */
.tableWrap {
  composes: tableCard from "../../app/app/_ui/table.module.css";
  overflow-x: auto;
}

.table {
  composes: table from "../../app/app/_ui/table.module.css";
}

.table td {
  vertical-align: top;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- src/lib/help src/components/help src/content/help`
Expected: PASS. `manuals.render.test.tsx` has only its registry test until a manual exists.

- [ ] **Step 8: Typecheck, lint, check the old help still builds its imports, commit**

```bash
npx tsc --noEmit
npx eslint next.config.ts src/mdx-components.tsx src/components/help src/lib/help src/content/help
npm test -- src/app/app/help
rm -f .git/index.lock
git add package.json package-lock.json next.config.ts src/mdx-components.tsx src/components/help src/lib/help src/content/help src/app/app/help
git commit -m "MANUVA-58 feat(help): MDX pipeline and manual building blocks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `tsc` clean in `src/`, `eslint` clean, and the old `src/app/app/help` tests still pass.

---

### Task 3: The public /help pages, sitemap, and the keep-current rule

**Files:**
- Create: `src/lib/help/load.ts`
- Create: `src/content/help/content.ts`
- Create: `src/content/help/content.test.ts`
- Create: `src/content/help/purchasing-and-xero.mdx` (stub; Task 4 writes the manual)
- Modify: `src/content/help/manuals.ts` (first registry entry)
- Create: `src/app/help/layout.tsx`, `src/app/help/page.tsx`, `src/app/help/[manual]/page.tsx`
- Create: `src/app/help/help-search.tsx`, `src/app/help/help-search.test.tsx`
- Create: `src/app/help/help.module.css`
- Create: `src/app/help/public-route.test.ts`
- Create: `src/app/sitemap.ts`, `src/app/sitemap.test.ts`
- Modify: `public/robots.txt`
- Modify: `CLAUDE.md` (new "Help manuals (keep current)" section)
- Modify: `docs/qa-feature-test-plan.md` (§21 and the changelog)

**Interfaces:**
- Consumes: `MANUALS`, `findManual`, `ManualSlug` (Task 1); `extractHeadings`, `Heading`, `buildSearchIndex`, `SearchEntry`, `SearchSource`, `searchHelp`, `helpBaseUrl` (Task 1); `proseStyles.prose` and the MDX map (Task 2).
- Produces:
  - `readManualSource(slug: ManualSlug): string`
  - `getManualHeadings(slug: ManualSlug): Heading[]`
  - `getSearchSources(): SearchSource[]`
  - `MANUAL_CONTENT: Partial<Record<ManualSlug, () => Promise<{ default: MDXContent }>>>`

Later tasks add one line to `MANUAL_CONTENT` and one entry to `MANUALS` per manual.

- [ ] **Step 1: Write the failing tests**

`src/content/help/content.test.ts`:

```ts
import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { MANUALS } from "./manuals";

// content.ts imports .mdx files, which vitest does not compile, so it is checked as text.
const source = readFileSync(path.join(process.cwd(), "src/content/help/content.ts"), "utf8");

describe("manual content loaders", () => {
  it("has a loader for every published manual, importing its own file", () => {
    for (const { slug } of MANUALS) {
      expect(source, slug).toContain(`"${slug}": () => import("./${slug}.mdx")`);
    }
  });
});
```

`src/app/help/public-route.test.ts`:

```ts
import { existsSync, readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

// main still has the root middleware.ts; PR #34 moves it to src/proxy.ts. Check whichever exist.
const CANDIDATES = ["middleware.ts", "src/middleware.ts", "src/proxy.ts"];

describe("help centre is public", () => {
  it("is not covered by the login middleware/proxy", () => {
    const present = CANDIDATES.filter((f) => existsSync(path.join(process.cwd(), f)));
    expect(present.length).toBeGreaterThan(0);
    for (const file of present) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      const matcher = /matcher:\s*(\[[^\]]*\])/.exec(source)?.[1];
      expect(matcher, file).toBe('["/app/:path*"]');
    }
  });
});
```

`src/app/help/help-search.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import HelpSearch from "./help-search";

describe("HelpSearch", () => {
  it("renders a labelled search box and no results before anything is typed", () => {
    const html = renderToStaticMarkup(
      <HelpSearch entries={[{ href: "/help/stocktake", title: "Stocktake", manualTitle: "Stocktake", kind: "manual" }]} />,
    );
    expect(html).toContain('<label for="help-search"');
    expect(html).toContain('type="search"');
    expect(html).not.toContain("/help/stocktake");
  });
});
```

`src/app/sitemap.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import sitemap from "./sitemap";
import { MANUALS } from "@/content/help/manuals";
import { helpBaseUrl } from "@/lib/help/urls";

describe("sitemap", () => {
  it("lists the help index and every published manual", () => {
    const urls = sitemap().map((e) => e.url);
    const base = helpBaseUrl();
    expect(urls).toContain(`${base}/help`);
    for (const m of MANUALS) expect(urls).toContain(`${base}/help/${m.slug}`);
    expect(urls).toHaveLength(MANUALS.length + 1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/content/help src/app/help src/app/sitemap.test.ts`
Expected: FAIL. `content.ts`, `./help-search` and `./sitemap` do not exist. `public-route.test.ts` passes, because it pins existing behaviour.

- [ ] **Step 3: Register the first manual with a stub**

`src/content/help/purchasing-and-xero.mdx`:

```mdx
Purchasing covers the road from ordering stock to paying for it: purchase orders, receiving goods, supplier invoices and, once Xero is connected, bills in Xero.

## How it fits together

The full manual lands in the next commit.
```

`src/content/help/manuals.ts`: replace `export const MANUALS: Manual[] = [];` with:

```ts
export const MANUALS: Manual[] = [
  {
    slug: "purchasing-and-xero",
    title: "Purchasing & Xero",
    description: "Raise purchase orders, receive goods, enter supplier invoices and send bills to Xero.",
  },
];
```

`src/content/help/content.ts`:

```ts
import type { MDXContent } from "mdx/types";
import type { ManualSlug } from "./manuals";

/**
 * Lazy loaders for each published manual's MDX. Kept apart from manuals.ts so
 * the registry stays importable in tests, which do not compile MDX.
 */
export const MANUAL_CONTENT: Partial<Record<ManualSlug, () => Promise<{ default: MDXContent }>>> = {
  "purchasing-and-xero": () => import("./purchasing-and-xero.mdx"),
};
```

`src/lib/help/load.ts`:

```ts
import { readFileSync } from "fs";
import path from "path";
import { MANUALS, type ManualSlug } from "@/content/help/manuals";
import { extractHeadings, type Heading } from "./headings";
import type { SearchSource } from "./search";

// Read at build time: every /help page is statically generated.
const CONTENT_DIR = path.join(process.cwd(), "src/content/help");

export function readManualSource(slug: ManualSlug): string {
  return readFileSync(path.join(CONTENT_DIR, `${slug}.mdx`), "utf8");
}

export function getManualHeadings(slug: ManualSlug): Heading[] {
  return extractHeadings(readManualSource(slug));
}

export function getSearchSources(): SearchSource[] {
  return MANUALS.map((m) => ({
    slug: m.slug,
    title: m.title,
    description: m.description,
    headings: getManualHeadings(m.slug),
  }));
}
```

- [ ] **Step 4: Write the pages**

`src/app/help/layout.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./help.module.css";

export default function HelpLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link href="/help" className={styles.brand} aria-label="Manuva help centre home">
            <Image src="/manuva-logo.png" alt="Manuva" width={136} height={30} priority />
            <span className={styles.brandLabel}>Help</span>
          </Link>
          <Link href="/app" className={styles.openApp}>
            Open Manuva
          </Link>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <a href="https://manuva.app">manuva.app</a>
        <span aria-hidden="true">·</span>
        <Link href="/privacy">Privacy</Link>
      </footer>
    </div>
  );
}
```

`src/app/help/help-search.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { searchHelp, type SearchEntry } from "@/lib/help/search";
import styles from "./help.module.css";

export default function HelpSearch({ entries }: { entries: SearchEntry[] }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchHelp(entries, query), [entries, query]);
  const searching = query.trim() !== "";

  return (
    <div className={styles.search} role="search">
      <label htmlFor="help-search" className={styles.searchLabel}>
        Search the manuals
      </label>
      <input
        id="help-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. supplier invoice, stocktake, Xero"
        autoComplete="off"
        className={styles.searchInput}
      />
      {searching && results.length > 0 ? (
        <ul className={styles.results}>
          {results.map((r) => (
            <li key={r.href}>
              <Link href={r.href} className={styles.result}>
                <span className={styles.resultTitle}>{r.title}</span>
                {r.kind === "section" ? <span className={styles.resultManual}>{r.manualTitle}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {searching && results.length === 0 ? (
        <p className={styles.noResults}>Nothing in the manuals matches “{query.trim()}”.</p>
      ) : null}
    </div>
  );
}
```

`src/app/help/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/app/app/_ui/page-header";
import StatusBadge from "@/app/app/_ui/status-badge";
import { MANUALS } from "@/content/help/manuals";
import { getSearchSources } from "@/lib/help/load";
import { buildSearchIndex } from "@/lib/help/search";
import { helpBaseUrl } from "@/lib/help/urls";
import HelpSearch from "./help-search";
import styles from "./help.module.css";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Help centre | Manuva",
  description: "Manuals for every part of Manuva: products, inventory, orders, purchasing, Xero, production planning and more.",
  alternates: { canonical: `${helpBaseUrl()}/help` },
};

export default function HelpIndexPage() {
  const entries = buildSearchIndex(getSearchSources());
  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Help"
        title="Manuva help centre"
        description="One manual for each part of Manuva, written from how the app works today."
      />
      <HelpSearch entries={entries} />
      <ul className={styles.cards}>
        {MANUALS.map((m) => (
          <li key={m.slug}>
            <Link href={`/help/${m.slug}`} className={styles.card}>
              <span className={styles.cardTitle}>
                {m.title}
                {m.planGated ? <StatusBadge variant="info">Plan feature</StatusBadge> : null}
              </span>
              <span className={styles.cardDesc}>{m.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`src/app/help/[manual]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageHeader from "@/app/app/_ui/page-header";
import StatusBadge from "@/app/app/_ui/status-badge";
import proseStyles from "@/components/help/prose.module.css";
import { MANUAL_CONTENT } from "@/content/help/content";
import { MANUALS, findManual } from "@/content/help/manuals";
import { getManualHeadings } from "@/lib/help/load";
import { helpBaseUrl } from "@/lib/help/urls";
import styles from "../help.module.css";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return MANUALS.map((m) => ({ manual: m.slug }));
}

type Props = { params: Promise<{ manual: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { manual } = await params;
  const m = findManual(manual);
  if (!m) return {};
  const url = `${helpBaseUrl()}/help/${m.slug}`;
  const title = `${m.title} | Manuva help`;
  return {
    title,
    description: m.description,
    alternates: { canonical: url },
    openGraph: { title, description: m.description, url, siteName: "Manuva", type: "article" },
  };
}

export default async function ManualPage({ params }: Props) {
  const { manual } = await params;
  const m = findManual(manual);
  const load = m ? MANUAL_CONTENT[m.slug] : undefined;
  if (!m || !load) notFound();
  const { default: Content } = await load();
  const headings = getManualHeadings(m.slug);

  return (
    <article className={styles.page}>
      <PageHeader
        breadcrumbs={[{ label: "Help", href: "/help" }, { label: m.title }]}
        title={m.title}
        description={m.description}
        actions={m.planGated ? <StatusBadge variant="info">Plan feature</StatusBadge> : undefined}
      />
      {headings.length > 0 ? (
        <nav className={styles.contents} aria-label="On this page">
          <p className={styles.contentsLabel}>On this page</p>
          <ol className={styles.contentsList}>
            {headings.map((h) => (
              <li key={h.id}>
                <a href={`#${h.id}`}>{h.text}</a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className={proseStyles.prose}>
        <Content />
      </div>
    </article>
  );
}
```

`src/app/help/help.module.css`:

```css
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
}

/* The bar matches the app sidebar, so the white logo reads in every theme. */
.topbar {
  background: var(--bg-sidebar);
}

.topbarInner {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-3) var(--space-4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  text-decoration: none;
}

.brandLabel {
  color: var(--ink-on-brand);
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
}

.openApp {
  composes: primary from "../app/_ui/buttons.module.css";
}

.main {
  flex: 1;
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4) var(--space-10);
}

.page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.footer {
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-5) var(--space-4);
  display: flex;
  gap: var(--space-2);
  border-top: 1px solid var(--stroke);
  font-size: var(--fs-sm);
  color: var(--ink-muted);
}

.footer a {
  color: var(--ink-muted);
  text-decoration: none;
}

.footer a:hover {
  color: var(--ink-strong);
}

/* Search */
.search {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.searchLabel {
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
  color: var(--ink-muted);
}

.searchInput {
  min-height: 42px;
  padding: 0 var(--space-4);
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-pill);
  background: var(--bg-input);
  color: var(--ink-strong);
  font: inherit;
  font-size: var(--fs-base);
}

.searchInput:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.results {
  list-style: none;
  margin: 0;
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
}

.result {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--ink-strong);
  text-decoration: none;
}

.result:hover,
.result:focus-visible {
  background: var(--surface-hover);
  outline: none;
}

.resultTitle {
  font-weight: var(--fw-medium);
}

.resultManual {
  font-size: var(--fs-sm);
  color: var(--ink-muted);
}

.noResults {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--ink-muted);
}

/* Manual cards */
.cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-4);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  height: 100%;
  padding: 18px;
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  text-decoration: none;
}

.card:hover {
  border-color: var(--stroke-strong);
}

.card:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.cardTitle {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--ink-strong);
}

.cardDesc {
  font-size: var(--fs-sm);
  line-height: var(--lh-normal);
  color: var(--ink-muted);
}

/* On-this-page contents */
.contents {
  padding: 18px;
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
}

.contentsLabel {
  margin: 0 0 var(--space-2);
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
  color: var(--ink-muted);
}

.contentsList {
  margin: 0;
  padding-left: var(--space-5);
  display: grid;
  gap: var(--space-1);
  font-size: var(--fs-sm);
}

.contentsList a {
  color: var(--brand-1);
  text-decoration: none;
}

.contentsList a:hover {
  text-decoration: underline;
}
```

`src/app/sitemap.ts`:

```ts
import type { MetadataRoute } from "next";
import { MANUALS } from "@/content/help/manuals";
import { helpBaseUrl } from "@/lib/help/urls";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = helpBaseUrl();
  return [
    { url: `${base}/help`, changeFrequency: "weekly", priority: 0.8 },
    ...MANUALS.map((m) => ({ url: `${base}/help/${m.slug}`, changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}
```

`public/robots.txt`: append one line after the existing `Sitemap:` line:

```
Sitemap: https://app.manuva.app/sitemap.xml
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/lib/help src/components/help src/content/help src/app/help src/app/sitemap.test.ts`
Expected: PASS, including `manuals.render.test.tsx` rendering the stub.

- [ ] **Step 6: Record the keep-current rule and the QA checks**

`CLAUDE.md`: add this section directly after the "Feature test plan (keep current)" section:

```markdown
## Help manuals (keep current)

The public help centre (`/help`, content in `src/content/help/*.mdx`) is the user manual for
every module, written to `docs/help-style.md`. **Whenever you add a feature or change how one
behaves, update that module's manual in the same change**: the steps, the UI text it quotes,
statuses, error messages and the role table. A new module gets a manual: an MDX file, an entry in
`src/content/help/manuals.ts` and a loader in `src/content/help/content.ts`.

A change that alters behaviour a manual describes, without updating the manual, is incomplete.
```

`docs/qa-feature-test-plan.md`: replace the body of `## 21. Help & Documentation — `/app/help`` (its heading and three checks) with:

```markdown
## 21. Help centre — `/help` (public)

**Entry:** `/help` (no login) — one manual per module, from `src/content/help/*.mdx`. The old `/app/help` articles stay until the cutover (MANUVA-69).

- [ ] `/help` loads signed out (no redirect to `/login`) and lists every published manual in registry order
- [ ] Typing in **Search the manuals** lists matching manuals, then sections; a result opens the manual at that section
- [ ] A search with no matches says so; clearing the box hides the results
- [ ] `/help/<manual>` shows the **On this page** contents; every contents link jumps to its section
- [ ] An unknown `/help/<slug>` shows the 404 page
- [ ] A plan-gated manual shows the **Plan feature** badge on its card and page
- [ ] Pages read correctly in the daylight and midnight themes, and at 390px wide with no sideways page scroll
- [ ] `/sitemap.xml` lists `/help` and every published manual
```

Append to `## Changelog` (use the actual date):

```markdown
- 2026-10-02 — added Help centre (MANUVA-58): public `/help` with one MDX manual per module, search, contents lists and a sitemap; the Purchasing & Xero manual is the first.
```

- [ ] **Step 7: Check the pages in the browser**

Start the dev server: `npx next dev -p 3100`, in the background.

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/help
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/help/purchasing-and-xero
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/help/not-a-manual
curl -s http://localhost:3100/sitemap.xml | grep -c '<loc>'
```

Expected output: `200`, `200`, `404`, then `2`. The first two requests carry no cookies, so this proves a signed-out visitor is not sent to login.

Then, in a browser at 390px and at desktop width:
- Open `/help` and `/help/purchasing-and-xero` with `localStorage["manuva-theme"]` unset (daylight), then set to `"midnight"`.
- Check that the text, cards, contents box and top bar all read clearly, and that there is no sideways page scroll.
- Check that typing "xero" in the search box lists the manual.

Stop the dev server afterwards.

- [ ] **Step 8: Typecheck, lint, build, commit**

```bash
npx tsc --noEmit
npx eslint src/app/help src/app/sitemap.ts src/lib/help src/content/help
npx next build
rm -f .git/index.lock
git add src/app/help src/app/sitemap.ts src/app/sitemap.test.ts src/lib/help src/content/help public/robots.txt CLAUDE.md docs/qa-feature-test-plan.md
git commit -m "MANUVA-58 feat(help): public /help pages, search, sitemap and keep-current rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `next build` succeeds and its route list shows `/help` and `/help/[manual]` as prerendered (SSG), with `/help/purchasing-and-xero` generated.

---

### Task 4: Style guide and the Purchasing & Xero manual

**Files:**
- Create: `docs/help-style.md`
- Create: `src/components/help/diagrams/purchasing-and-xero.tsx`
- Modify: `src/components/help/diagrams/index.ts`
- Modify: `src/content/help/purchasing-and-xero.mdx` (replace the stub with the manual)

**Interfaces:**
- Consumes: `DIAGRAMS` (Task 2); the MDX components `Callout`, `Screenshot`, `Diagram` (Task 2); the registry entry and loader for `purchasing-and-xero` (Task 3).
- Produces: `docs/help-style.md`, which every later manual task follows. Fixed headings for the cutover (Task 15):
  - `Creating a purchase order` → `#creating-a-purchase-order`
  - `Receiving goods` → `#receiving-goods`

- [ ] **Step 1: Write the style guide**

`docs/help-style.md`:

````markdown
# Help manual style guide

The rules for every manual in `src/content/help/`. A manual is read by a customer in the middle of
a job, or by someone deciding whether Manuva fits them. It must be true, findable and short.

## Voice

- Plain, second person, short sentences: "Click **Post invoice**." not "The user should click…".
- Australian English in prose (organisation, colour, labour). **UI text is quoted exactly as the app
  spells it**, even where that differs (a button that says "Labor" stays **Labor**).
- No marketing language. Say what happens, not how great it is.

## What goes in

- **Only what the code does.** Every statement can be traced to a route, component, server action
  or database function. A detail the code does not settle is left out.
- **No invented numbers.** Timings, limits, retry schedules, decimal places: only when the code sets
  them, and exactly as it sets them.
- **Exact UI text.** Button labels, field labels, tab names, statuses and error messages are copied
  from the source, in bold for controls (**Save draft**) and in quotes for messages
  ("Xero is locked up to …"). A message that includes a value gets `…` or a `[name]` placeholder.
- **Role and plan markers.** *(admin)*, *(super_admin)*, *(plan-gated)*, after the step or row they
  apply to.

## Shape

Every manual uses these `##` sections, in this order. A section with nothing true to say is left
out, never padded.

1. **Lead paragraph** (no heading): what the module is for and who uses it. Two or three sentences.
2. `## How it fits together`: one `<Diagram>` and a sentence that reads it.
3. **Task sections**, one per job a person does, named for the job in sentence case:
   `## Entering a supplier invoice`. A short intro sentence, then a numbered list of steps.
4. `## Statuses explained`: a table of every status label the module shows, what it means, and what
   moves it on.
5. `## Fixing problems`: a table of the exact messages the app shows, and what to do about each.
6. `## Who can do what`: a table with a row per action and a column per role.
7. `## Common questions`: a bulleted list, each item a bold question then a short answer.

Headings are plain text (no code, bold, links or brackets) and unique within the manual, because
each one becomes a link anchor.

## Markdown and components

- Steps: a Markdown ordered list (`1.`). Sub-points: an indented `-` list.
- Tables: GFM Markdown tables with a header row.
- No `import`/`export` lines and no `#` heading. The page supplies the title.
- Three components are available:
  - `<Callout type="tip|info|warning">…</Callout>`: one idea, used sparingly.
  - `<Diagram name="<manual slug>" caption="…" />`: the manual's drawing (see Diagrams).
  - `<Screenshot src="/help/<manual slug>/<name>.png" alt="…" caption="…" />`: name the screen it
    will show. The image arrives with the capture script; until then nothing renders in production.
    `alt` says what the screen shows ("The supplier invoice form with two receipt lines").
- Link to another manual with a normal Markdown link: `[Suppliers](/help/suppliers#adding-a-supplier)`.

## Diagrams

One drawing per manual, in `src/components/help/diagrams/<slug>.tsx`, default-exported and
registered in `src/components/help/diagrams/index.ts` under the manual's slug.

- An `<svg viewBox="0 0 760 H" role="img" aria-label="…">`, where H is the drawing's height plus
  about 24. The `aria-label` is the drawing's title.
- The first text is the title: the finding a reader should leave with, not the topic.
- Colours come only from tokens:
  - boxes: `var(--bg-card)` fill, `var(--ink-faint)` stroke;
  - text: `var(--ink-strong)`, quiet text `var(--ink-muted)`;
  - one accent box: `var(--brand-dim)` fill, `var(--brand-1)` stroke at width 2;
  - a band: `var(--surface-1)`.
- Text 15 (title) / 13 (names, weight 600) / 11.5 (body). Corners `rx={8}`. Arrowheads are one
  `<marker>` per drawing, with an id prefixed `m-<slug>-`.
- Boxes carry a name and at most two short lines. A role column at the left says who does each step,
  where that matters.

## Drafting a manual from the code

1. Read this guide, the manual's brief in the plan, and the old articles it replaces
   (`src/app/app/help/...`, until the cutover removes them). Treat the old articles as leads to
   check, not as truth.
2. Read the module's routes, client components and server actions. Collect every UI string you will
   quote, with its `file:line`.
3. Walk each task the way a user would: the page they start on, what they click, what changes.
   Note the role checks (`role === "admin"`, read-only observer guards) and plan gates
   (`has_planning_module`).
4. Write the diagram, then the MDX, in the shape above.
5. Run the help tests (`npm test -- src/content/help src/components/help src/lib/help`).
6. In your report, list:
   - every quoted UI string with its source `file:line`;
   - anything the brief asked for that the code does not do;
   - anything in the code that looks broken or inconsistent while you read it. Bugs are not fixed
     in a manual task; they are reported.
````

- [ ] **Step 2: Write the diagram**

`src/components/help/diagrams/purchasing-and-xero.tsx`:

```tsx
const L = 176;
const W = 320;
const CX = 336;
const SX = 536;
const SW = 200;
const EDGE = "var(--ink-faint)";
const INK = "var(--ink-strong)";
const QUIET = "var(--ink-muted)";

type Step = { y: number; h: number; role: string; name: string; lines: string[]; accent?: boolean };

const STEPS: Step[] = [
  { y: 64, h: 56, role: "Purchasing", name: "1  Raise the purchase order", lines: ["On the Purchase Orders page"] },
  { y: 152, h: 56, role: "Warehouse", name: "2  Receive the goods", lines: ["Goods Inwards: a receipt against the PO"] },
  { y: 240, h: 56, role: "Purchasing", name: "3  Enter the supplier invoice", lines: ["From the PO or receipt, saved as Draft"] },
  { y: 328, h: 56, role: "Purchasing", name: "4  Post the invoice", lines: ["Locks it; can also update component costs"] },
  {
    y: 432,
    h: 72,
    role: "Manuva, automatic",
    name: "5  Manuva sends the bill",
    lines: ["Queued for Xero, then Sent to Xero", "Supplier contact linked or created first"],
    accent: true,
  },
  { y: 536, h: 56, role: "Xero", name: "6  Bill lands as Awaiting Approval", lines: ["Nothing is approved or paid automatically"] },
  { y: 624, h: 56, role: "Accountant", name: "7  Accountant approves and pays", lines: ["In Xero, like any other bill"] },
];

/** Purchase to payment: who does each step, and where Xero takes over. */
export default function PurchasingAndXeroDiagram() {
  return (
    <svg viewBox="0 0 760 720" role="img" aria-label="Manuva sends the bill; your accountant approves and pays it in Xero" fontSize={13}>
      <defs>
        <marker id="m-purchasing-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={EDGE} />
        </marker>
      </defs>
      <text x={24} y={34} fontSize={15} fontWeight={600} fill={INK}>
        Manuva sends the bill; your accountant approves and pays it in Xero
      </text>

      <rect x={16} y={520} width={728} height={176} rx={8} fill="var(--surface-1)" />
      <text x={728} y={542} textAnchor="end" fontSize={11.5} fontWeight={600} fill={QUIET}>
        In Xero
      </text>

      <g fill="none" stroke={EDGE} strokeWidth={1.25}>
        {[120, 208, 296, 384, 504, 592].map((y0, i) => (
          <path key={y0} d={`M${CX} ${y0}V${[152, 240, 328, 432, 536, 624][i]}`} markerEnd="url(#m-purchasing-arrow)" />
        ))}
        <path d={`M${L + W} 356H${SX + SW / 2}V432`} markerEnd="url(#m-purchasing-arrow)" />
      </g>
      <text x={CX + 12} y={412} fontSize={11.5} fill={QUIET}>
        Xero connected and set up
      </text>
      <text x={L + W + 12} y={346} fontSize={11.5} fill={QUIET}>
        No Xero, or setup not finished
      </text>

      {STEPS.map((s) => (
        <g key={s.name}>
          <rect
            x={L}
            y={s.y}
            width={W}
            height={s.h}
            rx={8}
            fill={s.accent ? "var(--brand-dim)" : "var(--bg-card)"}
            stroke={s.accent ? "var(--brand-1)" : EDGE}
            strokeWidth={s.accent ? 2 : 1.25}
          />
          <text x={24} y={s.y + s.h / 2 + 4} fontSize={11.5} fontWeight={600} fill={QUIET}>
            {s.role}
          </text>
          <text x={L + 16} y={s.y + 24} fontWeight={600} fill={INK}>
            {s.name}
          </text>
          {s.lines.map((line, i) => (
            <text key={line} x={L + 16} y={s.y + 40 + i * 16} fontSize={11.5} fill={s.accent ? INK : QUIET}>
              {line}
            </text>
          ))}
        </g>
      ))}

      <rect x={SX} y={432} width={SW} height={72} rx={8} fill="var(--bg-card)" stroke={EDGE} strokeWidth={1.25} />
      <text x={SX + 16} y={456} fontWeight={600} fill={INK}>
        Stays in Manuva
      </text>
      <text x={SX + 16} y={472} fontSize={11.5} fill={QUIET}>
        Badge: Posted
      </text>
      <text x={SX + 16} y={488} fontSize={11.5} fill={QUIET}>
        Nothing is sent to Xero
      </text>
    </svg>
  );
}
```

`src/components/help/diagrams/index.ts`: register it.

```ts
import type { ComponentType } from "react";
import PurchasingAndXeroDiagram from "./purchasing-and-xero";

export const DIAGRAMS: Record<string, ComponentType> = {
  "purchasing-and-xero": PurchasingAndXeroDiagram,
};
```

Keep the doc comment above `DIAGRAMS` from Task 2.

- [ ] **Step 3: Run the diagram test**

Run: `npm test -- src/components/help/diagrams`
Expected: PASS. The purchasing drawing is an accessible SVG with no hex colours.

- [ ] **Step 4: Write the manual**

Replace `src/content/help/purchasing-and-xero.mdx` with the full manual, following `docs/help-style.md`.

**Sources, in order of authority:**
1. **The code.**
   - On this branch: `src/app/app/purchasing/` (PO list, `po-create-form.tsx`, `po-line-form.tsx`, `[id]`, `actions.ts`, `status-utils.ts`) and `src/app/app/goods-inwards/`.
   - Supplier invoices and Xero live on PR #32's branch. List the files with `git diff --stat origin/main...feat/manuva-34-xero-bills -- src` and read them with `git show feat/manuva-34-xero-bills:<path>`. The main paths are `src/app/app/purchasing/invoices/`, `src/app/app/settings/integrations/`, `src/lib/accounting/` and `src/app/api/xero/`.
2. **The Claude Docs version**, written and checked on 2026-10-02: `.superpowers/help-sources/purchasing-xero-claude-doc.md`. It covers Xero setup, supplier linking, invoices, posting, voiding, the sync log, connection health, roles and questions. Keep its facts where the code still agrees. It has no PO or receiving sections.
3. **The old articles**, as leads to check: `src/app/app/help/purchasing/purchase-orders/page.tsx`, `src/app/app/help/purchasing/goods-inwards/page.tsx` and `src/app/app/help/getting-started/create-purchase-order/page.tsx`. They mention **Mark as sent** and a dashboard purchasing-signals widget. Check both exist before you keep them.

**Lead:** purchasing covers the road from ordering stock to paying for it. Supplier invoices work in every workspace. The Xero connection is a pilot, shown only to workspaces on the pilot list.

**Sections, with these exact headings in this order:**
1. `How it fits together`: `<Diagram name="purchasing-and-xero" caption="Purchase to payment, and who does each step" />`, plus one sentence: steps 1 to 4 happen in Manuva whether or not Xero is connected; posting is what sends a bill; approval and payment stay with your accountant in Xero.
2. `Creating a purchase order`: from the code. Supplier, lines, quantities and prices, expected date, statuses the PO can move through, the PO number and the reference label fallback.
3. `Receiving goods`: Goods Inwards against a PO, partial receipts, what a receipt does to stock and cost.
4. `Entering a supplier invoice`
5. `Posting an invoice`: what posting writes, when a bill is queued, what lands in Xero.
6. `Voiding and re-entering an invoice` *(admin)*
7. `Setting up Xero` *(admin)*
8. `Linking suppliers to Xero contacts`
9. `Keeping the Xero connection healthy` *(admin)*: reconnect, the banner, emails, disconnect.
10. `Statuses explained`: purchase order statuses, invoice statuses and sync job statuses, as three tables or one table per object.
11. `Fixing problems`: the sync log and the exact messages.
12. `Who can do what`
13. `Common questions`

**Screenshots** (placeholders until MANUVA-72), each with a full alt text:
- `/help/purchasing-and-xero/po-form.png`
- `/help/purchasing-and-xero/receipt.png`
- `/help/purchasing-and-xero/invoice-form.png`
- `/help/purchasing-and-xero/invoice-detail.png`
- `/help/purchasing-and-xero/xero-setup.png`
- `/help/purchasing-and-xero/sync-log.png`

- [ ] **Step 5: Run the help tests**

Run: `npm test -- src/content/help src/components/help src/lib/help`
Expected: PASS. `manuals.render.test.tsx` renders the full manual. Its first heading is `How it fits together`, its headings are unique, and every `<h2>` id matches the contents list.

- [ ] **Step 6: Build and look at it**

```bash
npx tsc --noEmit
npx eslint src/components/help
npx next build
```

Expected: build succeeds. Then run `npx next dev -p 3100` and open `/help/purchasing-and-xero`:
- the diagram reads in daylight and midnight;
- every contents link jumps to its section;
- tables scroll inside their card at 390px.

Stop the dev server.

- [ ] **Step 7: Commit**

```bash
rm -f .git/index.lock
git add docs/help-style.md src/components/help/diagrams src/content/help/purchasing-and-xero.mdx
git commit -m "MANUVA-58 docs(help): style guide and the Purchasing & Xero manual

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## PR 2: Manuals, batch 1 (MANUVA-59 … MANUVA-63)

Every manual task below has the same steps:

1. Register the manual, then confirm the registry test fails: the MDX file is missing.
2. Write the diagram and register it under the manual's slug in `src/components/help/diagrams/index.ts`.
3. Write the MDX to `docs/help-style.md`, including its "Drafting a manual from the code" section, and run the help tests.
4. Typecheck, lint and commit.

The brief inside each task gives the exact registry entry, what to read, and the headings other code depends on. Those headings must appear word for word; the cutover (Task 15) links to them.

### Task 5: Getting started manual (MANUVA-59)

**Files:**
- Create: `src/content/help/getting-started.mdx`
- Create: `src/components/help/diagrams/getting-started.tsx`
- Modify: `src/components/help/diagrams/index.ts`, `src/content/help/manuals.ts`, `src/content/help/content.ts`

**Interfaces:**
- Consumes: `MANUALS`, `MANUAL_CONTENT`, `DIAGRAMS`, the MDX components, `docs/help-style.md` (Tasks 1–4).
- Produces: heading `Connecting Shopify` → `#connecting-shopify` (used by Task 15).

- [ ] **Step 1: Register the manual and watch the registry test fail**

In `src/content/help/manuals.ts`, add as the **first** entry of `MANUALS`:

```ts
  {
    slug: "getting-started",
    title: "Getting started",
    description: "Set up your workspace, invite your team, connect Shopify and add your first product.",
  },
```

In `src/content/help/content.ts`, add to `MANUAL_CONTENT`:

```ts
  "getting-started": () => import("./getting-started.mdx"),
```

Run: `npm test -- src/content/help`
Expected: FAIL. "has an MDX file for every listed manual" reports `getting-started`.

- [ ] **Step 2: Read the code**

Read these sources:
- `src/app/signup/`, `src/app/apply/`, `src/app/accept-invite/`, `src/app/login/`
- `src/app/app/page.tsx` (first-run state of the dashboard)
- `src/app/app/settings/company/`, `src/app/app/settings/team/`, `src/app/app/settings/locations/`, `src/app/app/settings/integrations/`
- `src/app/shopify-connect/`, `src/app/shopify/`, `src/app/api/shopify/`
- `src/app/app/products/` (creating the first product only)
- Old articles: `src/app/app/help/getting-started/*/page.tsx`

The manual is the first hour in Manuva: how you get an account, the workspace settings that matter first (company name, currency, timezone), inviting people and the roles they can have, the default location, connecting Shopify, and adding a first product. Link to the full manuals for depth rather than repeating them.

- [ ] **Step 3: Write the diagram and the manual**

**Diagram** `getting-started`: the first-hour path. Account → workspace settings → invite team → default location → connect Shopify → first product, with who does each step (admin or member).

**Required headings:** `How it fits together`, `Connecting Shopify`. Add task sections for each step the code supports, in the order a new workspace meets them. Include `Who can do what` (who can invite, who can change company settings and integrations) and `Common questions`.

Run: `npm test -- src/content/help src/components/help src/lib/help`
Expected: PASS.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint src/components/help src/content/help
rm -f .git/index.lock
git add src/content/help src/components/help/diagrams
git commit -m "MANUVA-59 docs(help): Getting started manual

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Products & BOMs manual (MANUVA-60)

**Files:**
- Create: `src/content/help/products-and-boms.mdx`
- Create: `src/components/help/diagrams/products-and-boms.tsx`
- Modify: `src/components/help/diagrams/index.ts`, `src/content/help/manuals.ts`, `src/content/help/content.ts`

**Interfaces:**
- Consumes: `MANUALS`, `MANUAL_CONTENT`, `DIAGRAMS`, the MDX components, `docs/help-style.md` (Tasks 1–4).
- Produces: headings `Creating a BOM` → `#creating-a-bom` and `BOM versions` → `#bom-versions` (used by Task 15).

- [ ] **Step 1: Register the manual and watch the registry test fail**

In `MANUALS`, add after `getting-started` and before `purchasing-and-xero`, keeping `ALL_MANUAL_SLUGS` order:

```ts
  {
    slug: "products-and-boms",
    title: "Products & BOMs",
    description: "Build products and variants, define their bills of materials, and manage BOM versions and retail items.",
  },
```

In `MANUAL_CONTENT`:

```ts
  "products-and-boms": () => import("./products-and-boms.mdx"),
```

Run: `npm test -- src/content/help`
Expected: FAIL on the missing `products-and-boms.mdx`.

- [ ] **Step 2: Read the code**

Read these sources:
- `src/app/app/products/`:
  - `page.tsx`, `product-filters.tsx`, `sort.ts`;
  - `[productId]/`, `variants/`, `variant-tabs.tsx`;
  - `bom-editor.tsx`, `bom-versions-tab.tsx`, `bom-seed-panel.tsx`, `bom-lightbox.tsx`;
  - `apply-labor-template.tsx`, `retail-item-dialog.tsx`, `retail-actions.ts`, `actions.ts`.
- `src/lib/` modules those import for BOM versions and retail items.
- Old articles: `src/app/app/help/bom/creating-a-bom/page.tsx`, `src/app/app/help/bom/versions/page.tsx`, `src/app/app/help/getting-started/first-bom/page.tsx`.

If the description claims something the code doesn't do, correct it and say so in the report.

- [ ] **Step 3: Write the diagram and the manual**

**Diagram** `products-and-boms`: product → variants → each variant's active BOM (components + labour) → versions. A retail item is the one-line-BOM path for bought-in stock.

**Required headings:** `How it fits together`, `Creating a BOM`, `BOM versions`. Add task sections for:
- finding products (filters and sort);
- adding a product and its variants, including Shopify-synced products;
- applying a labour template;
- tracking a variant as a retail item.

Include `Statuses explained` if products, variants or BOM versions show status labels, plus `Who can do what` and `Common questions`. Costing does **not** go here; it belongs to Production planning (Task 12).

Run: `npm test -- src/content/help src/components/help src/lib/help`
Expected: PASS.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint src/components/help src/content/help
rm -f .git/index.lock
git add src/content/help src/components/help/diagrams
git commit -m "MANUVA-60 docs(help): Products & BOMs manual

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Components & templates manual (MANUVA-61)

**Files:**
- Create: `src/content/help/components-and-templates.mdx`
- Create: `src/components/help/diagrams/components-and-templates.tsx`
- Modify: `src/components/help/diagrams/index.ts`, `src/content/help/manuals.ts`, `src/content/help/content.ts`

**Interfaces:**
- Consumes: `MANUALS`, `MANUAL_CONTENT`, `DIAGRAMS`, the MDX components, `docs/help-style.md` (Tasks 1–4).
- Produces: heading `How it fits together` → `#how-it-fits-together`, which Task 15 uses for the old "Components vs products" article.

- [ ] **Step 1: Register the manual and watch the registry test fail**

In `MANUALS`, add after `products-and-boms`:

```ts
  {
    slug: "components-and-templates",
    title: "Components & templates",
    description: "Keep your component catalogue, costs and suppliers up to date, and reuse component packs and labour routings.",
  },
```

In `MANUAL_CONTENT`:

```ts
  "components-and-templates": () => import("./components-and-templates.mdx"),
```

Run: `npm test -- src/content/help`
Expected: FAIL on the missing file.

- [ ] **Step 2: Read the code**

Read these sources:
- `src/app/app/components/`:
  - the list page and filter rail (`components/filter-rail.tsx`);
  - `[componentId]/`;
  - `actions.ts`, helpers;
  - the components import flow, if present.
- `src/app/app/templates/` (component packs and labour routings, `affected.ts`).
- Old article: `src/app/app/help/bom/components/page.tsx`.

- [ ] **Step 3: Write the diagram and the manual**

**Diagram** `components-and-templates`: the difference between a component, a product and a template. Components are what you buy or make and stock. Products are what you sell, built from components by a BOM. Templates are reusable packs of components and labour that you apply to BOMs.

**Required headings:** `How it fits together`. Add task sections for:
- finding components with the filter rail;
- adding and editing a component, including cost, unit, reorder point, supplier and images, as the code shows them;
- importing components, if the code has an import;
- creating a template;
- applying a template, and what changing a template does to BOMs that use it (`affected.ts`).

Include `Who can do what` and `Common questions`.

Run: `npm test -- src/content/help src/components/help src/lib/help`
Expected: PASS.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint src/components/help src/content/help
rm -f .git/index.lock
git add src/content/help src/components/help/diagrams
git commit -m "MANUVA-61 docs(help): Components & templates manual

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Inventory & warehouse manual (MANUVA-62)

**Files:**
- Create: `src/content/help/inventory-and-warehouse.mdx`
- Create: `src/components/help/diagrams/inventory-and-warehouse.tsx`
- Modify: `src/components/help/diagrams/index.ts`, `src/content/help/manuals.ts`, `src/content/help/content.ts`

**Interfaces:**
- Consumes: `MANUALS`, `MANUAL_CONTENT`, `DIAGRAMS`, the MDX components, `docs/help-style.md` (Tasks 1–4).
- Produces headings used by Task 15:
  - `Adjusting stock` → `#adjusting-stock`
  - `Stock movements` → `#stock-movements`
  - `Bin locations` → `#bin-locations`

- [ ] **Step 1: Register the manual and watch the registry test fail**

In `MANUALS`, add after `components-and-templates`:

```ts
  {
    slug: "inventory-and-warehouse",
    title: "Inventory & warehouse",
    description: "See stock levels, record adjustments, trace every movement and organise stock into bin locations.",
  },
```

In `MANUAL_CONTENT`:

```ts
  "inventory-and-warehouse": () => import("./inventory-and-warehouse.mdx"),
```

Run: `npm test -- src/content/help`
Expected: FAIL on the missing file.

- [ ] **Step 2: Read the code**

Read these sources:
- `src/app/app/inventory/`
- `src/app/app/warehouse/` (locations, zones, bins, barcodes)
- `src/app/app/settings/locations/`
- `src/app/app/scan/` (the barcode scanning flow)
- `src/app/app/reports/movements/` (for linking only)
- the inventory movement database functions they call (`apply_inventory_movement`, reserved movements) in `supabase/` for what on-hand, reserved, in-production and available mean
- Old articles: `src/app/app/help/inventory/*/page.tsx`

- [ ] **Step 3: Write the diagram and the manual**

**Diagram** `inventory-and-warehouse`: where stock numbers come from. Receipts, adjustments, stocktake commits, production and sales all write movements, and the movements make on-hand. Reserved and available sit against open orders.

**Required headings:** `How it fits together`, `Adjusting stock`, `Stock movements`, `Bin locations`. Add task sections for:
- reading the inventory list, and what each stock number means;
- setting up locations, zones and bins;
- scanning barcodes, from the code in `scan/`.

Include `Who can do what` and `Common questions`.

Run: `npm test -- src/content/help src/components/help src/lib/help`
Expected: PASS.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint src/components/help src/content/help
rm -f .git/index.lock
git add src/content/help src/components/help/diagrams
git commit -m "MANUVA-62 docs(help): Inventory & warehouse manual

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Stocktake manual (MANUVA-63)

**Files:**
- Create: `src/content/help/stocktake.mdx`
- Create: `src/components/help/diagrams/stocktake.tsx`
- Modify: `src/components/help/diagrams/index.ts`, `src/content/help/manuals.ts`, `src/content/help/content.ts`

**Interfaces:**
- Consumes: `MANUALS`, `MANUAL_CONTENT`, `DIAGRAMS`, the MDX components, `docs/help-style.md` (Tasks 1–4).
- Produces headings used by Task 15:
  - `Running a stocktake` → `#running-a-stocktake`
  - `Importing counts from CSV` → `#importing-counts-from-csv`
  - `Resolving discrepancies` → `#resolving-discrepancies`

- [ ] **Step 1: Register the manual and watch the registry test fail**

In `MANUALS`, add after `inventory-and-warehouse`:

```ts
  {
    slug: "stocktake",
    title: "Stocktake",
    description: "Count your stock, import counts from a spreadsheet, resolve discrepancies and commit the results.",
  },
```

In `MANUAL_CONTENT`:

```ts
  "stocktake": () => import("./stocktake.mdx"),
```

Keep the key quoted like the others: `content.test.ts` matches the quoted form.

Run: `npm test -- src/content/help`
Expected: FAIL on the missing file.

- [ ] **Step 2: Read the code**

Read these sources:
- `src/app/app/stocktake/` (sessions list, `[sessionId]/`, `bin-utils.ts`, CSV import, commit)
- `src/lib/csv/parse.ts` (accepted columns and errors)
- `src/app/app/reports/stocktake-history/` (for linking)
- Old articles: `src/app/app/help/stocktake/*/page.tsx`, `src/app/app/help/getting-started/first-stocktake/page.tsx`

- [ ] **Step 3: Write the diagram and the manual**

**Diagram** `stocktake`: start a session → count (by bin, scan or CSV) → review variances → commit, which writes adjustments as movements.

**Required headings:** `How it fits together`, `Running a stocktake`, `Importing counts from CSV`, `Resolving discrepancies`. In the CSV section:
- give the exact columns the parser accepts;
- give its exact error messages;
- add a `Statuses explained` table for session statuses.

Include `Fixing problems` (CSV and commit errors), `Who can do what` and `Common questions`.

Run: `npm test -- src/content/help src/components/help src/lib/help`
Expected: PASS.

- [ ] **Step 4: Typecheck, lint, build, commit**

```bash
npx tsc --noEmit
npx eslint src/components/help src/content/help
npx next build
rm -f .git/index.lock
git add src/content/help src/components/help/diagrams
git commit -m "MANUVA-63 docs(help): Stocktake manual

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `next build` prerenders `/help` and six manuals.

---

## PR 3: Manuals, batch 2, and the cutover (MANUVA-64 … MANUVA-69)

### Task 10: Orders & Shopify manual (MANUVA-64)

**Files:**
- Create: `src/content/help/orders-and-shopify.mdx`
- Create: `src/components/help/diagrams/orders-and-shopify.tsx`
- Modify: `src/components/help/diagrams/index.ts`, `src/content/help/manuals.ts`, `src/content/help/content.ts`

**Interfaces:**
- Consumes: `MANUALS`, `MANUAL_CONTENT`, `DIAGRAMS`, the MDX components, `docs/help-style.md` (Tasks 1–4).
- Produces headings used by Task 15:
  - `Shopify order sync` → `#shopify-order-sync`
  - `How allocation works` → `#how-allocation-works`
  - `Fulfilling an order` → `#fulfilling-an-order`
  - `Statuses explained` → `#statuses-explained`

- [ ] **Step 1: Register the manual and watch the registry test fail**

In `MANUALS`, add after `stocktake` and before `purchasing-and-xero`:

```ts
  {
    slug: "orders-and-shopify",
    title: "Orders & Shopify",
    description: "Bring in Shopify orders, understand allocation and statuses, and fulfil orders.",
  },
```

In `MANUAL_CONTENT`:

```ts
  "orders-and-shopify": () => import("./orders-and-shopify.mdx"),
```

Run: `npm test -- src/content/help`
Expected: FAIL on the missing file.

- [ ] **Step 2: Read the code**

Read these sources:
- `src/app/app/orders/` (list, `[id]` detail with allocation, costing and labour planning)
- `src/app/app/settings/orders/`
- `src/lib/shopify/` (sync, webhooks, scopes)
- `src/app/api/shopify/`
- the allocation engine in `src/lib/` that orders import
- Old articles: `src/app/app/help/orders/*/page.tsx`, `src/app/app/help/bom/allocation/page.tsx`

- [ ] **Step 3: Write the diagram and the manual**

**Diagram** `orders-and-shopify`: a Shopify order arrives (webhook or sync) → lines matched to variants → allocation reserves stock or flags shortfalls → production or picking → fulfilled, with retail items consuming stock on sale.

**Required headings:** `How it fits together`, `Shopify order sync`, `How allocation works`, `Fulfilling an order`, `Statuses explained`. The statuses table covers order statuses and line statuses exactly as the code names them. Include:
- **Fixing problems:** sync and allocation errors shown to users.
- **Who can do what.**
- **Common questions.**

Run: `npm test -- src/content/help src/components/help src/lib/help`
Expected: PASS.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint src/components/help src/content/help
rm -f .git/index.lock
git add src/content/help src/components/help/diagrams
git commit -m "MANUVA-64 docs(help): Orders & Shopify manual

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Suppliers manual (MANUVA-65)

**Files:**
- Create: `src/content/help/suppliers.mdx`
- Create: `src/components/help/diagrams/suppliers.tsx`
- Modify: `src/components/help/diagrams/index.ts`, `src/content/help/manuals.ts`, `src/content/help/content.ts`

**Interfaces:**
- Consumes: `MANUALS`, `MANUAL_CONTENT`, `DIAGRAMS`, the MDX components, `docs/help-style.md` (Tasks 1–4).
- Produces: heading `Adding a supplier` → `#adding-a-supplier` (used by Task 15).

- [ ] **Step 1: Register the manual and watch the registry test fail**

In `MANUALS`, add after `purchasing-and-xero`:

```ts
  {
    slug: "suppliers",
    title: "Suppliers",
    description: "Add suppliers, set lead times and payment terms, and link them to components and Xero contacts.",
  },
```

In `MANUAL_CONTENT`:

```ts
  "suppliers": () => import("./suppliers.mdx"),
```

Run: `npm test -- src/content/help`
Expected: FAIL on the missing file.

- [ ] **Step 2: Read the code**

Read these sources:
- `src/app/app/suppliers/` (list, detail, form, actions)
- `src/app/app/reports/lead-time-accuracy/` and `spend-by-supplier/` (for linking)
- Old article: `src/app/app/help/purchasing/suppliers/page.tsx`

Xero contact linking is documented in the Purchasing & Xero manual: link to `/help/purchasing-and-xero#linking-suppliers-to-xero-contacts` rather than repeating it. Check payment terms on the supplier record. If the supplier form has no payment-terms field on this branch, drop "payment terms" from the description and say so in the report.

- [ ] **Step 3: Write the diagram and the manual**

**Diagram** `suppliers`: the supplier record at the centre, linked to the components it supplies (with lead times), the POs raised to it, its receipts and invoices, and its Xero contact.

**Required headings:** `How it fits together`, `Adding a supplier`. Add task sections for:
- editing a supplier;
- linking a supplier to components;
- lead times, and how they feed reorder and lead-time reports.

Include `Who can do what` and `Common questions`.

Run: `npm test -- src/content/help src/components/help src/lib/help`
Expected: PASS.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint src/components/help src/content/help
rm -f .git/index.lock
git add src/content/help src/components/help/diagrams
git commit -m "MANUVA-65 docs(help): Suppliers manual

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Production planning manual (MANUVA-66)

**Files:**
- Create: `src/content/help/production-planning.mdx`
- Create: `src/components/help/diagrams/production-planning.tsx`
- Modify: `src/components/help/diagrams/index.ts`, `src/content/help/manuals.ts`, `src/content/help/content.ts`

**Interfaces:**
- Consumes: `MANUALS`, `MANUAL_CONTENT`, `DIAGRAMS`, the MDX components, `docs/help-style.md` (Tasks 1–4).
- Produces headings used by Task 15:
  - `How it fits together` → `#how-it-fits-together`
  - `The shopfloor queue` → `#the-shopfloor-queue`
  - `Departments and capacity` → `#departments-and-capacity`

- [ ] **Step 1: Register the manual and watch the registry test fail**

In `MANUALS`, add after `suppliers`:

```ts
  {
    slug: "production-planning",
    title: "Production planning",
    description: "Plan production on the floor, run the shopfloor queue, and manage departments, staffing, time and costs.",
    planGated: true,
  },
```

In `MANUAL_CONTENT`:

```ts
  "production-planning": () => import("./production-planning.mdx"),
```

Run: `npm test -- src/content/help`
Expected: FAIL on the missing file.

- [ ] **Step 2: Read the code**

Read these sources:
- `src/app/app/planning/(gated)/` (layout gate, `floor/`, `shopfloor/`)
- `src/app/app/planning/upgrade/`
- `src/app/app/departments/`, `src/app/app/staffing/`, `src/app/app/capacity/`, `src/app/app/actual-time/`, `src/app/app/staff-costings/`, `src/app/app/costing/`
- `src/lib/capacity/`, `src/lib/staffing/`, `src/lib/actual-time/`, `src/lib/costing/`
- Old articles: `src/app/app/help/production/*/page.tsx`

Staffing, Capacity, Actual time, Staff costings and Costing are not in the sidebar. Find how a user reaches each one: links from the floor page, tabs, or nowhere. Document only what a user can reach. List any unreachable page in the report; the controller files it as a bug.

- [ ] **Step 3: Write the diagram and the manual**

**Lead:** this module needs the planning feature on your plan *(plan-gated)*. Say what a workspace without it sees (the upgrade page).

**Diagram** `production-planning`: orders feed production work → the floor plan schedules it by department and week → the shopfloor queue is what operators work through → actual time recorded → costing compares planned and actual cost and margin.

**Required headings:** `How it fits together`, `The shopfloor queue`, `Departments and capacity`. Add task sections for:
- the floor plan;
- staffing;
- recording actual time;
- staff costings;
- costing (financial plans: planned cost, margin and variance, from `src/lib/costing/variance.ts`).

Include `Statuses explained` for production statuses, `Who can do what` and `Common questions`.

Run: `npm test -- src/content/help src/components/help src/lib/help`
Expected: PASS.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint src/components/help src/content/help
rm -f .git/index.lock
git add src/content/help src/components/help/diagrams
git commit -m "MANUVA-66 docs(help): Production planning manual

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Reports manual (MANUVA-67)

**Files:**
- Create: `src/content/help/reports.mdx`
- Create: `src/components/help/diagrams/reports.tsx`
- Modify: `src/components/help/diagrams/index.ts`, `src/content/help/manuals.ts`, `src/content/help/content.ts`

**Interfaces:**
- Consumes: `MANUALS`, `MANUAL_CONTENT`, `DIAGRAMS`, the MDX components, `docs/help-style.md` (Tasks 1–4).
- Produces headings used by Task 15:
  - `Stock on hand` → `#stock-on-hand`
  - `Inventory valuation` → `#inventory-valuation`
  - `Dead stock` → `#dead-stock`

- [ ] **Step 1: Register the manual and watch the registry test fail**

In `MANUALS`, add after `production-planning`:

```ts
  {
    slug: "reports",
    title: "Reports",
    description: "What each report answers, how to read it and how to export it.",
  },
```

In `MANUAL_CONTENT`:

```ts
  "reports": () => import("./reports.mdx"),
```

Run: `npm test -- src/content/help`
Expected: FAIL on the missing file.

- [ ] **Step 2: Read the code**

Read these sources:
- `src/app/app/reports/` (index page, `_components`, `_lib`, `export/`)
- each report: `stock-on-hand`, `valuation`, `dead-stock`, `movements`, `inventory-integrity`, `lead-time-accuracy`, `po-summary`, `po-variance`, `spend-by-supplier`, `stocktake-history`
- Old articles: `src/app/app/help/reports/*/page.tsx`

- [ ] **Step 3: Write the diagram and the manual**

**Diagram** `reports`: the reports grouped by the question they answer. Stock (on hand, valuation, dead stock, movements, integrity). Purchasing (PO summary, PO variance, spend by supplier, lead-time accuracy). Counting (stocktake history). Exports go to CSV.

**Required headings:** `How it fits together`, `Stock on hand`, `Inventory valuation`, `Dead stock`. Then one `##` section per remaining report, named after it as the app titles it. Each report section covers what the report answers, its filters and columns, how each figure is calculated (from the code), and export. Add an `Exporting reports` section if export is shared.

Include `Who can do what` and `Common questions`.

Run: `npm test -- src/content/help src/components/help src/lib/help`
Expected: PASS.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint src/components/help src/content/help
rm -f .git/index.lock
git add src/content/help src/components/help/diagrams
git commit -m "MANUVA-67 docs(help): Reports manual

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: Workspace admin manual (MANUVA-68)

**Files:**
- Create: `src/content/help/workspace-admin.mdx`
- Create: `src/components/help/diagrams/workspace-admin.tsx`
- Modify: `src/components/help/diagrams/index.ts`, `src/content/help/manuals.ts`, `src/content/help/content.ts`

**Interfaces:**
- Consumes: `MANUALS`, `MANUAL_CONTENT`, `DIAGRAMS`, the MDX components, `docs/help-style.md` (Tasks 1–4).
- Produces: no headings that other code depends on.

- [ ] **Step 1: Register the manual and watch the registry test fail**

In `MANUALS`, add as the **last** entry:

```ts
  {
    slug: "workspace-admin",
    title: "Workspace admin",
    description: "Manage your profile, company settings, team roles, integrations, billing, the activity log and trash.",
  },
```

In `MANUAL_CONTENT`:

```ts
  "workspace-admin": () => import("./workspace-admin.mdx"),
```

Run: `npm test -- src/content/help`
Expected: FAIL on the missing file.

- [ ] **Step 2: Read the code**

Read these sources:
- `src/app/app/settings/` (profile, appearance, theme, company, team, integrations, locations, orders, invoices, settings sidebar)
- `src/app/app/billing/` and `src/app/api/billing/` (trial, paywall, past-due, checkout)
- `src/app/app/_lib/require-active-subscription.ts`
- `src/app/app/activity-log/`, `src/app/app/trash/`
- `src/lib/tenant/context.ts` (the roles that exist: member, admin, super_admin, read-only observers)

The Xero card is documented in Purchasing & Xero: link to it. Shopify connection is in Getting started: link to it.

- [ ] **Step 3: Write the diagram and the manual**

**Diagram** `workspace-admin`: the roles and what each can reach. Members do daily work. Admins also manage settings, team, integrations and billing. Platform observers are read-only. A trial runs into a subscription; a past-due subscription limits access.

Add task sections for:
- your profile and appearance;
- company settings;
- managing your team and roles;
- integrations;
- locations;
- billing and subscription invoices (trial, paywall and past-due states, exactly as the code words them);
- the activity log;
- trash (restoring and clearing).

Include `Statuses explained` for subscription states, `Who can do what` and `Common questions`. Super-admin platform pages (`src/app/app/super-admin/`) are internal: leave them out.

Run: `npm test -- src/content/help src/components/help src/lib/help`
Expected: PASS.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint src/components/help src/content/help
rm -f .git/index.lock
git add src/content/help src/components/help/diagrams
git commit -m "MANUVA-68 docs(help): Workspace admin manual

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 15: Cutover: redirects, help links, remove the old articles (MANUVA-69)

**Files:**
- Create: `src/content/help/redirects.ts`, `src/content/help/redirects.test.ts`
- Modify: `next.config.ts` (add `redirects()`)
- Modify: `src/app/app/_ui/help-link.tsx`, `src/app/app/_ui/help-link.test.tsx`
- Create: `src/app/app/_ui/help-link-targets.test.ts`
- Modify:
  - `src/app/app/inventory/page.tsx:151`
  - `src/app/app/orders/page.tsx:119`
  - `src/app/app/stocktake/page.tsx:109`
  - `src/app/app/purchasing/page.tsx:103`
  - `src/app/app/planning/(gated)/floor/page.tsx:220`
- Modify: `src/app/app/topbar.tsx:110`
- Modify: `src/app/app/route-meta.ts` (remove the `/app/help` entry)
- Delete: `src/app/app/help/` (all of it)
- Modify: `CLAUDE.md` (Help manuals section), `docs/qa-feature-test-plan.md` (§21 and the changelog)

**Interfaces:**
- Consumes: `findManual`, `MANUALS` (Task 1); `getManualHeadings` (Task 3); the headings produced by Tasks 4–14.
- Produces:
  - `LEGACY_HELP_REDIRECTS: Record<string, string>`;
  - `legacyHelpRedirects(): { source: string; destination: string; permanent: true }[]`;
  - `HelpLink({ to: string; label?: string })`.

- [ ] **Step 1: Write the failing tests**

`src/content/help/redirects.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { findManual } from "./manuals";
import { getManualHeadings } from "@/lib/help/load";
import { LEGACY_HELP_REDIRECTS, legacyHelpRedirects } from "./redirects";

const OLD_SLUGS = [
  "getting-started/first-bom", "getting-started/connect-shopify", "getting-started/first-stocktake",
  "getting-started/create-purchase-order", "inventory/adjustments", "inventory/movements", "inventory/locations",
  "bom/creating-a-bom", "bom/components", "bom/versions", "bom/allocation", "orders/fulfilment",
  "orders/shopify-sync", "orders/order-statuses", "purchasing/purchase-orders", "purchasing/goods-inwards",
  "purchasing/suppliers", "production/planning-overview", "production/shopfloor", "production/capacity",
  "stocktake/running-a-stocktake", "stocktake/csv-import", "stocktake/resolving-discrepancies",
  "reports/stock-on-hand", "reports/valuation", "reports/dead-stock",
];

describe("legacy help redirects", () => {
  it("covers every one of the 26 old article slugs", () => {
    expect(Object.keys(LEGACY_HELP_REDIRECTS).sort()).toEqual([...OLD_SLUGS].sort());
  });

  it.each(Object.entries(LEGACY_HELP_REDIRECTS))("%s lands on an existing manual section", (_slug, target) => {
    const [manual, anchor] = target.split("#");
    expect(findManual(manual), manual).toBeDefined();
    expect(anchor, target).toBeTruthy();
    expect(getManualHeadings(findManual(manual)!.slug).map((h) => h.id)).toContain(anchor);
  });

  it("sends the hub to /help, each article to its section with a literal #, and anything else to /help", () => {
    const list = legacyHelpRedirects();
    expect(list[0]).toEqual({ source: "/app/help", destination: "/help", permanent: true });
    expect(list.at(-1)).toEqual({ source: "/app/help/:path*", destination: "/help", permanent: true });
    expect(list).toContainEqual({
      source: "/app/help/inventory/adjustments",
      destination: "/help/inventory-and-warehouse#adjusting-stock",
      permanent: true,
    });
    expect(list).toHaveLength(OLD_SLUGS.length + 2);
  });
});
```

`src/app/app/_ui/help-link-targets.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { findManual } from "@/content/help/manuals";
import { getManualHeadings } from "@/lib/help/load";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [full] : [];
  });
}

const files = sourceFiles(path.join(process.cwd(), "src"));
const uses = files.flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(/<HelpLink\b[^>]*>/g)].map((m) => ({ file, tag: m[0] })),
);

describe("in-app help links", () => {
  it("are all written with to=", () => {
    expect(uses.length).toBeGreaterThanOrEqual(5);
    for (const { file, tag } of uses) expect(tag, file).toMatch(/\bto="[^"]+"/);
  });

  it("point at an existing manual and heading", () => {
    for (const { file, tag } of uses) {
      const to = /\bto="([^"]+)"/.exec(tag)![1];
      const [manual, anchor] = to.split("#");
      const m = findManual(manual);
      expect(m, `${file}: ${to}`).toBeDefined();
      if (anchor) expect(getManualHeadings(m!.slug).map((h) => h.id), `${file}: ${to}`).toContain(anchor);
    }
  });
});
```

`src/app/app/_ui/help-link.test.tsx`: replace its contents with:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import HelpLink from "./help-link";

describe("HelpLink", () => {
  it("links to the public manual section", () => {
    const html = renderToStaticMarkup(<HelpLink to="inventory-and-warehouse#adjusting-stock" />);
    expect(html).toContain('href="/help/inventory-and-warehouse#adjusting-stock"');
  });
  it("opens in a new tab so the user keeps their place", () => {
    const html = renderToStaticMarkup(<HelpLink to="stocktake" />);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
  });
  it("shows the label when given, and uses it as the title", () => {
    const html = renderToStaticMarkup(<HelpLink to="stocktake" label="How to run a stocktake" />);
    expect(html).toContain("<span>How to run a stocktake</span>");
    expect(html).toContain('title="How to run a stocktake"');
  });
  it("falls back to a Help title without a label", () => {
    expect(renderToStaticMarkup(<HelpLink to="stocktake" />)).toContain('title="Help"');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/content/help/redirects.test.ts src/app/app/_ui`
Expected: FAIL. `./redirects` does not exist; `HelpLink` has no `to` prop; the five call sites still use `slug=`.

- [ ] **Step 3: Write the redirect map and wire it into Next**

`src/content/help/redirects.ts`:

```ts
/** Each old in-app article (/app/help/<slug>) and the manual section that replaced it (/help/<target>). */
export const LEGACY_HELP_REDIRECTS: Record<string, string> = {
  "getting-started/first-bom": "products-and-boms#creating-a-bom",
  "getting-started/connect-shopify": "getting-started#connecting-shopify",
  "getting-started/first-stocktake": "stocktake#running-a-stocktake",
  "getting-started/create-purchase-order": "purchasing-and-xero#creating-a-purchase-order",
  "inventory/adjustments": "inventory-and-warehouse#adjusting-stock",
  "inventory/movements": "inventory-and-warehouse#stock-movements",
  "inventory/locations": "inventory-and-warehouse#bin-locations",
  "bom/creating-a-bom": "products-and-boms#creating-a-bom",
  "bom/components": "components-and-templates#how-it-fits-together",
  "bom/versions": "products-and-boms#bom-versions",
  "bom/allocation": "orders-and-shopify#how-allocation-works",
  "orders/fulfilment": "orders-and-shopify#fulfilling-an-order",
  "orders/shopify-sync": "orders-and-shopify#shopify-order-sync",
  "orders/order-statuses": "orders-and-shopify#statuses-explained",
  "purchasing/purchase-orders": "purchasing-and-xero#creating-a-purchase-order",
  "purchasing/goods-inwards": "purchasing-and-xero#receiving-goods",
  "purchasing/suppliers": "suppliers#adding-a-supplier",
  "production/planning-overview": "production-planning#how-it-fits-together",
  "production/shopfloor": "production-planning#the-shopfloor-queue",
  "production/capacity": "production-planning#departments-and-capacity",
  "stocktake/running-a-stocktake": "stocktake#running-a-stocktake",
  "stocktake/csv-import": "stocktake#importing-counts-from-csv",
  "stocktake/resolving-discrepancies": "stocktake#resolving-discrepancies",
  "reports/stock-on-hand": "reports#stock-on-hand",
  "reports/valuation": "reports#inventory-valuation",
  "reports/dead-stock": "reports#dead-stock",
};

/** next.config redirects: the old hub, each old article, then a catch-all for anything else under /app/help. */
export function legacyHelpRedirects(): { source: string; destination: string; permanent: true }[] {
  return [
    { source: "/app/help", destination: "/help", permanent: true },
    ...Object.entries(LEGACY_HELP_REDIRECTS).map(([slug, target]) => ({
      source: `/app/help/${slug}`,
      destination: `/help/${target}`,
      permanent: true as const,
    })),
    { source: "/app/help/:path*", destination: "/help", permanent: true },
  ];
}
```

`next.config.ts`: import the list and add `redirects()` to `nextConfig`, next to `headers()`.

```ts
import { legacyHelpRedirects } from "./src/content/help/redirects";
// …
const nextConfig: NextConfig = {
  // … existing config …
  async redirects() {
    // Old /app/help articles moved to the public help centre (MANUVA-69).
    // Config redirects run before the proxy, so a signed-out visitor is not sent to login first.
    return legacyHelpRedirects();
  },
};
```

- [ ] **Step 4: Repoint the in-app links**

`src/app/app/_ui/help-link.tsx`: replace its contents with:

```tsx
import Link from "next/link";
import styles from "./help-link.module.css";

type Props = {
  /** `<manual>` or `<manual>#<anchor>` in the public help centre, e.g. "stocktake#running-a-stocktake". */
  to: string;
  label?: string;
};

export default function HelpLink({ to, label }: Props) {
  return (
    <Link href={`/help/${to}`} className={styles.link} title={label ?? "Help"} target="_blank" rel="noopener">
      <span className={styles.icon} aria-hidden="true">ⓘ</span>
      {label ? <span>{label}</span> : null}
    </Link>
  );
}
```

Change the five call sites, keeping each label:

| File | New prop |
|---|---|
| `src/app/app/inventory/page.tsx` | `to="inventory-and-warehouse#adjusting-stock"` |
| `src/app/app/orders/page.tsx` | `to="orders-and-shopify#statuses-explained"` |
| `src/app/app/stocktake/page.tsx` | `to="stocktake#running-a-stocktake"` |
| `src/app/app/purchasing/page.tsx` | `to="purchasing-and-xero#creating-a-purchase-order"` |
| `src/app/app/planning/(gated)/floor/page.tsx` | `to="production-planning#how-it-fits-together"` |

`src/app/app/topbar.tsx`: change the Help menu link from `href="/app/help"` to
`href="/help" target="_blank" rel="noopener"`, keeping its `className` and `onClick`.

`src/app/app/route-meta.ts`: delete the route definition whose `prefix` is `"/app/help"`.

- [ ] **Step 5: Remove the old articles**

```bash
rm -f .git/index.lock
git rm -r -q src/app/app/help
grep -rn "app/help" src --include=*.ts --include=*.tsx
```

Expected: the `grep` prints lines only from `src/content/help/redirects.ts` and `src/content/help/redirects.test.ts`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS for the whole suite, including `redirects.test.ts`, `help-link.test.tsx`, `help-link-targets.test.ts` and `manuals.render.test.tsx` across all 11 manuals.

- [ ] **Step 7: Check the redirects keep their anchor**

Start `npx next dev -p 3100` in the background, then:

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3100/app/help
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3100/app/help/inventory/adjustments
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3100/app/help/no/such-article
curl -sI http://localhost:3100/app/help/inventory/adjustments | grep -i '^location'
```

Expected:
- `308 http://localhost:3100/help`
- `308 http://localhost:3100/help/inventory-and-warehouse#adjusting-stock`
- `308 http://localhost:3100/help`
- a `Location:` header containing a literal `#adjusting-stock`, not `%23`

All of these come without cookies, so no hop to `/login`.

If the `Location` header shows `%23`, Next is encoding the fragment. In that case:
1. Change `legacyHelpRedirects()` to drop the `#anchor` from `destination`, sending visitors to the manual page.
2. Update the redirect test's expected destination to match.
3. Record the change in the task report.

Then click a help link on `/app/inventory` signed in. It opens the manual section in a new tab. Stop the dev server.

- [ ] **Step 8: Update the rule and the QA plan**

`CLAUDE.md`, "Help manuals (keep current)": add this paragraph at the end of the section:

```markdown
In-app help links are `<HelpLink to="<manual>#<anchor>" />`, where the anchor is a `##` heading's
slug. Renaming a heading that a help link or `src/content/help/redirects.ts` points at breaks the
tests until both are updated.
```

`docs/qa-feature-test-plan.md` §21: replace the sentence "The old `/app/help` articles stay until the cutover (MANUVA-69)." with "The old `/app/help` articles are gone; their URLs redirect." Then add these checks:

```markdown
- [ ] `/app/help` and every old `/app/help/<article>` URL redirect to `/help` or to the matching manual section, signed out too
- [ ] The ⓘ help links on Inventory, Orders, Stocktake, Purchasing and Production Planning open the right manual section in a new tab
- [ ] The top bar's Help menu item opens `/help` in a new tab
```

Append to `## Changelog`:

```markdown
- 2026-10-02 — amended Help centre (MANUVA-69): the 26 `/app/help` articles are replaced by the 11 public manuals; old URLs redirect to the matching section and in-app help links open the manual in a new tab.
```

Use the actual date of the change.

- [ ] **Step 9: Typecheck, lint, build, commit**

```bash
npx tsc --noEmit
npx eslint next.config.ts src/content/help src/app/app/_ui src/app/app/topbar.tsx src/app/app/route-meta.ts src/app/app/inventory/page.tsx src/app/app/orders/page.tsx src/app/app/stocktake/page.tsx src/app/app/purchasing/page.tsx "src/app/app/planning/(gated)/floor/page.tsx"
npx next build
rm -f .git/index.lock
git add -A src/app/app/help next.config.ts src/content/help src/app/app/_ui src/app/app/topbar.tsx src/app/app/route-meta.ts src/app/app/inventory/page.tsx src/app/app/orders/page.tsx src/app/app/stocktake/page.tsx src/app/app/purchasing/page.tsx "src/app/app/planning/(gated)/floor/page.tsx" CLAUDE.md docs/qa-feature-test-plan.md
git commit -m "MANUVA-69 refactor(help): redirect /app/help to the manuals and retire the old articles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: build succeeds, with `/help` and all 11 manuals prerendered and no `/app/help` routes.

---

## Marketing site

### Task 16: Help link on manuva.app (MANUVA-70)

**Files** (repo `C:\dev\ManuvaMarketingBold`):
- Modify: the site navigation and footer, wherever `src/site.ts` and `src/components/` define them.
- Test: that repo's own tests for nav and footer links, if any.

**Interfaces:**
- Consumes: the live help centre at `https://app.manuva.app/help`, after PR 3 is deployed.
- Produces: a **Help** link in the marketing nav and footer.

- [ ] **Step 1: Check the repo is free**

```bash
git -C /c/dev/ManuvaMarketingBold status --short
git -C /c/dev/ManuvaMarketingBold branch --show-current
git -C /c/dev/ManuvaMarketingBold log --oneline -3
```

Another session works in this repo (MVBOLD items on 2026-10-02). If the working tree is dirty, or the current branch is not `main`, **stop and ask** before touching anything.

- [ ] **Step 2: Follow that repo's rules**

Read `C:\dev\ManuvaMarketingBold\CLAUDE.md` and `AGENTS.md`. They set its task-code prefix (`MVBOLD-n`), branch naming, design rules and tests. The commit message carries both its own code and `MANUVA-70`.

- [ ] **Step 3: Add the link**

- **Nav:** add **Help** pointing to `https://app.manuva.app/help`, in the position that repo's nav pattern uses for secondary links.
- **Footer:** add the same link in its product or resources column.
- **Tests:** if the repo has nav or footer tests (vitest or Playwright), add an assertion that the Help link exists with that `href`, and run them (`npm test`, then `npm run test:e2e` if nav is covered there).

- [ ] **Step 4: Build and commit**

```bash
cd /c/dev/ManuvaMarketingBold && npm run build
```

Expected: the build succeeds. Commit on a branch named to that repo's convention. Opening the PR waits for the go-ahead.

---

## After the plan

- **Screenshots (MANUVA-71, MANUVA-72):** a separate plan written after PR 3 lands. It covers the demo workspace seed (production write, explicit yes required), the demo user, the capture script and the images. It also adds the "every `Screenshot` src exists" test, and the screenshot line in CLAUDE.md.
- **monday:** each task's item goes In Progress when it starts and Done when its PR merges. Bugs reported by manual tasks become new items in Bugs.
