import { randomBytes } from "node:crypto";

export function generateToken(): string {
  // 32 random bytes → ~43 base64url chars. Cryptographically random,
  // URL-safe, and impossible to guess.
  return randomBytes(32).toString("base64url");
}
