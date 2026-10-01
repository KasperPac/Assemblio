import { describe, expect, it } from "vitest";
import { scrubSecrets } from "./scrub";

describe("scrubSecrets", () => {
  it("redacts secret-named keys at any depth", () => {
    expect(scrubSecrets({ a: { access_token: "x", Authorization: "Bearer y", ok: 1 } })).toEqual({ a: { access_token: "[redacted]", Authorization: "[redacted]", ok: 1 } });
  });
  it("redacts bearer strings and JWT-shaped strings inside text", () => {
    const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlLXZhbHVl";
    expect(scrubSecrets(`failed with Bearer abc.def and ${jwt}`)).toBe("failed with Bearer [redacted] and [redacted-jwt]");
  });
  it("leaves ordinary values alone", () => {
    expect(scrubSecrets(["x", 2, null, { Message: "Account code '300' is not valid" }])).toEqual(["x", 2, null, { Message: "Account code '300' is not valid" }]);
  });
});
