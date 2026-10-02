const FALLBACK = "https://app.manuva.app";

/** Absolute origin for help-centre canonical URLs and the sitemap. */
export function helpBaseUrl(env: string | undefined = process.env.NEXT_PUBLIC_APP_URL): string {
  return (env && env.trim() !== "" ? env : FALLBACK).replace(/\/+$/, "");
}
