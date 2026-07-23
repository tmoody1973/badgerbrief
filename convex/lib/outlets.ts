import { WI_OUTLETS } from "./scoutParse";

export const OUTLET_TYPES = [
  "nonprofit", "public_media", "corporate_daily", "wire",
  "trade", "tv", "national", "other",
] as const;
export type OutletType = (typeof OUTLET_TYPES)[number];

/** Collapse outlet name/domain variants to one key. Mirrors
 * normalizeSponsorKey so the two enrichment pipelines behave identically. */
/** The outlet's canonical display name when its URL is on a domain we know,
 *  otherwise whatever name the caller supplied (campaign sites, one-offs). */
export function canonicalOutletName(outlet: string, url?: string): string {
  if (!url) return outlet;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return outlet;
  }
  for (const [domain, name] of Object.entries(WI_OUTLETS)) {
    if (host === domain || host.endsWith(`.${domain}`)) return name;
  }
  return outlet;
}

export function normalizeOutletKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const HUB_RELEVANCE_MIN = 0.5;
const WI_ELECTION_TERMS = ["wisconsin", "primary", "ballot", "election", "candidate", "assembly", "u.s. senate", "governor"];

/** Deterministic v1 gate: hub-eligible when the text names a tracked candidate,
 * or matches a race keyword together with a WI-election term. No LLM — cheap,
 * testable, honest. (An LLM classifier can replace this later without changing
 * callers.) */
export function scoreRelevance(
  text: string,
  ctx: { candidateNames: string[]; raceKeywords: string[] },
): { score: number; reason: string } {
  const t = text.toLowerCase();
  const named = ctx.candidateNames.find((n) => t.includes(n.toLowerCase()));
  if (named) return { score: 1, reason: `names candidate ${named}` };
  const race = ctx.raceKeywords.find((k) => t.includes(k.toLowerCase()));
  const wi = WI_ELECTION_TERMS.some((w) => t.includes(w));
  if (race && wi) return { score: 0.7, reason: `race keyword "${race}" + WI-election term` };
  if (wi) return { score: 0.3, reason: "WI-election term only" };
  return { score: 0, reason: "no candidate/race/election match" };
}

/**
 * `publishedAt` comes from an LLM reading a page, so it arrives dirty: literal
 * "N/A", truncated "2026-06-", or a hallucinated date months in the future.
 * A date we cannot verify must never be displayed or sorted on — return
 * undefined and let callers fall back to when WE found the article.
 * Accepts one day of skew for timezone/clock differences.
 */
export function cleanPublishedAt(
  raw: string | undefined,
  now: number = Date.now(),
): string | undefined {
  if (!raw) return undefined;
  // Require a full YYYY-MM-DD. Date.parse is lenient enough to turn the
  // truncated "2026-06-" into June 1st — inventing a day we were never told.
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ]|$)/.test(raw.trim())) return undefined;
  const t = Date.parse(raw.trim());
  if (Number.isNaN(t)) return undefined;
  if (t > now + 86_400_000) return undefined; // impossible: published in the future
  return new Date(t).toISOString().slice(0, 10);
}

/** Stamp a discovered article with its outlet key + hub relevance. Lives here
 * (pure lib) rather than in scout.ts so BOTH the "use node" scout action and
 * plain mutations (e.g. the backfill) share one implementation — a mutation
 * cannot import from a "use node" module. */
export function decorateCoverageRow(
  row: { outlet: string; headline: string; url?: string },
  ctx: { candidateNames: string[]; raceKeywords: string[] },
): { outletKey: string; relevanceScore: number; relevanceReason: string; hubStatus?: "auto" } {
  const { score, reason } = scoreRelevance(row.headline, ctx);
  return {
    // Key off the URL's domain when we recognise it, falling back to the name.
    // `row.outlet` is a string the LLM wrote, so the same newsroom arrives as
    // "TMJ4", "TMJ4 News" or "WTMJ-TV" on different runs — three keys, three
    // half-populated outlet rows, and a transparency stamp that renders only
    // sometimes. The domain is in the URL and cannot vary.
    // Safe for existing rows: canonicalOutletName returns the same four names
    // already stored, so their keys are unchanged and no backfill is needed.
    outletKey: normalizeOutletKey(canonicalOutletName(row.outlet, row.url)),
    relevanceScore: score,
    relevanceReason: reason,
    ...(score >= HUB_RELEVANCE_MIN ? { hubStatus: "auto" as const } : {}),
  };
}

/** Turn a raw Firecrawl/Perplexity payload into typed transparency fields.
 * Unknown/missing `type` falls back to "other" rather than throwing. */
export function parseOutletTransparency(raw: unknown): {
  type: OutletType; ownership?: string; fundingNote?: string; ownershipSourceUrl?: string;
} {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawType = String(r.type ?? "").toLowerCase();
  const type = (OUTLET_TYPES as readonly string[]).includes(rawType) ? (rawType as OutletType) : "other";
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : undefined);
  return {
    type,
    ownership: str(r.ownership),
    fundingNote: str(r.funding) ?? str(r.fundingNote),
    ownershipSourceUrl: str(r.sourceUrl) ?? str(r.ownershipSourceUrl),
  };
}
