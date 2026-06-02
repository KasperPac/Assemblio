import { describe, it, expect, vi, beforeEach } from "vitest";

// Reset modules between tests to clear the module-level token cache.
// IMPORTANT: `searchComponentImage` must be imported with dynamic `await import("./client")`
// inside each test body — NOT at the top of the file. A top-level import runs before any
// beforeEach and captures the stale module reference, breaking cache isolation.
beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  // Set dummy env vars so the early credential check in getToken() doesn't throw.
  // Individual tests mock fetch to control what the token endpoint returns.
  process.env.NEXAR_CLIENT_ID = "test-client-id";
  process.env.NEXAR_CLIENT_SECRET = "test-client-secret";
});

describe("searchComponentImage", () => {
  it("returns found:true with image data when Nexar returns a matching part", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("identity.nexar.com")) {
        return new Response(
          JSON.stringify({ access_token: "test-token", expires_in: 86400 }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            supSearch: {
              results: [
                {
                  part: {
                    bestImage: { url: "https://cdn.nexar.com/images/part.jpg" },
                    manufacturer: { name: "YAGEO" },
                    mpn: "RC0402FR-0710KL",
                  },
                },
              ],
            },
          },
        }),
        { status: 200 }
      );
    });

    const { searchComponentImage } = await import("./client");
    const result = await searchComponentImage("RC0402FR-0710KL YAGEO");

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.imageUrl).toBe("https://cdn.nexar.com/images/part.jpg");
      expect(result.manufacturer).toBe("YAGEO");
      expect(result.mpn).toBe("RC0402FR-0710KL");
    }
  });

  it("returns found:false / no_results when supSearch returns empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("identity.nexar.com")) {
        return new Response(
          JSON.stringify({ access_token: "test-token", expires_in: 86400 }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({ data: { supSearch: { results: [] } } }),
        { status: 200 }
      );
    });

    const { searchComponentImage } = await import("./client");
    const result = await searchComponentImage("NONEXISTENT-PART-XYZ");

    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.reason).toBe("no_results");
    }
  });

  it("returns found:false / api_error when the token request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Unauthorized", { status: 401 })
    );

    const { searchComponentImage } = await import("./client");
    const result = await searchComponentImage("anything");

    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.reason).toBe("api_error");
    }
  });
});
