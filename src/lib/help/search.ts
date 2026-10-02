import type { Heading } from "./headings";

export type SearchEntry = {
  href: string;
  title: string;
  manualTitle: string;
  description?: string;
  kind: "manual" | "section";
};

export type SearchSource = { slug: string; title: string; description: string; headings: Heading[] };

export function buildSearchIndex(sources: SearchSource[]): SearchEntry[] {
  return sources.flatMap((s) => [
    { href: `/help/${s.slug}`, title: s.title, manualTitle: s.title, description: s.description, kind: "manual" as const },
    ...s.headings.map((h) => ({
      href: `/help/${s.slug}#${h.id}`,
      title: h.text,
      manualTitle: s.title,
      kind: "section" as const,
    })),
  ]);
}

/**
 * Entries containing every word of the query, case-insensitively. A section
 * matches when every word is in its own title or its manual's title, and at
 * least one is in its own title, so "xero" finds "Setting up Xero" without
 * listing every section of the Xero manual. Manuals come first. Plain
 * substring matching, so no input can throw.
 */
export function searchHelp(entries: SearchEntry[], query: string, limit = 12): SearchEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const matches = entries.filter((e) => {
    const own = `${e.title} ${e.description ?? ""}`.toLowerCase();
    const all = `${own} ${e.manualTitle.toLowerCase()}`;
    return terms.every((t) => all.includes(t)) && terms.some((t) => own.includes(t));
  });
  return [...matches.filter((e) => e.kind === "manual"), ...matches.filter((e) => e.kind === "section")].slice(0, limit);
}
