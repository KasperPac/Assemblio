import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PageHeader from "./page-header";

describe("PageHeader", () => {
  it("preserves quiet breadcrumbs, actions and title without a band or stat", () => {
    const html = renderToStaticMarkup(<PageHeader eyebrow="Operations" title="PO-123" breadcrumbs={[{ label: "Purchasing", href: "/app/purchasing" }, { label: "PO-123" }]} description="Order details" actions={<button>Edit</button>} stat={{ label: "Unused", value: 12 }} cover />);
    expect(html).toContain('href="/app/purchasing"');
    expect(html).toContain("<h1");
    expect(html).toContain("Order details");
    expect(html).toContain("Edit");
    expect(html).not.toContain("data-band");
    expect(html).not.toContain("Unused");
    expect(html).not.toContain('aria-hidden="true"');
  });
  it("scopes the index header and all action children to its explicit domain", () => {
    const html = renderToStaticMarkup(<PageHeader band domain="production" eyebrow="Operations · Production" title="Production orders" stat={{ label: "Open jobs", value: 0, unit: "jobs", delta: "Ready now" }} actions={<dialog><button>Save</button></dialog>} />);
    expect(html).toContain('data-index-header="" data-domain="production"');
    expect(html).toContain("Open jobs");
    expect(html).toContain(">0</span>");
    expect(html).toContain("jobs");
    expect(html).toContain("Ready now");
    expect(html).toContain("<dialog>");
  });
  it("renders an index header without domain metadata and no fabricated metric", () => {
    const html = renderToStaticMarkup(<PageHeader band eyebrow="Operations" title="Dashboard" />);
    expect(html).toContain('data-index-header=""');
    expect(html).not.toContain("data-domain");
    expect(html).not.toContain("statValue");
  });
  it("keeps metrics accessible without a poster watermark", () => {
    const html = renderToStaticMarkup(<PageHeader band cover domain="audit" title="Delivery performance" stat={{ label: "On-time deliveries", value: "—" }} />);
    expect(html).not.toContain('aria-hidden="true"');
    expect(html).toContain("On-time deliveries");
  });

  it("restores every scoped control token for dialogs and the avatar menu", () => {
    const css = readFileSync(new URL("../../globals.css", import.meta.url), "utf8");
    const reset = css.match(/:is\(\[data-band\], \[data-app-content\]\) :is\(dialog, \[data-band-reset\]\) \{([^}]+)\}/)?.[1];
    expect(reset).toBeDefined();
    for (const token of ["ink-strong", "ink-muted", "ink-faint", "bg-card", "stroke", "stroke-strong", "brand-1", "brand-2", "brand-dim", "ink-on-brand", "surface-hover"]) {
      expect(reset).toContain(`--${token}: var(--band-reset-${token})`);
      expect(css).toContain(`--band-reset-${token}: var(--${token})`);
    }
    const topbar = readFileSync(new URL("../topbar.tsx", import.meta.url), "utf8");
    expect(topbar).toContain('className={styles.dropdownMenu} data-band-reset=""');
  });

  it("resolves Archivo aliases on the body where next/font is applied", () => {
    const css = readFileSync(new URL("../../globals.css", import.meta.url), "utf8");
    const body = css.match(/body \{\s+--font-body[^}]+\}/)?.[0];
    expect(body).toContain("--font-display: var(--font-archivo)");
    expect(body).toContain("--font-numeral: var(--font-archivo)");
    const layout = readFileSync(new URL("../../layout.tsx", import.meta.url), "utf8");
    expect(layout).toContain('axes: ["wdth"]');
    expect(layout).toContain("${archivo.variable}");
  });
});
