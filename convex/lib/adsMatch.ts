/**
 * Platform-agnostic ad→candidate matching for the ad adapters (MOO-309 Meta,
 * MOO-315 Google). Pure (no Convex ctx, no network) so it unit-tests without
 * convex-test. Each platform's normalize step (raw API row → NormalizedAd)
 * lives in its own file (metaAds.ts, googleAds.ts) and feeds this.
 *
 * TRUST RULE (PRD + the "never name-match without a Wisconsin+office check"
 * landmine): only a *verified tracked entity* — a Meta page_id / Google
 * advertiser_id we curate as belonging to a specific candidate — auto-attributes
 * on public pages. Every name-INFERRED attribution routes to review_tasks for a
 * human. So `candidateSlug` is set publicly ONLY when confidence clears
 * PUBLIC_MATCH_THRESHOLD, which by construction only a tracked entity does.
 */

/** At/above this confidence an ad auto-attributes to a candidate publicly. */
export const PUBLIC_MATCH_THRESHOLD = 0.7;

export type AdPlatform = "meta" | "google";

/** Normalized ad, aligned to the `ads` table columns (minus bookkeeping
 * timestamps and the attribution the caller decides). `entityId` is the
 * platform's page_id (Meta) / advertiser_id (Google) — used for tracked-entity
 * matching, not stored (the schema keeps `pageOrCommittee`). */
export interface NormalizedAd {
  platform: AdPlatform;
  platformAdId: string;
  entityId: string;
  pageOrCommittee: string;
  creativeText?: string;
  creativeLinkUrl?: string;
  snapshotUrl?: string;
  fundingEntity?: string;
  status?: string;
  spendLower?: number;
  spendUpper?: number;
  impressionsLower?: number;
  impressionsUpper?: number;
}

/** A curated platform entity we know belongs to a candidate — the only
 * high-trust attribution source. `entityId` is a Meta page_id or Google
 * advertiser_id. */
export interface TrackedEntity {
  entityId: string;
  candidateSlug: string;
  raceId: string;
}

/** A candidate an ad may be attributed to. All are Wisconsin 2026 by
 * construction (the whole DB is), so the landmine's "Wisconsin check" is
 * inherent — we never match outside this set. */
export interface MatchCandidate {
  slug: string;
  name: string;
  raceId: string;
  office: string;
  level: string;
}

export interface AdMatch {
  confidence: number;
  reason: string;
  /** Set only when confidence >= PUBLIC_MATCH_THRESHOLD (tracked entity). */
  candidateSlug?: string;
  raceId?: string;
  /** A human-review suggestion when we inferred but won't auto-publish. */
  suggestedSlug?: string;
  suggestedRaceId?: string;
  /** True → open a review_task; the ad stays unattributed on public pages. */
  review: boolean;
}

/** lowercase, strip punctuation to spaces, collapse whitespace. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whole-word presence, so "roys" doesn't match "corduroys". */
function hasWord(haystack: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`).test(haystack);
}

function surnameOf(name: string): string {
  const parts = normalizeText(name).split(" ").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/** Office-ish tokens to corroborate a name match (reduces cross-office false
 * positives). Not exhaustive — just a confidence nudge for review routing. */
function officeTokens(c: MatchCandidate): string[] {
  return normalizeText(`${c.office} ${c.level}`)
    .split(" ")
    .filter((t) => t.length >= 4);
}

/**
 * Attribute a normalized ad. A tracked entity wins outright (verified → public).
 * Otherwise we only ever *suggest* an attribution for human review; a
 * name-inferred match never sets a public `candidateSlug`.
 */
export function scoreAdMatch(
  ad: NormalizedAd,
  trackedEntities: TrackedEntity[],
  candidates: MatchCandidate[],
): AdMatch {
  const tracked = trackedEntities.find((p) => p.entityId === ad.entityId);
  if (tracked) {
    return {
      confidence: 0.98,
      reason: `verified tracked entity ${ad.entityId}`,
      candidateSlug: tracked.candidateSlug,
      raceId: tracked.raceId,
      review: false,
    };
  }

  const haystack = normalizeText(
    `${ad.pageOrCommittee} ${ad.fundingEntity ?? ""} ${ad.creativeText ?? ""}`,
  );
  const hits = candidates.filter((c) => {
    const surname = surnameOf(c.name);
    return surname.length >= 4 && hasWord(haystack, surname);
  });

  if (hits.length === 1) {
    const c = hits[0];
    const officeHit = officeTokens(c).some((t) => hasWord(haystack, t));
    return {
      confidence: officeHit ? 0.6 : 0.45,
      reason: `name "${surnameOf(c.name)}" matched ${c.slug}${
        officeHit ? " + office" : ""
      } — needs human confirmation (not a verified entity)`,
      suggestedSlug: c.slug,
      suggestedRaceId: c.raceId,
      review: true,
    };
  }

  if (hits.length > 1) {
    return {
      confidence: 0.3,
      reason: `ambiguous: name matched ${hits.map((h) => h.slug).join(", ")}`,
      review: true,
    };
  }

  return { confidence: 0, reason: "no candidate match", review: false };
}
