/**
 * The supplier-currency warning applies only when a Xero bill will actually be posted, i.e. when Xero's
 * base currency is known. Without Xero there is no bill, so the warning would be false.
 * Returns the two currencies to name in the warning, or null for no warning.
 */
export function currencyMismatch(
  supplierCurrency: string | null | undefined,
  xeroBaseCurrency: string | null | undefined,
): { supplier: string; xero: string } | null {
  if (!supplierCurrency || !xeroBaseCurrency) return null;
  if (supplierCurrency === xeroBaseCurrency) return null;
  return { supplier: supplierCurrency, xero: xeroBaseCurrency };
}
