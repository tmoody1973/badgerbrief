import { describe, expect, test } from "vitest";
import { CATEGORY_META, computeSegments } from "./financeSegments";

const cats = [
  { key: "individuals", amount: 300, count: 2, topDonors: [] },
  { key: "party", amount: 500, count: 1, topDonors: [] },
  { key: "pac", amount: 200, count: 1, topDonors: [] },
];

describe("computeSegments", () => {
  test("percentages sum to exactly 100", () => {
    const segs = computeSegments(cats);
    expect(segs.reduce((s, x) => s + x.pct, 0)).toBe(100);
  });

  test("keeps fixed category order and attaches meta", () => {
    const segs = computeSegments(cats);
    expect(segs.map((s) => s.key)).toEqual(["individuals", "party", "pac"]);
    expect(segs[0].label).toBe(CATEGORY_META.individuals.label);
    expect(segs[0].color).toBe(CATEGORY_META.individuals.color);
  });

  test("absent or empty input renders nothing", () => {
    expect(computeSegments(undefined)).toEqual([]);
    expect(computeSegments([])).toEqual([]);
    expect(computeSegments([{ key: "individuals", amount: 0, count: 0, topDonors: [] }])).toEqual([]);
  });

  test("sub-1% category is folded into other, donors preserved", () => {
    const donor = { name: "Tiny PAC", amount: 3, location: "Madison, WI" };
    const segs = computeSegments([
      { key: "individuals", amount: 997, count: 5, topDonors: [] },
      { key: "pac", amount: 3, count: 1, topDonors: [donor] }, // 0.3% of 1000
    ]);
    expect(segs.map((s) => s.key)).toEqual(["individuals", "other"]);
    const other = segs.find((s) => s.key === "other")!;
    expect(other.amount).toBe(3);
    expect(other.count).toBe(1);
    expect(other.topDonors).toContainEqual(donor);
  });

  test("awkward three-way split still sums to exactly 100", () => {
    const segs = computeSegments([
      { key: "individuals", amount: 1, count: 1, topDonors: [] },
      { key: "party", amount: 1, count: 1, topDonors: [] },
      { key: "pac", amount: 1, count: 1, topDonors: [] },
    ]);
    expect(segs.every((s) => Number.isInteger(s.pct))).toBe(true);
    expect(segs.reduce((s, x) => s + x.pct, 0)).toBe(100);
  });
});
