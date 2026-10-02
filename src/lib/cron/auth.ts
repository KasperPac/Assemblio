import { timingSafeEqual } from "node:crypto";

/**
 * Bearer-token check for cron routes. Fails closed when CRON_SECRET is unset
 * or empty. The comparison is constant-time over equal-length buffers.
 */
export function isAuthorisedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}
