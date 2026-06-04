import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expiresAtFrom, refreshAccessToken, getValidAccessToken } from "./token-refresh";

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

describe("getValidAccessToken — app-aware refresh", () => {
  // Fake admin client routing by table; store reports app_id, token is expired.
  function makeAdmin(appId: string) {
    return {
      from(table: string) {
        if (table === "shopify_store") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: "store1", app_id: appId },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        // shopify_install_tokens: expired token with a refresh_token
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  access_token: "old_access",
                  refresh_token: "rt_old",
                  scopes: "read_orders,read_products",
                  expires_at: "2000-01-01T00:00:00.000Z",
                },
                error: null,
              }),
            }),
          }),
          upsert: async () => ({ data: null, error: null }),
        };
      },
    } as unknown as SupabaseClient;
  }

  const ENV = {
    SHOPIFY_API_KEY: "public-key",
    SHOPIFY_API_SECRET: "public-secret",
    SHOPIFY_UNLISTED_API_KEY: "unlisted-key",
    SHOPIFY_UNLISTED_API_SECRET: "unlisted-secret",
    NEXT_PUBLIC_APP_URL: "https://app.manuva.app",
  };
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const [k, v] of Object.entries(ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
  });
  afterEach(() => {
    for (const k of Object.keys(ENV)) process.env[k] = saved[k];
  });

  it("refreshes an unlisted-app token using the unlisted app's client credentials", async () => {
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

    const admin = makeAdmin("unlisted");
    const result = await getValidAccessToken(admin, "tenant1", "fab.myshopify.com");

    expect(result.accessToken).toBe("shpat_new");
    expect(result.refreshed).toBe(true);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.client_id).toBe("unlisted-key");
    expect(body.client_secret).toBe("unlisted-secret");
    expect(body.grant_type).toBe("refresh_token");
  });

  it("refreshes a public-app token using the public app's client credentials", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "shpat_pub", refresh_token: "rt_new", expires_in: 86400 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const admin = makeAdmin("public");
    await getValidAccessToken(admin, "tenant1", "store.myshopify.com");

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.client_id).toBe("public-key");
  });
});
