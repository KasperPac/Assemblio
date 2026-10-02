import type { ComponentType } from "react";
import PurchasingAndXeroDiagram from "./purchasing-and-xero";

/**
 * One drawing per manual for its "How it fits together" section, keyed by the
 * manual's slug and used in MDX as <Diagram name="<slug>" caption="…" />.
 * Drawings are SVG components coloured only with design tokens.
 */
export const DIAGRAMS: Record<string, ComponentType> = {
  "purchasing-and-xero": PurchasingAndXeroDiagram,
};
