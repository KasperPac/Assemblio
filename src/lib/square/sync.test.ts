import { describe, expect, it } from "vitest";
import { squarePages, squareOrderSearchStart } from "./sync";

describe("Square reconciliation pagination", () => {
  it("walks every page", async () => expect(await squarePages(async (cursor) => cursor ? { rows: [2] } : { rows: [1], cursor: "next" })).toEqual([1, 2]));
  it("rejects repeated cursors instead of hanging or applying partial data", async () => await expect(squarePages(async () => ({ rows: [1], cursor: "loop" }))).rejects.toThrow("repeated"));
  it("rejects a truncated walk", async () => await expect(squarePages(async () => ({ rows: [1], cursor: "next" }), 1)).rejects.toThrow("page budget"));
});

describe("Square incremental sales window", () => {
  const now = Date.parse("2026-10-12T01:00:00Z");
  it("does not import old sales before opening stock is confirmed", () => expect(squareOrderSearchStart(null, null, now)).toBe("2026-10-12T01:00:00.000Z"));
  it("keeps a four-day overlap for delayed POS uploads without re-reading all history", () => {
    expect(squareOrderSearchStart("2026-09-01T00:00:00Z", "2026-10-12T00:00:00Z", now)).toBe("2026-10-08T00:00:00.000Z");
  });
  it("never moves the search earlier than the opening baseline", () => expect(squareOrderSearchStart("2026-10-11T00:00:00Z", "2026-10-12T00:00:00Z", now)).toBe("2026-10-11T00:00:00.000Z"));
});
