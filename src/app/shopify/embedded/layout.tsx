import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Manuva on Shopify",
};

export default function EmbeddedLayout({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ?? process.env.SHOPIFY_API_KEY ?? "";

  return (
    <>
      {/*
        The meta tag plus the app-bridge.js script together initialise App Bridge.
        Required for the embedded surface to make authenticated calls back to our API.
        https://shopify.dev/docs/api/app-bridge-library
      */}
      <meta name="shopify-api-key" content={apiKey} />
      <Script
        src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
        strategy="beforeInteractive"
      />
      {children}
    </>
  );
}
