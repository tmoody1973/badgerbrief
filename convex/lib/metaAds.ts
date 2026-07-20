/**
 * Pure (no Convex ctx, no network) logic for the Meta Ad Library adapter
 * (MOO-309): normalize a raw `ads_archive` entry into our `ads` shape, and
 * score an ad→candidate attribution. Kept dependency-free so it unit-tests
 * without convex-test, mirroring scoutParse.ts / campaignMap.ts.
 *
 * TRUST RULE (PRD + the "never name-match without a Wisconsin+office check"
 * landmine): only a *verified tracked page* (a Meta page_id we curate as
 * belonging to a specific candidate) auto-attributes to a candidate on public
 * pages. Every name-INFERRED attribution is routed to review_tasks for a human
 * to confirm — a committee named "Wisconsin Values" could back anyone. So
 * `candidateSlug` is set on the public ad row ONLY when confidence clears
 * PUBLIC_MATCH_THRESHOLD, which by construction only tracked pages do.
 */

/** At/above this confidence an ad auto-attributes to a candidate publicly. */
export const PUBLIC_MATCH_THRESHOLD = 0.7;

/** A raw entry from the Meta Ad Library `ads_archive` endpoint. Fields are
 * optional/loosely typed because the API omits absent ones and serializes the
 * money bounds as strings. */
export interface MetaAdArchiveEntry {
  id?: string;
  page_id?: string;
  page_name?: string;
  bylines?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_captions?: string[];
  ad_creative_link_titles?: string[];
  ad_snapshot_url?: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  spend?: { lower_bound?: string; upper_bound?: string };
  impressions?: { lower_bound?: string; upper_bound?: string };
  currency?: string;
}

/** Our normalized ad, aligned to the `ads` table columns (minus bookkeeping
 * timestamps and the attribution the caller decides). */
export interface NormalizedAd {
  platform: "meta";
  platformAdId: string;
  pageId: string;
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

/** A curated Meta page we know belongs to a candidate — the only high-trust
 * attribution source. */
export interface TrackedPage {
  pageId: string;
  candidateSlug: string;
  raceId: string;
}

/** A candidate we can attempt to attribute an ad to. All candidates here are
 * Wisconsin 2026 by construction (the whole DB is), so the "Wisconsin check"
 * from the landmine is inherent — we never match outside this set. */
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
  /** Set only when confidence >= PUBLIC_MATCH_THRESHOLD (tracked page). */
  candidateSlug?: string;
  raceId?: string;
  /** A human-review suggestion when we inferred but won't auto-publish. */
  suggestedSlug?: string;
  suggestedRaceId?: string;
  /** True → open a review_task; the ad stays unattributed on public pages. */
  review: boolean;
}

function num(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function first(arr: string[] | undefined): string | undefined {
  return arr && arr.length > 0 ? arr[0] : undefined;
}

export function normalizeMetaAd(entry: MetaAdArchiveEntry): NormalizedAd | null {
  // id + page_id are the two fields we cannot function without.
  if (!entry.id || !entry.page_id) return null;
  return {
    platform: "meta",
    platformAdId: entry.id,
    pageId: entry.page_id,
    pageOrCommittee: entry.page_name ?? entry.page_id,
    creativeText: first(entry.ad_creative_bodies),
    creativeLinkUrl: first(entry.ad_creative_link_captions),
    snapshotUrl: entry.ad_snapshot_url,
    fundingEntity: entry.bylines || undefined,
    // Meta doesn't return a status; a stop time in the past means it stopped.
    status: entry.ad_delivery_stop_time ? "inactive" : "active",
    spendLower: num(entry.spend?.lower_bound),
    spendUpper: num(entry.spend?.upper_bound),
    impressionsLower: num(entry.impressions?.lower_bound),
    impressionsUpper: num(entry.impressions?.upper_bound),
  };
}

/** lowercase, strip punctuation to spaces, collapse whitespace. */
function normalizeText(s: string): string {
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
 * Attribute a normalized ad. Tracked pages win outright (verified → public).
 * Otherwise we only ever *suggest* an attribution for human review; a
 * name-inferred match never sets a public `candidateSlug`.
 */
export function scoreAdMatch(
  ad: NormalizedAd,
  trackedPages: TrackedPage[],
  candidates: MatchCandidate[],
): AdMatch {
  const tracked = trackedPages.find((p) => p.pageId === ad.pageId);
  if (tracked) {
    return {
      confidence: 0.98,
      reason: `verified tracked page ${ad.pageId}`,
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
      } — needs human confirmation (not a verified page)`,
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
