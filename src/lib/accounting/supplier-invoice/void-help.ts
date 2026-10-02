/** What the void dialog tells the user about Xero, by what has actually happened to the bill. */
export function voidHelpText(p: { externalId: string | null; syncStatus: string; xeroLive: boolean }): string {
  if (p.externalId) return "The bill is deleted or voided in Xero, and the receipt lines can be invoiced again.";
  if (p.xeroLive && (p.syncStatus === "queued" || p.syncStatus === "failed")) {
    return "Any bill already created in Xero is voided there too, and the receipt lines can be invoiced again.";
  }
  return "The receipt lines can be invoiced again.";
}
