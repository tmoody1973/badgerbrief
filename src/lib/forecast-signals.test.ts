import { describe, expect, test } from "vitest";
import { socialShares, adSpendShares, newsShares } from "./forecast-signals";

describe("forecast signal share builders", () => {
  test("socialShares sums followers per active Dem then normalizes", () => {
    const social = [
      { candidateSlug: "francesca-hong", platform: "twitter", followers: 120000 },
      { candidateSlug: "francesca-hong", platform: "instagram", followers: 40000 },
      { candidateSlug: "kelda-roys", platform: "twitter", followers: 40000 },
      { candidateSlug: "tom-tiffany", platform: "twitter", followers: 90000 }, // not an active Dem → excluded
    ] as any;
    const s = socialShares(social);
    expect(s.Hong).toBeCloseTo(0.8); // 160k / 200k
    expect(s.Roys).toBeCloseTo(0.2);
    expect(s.Tiffany).toBeUndefined();
  });

  test("adSpendShares uses per-candidate totalSpend", () => {
    const adMoney = { candidates: [
      { candidateSlug: "francesca-hong", totalSpend: 30000 },
      { candidateSlug: "david-crowley", totalSpend: 10000 },
    ] } as any;
    const s = adSpendShares(adMoney);
    expect(s.Hong).toBeCloseTo(0.75);
    expect(s.Crowley).toBeCloseTo(0.25);
  });

  test("newsShares uses max(0, positive-negative) favorable-coverage volume", () => {
    const tone = [
      { candidateSlug: "francesca-hong", positive: 4, negative: 1 },
      { candidateSlug: "kelda-roys", positive: 1, negative: 3 }, // net negative → 0 share
    ] as any;
    const s = newsShares(tone);
    expect(s.Hong).toBeCloseTo(1); // 3 vs 0
    expect(s.Roys).toBeCloseTo(0);
  });
});
