import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmailShell } from "./email-shell";

describe("EmailShell", () => {
  it("renders provided children inside the card", () => {
    const html = renderToStaticMarkup(
      <EmailShell logoBaseUrl="https://manuva.app">
        <p>hello from inside the shell</p>
      </EmailShell>
    );
    expect(html).toContain("hello from inside the shell");
  });

  it("renders the Manuva logo image with an absolute URL", () => {
    const html = renderToStaticMarkup(
      <EmailShell logoBaseUrl="https://manuva.app">
        <p>x</p>
      </EmailShell>
    );
    expect(html).toContain('src="https://manuva.app/Manuva_svg.svg"');
    expect(html.toLowerCase()).toContain('alt="manuva"');
  });

  it("renders the footer copy", () => {
    const html = renderToStaticMarkup(
      <EmailShell logoBaseUrl="https://manuva.app">
        <p>x</p>
      </EmailShell>
    );
    expect(html).toContain("manuva.app");
    expect(html).toContain("safely ignore");
  });

  it("uses the page background color", () => {
    const html = renderToStaticMarkup(
      <EmailShell logoBaseUrl="https://manuva.app">
        <p>x</p>
      </EmailShell>
    );
    expect(html.toLowerCase()).toContain("#f8f7f5");
  });
});
