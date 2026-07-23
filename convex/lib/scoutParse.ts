/**
 * MOO-322 Task 2: pure (no Convex ctx, no network) helpers for the article
 * scout — allowlist enforcement, Perplexity response parsing, and rotation
 * sort. Kept dependency-free so they're unit-testable without convex-test,
 * mirroring the researchQueries.ts split (db-touching code lives elsewhere).
 */

/**
 * Wisconsin newsrooms the scout is allowed to surface. This list does double
 * duty and BOTH uses matter:
 *
 *  1. `search_domain_filter` on the Perplexity call — it bounds what the model
 *     is even allowed to search, so an outlet absent here is undiscoverable.
 *     A four-domain list was the real reason a major development (Crowley
 *     re-entering the governor's race) landed with a single source: three
 *     quarters of the state's political press could not be seen.
 *  2. `isAllowedUrl` — the post-hoc gate on every URL we store.
 *
 * Perplexity caps `search_domain_filter` at 20 entries (docs.perplexity.ai,
 * search-domain-filters, checked 2026-07-23) and SILENTLY truncates past that,
 * which would drop outlets off the end of this array with no error. That is
 * why the list is capped and asserted below rather than left to grow freely —
 * adding a 21st outlet must be a deliberate swap, not an invisible no-op.
 *
 * Use the domain articles actually live on, which is not always the brand's
 * vanity domain: NBC15 Madison publishes on wmtv15news.com, and WisconsinEye
 * redirects wisconsineye.org → wiseye.org.
 */
export const WI_OUTLETS: Record<string, string> = {
  // --- Milwaukee ---
  "jsonline.com": "Milwaukee Journal Sentinel",
  "urbanmilwaukee.com": "Urban Milwaukee",
  "wuwm.com": "WUWM",
  "tmj4.com": "TMJ4 News",
  "wisn.com": "WISN 12 News",
  "fox6now.com": "FOX6 News Milwaukee",
  "cbs58.com": "CBS 58 News",
  // --- Madison ---
  "madison.com": "Wisconsin State Journal",
  "captimes.com": "The Capital Times",
  "channel3000.com": "News 3 Now",
  "wkow.com": "WKOW 27 News",
  "wmtv15news.com": "NBC15 Madison", // nbc15.com 301s here
  "isthmus.com": "Isthmus",
  "pbswisconsin.org": "PBS Wisconsin",
  // --- Statewide ---
  "wpr.org": "Wisconsin Public Radio",
  "wisconsinwatch.org": "Wisconsin Watch",
  "wisconsinexaminer.com": "Wisconsin Examiner",
  "wispolitics.com": "WisPolitics",
  "wiseye.org": "WisconsinEye", // wisconsineye.org 301s here
  // --- Other markets ---
  "wbay.com": "WBAY Action 2 News",
};

export const ALLOWED_DOMAINS = Object.keys(WI_OUTLETS);

/** Perplexity's hard cap on `search_domain_filter`. Past this it truncates
 *  without erroring, so we fail loudly at import instead. */
export const MAX_SEARCH_DOMAINS = 20;

if (ALLOWED_DOMAINS.length > MAX_SEARCH_DOMAINS) {
  throw new Error(
    `ALLOWED_DOMAINS has ${ALLOWED_DOMAINS.length} entries; Perplexity's ` +
      `search_domain_filter caps at ${MAX_SEARCH_DOMAINS} and truncates the rest ` +
      `silently. Swap an outlet out rather than appending.`,
  );
}

/** Exact host or subdomain of an allowed outlet, http(s) schemes only. */
export function isAllowedUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return ALLOWED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export type ScoutArticle = {
  url: string;
  outlet: string;
  headline: string;
  publishedAt?: string;
  whyRelevant: string;
};

/**
 * Parse a Perplexity chat-completions message.content string into scout
 * articles.
 *
 * Response shape confirmed against docs.perplexity.ai (chat-completions-post
 * reference + structured-outputs guide, checked 2026-07-18): with
 * `response_format: { type: "json_schema", ... }`, `choices[0].message.content`
 * is still a STRING containing the JSON payload — never a pre-parsed object —
 * so this always starts from JSON.parse of the raw string. Tolerant of
 * Perplexity wrapping the JSON in a markdown code fence. Never throws:
 * malformed input always returns `{error}` instead.
 */
export function parseScoutResponse(
  raw: string,
): { articles: ScoutArticle[] } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(stripCodeFence(raw));
  } catch {
    return { error: "malformed JSON in scout response" };
  }

  if (typeof data !== "object" || data === null || !("articles" in data)) {
    return { error: "scout response missing 'articles' array" };
  }
  const rawArticles = (data as { articles: unknown }).articles;
  if (!Array.isArray(rawArticles)) {
    return { error: "scout response 'articles' is not an array" };
  }

  const articles: ScoutArticle[] = [];
  const seenUrls = new Set<string>(); // intra-batch dedup: same URL twice in one response → one article
  for (const item of rawArticles) {
    if (typeof item !== "object" || item === null) continue;
    const a = item as Record<string, unknown>;
    if (
      typeof a.url !== "string" ||
      typeof a.outlet !== "string" ||
      typeof a.headline !== "string" ||
      typeof a.whyRelevant !== "string"
    ) {
      // Drop the individual malformed entry rather than failing the whole
      // batch — one bad article from the LLM shouldn't sink every other
      // valid one.
      continue;
    }
    if (seenUrls.has(a.url)) continue;
    seenUrls.add(a.url);
    articles.push({
      url: a.url,
      outlet: a.outlet,
      headline: a.headline,
      whyRelevant: a.whyRelevant,
      ...(typeof a.publishedAt === "string" ? { publishedAt: a.publishedAt } : {}),
    });
  }
  return { articles };
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

/** Least-recently-proposed first; never-proposed items (no lastProposedAt) sort first. */
export function sortByRotation<T extends { lastProposedAt?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.lastProposedAt ?? 0) - (b.lastProposedAt ?? 0));
}
