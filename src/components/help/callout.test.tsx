import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Callout } from "./callout";

describe("Callout", () => {
  it("renders tip content", () => {
    const html = renderToStaticMarkup(<Callout type="tip">Always reconcile after a stocktake.</Callout>);
    expect(html).toContain("Always reconcile after a stocktake.");
    expect(html).toContain("💡");
  });

  it("renders warning content", () => {
    const html = renderToStaticMarkup(<Callout type="warning">This action is irreversible.</Callout>);
    expect(html).toContain("This action is irreversible.");
    expect(html).toContain("⚠️");
  });

  it("renders info content", () => {
    const html = renderToStaticMarkup(<Callout type="info">Orders sync every few minutes.</Callout>);
    expect(html).toContain("Orders sync every few minutes.");
    expect(html).toContain("ℹ️");
  });

  it("defaults to tip when type is omitted", () => {
    const html = renderToStaticMarkup(<Callout>Default tip</Callout>);
    expect(html).toContain("💡");
    expect(html).toContain("Default tip");
  });
});
