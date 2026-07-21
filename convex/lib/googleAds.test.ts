// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  MatchCandidate,
  PUBLIC_MATCH_THRESHOLD,
  scoreAdMatch,
  TrackedEntity,
} from "./adsMatch";
import { normalizeGoogleAd, parseImpressionBucket } from "./googleAds";
import {
  GOOGLE_ADS_FIXTURE,
  GOOGLE_ADS_FIXTURE_TRACKED_ENTITIES,
} from "./googleAdsFixture";

const candidates: MatchCandidate[] = [
  {
    slug: "kelda-roys",
    name: "Kelda Roys",
    raceId: "WI-GOV-2026",
    office: "Governor",
    level: "State Executive",
  },
];
const tracked: TrackedEntity[] = GOOGLE_ADS_FIXTURE_TRACKED_ENTITIES;

describe("parseImpressionBucket", () => {
  it("parses ranges, upper-only, and lower-only buckets", () => {
    expect(parseImpressionBucket("100k-1M")).toEqual({
      lower: 100000,
      upper: 1000000,
    });
    expect(parseImpressionBucket("10k-100k")).toEqual({
      lower: 10000,
      upper: 100000,
    });
    expect(parseImpressionBucket("≤ 10k")).toEqual({ upper: 10000 });
    expect(parseImpressionBucket("1M+")).toEqual({ lower: 1000000 });
    expect(parseImpressionBucket(undefined)).toEqual({});
    expect(parseImpressionBucket("weird")).toEqual({});
  });
});

describe("normalizeGoogleAd", () => {
  it("maps a creative_stats row into the shared shape", () => {
    const ad = normalizeGoogleAd(GOOGLE_ADS_FIXTURE[0])!;
    expect(ad.platform).toBe("google");
    expect(ad.platformAdId).toBe("g_ad_2001");
    expect(ad.entityId).toBe("AR0000000001");
    expect(ad.pageOrCommittee).toBe("Kelda Roys for Wisconsin");
    expect(ad.spendLower).toBe(5000);
    expect(ad.spendUpper).toBe(10000);
    expect(ad.impressionsLower).toBe(100000);
    expect(ad.impressionsUpper).toBe(1000000);
    expect(ad.status).toBe("active");
    expect(ad.creativeText).toBeUndefined(); // dataset has no creative body
    expect(ad.deliveryStart).toBe("2026-07-01"); // date_range_start, for cycle scope
  });

  it("marks an ad with an end date inactive", () => {
    const ad = normalizeGoogleAd(GOOGLE_ADS_FIXTURE[2])!;
    expect(ad.status).toBe("inactive");
  });

  it("returns null without ad_id or advertiser_id", () => {
    expect(normalizeGoogleAd({ ad_id: "x" })).toBeNull();
    expect(normalizeGoogleAd({ advertiser_id: "y" })).toBeNull();
  });
});

describe("scoreAdMatch reused for Google", () => {
  it("auto-attributes a tracked advertiser, routes name-inference to review", () => {
    const tracked1 = normalizeGoogleAd(GOOGLE_ADS_FIXTURE[0])!;
    const m1 = scoreAdMatch(tracked1, tracked, candidates);
    expect(m1.candidateSlug).toBe("kelda-roys");
    expect(m1.confidence).toBeGreaterThanOrEqual(PUBLIC_MATCH_THRESHOLD);

    const named = normalizeGoogleAd(GOOGLE_ADS_FIXTURE[1])!; // "Roys Victory Fund"
    const m2 = scoreAdMatch(named, tracked, candidates);
    expect(m2.review).toBe(true);
    expect(m2.candidateSlug).toBeUndefined();
    expect(m2.suggestedSlug).toBe("kelda-roys");

    const none = normalizeGoogleAd(GOOGLE_ADS_FIXTURE[2])!;
    expect(scoreAdMatch(none, tracked, candidates).confidence).toBe(0);
  });
});
