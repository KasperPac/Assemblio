import { describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import {
  SessionTokenError,
  extractBearerToken,
  verifyShopifySessionToken,
  type ShopifySessionTokenClaims,
} from "./session-token";

const API_KEY = "test-api-key";
const API_SECRET = "test-api-secret";

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signJwt(
  claims: Partial<ShopifySessionTokenClaims>,
  opts: { alg?: string; secret?: string } = {}
): string {
  const header = base64url(JSON.stringify({ alg: opts.alg ?? "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify(claims));
  const signature = createHmac("sha256", opts.secret ?? API_SECRET)
    .update(`${header}.${payload}`)
    .digest();
  return `${header}.${payload}.${base64url(signature)}`;
}

function validClaims(overrides: Partial<ShopifySessionTokenClaims> = {}): ShopifySessionTokenClaims {
  const now = 1_700_000_000;
  return {
    iss: "https://demo.myshopify.com/admin",
    dest: "https://demo.myshopify.com",
    aud: API_KEY,
    sub: "user_42",
    exp: now + 60,
    nbf: now - 5,
    iat: now,
    jti: "uuid-1",
    sid: "sid-1",
    ...overrides,
  };
}

const NOW = 1_700_000_000;

describe("verifyShopifySessionToken", () => {
  it("verifies a well-formed token and returns the shop + claims", () => {
    const token = signJwt(validClaims());
    const result = verifyShopifySessionToken(token, {
      apiKey: API_KEY,
      apiSecret: API_SECRET,
      nowSeconds: NOW,
    });
    expect(result.shop).toBe("demo.myshopify.com");
    expect(result.claims.sub).toBe("user_42");
  });

  it("rejects tokens signed with a different secret", () => {
    const token = signJwt(validClaims(), { secret: "wrong-secret" });
    expect(() =>
      verifyShopifySessionToken(token, {
        apiKey: API_KEY,
        apiSecret: API_SECRET,
        nowSeconds: NOW,
      })
    ).toThrowError(/bad-signature/);
  });

  it("rejects expired tokens beyond clock skew", () => {
    const token = signJwt(validClaims({ exp: NOW - 100, nbf: NOW - 200 }));
    expect(() =>
      verifyShopifySessionToken(token, {
        apiKey: API_KEY,
        apiSecret: API_SECRET,
        nowSeconds: NOW,
      })
    ).toThrowError(/expired/);
  });

  it("allows 5s clock skew on exp", () => {
    const token = signJwt(validClaims({ exp: NOW - 3, nbf: NOW - 60 }));
    const result = verifyShopifySessionToken(token, {
      apiKey: API_KEY,
      apiSecret: API_SECRET,
      nowSeconds: NOW,
    });
    expect(result.shop).toBe("demo.myshopify.com");
  });

  it("rejects tokens not yet valid (nbf > now beyond skew)", () => {
    const token = signJwt(validClaims({ nbf: NOW + 100, exp: NOW + 200 }));
    expect(() =>
      verifyShopifySessionToken(token, {
        apiKey: API_KEY,
        apiSecret: API_SECRET,
        nowSeconds: NOW,
      })
    ).toThrowError(/not-yet-valid/);
  });

  it("rejects aud mismatch", () => {
    const token = signJwt(validClaims({ aud: "different-api-key" }));
    expect(() =>
      verifyShopifySessionToken(token, {
        apiKey: API_KEY,
        apiSecret: API_SECRET,
        nowSeconds: NOW,
      })
    ).toThrowError(/aud-mismatch/);
  });

  it("rejects iss/dest hostname mismatch", () => {
    const token = signJwt(
      validClaims({ iss: "https://evil.myshopify.com/admin", dest: "https://demo.myshopify.com" })
    );
    expect(() =>
      verifyShopifySessionToken(token, {
        apiKey: API_KEY,
        apiSecret: API_SECRET,
        nowSeconds: NOW,
      })
    ).toThrowError(/iss-dest-host-mismatch/);
  });

  it("rejects non-myshopify.com hosts", () => {
    const token = signJwt(
      validClaims({ iss: "https://evil.com/admin", dest: "https://evil.com" })
    );
    expect(() =>
      verifyShopifySessionToken(token, {
        apiKey: API_KEY,
        apiSecret: API_SECRET,
        nowSeconds: NOW,
      })
    ).toThrowError(/not-a-shopify-shop/);
  });

  it("rejects non-HS256 algorithms (alg confusion guard)", () => {
    const token = signJwt(validClaims(), { alg: "none" });
    expect(() =>
      verifyShopifySessionToken(token, {
        apiKey: API_KEY,
        apiSecret: API_SECRET,
        nowSeconds: NOW,
      })
    ).toThrowError(/unsupported-alg/);
  });

  it("rejects malformed tokens", () => {
    expect(() =>
      verifyShopifySessionToken("not.a.real.jwt.token", {
        apiKey: API_KEY,
        apiSecret: API_SECRET,
        nowSeconds: NOW,
      })
    ).toThrowError(/malformed-jwt/);
  });

  it("rejects empty input", () => {
    expect(() => verifyShopifySessionToken("")).toThrow(SessionTokenError);
  });

  it("uses env vars when options not supplied", () => {
    const prevKey = process.env.SHOPIFY_API_KEY;
    const prevSecret = process.env.SHOPIFY_API_SECRET;
    process.env.SHOPIFY_API_KEY = API_KEY;
    process.env.SHOPIFY_API_SECRET = API_SECRET;
    try {
      const token = signJwt(validClaims());
      const result = verifyShopifySessionToken(token, { nowSeconds: NOW });
      expect(result.shop).toBe("demo.myshopify.com");
    } finally {
      process.env.SHOPIFY_API_KEY = prevKey;
      process.env.SHOPIFY_API_SECRET = prevSecret;
    }
  });
});

describe("extractBearerToken", () => {
  it("returns the token from a Bearer header", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(extractBearerToken("  Bearer  abc.def.ghi  ")).toBe("abc.def.ghi");
    expect(extractBearerToken("bearer lowercase")).toBe("lowercase");
  });

  it("returns null for missing or malformed headers", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Basic abc")).toBeNull();
  });
});
