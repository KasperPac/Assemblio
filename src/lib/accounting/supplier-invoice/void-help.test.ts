import { describe, expect, it } from "vitest";
import { voidHelpText } from "./void-help";

describe("voidHelpText", () => {
  it("says the bill is deleted or voided once it has been sent", () => {
    expect(voidHelpText({ externalId: "x-1", syncStatus: "synced", xeroLive: true })).toBe("The bill is deleted or voided in Xero, and the receipt lines can be invoiced again.");
  });
  it("mentions a possible bill when the sync is queued or failed with a live connection", () => {
    for (const syncStatus of ["queued", "failed"]) {
      expect(voidHelpText({ externalId: null, syncStatus, xeroLive: true })).toBe("Any bill already created in Xero is voided there too, and the receipt lines can be invoiced again.");
    }
  });
  it("says nothing about Xero without a connection or when never synced", () => {
    expect(voidHelpText({ externalId: null, syncStatus: "queued", xeroLive: false })).toBe("The receipt lines can be invoiced again.");
    expect(voidHelpText({ externalId: null, syncStatus: "not_synced", xeroLive: true })).toBe("The receipt lines can be invoiced again.");
  });
});
