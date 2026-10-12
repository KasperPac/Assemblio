import { createHmac, timingSafeEqual } from "node:crypto";

/** Square signs the EXACT registered notification URL concatenated with the raw UTF-8 body. */
export function verifySquareWebhookSignature(rawBody: string, signature: string | null, signatureKey: string, notificationUrl: string): boolean {
  if (!signatureKey || !notificationUrl || !signature || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = createHmac("sha256", signatureKey).update(notificationUrl).update(rawBody).digest();
  const actual = Buffer.from(signature, "base64");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
