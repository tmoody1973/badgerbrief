import { describe, expect, test } from "vitest";
import {
  mid,
  isOwnCommittee,
  rollupCandidate,
  rollupRace,
  type AdRow,
} from "./adMoney";

const ad = (o: Partial<AdRow>): AdRow => ({
  pageOrCommittee: "",
  ...o,
});

describe("mid", () => {
  test("averages both bounds", () => expect(mid(100, 200)).toBe(150));
  test("uses the single present bound", () => {
    expect(mid(100, undefined)).toBe(100);
    expect(mid(undefined, 200)).toBe(200);
  });
  test("no bounds → 0", () => expect(mid()).toBe(0));
});

describe("isOwnCommittee", () => {
  test("surname in sponsor → own", () =>
    expect(isOwnCommittee("Tiffany for Governor", "Tom Tiffany")).toBe(true));
  test("unrelated PAC → outside", () =>
    expect(isOwnCommittee("A Better Wisconsin Together", "Tom Tiffany")).toBe(false));
  test("empty name → outside", () =>
    expect(isOwnCommittee("Anything", "")).toBe(false));
});

describe("rollupCandidate", () => {
  const cand = { slug: "tom-tiffany", name: "Tom Tiffany" };
  test("own-committee support → own + support", () => {
    const r = rollupCandidate(
      [ad({ candidateSlug: "tom-tiffany", stance: "support", pageOrCommittee: "Tiffany for Governor", spendLower: 100, spendUpper: 300, impressionsLower: 1000, impressionsUpper: 3000 })],
      cand,
    );
    expect(r.supportSpend).toBe(200);
    expect(r.ownSpend).toBe(200);
    expect(r.outsideSpend).toBe(0);
    expect(r.impressions).toBe(2000);
    expect(r.adCount).toBe(1);
  });
  test("outside support PAC → support but outside", () => {
    const r = rollupCandidate(
      [ad({ candidateSlug: "tom-tiffany", stance: "support", pageOrCommittee: "Freedom PAC", spendLower: 50, spendUpper: 150 })],
      cand,
    );
    expect(r.supportSpend).toBe(100);
    expect(r.ownSpend).toBe(0);
    expect(r.outsideSpend).toBe(100);
  });
  test("attack → attack + outside", () => {
    const r = rollupCandidate(
      [ad({ candidateSlug: "tom-tiffany", stance: "oppose", pageOrCommittee: "A Better Wisconsin Together", spendLower: 20, spendUpper: 40 })],
      cand,
    );
    expect(r.attackSpend).toBe(30);
    expect(r.outsideSpend).toBe(30);
    expect(r.supportSpend).toBe(0);
  });
  test("no stance → excluded from sums, counted in adCount + unclassified", () => {
    const r = rollupCandidate(
      [ad({ candidateSlug: "tom-tiffany", pageOrCommittee: "Mystery", spendLower: 500, spendUpper: 500 })],
      cand,
    );
    expect(r.supportSpend).toBe(0);
    expect(r.attackSpend).toBe(0);
    expect(r.adCount).toBe(1);
    expect(r.unclassifiedCount).toBe(1);
  });
});

describe("rollupRace", () => {
  const candidates = [
    { slug: "tom-tiffany", name: "Tom Tiffany" },
    { slug: "jane-doe", name: "Jane Doe" },
  ];
  const ads: AdRow[] = [
    ad({ candidateSlug: "tom-tiffany", stance: "support", pageOrCommittee: "Tiffany for Governor", spendLower: 800000, spendUpper: 834000 }),
    ad({ candidateSlug: "tom-tiffany", stance: "oppose", pageOrCommittee: "A Better Wisconsin Together", spendLower: 60000, spendUpper: 80000 }),
    ad({ candidateSlug: "jane-doe", stance: "support", pageOrCommittee: "Doe for WI", spendLower: 10000, spendUpper: 10000 }),
  ];
  test("totals, shares, most-attacked", () => {
    const r = rollupRace(ads, candidates);
    // support: 817000 (Tiffany own) + 10000 (Doe) = 827000; attack: 70000
    expect(r.totalSpend).toBe(897000);
    expect(r.outsideSpend).toBe(70000); // only the attack is outside here
    expect(r.mostAttacked).toBe("tom-tiffany");
    expect(Math.round(r.supportShare * 1000)).toBe(922); // 827000/897000
    expect(r.candidates[0].slug).toBe("tom-tiffany"); // sorted desc by spend
  });
  test("no attributed ads → empty candidates, zero totals, null mostAttacked", () => {
    const r = rollupRace([], candidates);
    expect(r.candidates).toEqual([]);
    expect(r.totalSpend).toBe(0);
    expect(r.mostAttacked).toBeNull();
    expect(r.supportShare).toBe(0);
  });
});
