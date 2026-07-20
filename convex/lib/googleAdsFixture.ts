import type { GooglePoliticalAdRow } from "./googleAds";

/**
 * Sample rows from google_political_ads.creative_stats for building the Google
 * adapter (MOO-315) without GCP/BigQuery access. Mirrors the Meta fixture's
 * three routing outcomes:
 *  - g_ad_2001: from a verified tracked advertiser → auto-attributes publicly
 *  - g_ad_2002: candidate name in an UNtracked advertiser's ad → review only
 *  - g_ad_2003: no candidate signal → stored, unattributed, no review
 */
export const GOOGLE_ADS_FIXTURE: GooglePoliticalAdRow[] = [
  {
    ad_id: "g_ad_2001",
    ad_url: "https://adstransparency.google.com/advertiser/AR01/creative/g_ad_2001",
    ad_type: "TEXT",
    advertiser_id: "AR0000000001",
    advertiser_name: "Kelda Roys for Wisconsin",
    date_range_start: "2026-07-01",
    spend_range_min_usd: 5000,
    spend_range_max_usd: 10000,
    impressions: "100k-1M",
  },
  {
    ad_id: "g_ad_2002",
    ad_url: "https://adstransparency.google.com/advertiser/AR02/creative/g_ad_2002",
    ad_type: "VIDEO",
    advertiser_id: "AR0000000002",
    // Untracked advertiser whose name carries the candidate's surname → the
    // name-inference path routes it to review, never straight to public.
    advertiser_name: "Roys Victory Fund",
    date_range_start: "2026-07-05",
    spend_range_min_usd: 1000,
    spend_range_max_usd: 5000,
    impressions: "10k-100k",
  },
  {
    ad_id: "g_ad_2003",
    ad_url: "https://adstransparency.google.com/advertiser/AR03/creative/g_ad_2003",
    ad_type: "IMAGE",
    advertiser_id: "AR0000000003",
    advertiser_name: "Wisconsin Manufacturers Council",
    date_range_start: "2026-07-03",
    date_range_end: "2026-07-12",
    spend_range_min_usd: 500,
    spend_range_max_usd: 1000,
    impressions: "≤ 10k",
  },
];

/** The one advertiser we "know" belongs to a candidate in the fixture set. */
export const GOOGLE_ADS_FIXTURE_TRACKED_ENTITIES = [
  { entityId: "AR0000000001", candidateSlug: "kelda-roys", raceId: "WI-GOV-2026" },
];
