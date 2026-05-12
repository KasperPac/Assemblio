// Email tokens — must mirror the Daylight palette in
// C:/dev/manuva-tokens/Manuva Design System/colors_and_type.css.
// Email clients don't support CSS custom properties, so these are inlined.

export const COLOR = {
  bgPage: "#F8F7F5",
  bgCard: "#FFFFFF",
  inkStrong: "#1A1814",
  inkMuted: "#6B6560",
  inkFaint: "#9B9590",
  brand: "#6366F1",
  inkOnBrand: "#FFFFFF",
  stroke: "rgba(0, 0, 0, 0.08)",
} as const;

export const FONT = {
  body: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const;

export const SIZE = {
  cardMaxWidthPx: 560,
  cardPaddingPx: 32,
  cardRadiusPx: 12,
  logoWidthPx: 320,
} as const;
