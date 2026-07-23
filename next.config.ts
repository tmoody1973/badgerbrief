import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Article thumbnails come from the publisher's own og:image. This is an
    // ALLOWLIST on purpose: only outlets we've reviewed can render an image on
    // BadgerBrief, and next/image fetches + resizes + caches them on our side
    // rather than hotlinking a full-size hero off the publisher.
    // Add a host here when its outlet is approved in /admin → Outlets.
    remotePatterns: [
      { protocol: "https", hostname: "urbanmilwaukee.com" },
      { protocol: "https", hostname: "**.urbanmilwaukee.com" },
      { protocol: "https", hostname: "wpr.org" },
      { protocol: "https", hostname: "**.wpr.org" },
      { protocol: "https", hostname: "wuwm.com" },
      { protocol: "https", hostname: "**.wuwm.com" },
      { protocol: "https", hostname: "jsonline.com" },
      { protocol: "https", hostname: "**.jsonline.com" },
      { protocol: "https", hostname: "**.gannett-cdn.com" },
      // WPR/WUWM serve their images off NPR's Brightspot CDN, not their own host.
      { protocol: "https", hostname: "**.brightspotcdn.com" },
    ],
  },
};

export default nextConfig;
