import type { NormalizedAd } from "./adsMatch";

/**
 * Google-specific normalize for the Political Ads adapter (MOO-315): a row from
 * the public BigQuery dataset `bigquery-public-data.google_political_ads.creative_stats`
 * → the shared NormalizedAd shape. Matching/routing is platform-agnostic
 * (adsMatch.ts) and identical to Meta's.
 *
 * Differences from Meta: the tracked entity is `advertiser_id` (not a page_id),
 * the "paid for by" is `advertiser_name`, impressions come as a bucket STRING
 * ("10k-100k") rather than numeric bounds, and the dataset carries no creative
 * body text — so creativeText is usually absent.
 */

/** A row from google_political_ads.creative_stats (fields we use). */
export interface GooglePoliticalAdRow {
  ad_id?: string;
  ad_url?: string;
  ad_type?: string;
  advertiser_id?: string;
  advertiser_name?: string;
  date_range_start?: string;
  date_range_end?: string;
  // Google buckets spend into a min/max USD range.
  spend_range_min_usd?: number | string;
  spend_range_max_usd?: number | string;
  // Impressions is a bucket label, e.g. "≤ 10k", "10k-100k", "100k-1M".
  impressions?: string;
}

function num(value: number | string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

const UNIT: Record<string, number> = { k: 1_000, m: 1_000_000, b: 1_000_000_000 };

/** Parse a token like "10k", "1m", "500", "1.5M" → a number. */
function parseBucketToken(token: string): number | undefined {
  const m = token.trim().toLowerCase().match(/^([\d.]+)\s*([kmb])?$/);
  if (!m) return undefined;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return undefined;
  return base * (m[2] ? UNIT[m[2]] : 1);
}

/**
 * Turn Google's impressions bucket string into [lower, upper]. Handles
 * "10k-100k" (range), "≤ 10k" / "< 10k" / "up to 10k" (upper only), and
 * "≥ 1M" / "1M+" (lower only). Unknown formats → [undefined, undefined].
 */
export function parseImpressionBucket(
  bucket: string | undefined,
): { lower?: number; upper?: number } {
  if (!bucket) return {};
  const cleaned = bucket.replace(/[,_\s]/g, "").toLowerCase();
  const range = cleaned.match(/^([\d.]+[kmb]?)[-–]([\d.]+[kmb]?)$/);
  if (range) {
    return { lower: parseBucketToken(range[1]), upper: parseBucketToken(range[2]) };
  }
  const upperOnly = cleaned.match(/^(?:≤|<|upto)([\d.]+[kmb]?)$/);
  if (upperOnly) return { upper: parseBucketToken(upperOnly[1]) };
  const lowerOnly = cleaned.match(/^(?:≥|>)?([\d.]+[kmb]?)\+$/);
  if (lowerOnly) return { lower: parseBucketToken(lowerOnly[1]) };
  const single = parseBucketToken(cleaned);
  return single !== undefined ? { lower: single, upper: single } : {};
}

export function normalizeGoogleAd(
  row: GooglePoliticalAdRow,
): NormalizedAd | null {
  // ad_id + advertiser_id are the two fields we cannot function without.
  if (!row.ad_id || !row.advertiser_id) return null;
  const impressions = parseImpressionBucket(row.impressions);
  return {
    platform: "google",
    platformAdId: row.ad_id,
    entityId: row.advertiser_id,
    pageOrCommittee: row.advertiser_name ?? row.advertiser_id,
    // The public dataset carries no creative body text.
    creativeText: undefined,
    creativeLinkUrl: row.ad_url,
    snapshotUrl: row.ad_url,
    fundingEntity: row.advertiser_name || undefined,
    status: row.date_range_end ? "inactive" : "active",
    spendLower: num(row.spend_range_min_usd),
    spendUpper: num(row.spend_range_max_usd),
    impressionsLower: impressions.lower,
    impressionsUpper: impressions.upper,
  };
}
