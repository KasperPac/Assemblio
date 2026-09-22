/**
 * Parsing and validation for a manual actual-time entry.
 *
 * Extracted from src/app/app/actual-time/actions.ts so it can be tested: a
 * "use server" module may only export async functions, so these helpers were
 * unreachable from a test. The action keeps the RPC call and redirects.
 */

/** Parse an hours field. Blank, missing or unparseable means "not given". */
export function parseEntryHours(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const parsed = Number(value.toString());
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

/**
 * Normalise a datetime-local field to an ISO string, or null when absent or
 * unparseable. A bad timestamp is dropped rather than rejected: start/end are
 * optional context on the entry, and the hours figure is what actually counts.
 */
export function parseEntryTimestamp(value: FormDataEntryValue | null): string | null {
  const raw = value?.toString().trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export type ActualTimeEntryInput = {
  orderLineId?: string | null;
  departmentId?: string | null;
  hours: number | null;
};

export type ActualTimeValidation =
  | { ok: true }
  | { ok: false; error: string };

/**
 * An entry must name the job line and the department that did the work, and
 * book a positive number of hours. Zero and negative are rejected: they would
 * pollute job costing and department utilisation with entries that mean
 * nothing, and a negative reversal is not a thing this form supports.
 */
export function validateActualTimeEntry(
  input: ActualTimeEntryInput
): ActualTimeValidation {
  if (!input.orderLineId || !input.departmentId) {
    return { ok: false, error: "Order line and department are required." };
  }
  if (input.hours === null || !Number.isFinite(input.hours) || input.hours <= 0) {
    return { ok: false, error: "Hours must be greater than zero." };
  }
  return { ok: true };
}
