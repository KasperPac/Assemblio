import { describe, expect, it } from "vitest";
import { getSupabaseProjectRef } from "./config";

describe("getSupabaseProjectRef", () => {
  it("prefers explicit SUPABASE_PROJECT_REF", () => {
    expect(
      getSupabaseProjectRef({
        SUPABASE_PROJECT_REF: "explicit-ref",
        NEXT_PUBLIC_SUPABASE_URL: "https://derived-ref.supabase.co",
      })
    ).toBe("explicit-ref");
  });

  it("derives the project ref from NEXT_PUBLIC_SUPABASE_URL", () => {
    expect(
      getSupabaseProjectRef({
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
      })
    ).toBe("abcdefghijklmnop");
  });

  it("returns null when neither source is available", () => {
    expect(getSupabaseProjectRef({})).toBeNull();
  });
});
