import type { NormalizedAd } from "./adsMatch";

/**
 * Meta-specific normalize for the Ad Library adapter (MOO-309): a raw
 * `ads_archive` entry → the shared NormalizedAd shape. Matching/routing is
 * platform-agnostic and lives in adsMatch.ts.
 */

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
  delivery_by_region?: Array<{ region?: string; percentage?: string }>;
}

/**
 * Did this ad meaningfully reach Wisconsin? Meta has no state query filter
 * (only country), so name-based discovery pulls in national ads (a Michigan
 * Senate ad surfaced on the WI tracker). `delivery_by_region` is the after-the-
 * fact signal: keep an ad only if Wisconsin is a real share of its delivery,
 * not the ~2% spillover a nationwide ad shows in every state.
 * ponytail: 5% threshold; tune if legit WI ads get dropped.
 */
export function deliveredInWisconsin(
  entry: MetaAdArchiveEntry,
  minShare = 0.05,
): boolean {
  const wi = entry.delivery_by_region?.find(
    (r) => (r.region ?? "").trim().toLowerCase() === "wisconsin",
  );
  if (!wi) return false;
  let share = Number(wi.percentage ?? 0);
  if (!Number.isFinite(share)) return false;
  if (share > 1) share = share / 100; // some responses use percent, not fraction
  return share >= minShare;
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
    entityId: entry.page_id,
    pageOrCommittee: entry.page_name ?? entry.page_id,
    creativeText: first(entry.ad_creative_bodies),
    creativeLinkUrl: first(entry.ad_creative_link_captions),
    snapshotUrl: entry.ad_snapshot_url,
    fundingEntity: entry.bylines || undefined,
    // Meta doesn't return a status; a stop time means it stopped.
    status: entry.ad_delivery_stop_time ? "inactive" : "active",
    spendLower: num(entry.spend?.lower_bound),
    spendUpper: num(entry.spend?.upper_bound),
    impressionsLower: num(entry.impressions?.lower_bound),
    impressionsUpper: num(entry.impressions?.upper_bound),
  };
}
