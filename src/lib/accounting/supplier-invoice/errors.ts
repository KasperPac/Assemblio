const USER_CODES = new Set(["P0001", "P0002", "23505", "42501"]);
const RLS_TEXT = /row-level security/i;

type DbError = { code?: string; message?: string };

/**
 * Turns a Postgres error into something a user can act on. Only the SQL functions' own
 * messages (raised with a known errcode) pass through; anything else gets the fallback.
 * `ctx.invoiceNumber` names the invoice in the duplicate-number message.
 */
export function dbErrorMessage(error: DbError | null, fallback: string, ctx?: { invoiceNumber?: string }): string {
  if (!error) return fallback;
  const msg = (error.message ?? "").trim();
  if (error.code === "23505" && msg.includes("supplier_invoice_live_number_uq")) {
    return ctx?.invoiceNumber ? `You've already entered invoice ${ctx.invoiceNumber} for this supplier.` : "This supplier already has an invoice with that number.";
  }
  if (error.code === "55P03") return "This invoice is being sent to Xero right now. Try again in a minute.";
  if (error.code === "42501" && RLS_TEXT.test(msg)) return "You don't have access to do that.";
  if (USER_CODES.has(error.code ?? "") && msg && !msg.startsWith("duplicate key")) {
    const s = msg.charAt(0).toUpperCase() + msg.slice(1);
    return /[.!?]$/.test(s) ? s : `${s}.`;
  }
  return fallback;
}
