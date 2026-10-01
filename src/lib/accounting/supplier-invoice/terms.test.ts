import { describe, expect, it } from "vitest";
import { dueDateFromTerms } from "./terms";

describe("dueDateFromTerms", () => {
  it.each([
    ["Net 30", "2026-10-31"],
    ["30 days", "2026-10-31"],
    ["14", "2026-10-15"],
    ["EOM", "2026-10-31"],
    ["30 EOM", "2026-11-30"],
    ["20 days EOM", "2026-11-20"],
    ["COD", "2026-10-31"],
    [null, "2026-10-31"],
  ])("%s from 2026-10-01 → %s", (terms, due) => {
    expect(dueDateFromTerms("2026-10-01", terms)).toBe(due);
  });
  it("handles month ends and leap years", () => {
    expect(dueDateFromTerms("2028-02-10", "EOM")).toBe("2028-02-29");
    expect(dueDateFromTerms("2026-01-31", "Net 30")).toBe("2026-03-02");
  });
});
