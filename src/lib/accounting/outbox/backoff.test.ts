import { describe, expect, it } from "vitest";
import { nextAttemptAt, nextUtcMidnight } from "./backoff";

const t0 = new Date("2026-10-01T00:00:00Z");
const min = (n: number) => n * 60_000;

describe("nextAttemptAt", () => {
  it("follows 1m, 5m, 15m, 1h", () => {
    expect(nextAttemptAt(1, t0, t0, null)!.getTime() - t0.getTime()).toBe(min(1));
    expect(nextAttemptAt(2, t0, t0, null)!.getTime() - t0.getTime()).toBe(min(5));
    expect(nextAttemptAt(3, t0, t0, null)!.getTime() - t0.getTime()).toBe(min(15));
    expect(nextAttemptAt(4, t0, t0, null)!.getTime() - t0.getTime()).toBe(min(60));
  });
  it("uses Retry-After when present", () => {
    expect(nextAttemptAt(5, t0, t0, 20)!.getTime() - t0.getTime()).toBe(20_000);
  });
  it("gives up once the next attempt would pass 24h from the first", () => {
    const late = new Date(t0.getTime() + min(23 * 60));
    expect(nextAttemptAt(7, t0, late, null)).toBeNull();
  });
});

describe("nextUtcMidnight", () => {
  it("rolls to the next UTC day", () => {
    expect(nextUtcMidnight(new Date("2026-10-01T13:45:00Z")).toISOString()).toBe("2026-10-02T00:00:00.000Z");
  });
});
