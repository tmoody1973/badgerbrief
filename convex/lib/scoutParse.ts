/**
 * MOO-322 Task 2: pure (no Convex ctx, no network) helpers for the article
 * scout — allowlist enforcement, Perplexity response parsing, and rotation
 * sort. Kept dependency-free so they're unit-testable without convex-test,
 * mirroring the researchQueries.ts split (db-touching code lives elsewhere).
 */

export const ALLOWED_DOMAINS = ["wuwm.com", "wpr.org", "urbanmilwaukee.com", "jsonline.com"];

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
