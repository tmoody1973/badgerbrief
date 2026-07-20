import type { MetaAdArchiveEntry } from "./metaAds";

/**
 * Sample Meta `ads_archive` responses for building against without a live
 * token (MOO-309). Shapes match the real Graph API. Covers the three routing
 * outcomes the pipeline must get right:
 *  - aid_1001: from a verified tracked page → auto-attributes publicly
 *  - aid_1002: candidate name in an UNtracked PAC's ad → review queue only
 *  - aid_1003: no candidate signal → stored on /ads, unattributed, no review
 *
 * Pair with `META_ADS_FIXTURE_TRACKED_PAGES` when calling syncMetaAds.
 */
export const META_ADS_FIXTURE: MetaAdArchiveEntry[] = [
  {
    id: "aid_1001",
    page_id: "1000000001",
    page_name: "Kelda Roys for Wisconsin",
    bylines: "Roys for Wisconsin",
    ad_creative_bodies: [
      "Kelda Roys will protect reproductive freedom for every Wisconsinite.",
    ],
    ad_creative_link_captions: ["keldaroys.com"],
    ad_snapshot_url: "https://www.facebook.com/ads/library/?id=aid_1001",
    ad_delivery_start_time: "2026-07-01T00:00:00+0000",
    spend: { lower_bound: "5000", upper_bound: "9999" },
    impressions: { lower_bound: "100000", upper_bound: "200000" },
    currency: "USD",
  },
  {
    id: "aid_1002",
    page_id: "9000000002",
    page_name: "Progressive Wisconsin Action Fund",
    bylines: "Progressive Wisconsin Action Fund",
    ad_creative_bodies: [
      "Kelda Roys is the leader Wisconsin needs for Governor. Vote August 11.",
    ],
    ad_snapshot_url: "https://www.facebook.com/ads/library/?id=aid_1002",
    ad_delivery_start_time: "2026-07-05T00:00:00+0000",
    spend: { lower_bound: "1000", upper_bound: "4999" },
    impressions: { lower_bound: "20000", upper_bound: "50000" },
    currency: "USD",
  },
  {
    id: "aid_1003",
    page_id: "9000000003",
    page_name: "Wisconsin Taxpayers Alliance",
    bylines: "Wisconsin Taxpayers Alliance",
    ad_creative_bodies: ["Lower taxes and less spending for a stronger Wisconsin."],
    ad_snapshot_url: "https://www.facebook.com/ads/library/?id=aid_1003",
    ad_delivery_start_time: "2026-07-03T00:00:00+0000",
    ad_delivery_stop_time: "2026-07-10T00:00:00+0000",
    spend: { lower_bound: "500", upper_bound: "999" },
    impressions: { lower_bound: "5000", upper_bound: "10000" },
    currency: "USD",
  },
];

/** The one page we "know" belongs to a candidate in the fixture set. */
export const META_ADS_FIXTURE_TRACKED_PAGES = [
  { pageId: "1000000001", candidateSlug: "kelda-roys", raceId: "WI-GOV-2026" },
];
