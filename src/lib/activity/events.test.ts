import { describe, expect, it } from "vitest";
import { ACTIVITY_EVENTS } from "./events";

describe("ACTIVITY_EVENTS catalog", () => {
  it("every event produces a non-empty summary string", () => {
    for (const [key, def] of Object.entries(ACTIVITY_EVENTS)) {
      const summary = def.summary({ name: "X", poNumber: "PO-1", email: "a@b.c", version: 2 });
      expect(typeof summary, key).toBe("string");
      expect(summary.length, key).toBeGreaterThan(0);
    }
  });

  it("entityType is a non-empty string or null", () => {
    for (const [key, def] of Object.entries(ACTIVITY_EVENTS)) {
      if (def.entityType !== null) {
        expect(def.entityType.length, key).toBeGreaterThan(0);
      }
    }
  });
});
