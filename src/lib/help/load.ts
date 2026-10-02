import { readFileSync } from "fs";
import path from "path";
import { MANUALS, type ManualSlug } from "@/content/help/manuals";
import { extractHeadings, type Heading } from "./headings";
import type { SearchSource } from "./search";

// Read at build time: every /help page is statically generated.
const CONTENT_DIR = path.join(process.cwd(), "src/content/help");

export function readManualSource(slug: ManualSlug): string {
  return readFileSync(path.join(CONTENT_DIR, `${slug}.mdx`), "utf8");
}

export function getManualHeadings(slug: ManualSlug): Heading[] {
  return extractHeadings(readManualSource(slug));
}

export function getSearchSources(): SearchSource[] {
  return MANUALS.map((m) => ({
    slug: m.slug,
    title: m.title,
    description: m.description,
    headings: getManualHeadings(m.slug),
  }));
}
