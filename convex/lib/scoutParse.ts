/**
 * MOO-322 Task 2: pure (no Convex ctx, no network) helpers for the article
 * scout — allowlist enforcement, search-result conversion, and rotation
 * sort. Kept dependency-free so they're unit-testable without convex-test,
 * mirroring the researchQueries.ts split (db-touching code lives elsewhere).
 */
/**
 * Wisconsin newsrooms the scout is allowed to surface. This list does double
 * duty and BOTH uses matter:
 *
 *  1. `includeDomains` on the context.dev search — it bounds what the search
 *     can return, so an outlet absent here is undiscoverable.
 *     A four-domain list was the real reason a major development (Crowley
 *     re-entering the governor's race) landed with a single source: three
 *     quarters of the state's political press could not be seen.
 *  2. `isAllowedUrl` — the post-hoc gate on every URL we store.
 *
 * context.dev caps `includeDomains` at 100 entries (docs.context.dev,
 * /web/search, checked 2026-10-14). The list is asserted against that cap
 * below so an outlet past it fails loudly instead of never being searched.
 * (Until October 2026 the scout used Perplexity, which capped at 20 and
 * truncated silently.)
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

/** context.dev's cap on `includeDomains`; we fail loudly at import past it. */
export const MAX_SEARCH_DOMAINS = 100;

if (ALLOWED_DOMAINS.length > MAX_SEARCH_DOMAINS) {
  throw new Error(
    `ALLOWED_DOMAINS has ${ALLOWED_DOMAINS.length} entries; the search's ` +
      `includeDomains caps at ${MAX_SEARCH_DOMAINS}.`,
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
  imageUrl?: string;
  /** The article page could not be read: keep it off /news until a person reviews it. */
  unread?: true;
};

/** Least-recently-proposed first; never-proposed items (no lastProposedAt) sort first. */
export function sortByRotation<T extends { lastProposedAt?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.lastProposedAt ?? 0) - (b.lastProposedAt ?? 0));
}

/**
 * The search request for one candidate. It names the office in words (not the
 * race ID) and the general election; the old text asked for coverage of "the
 * August 11, 2026 primary" for two months after it was over.
 */
/** The search text for one candidate: the exact name, then the office. */
export function scoutQuery(target: { name: string; office: string }): string {
  return `"${target.name}" ${target.office}`;
}

/** Listing, tag, author, people, topic, collection and file pages that come back from a search but are not articles. */
const NOT_AN_ARTICLE = /\/(category|tag|tags|author|authors|archives?|people|person|topics?)\/|\/topics?$|\/collection_|\.(jpe?g|png|gif|webp|pdf)$/i;

/**
 * A page that is not an article: a section front ("/news", "/" — every
 * article address on these outlets has at least two path segments), or a
 * listing, profile, topic or file page. Urban Milwaukee /people/ profiles and
 * WPR /topic/ pages reached /news under the old scout.
 */
export function isNotAnArticle(url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return true;
  }
  return path.split("/").filter(Boolean).length < 2 || NOT_AN_ARTICLE.test(path);
}

/**
 * A campaign's own press release, reposted by an outlet. Urban Milwaukee files
 * them under /pressrelease/; WisPolitics titles them "Sender: Headline"
 * ("DCCC: DCCC Releases New TV Ad…", "Crowley campaign: …"). /news is for
 * newsroom coverage, so these are left out (Tarik's call, 2026-10-14).
 */
function isPressRelease(url: URL, title: string): boolean {
  if (url.hostname.endsWith("urbanmilwaukee.com") && url.pathname.startsWith("/pressrelease/")) return true;
  return url.hostname.endsWith("wispolitics.com") && /^[^:]{2,60}:\s/.test(title);
}

/**
 * An opinion piece: a column, guest essay, editorial or reader letter. /news
 * is a nonpartisan news feed, and the relevance check cannot tell a letter
 * endorsing a candidate from reporting about them (on 2026-10-14 a letter
 * backing one candidate led /news). Most outlets put opinion under /opinion/;
 * Wisconsin Watch labels it in the headline instead.
 */
export function isOpinion(url: string, title: string): boolean {
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return /\/opinion\//i.test(path) || /^(guest opinion|opinion|letter)\b\s*[:|]/i.test(title.trim());
}

function outletFor(host: string): string | undefined {
  const domain = ALLOWED_DOMAINS.find((d) => host === d || host.endsWith(`.${d}`));
  return domain ? WI_OUTLETS[domain] : undefined;
}

/**
 * Turn a context.dev /web/search response into scout articles. The headline
 * and snippet are the outlet's own words; no publication date is set here,
 * because the search does not give one — the nightly date check reads it from
 * the article itself. Never throws: a malformed response returns `{error}`.
 */
export function articlesFromSearch(response: unknown): { articles: ScoutArticle[] } | { error: string } {
  const results = (response as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return { error: "search response missing 'results' array" };

  const articles: ScoutArticle[] = [];
  const seen = new Set<string>();
  for (const item of results) {
    const r = (item ?? {}) as { url?: unknown; title?: unknown; description?: unknown };
    if (typeof r.url !== "string" || typeof r.title !== "string" || !r.title.trim()) continue;
    if (!isAllowedUrl(r.url)) continue;
    const url = new URL(r.url);
    url.search = "";
    url.hash = "";
    const title = r.title.trim();
    if (isNotAnArticle(url.toString()) || isPressRelease(url, title) || isOpinion(r.url, title)) continue;
    const clean = url.toString();
    if (seen.has(clean)) continue;
    seen.add(clean);
    articles.push({
      url: clean,
      outlet: outletFor(url.hostname.toLowerCase()) ?? url.hostname,
      headline: title,
      whyRelevant: typeof r.description === "string" ? r.description.trim() : "",
    });
  }
  return { articles };
}

/**
 * Fill in what the search leaves out, from the article page itself (read by
 * the scout through context.dev, which gets past the outlets that block plain
 * fetches): the full headline — search titles are cut off at about 60
 * characters — and the share image. The page's real title is also where a
 * WisPolitics press release shows itself ("Crowley campaign: …"), so the
 * press-release check runs again on it; null means leave the article out.
 * With no page title the article is kept as the search found it but marked
 * `unread`: its headline may be cut off and a WisPolitics press release may
 * only show itself on the page, so it must wait for a person, not go public.
 */
export function withPageDetails(article: ScoutArticle, page: { title?: string; image?: string }): ScoutArticle | null {
  const title = page.title?.trim();
  if (!title) return { ...article, unread: true };
  if (isPressRelease(new URL(article.url), title) || isOpinion(article.url, title)) return null;
  const image = page.image && /^https?:\/\//.test(page.image) ? page.image : undefined;
  return { ...article, headline: title, ...(image ? { imageUrl: image } : {}) };
}
