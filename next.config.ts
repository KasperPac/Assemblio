import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
      },
    ],
  },
  async headers() {
    return [
      {
        // Shopify embedded surface must be iframe-able from Shopify Admin.
        // We override Next's default frame protections only on this exact subtree.
        source: "/shopify/embedded/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors https://*.myshopify.com https://admin.shopify.com;",
          },
        ],
      },
    ];
  },
};

// MDX renders the public help centre (src/content/help/*.mdx), which is imported
// by the /help routes, not routed itself, so pageExtensions stays as it is.
// The plugin is named as a string so the config stays serialisable, which
// Turbopack requires.
const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm"],
  },
});

export default withMDX(nextConfig);
