import { createHmac, timingSafeEqual } from "crypto";

export type PendingInstall = {
  shop: string;
  accessToken: string;
  scopes: string;
  refreshToken: string | null;
  expiresInSeconds: number | null;
};

const TTL_MS = 10 * 60 * 1000;

export function signPendingInstall(
  shop: string,
  accessToken: string,
  scopes: string,
  refreshToken: string | null = null,
  expiresInSeconds: number | null = null
): string {
  const payload = {
    shop,
    accessToken,
    scopes,
    refreshToken,
    expiresInSeconds,
    exp: Date.now() + TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const secret = process.env.SHOPIFY_API_SECRET ?? "";
  const sig = createHmac("sha256", secret).update(encoded).digest("hex");
  return `${encoded}.${sig}`;
}

export function verifyPendingInstall(cookie: string): PendingInstall | null {
  const dotIndex = cookie.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const encoded = cookie.slice(0, dotIndex);
  const receivedSig = cookie.slice(dotIndex + 1);
  if (!encoded || !receivedSig) return null;

  const secret = process.env.SHOPIFY_API_SECRET ?? "";
  const expectedSig = createHmac("sha256", secret).update(encoded).digest("hex");

  const a = Buffer.from(expectedSig, "hex");
  const b = Buffer.from(receivedSig, "hex");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  let payload: {
    shop?: string;
    accessToken?: string;
    scopes?: string;
    refreshToken?: string | null;
    expiresInSeconds?: number | null;
    exp?: number;
  };
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload.shop !== "string" || !payload.shop) return null;
  if (typeof payload.accessToken !== "string" || !payload.accessToken) return null;
  if (typeof payload.exp !== "number") return null;
  if (payload.exp < Date.now()) return null;

  return {
    shop: payload.shop,
    accessToken: payload.accessToken,
    scopes: payload.scopes ?? "",
    refreshToken: payload.refreshToken ?? null,
    expiresInSeconds: payload.expiresInSeconds ?? null,
  };
}
