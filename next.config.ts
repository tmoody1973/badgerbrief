import type { NextConfig } from "next";

/**
 * Article thumbnails come from the publisher's own og:image. This is an
 * ALLOWLIST on purpose: only outlets we've reviewed can render an image on
 * BadgerBrief, and next/image fetches + resizes + caches them on our side
 * rather than hotlinking a full-size hero off the publisher.
 *
 * Two constraints, both learned the hard way:
 *
 *  1. `**.example.com` requires at least one subdomain label — it does NOT
 *     match the apex. Listing only the wildcard silently 400s every publisher
 *     that serves images off its bare domain (wisconsinexaminer.com does).
 *     So outlet domains go through `withSubdomains`, which emits both forms.
 *  2. **Next.js caps `remotePatterns` at 50 entries and FAILS THE BUILD past
 *     it.** Since every outlet costs two slots, the budget is the real limit
 *     on this list — assert it here rather than discovering it in a deploy.
 *
 * Shared CDNs need the wildcard form only; nobody serves an image off a bare
 * `brightspotcdn.com`.
 */
const OUTLET_DOMAINS = [
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
];

/** Shared image CDNs — the image host is usually NOT the article host. */
const CDN_DOMAINS = [
  "gannett-cdn.com",
  "brightspotcdn.com", // NPR/WPR/WUWM + the Scripps and Hearst station groups
  "gtv-cdn.com",       // Gray stations (WBAY)
];

/** Single image servers seen on real `imageUrl` values after ingest — none of
 *  these are guessable from the article's domain. */
const EXACT_HOSTS = [
  "image.pbs.org",                                // PBS Wisconsin
  "wisconsinpublictv.s3.us-east-2.amazonaws.com", // PBS Wisconsin's own S3
  "newscdn2.weigelbroadcasting.com",              // CBS 58 (Weigel)
  "images.foxtv.com",                             // FOX6 (Fox Corp)
];

const remotePatterns = [
  ...OUTLET_DOMAINS.flatMap((hostname) => [
    { protocol: "https" as const, hostname },
    { protocol: "https" as const, hostname: `**.${hostname}` },
  ]),
  ...CDN_DOMAINS.map((d) => ({ protocol: "https" as const, hostname: `**.${d}` })),
  ...EXACT_HOSTS.map((hostname) => ({ protocol: "https" as const, hostname })),
];

const MAX_REMOTE_PATTERNS = 50; // Next.js hard limit; over it the build fails.
if (remotePatterns.length > MAX_REMOTE_PATTERNS) {
  throw new Error(
    `remotePatterns has ${remotePatterns.length} entries; Next.js caps it at ` +
      `${MAX_REMOTE_PATTERNS} and fails the build. Each outlet domain costs two ` +
      `slots (apex + wildcard) — drop one before adding another.`,
  );
}

const nextConfig: NextConfig = {
  images: { remotePatterns },
};

export default nextConfig;
