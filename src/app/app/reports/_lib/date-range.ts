export type DateRange = { from: Date; to: Date };

export function resolveDateRange(
  sp: { from?: string; to?: string },
  defaultDays = 30
): DateRange {
  const now = new Date();
  const to = sp.to ? new Date(sp.to) : now;
  const from = sp.from
    ? new Date(sp.from)
    : new Date(now.getTime() - defaultDays * 24 * 60 * 60 * 1000);
  return { from, to };
}

export function fmtParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fmtDisplay(d: Date): string {
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
