export const OUTLET_TYPES = [
  "nonprofit", "public_media", "corporate_daily", "wire",
  "trade", "tv", "national", "other",
] as const;
export type OutletType = (typeof OUTLET_TYPES)[number];

/** Collapse outlet name/domain variants to one key. Mirrors
 * normalizeSponsorKey so the two enrichment pipelines behave identically. */
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

/** Stamp a discovered article with its outlet key + hub relevance. Lives here
 * (pure lib) rather than in scout.ts so BOTH the "use node" scout action and
 * plain mutations (e.g. the backfill) share one implementation — a mutation
 * cannot import from a "use node" module. */
export function decorateCoverageRow(
  row: { outlet: string; headline: string },
  ctx: { candidateNames: string[]; raceKeywords: string[] },
): { outletKey: string; relevanceScore: number; relevanceReason: string; hubStatus?: "auto" } {
  const { score, reason } = scoreRelevance(row.headline, ctx);
  return {
    outletKey: normalizeOutletKey(row.outlet),
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
