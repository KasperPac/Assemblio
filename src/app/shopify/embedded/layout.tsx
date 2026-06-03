import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manuva on Shopify",
};

export default function EmbeddedLayout({ children }: { children: React.ReactNode }) {
  // App Bridge bootstrap (the shopify-api-key meta + loader script) lives in page.tsx,
  // not here: the api-key must match the app the merchant installed (public "Manuva"
  // vs unlisted "Manuva Fab"), and that's resolved from the `shop` search param, which
  // layouts don't receive.
  return <>{children}</>;
}
