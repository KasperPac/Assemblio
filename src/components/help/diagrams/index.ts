import type { ComponentType } from "react";
import GettingStartedDiagram from "./getting-started";
import ProductsAndBomsDiagram from "./products-and-boms";
import ComponentsAndTemplatesDiagram from "./components-and-templates";
import PurchasingAndXeroDiagram from "./purchasing-and-xero";

/**
 * One drawing per manual for its "How it fits together" section, keyed by the
 * manual's slug and used in MDX as <Diagram name="<slug>" caption="…" />.
 * Drawings are SVG components coloured only with design tokens.
 */
export const DIAGRAMS: Record<string, ComponentType> = {
  "getting-started": GettingStartedDiagram,
  "products-and-boms": ProductsAndBomsDiagram,
  "components-and-templates": ComponentsAndTemplatesDiagram,
  "purchasing-and-xero": PurchasingAndXeroDiagram,
};
