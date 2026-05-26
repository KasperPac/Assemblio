import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { expiresAtFrom, refreshAccessToken } from "./token-refresh";

const API_KEY = "test-api-key";
const API_SECRET = "test-api-secret";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("expiresAtFrom", () => {
  it("returns null when no value provided", () => {
    expect(expiresAtFrom(undefined)).toBeNull();
    expect(expiresAtFrom(0)).toBeNull();
  });

  it("subtracts 60s of safety margin and returns an ISO string", () => {
    const now = new Date("2026-05-26T00:00:00Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);

    const result = expiresAtFrom(86400);
    expect(result).toBe(new Date(now + (86400 - 60) * 1000).toISOString());

    vi.restoreAllMocks();
  });
});

describe("refreshAccessToken", () => {
  it("posts the refresh_token grant and returns the new token set", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "shpat_new",
          refresh_token: "rt_new",
          expires_in: 86400,
          scope: "read_orders,read_products",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await refreshAccessToken("demo.myshopify.com", "rt_old", {
      apiKey: API_KEY,
      apiSecret: API_SECRET,
    });

    expect(result).toEqual({
      access_token: "shpat_new",
      refresh_token: "rt_new",
      expires_in: 86400,
      scope: "read_orders,read_products",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://demo.myshopify.com/admin/oauth/access_token");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      client_id: API_KEY,
      client_secret: API_SECRET,
      grant_type: "refresh_token",
      refresh_token: "rt_old",
    });
  });

  it("throws when Shopify returns non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response("invalid_grant", { status: 400 }));

    await expect(
      refreshAccessToken("demo.myshopify.com", "rt_old", {
        apiKey: API_KEY,
        apiSecret: API_SECRET,
      })
    ).rejects.toThrowError(/token-refresh failed \(400\)/);
  });

  it("throws when credentials are missing", async () => {
    await expect(
      refreshAccessToken("demo.myshopify.com", "rt_old", {
        apiKey: "",
        apiSecret: "",
      })
    ).rejects.toThrowError(/missing SHOPIFY_API_KEY/);
  });
});
