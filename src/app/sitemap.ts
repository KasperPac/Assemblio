import type { MetadataRoute } from "next";
import { MANUALS } from "@/content/help/manuals";
import { helpBaseUrl } from "@/lib/help/urls";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = helpBaseUrl();
  return [
    { url: `${base}/help`, changeFrequency: "weekly", priority: 0.8 },
    ...MANUALS.map((m) => ({ url: `${base}/help/${m.slug}`, changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}
