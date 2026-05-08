export type DateRange = { from: Date; to: Date };

function safeDate(s: string): Date | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function resolveDateRange(
  sp: { from?: string; to?: string },
  defaultDays = 30
): DateRange {
  const now = new Date();
  const to = sp.to ? (safeDate(sp.to) ?? now) : now;
  const from = sp.from
    ? (safeDate(sp.from) ?? new Date(now.getTime() - defaultDays * 24 * 60 * 60 * 1000))
    : new Date(now.getTime() - defaultDays * 24 * 60 * 60 * 1000);
  return { from, to };
}

export function fmtParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fmtDisplay(d: Date): string {
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
