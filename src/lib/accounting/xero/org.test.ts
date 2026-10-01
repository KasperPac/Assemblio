import { describe, expect, it } from "vitest";
import { accountOptions, INVENTORY_ACCOUNT_TYPES, lockDateBlocking, OTHER_CHARGE_ACCOUNT_TYPES, parseXeroDate, purchaseTaxOptions } from "./org";

const accounts = [
  { AccountID: "a1", Code: "630", Name: "Inventory", Type: "CURRENT", Status: "ACTIVE" },
  { AccountID: "a2", Code: "631", Name: "Tracked inv", Type: "INVENTORY", Status: "ACTIVE" },
  { AccountID: "a3", Code: "425", Name: "Freight", Type: "EXPENSE", Status: "ACTIVE" },
  { AccountID: "a4", Code: "310", Name: "Old COGS", Type: "DIRECTCOSTS", Status: "ARCHIVED" },
  { AccountID: "a5", Name: "No code", Type: "CURRENT", Status: "ACTIVE" },
];

describe("org helpers", () => {
  it("inventory options are active CURRENT accounts with codes, never INVENTORY type", () => {
    expect(accountOptions(accounts, INVENTORY_ACCOUNT_TYPES).map((a) => a.code)).toEqual(["630"]);
  });
  it("other-charge options are active expense-like accounts", () => {
    expect(accountOptions(accounts, OTHER_CHARGE_ACCOUNT_TYPES).map((a) => a.code)).toEqual(["425"]);
  });
  it("purchase tax options exclude inactive and sales-only", () => {
    const rates = [
      { TaxType: "INPUT", Name: "GST on Expenses", Status: "ACTIVE", CanApplyToExpenses: true, EffectiveRate: "10.0000" },
      { TaxType: "OUTPUT", Name: "GST on Income", Status: "ACTIVE", CanApplyToExpenses: false, EffectiveRate: 10 },
      { TaxType: "EXEMPTEXPENSES", Name: "GST Free Expenses", Status: "ACTIVE", CanApplyToExpenses: true, EffectiveRate: 0 },
      { TaxType: "OLD", Name: "Old", Status: "DELETED", CanApplyToExpenses: true, EffectiveRate: 5 },
    ];
    expect(purchaseTaxOptions(rates)).toEqual([
      { taxType: "INPUT", name: "GST on Expenses", rate: 10 },
      { taxType: "EXEMPTEXPENSES", name: "GST Free Expenses", rate: 0 },
    ]);
  });
  it("parses Xero /Date()/ and ISO dates", () => {
    expect(parseXeroDate("/Date(1782777600000+0000)/")).toBe("2026-06-30");
    expect(parseXeroDate("2026-06-30T00:00:00")).toBe("2026-06-30");
    expect(parseXeroDate(null)).toBeNull();
  });
  it("rejects out-of-range epochs in /Date()/", () => {
    expect(parseXeroDate("/Date(100000000000000000000+0000)/")).toBeNull();
  });
  it("rejects impossible ISO dates", () => {
    expect(parseXeroDate("2026-13-45T00:00:00")).toBeNull();
  });
  it("blocks on or before the latest lock date", () => {
    const org = { PeriodLockDate: "/Date(1782777600000+0000)/", EndOfYearLockDate: "/Date(1751241600000+0000)/" };
    expect(lockDateBlocking("2026-06-30", org)).toBe("2026-06-30");
    expect(lockDateBlocking("2026-07-01", org)).toBeNull();
    expect(lockDateBlocking("2026-07-01", {})).toBeNull();
  });
});
