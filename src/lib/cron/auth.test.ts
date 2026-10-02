import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorisedCron } from "./auth";

const req = (authorization?: string) =>
  new Request("http://x/api/cron/y", { headers: authorization ? { authorization } : {} });

afterEach(() => vi.unstubAllEnvs());

describe("isAuthorisedCron", () => {
  it("rejects everything when CRON_SECRET is unset or empty", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isAuthorisedCron(req("Bearer "))).toBe(false);
    expect(isAuthorisedCron(req())).toBe(false);
  });

  it("accepts only the exact bearer token", () => {
    vi.stubEnv("CRON_SECRET", "test-secret-value");
    expect(isAuthorisedCron(req("Bearer test-secret-value"))).toBe(true);
    expect(isAuthorisedCron(req("Bearer test-secret-valuX"))).toBe(false);
    expect(isAuthorisedCron(req("Bearer short"))).toBe(false);
    expect(isAuthorisedCron(req("test-secret-value"))).toBe(false);
    expect(isAuthorisedCron(req())).toBe(false);
  });
});
