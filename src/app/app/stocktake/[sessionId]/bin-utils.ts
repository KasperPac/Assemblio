// Pure helpers shared by both server-side (page.tsx, print/page.tsx) and
// client-side (counting-sheet.tsx) stocktake code. Cannot live in counting-sheet.tsx
// because that file has "use client" and Next.js 15 forbids server code from
// invoking exports of a client module.

export type BinRef = { name: string } | Array<{ name: string }> | null;

export function binName(ref: BinRef): string | null {
  if (!ref) return null;
  const obj = Array.isArray(ref) ? ref[0] : ref;
  return obj?.name ?? null;
}
