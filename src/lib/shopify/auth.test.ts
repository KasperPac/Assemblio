import { describe, expect, it, afterEach, vi } from "vitest";
import { isAcceptableAppUrl } from "./auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAcceptableAppUrl", () => {
  it("accepts HTTPS URLs in any environment", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isAcceptableAppUrl("https://app.manuva.app")).toBe(true);
    expect(isAcceptableAppUrl("https://app.manuva.app/")).toBe(true);
    expect(isAcceptableAppUrl("https://example.com:8443/sub")).toBe(true);
  });

  it("rejects HTTP URLs in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isAcceptableAppUrl("http://app.manuva.app")).toBe(false);
    expect(isAcceptableAppUrl("http://localhost:3000")).toBe(false);
  });

  it("accepts http://localhost and http://127.0.0.1 in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isAcceptableAppUrl("http://localhost:3000")).toBe(true);
    expect(isAcceptableAppUrl("http://127.0.0.1:3000")).toBe(true);
  });

  it("rejects non-localhost HTTP in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isAcceptableAppUrl("http://example.com")).toBe(false);
  });

  it("rejects empty or malformed URLs", () => {
    expect(isAcceptableAppUrl("")).toBe(false);
    expect(isAcceptableAppUrl("not-a-url")).toBe(false);
    expect(isAcceptableAppUrl("ftp://example.com")).toBe(false);
  });
});
