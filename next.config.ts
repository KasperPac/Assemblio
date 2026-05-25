import type { NextConfig } from "next";
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

export default nextConfig;
