import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manuva on Shopify",
};

export default function EmbeddedLayout({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ?? process.env.SHOPIFY_API_KEY ?? "";

  return (
    <>
      {/*
        App Bridge MUST be loaded as the first <script> tag with no async/defer/module.
        React 19 hoists raw <script> tags to <head> and renders them synchronously
        (no async attribute), which satisfies App Bridge's loader check.
        https://shopify.dev/docs/api/app-bridge-library
      */}
      <meta name="shopify-api-key" content={apiKey} />
      <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
      {children}
    </>
  );
}
