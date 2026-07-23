import { cleanPublishedAt } from "./outlets";

/**
 * Read an article's REAL publication date out of the page's own metadata,
 * rather than trusting an LLM's guess.
 *
 * Order is by trustworthiness: OpenGraph `article:published_time` and
 * schema.org `datePublished` are machine-readable fields the publisher
 * emits; a bare <time datetime> is a weaker last resort (it can mark an
 * event date rather than the publication date), so it is only consulted
 * when nothing better exists.
 *
 * Every candidate goes through cleanPublishedAt, so the same rules apply as
 * everywhere else: strict YYYY-MM-DD, never a future date. Returns undefined
 * when the page states no date we can trust — the honest answer.
 */
/**
 * The image the publisher itself declared for link previews (og:image /
 * twitter:image). We never scrape an image out of the article body — only the
 * one the outlet published FOR this purpose. Returns undefined when absent or
 * not an absolute http(s) URL.
 */
export function extractOgImage(html: string): string | undefined {
  if (!html) return undefined;
  const patterns: RegExp[] = [
    /<meta[^>]+(?:property|name)=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image(?::url)?["']/i,
    /<meta[^>]+(?:property|name)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m) continue;
    const url = m[1].trim().replace(/&amp;/g, "&");
    // Absolute https(s) only — a relative or data: URL can't be allowlisted
    // by next/image, and we will not guess the origin.
    if (/^https?:\/\/\S+$/i.test(url)) return url;
  }
  return undefined;
}

export function extractPublishedDate(
  html: string,
  now: number = Date.now(),
): string | undefined {
  if (!html) return undefined;

  const patterns: RegExp[] = [
    // <meta property="article:published_time" content="...">  (either attr order)
    /<meta[^>]+(?:property|name)=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']article:published_time["']/i,
    // schema.org JSON-LD (NewsArticle.datePublished)
    /"datePublished"\s*:\s*"([^"]+)"/i,
    // less common publisher meta
    /<meta[^>]+(?:property|name)=["'](?:og:published_time|publish-date|publication_date|date)["'][^>]+content=["']([^"']+)["']/i,
    // weakest: a machine-readable <time datetime="...">
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];

  for (const re of patterns) {
    const m = html.match(re);
    if (!m) continue;
    const cleaned = cleanPublishedAt(m[1], now);
    if (cleaned) return cleaned; // first trustworthy hit wins
  }
  return undefined;
}

/**
 * Many publishers encode the publication date in the permalink itself
 * (`urbanmilwaukee.com/2026/06/14/some-headline/`). That is the outlet's own
 * canonical URL, not a model's guess — a legitimate fallback when the page
 * ships no date metadata. Requires a full /YYYY/MM/DD/ path segment, so a
 * lone year or an id like /2026/ is ignored.
 */
export function dateFromUrlPath(
  url: string,
  now: number = Date.now(),
): string | undefined {
  const m = url.match(/\/(20\d{2})\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])(?:\/|-|_)/);
  if (!m) return undefined;
  return cleanPublishedAt(`${m[1]}-${m[2]}-${m[3]}`, now);
}
