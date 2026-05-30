import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Steps, Step } from "./steps";

describe("Steps", () => {
  it("renders an ordered list", () => {
    const html = renderToStaticMarkup(
      <Steps>
        <Step>First action</Step>
        <Step>Second action</Step>
      </Steps>
    );
    expect(html).toContain("<ol");
    expect(html).toContain("<li");
  });

  it("renders each step's content", () => {
    const html = renderToStaticMarkup(
      <Steps>
        <Step>Open Inventory</Step>
        <Step>Click Log movement</Step>
      </Steps>
    );
    expect(html).toContain("Open Inventory");
    expect(html).toContain("Click Log movement");
  });

  it("renders inline markup inside steps", () => {
    const html = renderToStaticMarkup(
      <Steps>
        <Step>Click <strong>Submit</strong></Step>
      </Steps>
    );
    expect(html).toContain("<strong>Submit</strong>");
  });
});
