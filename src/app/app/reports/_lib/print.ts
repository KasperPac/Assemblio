import { fmtDisplay } from "./date-range";

type ThemeRoot = {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

/**
 * Runs the browser's print dialog with the Daylight theme forced on, so a
 * Midnight-mode user doesn't get a page of black ink. The attribute is
 * restored (or removed) once the dialog is dismissed, even if print throws.
 */
export function printWithLightTheme(root: ThemeRoot, print: () => void) {
  const previous = root.getAttribute("data-theme");
  root.setAttribute("data-theme", "light");
  try {
    print();
  } finally {
    if (previous === null) root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", previous);
  }
}

/** Human label for the report's date range, for the printed header. */
export function rangeLabel(sp: { from?: string; to?: string }): string {
  const from = sp.from ? new Date(sp.from) : null;
  const to = sp.to ? new Date(sp.to) : null;
  const ok = (d: Date | null): d is Date => !!d && !isNaN(d.getTime());
  if (ok(from) && ok(to)) return `${fmtDisplay(from)} – ${fmtDisplay(to)}`;
  if (ok(from)) return `From ${fmtDisplay(from)}`;
  if (ok(to)) return `Up to ${fmtDisplay(to)}`;
  return "All time";
}
