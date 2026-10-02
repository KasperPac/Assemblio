import type { MDXContent } from "mdx/types";
import type { ManualSlug } from "./manuals";

/**
 * Lazy loaders for each published manual's MDX. Kept apart from manuals.ts so
 * the registry stays importable in tests, which do not compile MDX.
 */
export const MANUAL_CONTENT: Partial<Record<ManualSlug, () => Promise<{ default: MDXContent }>>> = {
  "purchasing-and-xero": () => import("./purchasing-and-xero.mdx"),
};
