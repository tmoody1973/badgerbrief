/**
 * The single image allowlist: next.config.ts hands remotePatterns to
 * next/image, and ArticleThumb asks isAllowedImage before trying a URL, so an
 * unreviewed host shows the outlet's initials instead of a failed load (and,
 * in development, instead of next/image throwing).
 */
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
export const OUTLET_DOMAINS = [
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
export const CDN_DOMAINS = [
  "gannett-cdn.com",
  "brightspotcdn.com", // NPR/WPR/WUWM + the Scripps and Hearst station groups
  "gtv-cdn.com",       // Gray stations (WBAY)
  "townnews.com",      // Lee papers (Cap Times, madison.com) via bloximages.*.townnews.com
];

/** Single image servers seen on real `imageUrl` values after ingest — none of
 *  these are guessable from the article's domain. */
export const EXACT_HOSTS = [
  "image.pbs.org",                                // PBS Wisconsin
  "wisconsinpublictv.s3.us-east-2.amazonaws.com", // PBS Wisconsin's own S3
  "newscdn2.weigelbroadcasting.com",              // CBS 58 (Weigel)
  "images.foxtv.com",                             // FOX6 (Fox Corp)
];

export const remotePatterns = [
  ...OUTLET_DOMAINS.flatMap((hostname) => [
    { protocol: "https" as const, hostname },
    { protocol: "https" as const, hostname: `**.${hostname}` },
  ]),
  ...CDN_DOMAINS.map((d) => ({ protocol: "https" as const, hostname: `**.${d}` })),
  ...EXACT_HOSTS.map((hostname) => ({ protocol: "https" as const, hostname })),
  // WordPress's image service fronts Wisconsin Watch's photos. Scoped to that
  // outlet's path: allowing the whole host would admit any WordPress site.
  { protocol: "https" as const, hostname: "i0.wp.com", pathname: "/wisconsinwatch.org/**" },
];

const MAX_REMOTE_PATTERNS = 50; // Next.js hard limit; over it the build fails.
if (remotePatterns.length > MAX_REMOTE_PATTERNS) {
  throw new Error(
    `remotePatterns has ${remotePatterns.length} entries; Next.js caps it at ` +
      `${MAX_REMOTE_PATTERNS} and fails the build. Each outlet domain costs two ` +
      `slots (apex + wildcard) — drop one before adding another.`,
  );
}


const matchesHost = (pattern: string, host: string) =>
  pattern.startsWith("**.") ? host.endsWith(pattern.slice(2)) && host !== pattern.slice(3) : host === pattern;

const matchesPath = (pattern: string | undefined, path: string) =>
  !pattern || (pattern.endsWith("/**") ? path.startsWith(pattern.slice(0, -2)) : path === pattern);

/** Whether next/image will accept this URL under remotePatterns. */
export function isAllowedImage(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  return remotePatterns.some((p) => matchesHost(p.hostname, u.hostname) && matchesPath("pathname" in p ? p.pathname : undefined, u.pathname));
}
