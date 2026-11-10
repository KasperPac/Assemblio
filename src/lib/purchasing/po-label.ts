/** How a purchase order is named on screen and in Xero: its number, else a short id (as the PO detail page does). */
export function poLabel(po: { id: string; po_number: string | null | undefined }): string {
  const n = po.po_number?.trim();
  return n ? n : `PO-${po.id.slice(0, 8).toUpperCase()}`;
}
