import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { exchangeSessionTokenForOfflineAccessToken } from "./token-exchange";

const API_KEY = "test-api-key";
const API_SECRET = "test-api-secret";
const SHOP = "demo.myshopify.com";
const SESSION_TOKEN = "session.token.value";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("exchangeSessionTokenForOfflineAccessToken", () => {
  it("posts the correct token-exchange grant and returns the access token", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "shpat_abc123",
          scope: "read_orders,read_products",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await exchangeSessionTokenForOfflineAccessToken(SHOP, SESSION_TOKEN, {
      apiKey: API_KEY,
      apiSecret: API_SECRET,
    });

    expect(result.accessToken).toBe("shpat_abc123");
    expect(result.scope).toBe("read_orders,read_products");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://${SHOP}/admin/oauth/access_token`);
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      client_id: API_KEY,
      client_secret: API_SECRET,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: SESSION_TOKEN,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
    });
  });

  it("throws on non-2xx response with status + body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("invalid_request", { status: 400 })
    );

    await expect(
      exchangeSessionTokenForOfflineAccessToken(SHOP, SESSION_TOKEN, {
        apiKey: API_KEY,
        apiSecret: API_SECRET,
      })
    ).rejects.toThrowError(/token-exchange failed \(400\): invalid_request/);
  });

  it("throws when response is missing access_token or scope", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "shpat_abc" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(
      exchangeSessionTokenForOfflineAccessToken(SHOP, SESSION_TOKEN, {
        apiKey: API_KEY,
        apiSecret: API_SECRET,
      })
    ).rejects.toThrowError(/malformed response/);
  });

  it("throws when credentials are missing entirely", async () => {
    await expect(
      exchangeSessionTokenForOfflineAccessToken(SHOP, SESSION_TOKEN, {
        apiKey: "",
        apiSecret: "",
      })
    ).rejects.toThrowError(/missing SHOPIFY_API_KEY or SHOPIFY_API_SECRET/);
  });
});
