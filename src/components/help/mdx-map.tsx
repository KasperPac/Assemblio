import type { MDXComponents } from "mdx/types";
import { isValidElement, type ReactNode } from "react";
import { slugify } from "@/lib/help/headings";
import { Callout } from "./callout";
import { Diagram } from "./diagram";
import { Screenshot } from "./screenshot";
import styles from "./prose.module.css";

/** Plain text of a React node, for building an anchor from heading children. */
export function textContent(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textContent(node.props.children);
  return "";
}

/** How MDX elements render in a help manual. Used by Next (src/mdx-components.tsx) and by the tests. */
export const helpMdxComponents: MDXComponents = {
  h2: ({ children }) => (
    <h2 id={slugify(textContent(children))} className={styles.h2}>
      {children}
    </h2>
  ),
  table: ({ children }) => (
    <div className={styles.tableWrap}>
      <table className={styles.table}>{children}</table>
    </div>
  ),
  Callout,
  Diagram,
  Screenshot,
};
