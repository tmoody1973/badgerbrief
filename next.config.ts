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

      // --- Madison + statewide + TV (added with the widened scout allowlist) ---
      // The article host is usually NOT the image host, so these are mostly CDN
      // entries. Broadcast groups standardised hard: Scripps/Hearst/Gray/Allen
      // all serve off Brightspot (already covered above), Nexstar and Sinclair
      // off their own clouds, and Lee's papers off TownNews.
      { protocol: "https", hostname: "**.lee.net" },          // madison.com / captimes.com (Lee)
      { protocol: "https", hostname: "**.townnews.com" },     // Lee's TownNews image service
      { protocol: "https", hostname: "**.wiscnews.com" },
      { protocol: "https", hostname: "channel3000.com" },
      { protocol: "https", hostname: "**.channel3000.com" },
      { protocol: "https", hostname: "**.wkow.com" },
      { protocol: "https", hostname: "**.wmtv15news.com" },
      { protocol: "https", hostname: "**.isthmus.com" },
      { protocol: "https", hostname: "**.pbswisconsin.org" },
      { protocol: "https", hostname: "**.tmj4.com" },
      { protocol: "https", hostname: "**.wisn.com" },
      { protocol: "https", hostname: "**.fox6now.com" },
      { protocol: "https", hostname: "**.cbs58.com" },
      { protocol: "https", hostname: "**.wbay.com" },
      { protocol: "https", hostname: "**.wisconsinwatch.org" },
      { protocol: "https", hostname: "**.wisconsinexaminer.com" },
      { protocol: "https", hostname: "**.wispolitics.com" },
      { protocol: "https", hostname: "**.wiseye.org" },
      { protocol: "https", hostname: "**.files.wordpress.com" }, // WP-hosted media (Examiner, WisEye)
      { protocol: "https", hostname: "**.cloudfront.net" },      // Nexstar/Sinclair station clouds
    ],
  },
};

export default nextConfig;
