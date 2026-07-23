import type { NextConfig } from "next";

/**
 * Article thumbnails come from the publisher's own og:image. This is an
 * ALLOWLIST on purpose: only outlets we've reviewed can render an image on
 * BadgerBrief, and next/image fetches + resizes + caches them on our side
 * rather than hotlinking a full-size hero off the publisher.
 *
 * `**.example.com` requires at least one subdomain label — it does NOT match
 * the apex. Listing only the wildcard silently 404s every publisher that
 * serves images off its bare domain (this bit wisconsinexaminer.com). So
 * domains go through `withSubdomains`, which always emits both forms, and
 * hosts that are exact (an S3 bucket, a single image server) are listed as
 * literals below.
 */
const withSubdomains = (...domains: string[]) =>
  domains.flatMap((hostname) => [
    { protocol: "https" as const, hostname },
    { protocol: "https" as const, hostname: `**.${hostname}` },
  ]);

const exactHosts = (...hostnames: string[]) =>
  hostnames.map((hostname) => ({ protocol: "https" as const, hostname }));

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      ...withSubdomains(
        // --- outlet domains (mirrors WI_OUTLETS in convex/lib/scoutParse.ts) ---
        "urbanmilwaukee.com",
        "wpr.org",
        "wuwm.com",
        "jsonline.com",
        "madison.com",
        "captimes.com",
        "channel3000.com",
        "wkow.com",
        "wmtv15news.com",
        "isthmus.com",
        "pbswisconsin.org",
        "tmj4.com",
        "wisn.com",
        "fox6now.com",
        "cbs58.com",
        "wbay.com",
        "wisconsinwatch.org",
        "wisconsinexaminer.com",
        "wispolitics.com",
        "wiseye.org",
        // --- shared CDNs (the image host is usually NOT the article host) ---
        "gannett-cdn.com",
        "brightspotcdn.com", // NPR/WPR/WUWM + the Scripps & Hearst station groups
        "gtv-cdn.com",       // Gray stations (WBAY)
        "lee.net",           // Lee Enterprises (madison.com, captimes.com)
        "townnews.com",      // Lee's TownNews image service
        "wiscnews.com",
      ),
      // Single image servers observed on real `imageUrl` values after ingest —
      // none of these are guessable from the article domain.
      ...exactHosts(
        "image.pbs.org",                             // PBS Wisconsin
        "wisconsinpublictv.s3.us-east-2.amazonaws.com", // PBS Wisconsin's own S3
        "newscdn2.weigelbroadcasting.com",           // CBS 58 (Weigel)
        "images.foxtv.com",                          // FOX6 (Fox Corp)
      ),
    ],
  },
};

export default nextConfig;
