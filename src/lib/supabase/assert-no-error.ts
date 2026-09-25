// supabase-js resolves `.rpc()` and query builders with `{ data, error }`;
// it does not throw. An unchecked call looks like success — that is how
// MANUVA-16 reported plan_errors: 0 for months while writing nothing.
export function assertNoError(
  error: { message?: string } | null,
  context: string
) {
  if (!error) return;
  // `||` not `??`: an error object with an empty message is still a failure,
  // and "context: " alone tells a reader nothing.
  throw new Error(`${context}: ${error.message || "Unknown Supabase error"}`);
}
