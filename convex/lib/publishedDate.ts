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
