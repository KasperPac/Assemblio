import type { MDXComponents } from "mdx/types";
import { helpMdxComponents } from "@/components/help/mdx-map";

// Required by @next/mdx in the App Router: every imported .mdx file renders with these.
export function useMDXComponents(components: MDXComponents = {}): MDXComponents {
  return { ...helpMdxComponents, ...components };
}
