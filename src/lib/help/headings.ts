export type Heading = { text: string; id: string };

/**
 * The anchor id for a heading. The contents list, the rendered <h2>, search
 * results, in-app help links and old-URL redirects all use this one function,
 * so they cannot disagree.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The `## ` headings of an MDX source, in order, skipping fenced code blocks. */
export function extractHeadings(source: string): Heading[] {
  const headings: Heading[] = [];
  let inFence = false;
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^##[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (match) headings.push({ text: match[1], id: slugify(match[1]) });
  }
  return headings;
}
