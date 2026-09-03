/**
 * Staffing hour arithmetic and form parsing.
 *
 * Extracted from src/app/app/staffing/actions.ts so it can be tested: a
 * "use server" module may only export async functions, so helpers living
 * there were unreachable from a test.
 */

/** Parse an hours field, falling back when blank or not a finite number. */
export function parseHours(
  value: FormDataEntryValue | null,
  fallback = 0
): number {
  const raw = value?.toString().trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Same, but a blank or unparseable value means "not set" rather than 0. */
export function parseNullableHours(
  value: FormDataEntryValue | null
): number | null {
  const raw = value?.toString().trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseCheckbox(value: FormDataEntryValue | null): boolean {
  return value === "on";
}

/**
 * Hours a staff member is actually available to produce in a week.
 *
 * Overtime adds; leave, training and non-productive time subtract. The
 * result is intentionally not clamped at zero — a negative figure means
 * more time has been booked away than the contract covers, and that should
 * surface on the capacity screen rather than be silently hidden.
 */
export function netAvailableHours(
  contracted: number,
  leave: number,
  training: number,
  nonProductive: number,
  overtime: number
): number {
  return contracted - leave - training - nonProductive + overtime;
}
