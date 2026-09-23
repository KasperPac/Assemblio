import { describe, expect, it } from "vitest";
import { assertNoError } from "./sync";

/**
 * Regression cover for MANUVA-16: the Shopify sync called
 * generate_job_financial_plan without reading the returned `error`, so a
 * failing RPC counted as a successful run and the sync reported
 * plan_errors: 0 while writing no cost snapshots at all.
 */
describe("assertNoError", () => {
  it("passes through when there is no error", () => {
    expect(() => assertNoError(null, "context")).not.toThrow();
  });

  it("throws when supabase returns an error object", () => {
    expect(() => assertNoError({ message: "No tenant context for user" }, "generate_job_financial_plan")).toThrow(
      "generate_job_financial_plan: No tenant context for user"
    );
  });

  it("throws even when the error carries no message", () => {
    expect(() => assertNoError({}, "generate_job_financial_plan")).toThrow(
      "generate_job_financial_plan: Unknown Supabase error"
    );
  });

  it("treats an empty-string message as an error, not a success", () => {
    expect(() => assertNoError({ message: "" }, "ctx")).toThrow("ctx: Unknown Supabase error");
  });
});
