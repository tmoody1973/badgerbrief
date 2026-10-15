import { describe, expect, test } from "vitest";
import { groupCandidateAds } from "./candidate-ads";

const ad = (id: string, pageOrCommittee: string, spendLower?: number, spendUpper?: number, stance: "support" | "oppose" = "oppose") => ({
  _id: id,
  pageOrCommittee,
  stance,
  spendLower,
  spendUpper,
});

describe("groupCandidateAds", () => {
  const groups = groupCandidateAds([
    ad("a", "Democratic Governors Association", 1000, 1999),
    ad("b", "Democratic Governors Association,", 5000, 9999),
    ad("c", "Tiffany for Wisconsin", 20000, 24999, "support"),
    ad("d", "Small PAC"),
  ]);

  test("one row per sponsor, however the ad spells the name, biggest disclosed spend first", () => {
    expect(groups.map((g) => [g.sponsor, g.ads.map((a) => a._id)])).toEqual([
      ["Tiffany for Wisconsin", ["c"]],
      ["Democratic Governors Association", ["a", "b"]],
      ["Small PAC", ["d"]],
    ]);
  });

  test("adds up Meta's disclosed ranges, low end and high end, rather than inventing a single number", () => {
    expect(groups[1]).toMatchObject({ spendLower: 6000, spendUpper: 11998 });
  });

  test("says nothing about spend when no ad disclosed any", () => {
    expect(groups[2]).toMatchObject({ spendLower: undefined, spendUpper: undefined });
  });
});
