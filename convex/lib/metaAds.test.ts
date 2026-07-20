// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  MatchCandidate,
  PUBLIC_MATCH_THRESHOLD,
  scoreAdMatch,
  TrackedEntity,
} from "./adsMatch";
import { normalizeMetaAd } from "./metaAds";
import {
  META_ADS_FIXTURE,
  META_ADS_FIXTURE_TRACKED_PAGES,
} from "./metaAdsFixture";

const candidates: MatchCandidate[] = [
  {
    slug: "kelda-roys",
    name: "Kelda Roys",
    raceId: "WI-GOV-2026",
    office: "Governor",
    level: "State Executive",
  },
  {
    slug: "joel-brennan",
    name: "Joel Brennan",
    raceId: "WI-GOV-2026",
    office: "Governor",
    level: "State Executive",
  },
];
const tracked: TrackedEntity[] = META_ADS_FIXTURE_TRACKED_PAGES;

describe("normalizeMetaAd", () => {
  it("maps Graph fields, taking first of array fields and coercing money", () => {
    const ad = normalizeMetaAd(META_ADS_FIXTURE[0])!;
    expect(ad.platformAdId).toBe("aid_1001");
    expect(ad.entityId).toBe("1000000001");
    expect(ad.pageOrCommittee).toBe("Kelda Roys for Wisconsin");
    expect(ad.creativeText).toContain("reproductive freedom");
    expect(ad.spendLower).toBe(5000);
    expect(ad.spendUpper).toBe(9999);
    expect(ad.impressionsLower).toBe(100000);
    expect(ad.status).toBe("active");
  });

  it("marks an ad with a stop time inactive", () => {
    const ad = normalizeMetaAd(META_ADS_FIXTURE[2])!;
    expect(ad.status).toBe("inactive");
  });

  it("returns null without an id or page_id", () => {
    expect(normalizeMetaAd({ page_id: "1" })).toBeNull();
    expect(normalizeMetaAd({ id: "1" })).toBeNull();
  });
});

describe("scoreAdMatch", () => {
  it("auto-attributes a verified tracked page above the public threshold", () => {
    const ad = normalizeMetaAd(META_ADS_FIXTURE[0])!;
    const m = scoreAdMatch(ad, tracked, candidates);
    expect(m.candidateSlug).toBe("kelda-roys");
    expect(m.raceId).toBe("WI-GOV-2026");
    expect(m.review).toBe(false);
    expect(m.confidence).toBeGreaterThanOrEqual(PUBLIC_MATCH_THRESHOLD);
  });

  it("routes a name-inferred (untracked page) match to review, never public", () => {
    const ad = normalizeMetaAd(META_ADS_FIXTURE[1])!;
    const m = scoreAdMatch(ad, tracked, candidates);
    expect(m.review).toBe(true);
    expect(m.candidateSlug).toBeUndefined(); // not public
    expect(m.suggestedSlug).toBe("kelda-roys");
    expect(m.confidence).toBeLessThan(PUBLIC_MATCH_THRESHOLD);
  });

  it("leaves an ad with no candidate signal unmatched (no review noise)", () => {
    const ad = normalizeMetaAd(META_ADS_FIXTURE[2])!;
    const m = scoreAdMatch(ad, tracked, candidates);
    expect(m.confidence).toBe(0);
    expect(m.review).toBe(false);
    expect(m.candidateSlug).toBeUndefined();
  });

  it("does not match a surname as a substring of another word", () => {
    // "Roys" must not match inside e.g. "corduroys"
    const ad = normalizeMetaAd({
      id: "x",
      page_id: "p",
      page_name: "Corduroys of Wisconsin",
    })!;
    const m = scoreAdMatch(ad, [], candidates);
    expect(m.suggestedSlug).toBeUndefined();
  });
});
