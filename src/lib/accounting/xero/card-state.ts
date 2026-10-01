// Pure display helpers for the Xero card on Settings > Integrations.

export type CardBadge = { variant: "default" | "success" | "warning"; label: string };

export function cardBadge(conn: { status: string; setup_completed_at: string | null } | null): CardBadge {
  if (!conn || conn.status === "disconnected") return { variant: "default", label: "Not connected" };
  if (conn.status === "needs_reconnect") return { variant: "warning", label: "Needs reconnect" };
  if (!conn.setup_completed_at) return { variant: "warning", label: "Finish setup" };
  return { variant: "success", label: "Connected" };
}

const GENERIC = "Something went wrong with Xero. Try again.";

const MESSAGES: Record<string, { text: string; error: boolean }> = {
  "setup-complete": { text: "Xero is set up. Posted supplier invoices will be sent as bills.", error: false },
  disconnected: { text: "Xero disconnected and Manuva's access revoked.", error: false },
  "disconnected-local": {
    text: "Disconnected in Manuva; remove Manuva in Xero → Connected apps if it still appears.",
    error: true,
  },
  error: { text: "The Xero connection didn't complete.", error: true },
};

const REASONS: Record<string, string> = {
  "not-admin": "Only admins can connect Xero.",
  "not-available": "Xero isn't available for this workspace yet.",
  "not-configured": "Xero isn't set up on this server yet.",
  "xero-denied": "Access was declined in Xero.",
  "xero-error": "Xero reported a problem. Try again.",
  "no-session": "Your session expired. Sign in and try again.",
  "bad-state": "The connection link was invalid. Start again.",
  expired: "The connection took too long. Start again.",
  "nonce-mismatch": "The connection was started in another browser. Start again.",
  "session-mismatch": "The connection was started by a different user or workspace.",
  "token-exchange": "Xero didn't issue access. Try again.",
  connections: "Couldn't read your Xero organisations. Try again.",
  "no-organisation": "No Xero organisation was found on that login.",
  "too-many-organisations": "That login has too many Xero organisations. Choose one when asked.",
  "organisation-read": "Couldn't read the Xero organisation. Try again.",
  "save-failed": "Couldn't save the connection. Try again.",
  "bad-organisation": "Choose one of the listed organisations.",
  "disconnect-failed": "Couldn't disconnect Xero. Try again.",
};

/** Banner text for the `xero=` / `reason=` redirect codes. Unknown codes get a generic message. */
export function redirectMessage(
  xeroParam: string | undefined,
  reason: string | undefined
): { text: string; error: boolean } | null {
  if (!xeroParam) return null;
  const base = Object.hasOwn(MESSAGES, xeroParam) ? MESSAGES[xeroParam] : { text: GENERIC, error: true };
  const extra = reason && Object.hasOwn(REASONS, reason) ? REASONS[reason] : null;
  return extra ? { text: `${base.text} ${extra}`, error: base.error } : base;
}
