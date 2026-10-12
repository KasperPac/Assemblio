export const AWAITING_PO_STATUSES = ["open", "in_transit"] as const;
const OPEN_STEP_STATUSES = new Set(["active", "queued", "blocked"]);
export const DEFAULT_BAND_TIMEZONE = "Australia/Sydney";

/** Count the components flagged by the balance table, once across locations. */
export function countBelowReorderComponents(
  rows: Array<{ componentId: string | null; onHand: number; reorderPoint: number | null }>,
) {
  return new Set(rows.filter((row) => row.componentId && row.onHand < Number(row.reorderPoint ?? 0))
    .map((row) => row.componentId)).size;
}

/** A production job is an order line, even when several departments have steps. */
export function countOpenProductionJobs(rows: Array<{ order_line_id: string; status: string }>) {
  return new Set(rows.filter((row) => OPEN_STEP_STATUSES.has(row.status)).map((row) => row.order_line_id)).size;
}

export function isAwaitingReceipt(status: string) {
  return AWAITING_PO_STATUSES.some((value) => value === status);
}

export function resolveBandTimezone(timezone: string | null | undefined) {
  const candidate = timezone || DEFAULT_BAND_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return DEFAULT_BAND_TIMEZONE;
  }
}

export function tenantDateKey(value: Date | string, timezone: string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: resolveBandTimezone(timezone), year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftedDateKey(key: string, days: number) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Resolve local midnight rather than assuming every calendar day lasts 24h. */
function localMidnight(key: string, timezone: string) {
  const target = new Date(`${key}T00:00:00Z`).getTime();
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: resolveBandTimezone(timezone), year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  for (let i = 0; i < 4; i++) {
    const parts = formatter.formatToParts(new Date(instant));
    const part = (type: string) => Number(parts.find((entry) => entry.type === type)!.value);
    const represented = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
    const correction = target - represented;
    instant += correction;
    if (!correction) break;
  }
  return new Date(instant).toISOString();
}

export function tenantDayBounds(now: Date, timezone: string) {
  const today = tenantDateKey(now, timezone)!;
  return { start: localMidnight(today, timezone), end: localMidnight(shiftedDateKey(today, 1), timezone) };
}

export function deliveryComparisonBounds(now: Date) {
  const windowMs = 90 * 24 * 60 * 60 * 1000;
  return {
    currentStart: new Date(now.getTime() - windowMs).toISOString(),
    previousStart: new Date(now.getTime() - 2 * windowMs).toISOString(),
    end: now.toISOString(),
  };
}

export type DeliveryMetricRow = {
  received_at: string;
  status: string;
  purchase_order: { expected_date: string | null } | Array<{ expected_date: string | null }> | null;
};

/** Scheduled, processed PO-linked receipts only; missing dates are not successes. */
export function onTimeDeliveryComparison(
  rows: DeliveryMetricRow[], now: Date, timezone: string,
) {
  const bounds = deliveryComparisonBounds(now);
  const current = { eligible: 0, onTime: 0 };
  const previous = { eligible: 0, onTime: 0 };
  for (const row of rows) {
    if (row.status !== "po_linked" && row.status !== "discrepancy") continue;
    const po = Array.isArray(row.purchase_order) ? row.purchase_order[0] : row.purchase_order;
    const expectedDay = po?.expected_date ? tenantDateKey(po.expected_date, timezone) : null;
    const receivedDay = tenantDateKey(row.received_at, timezone);
    const received = new Date(row.received_at).getTime();
    if (!expectedDay || !receivedDay || received >= now.getTime()) continue;
    const period = received >= Date.parse(bounds.currentStart) ? current
      : received >= Date.parse(bounds.previousStart) ? previous : null;
    if (!period) continue;
    period.eligible++;
    if (receivedDay <= expectedDay) period.onTime++;
  }
  const percent = (period: typeof current) => period.eligible ? Math.round(period.onTime / period.eligible * 100) : null;
  const currentPercent = percent(current);
  const previousPercent = percent(previous);
  return {
    currentPercent, previousPercent, eligibleReceipts: current.eligible,
    deltaPoints: currentPercent != null && previousPercent != null ? currentPercent - previousPercent : null,
  };
}
