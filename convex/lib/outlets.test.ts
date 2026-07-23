import { describe, expect, test } from "vitest";
import { normalizeOutletKey, OUTLET_TYPES, scoreRelevance, HUB_RELEVANCE_MIN } from "./outlets";

describe("normalizeOutletKey", () => {
  test("lowercases, strips punctuation, collapses spaces", () => {
    expect(normalizeOutletKey("Milwaukee Journal Sentinel")).toBe("milwaukee journal sentinel");
    expect(normalizeOutletKey("Urban Milwaukee!")).toBe("urban milwaukee");
    expect(normalizeOutletKey("WPR.org")).toBe("wpr org");
  });
  test("same outlet, punctuation variants collapse to one key", () => {
    expect(normalizeOutletKey("Wisconsin Watch")).toBe(normalizeOutletKey("Wisconsin  Watch."));
  });
  test("taxonomy includes the eight v1 types", () => {
    expect(OUTLET_TYPES).toContain("nonprofit");
    expect(OUTLET_TYPES).toContain("public_media");
    expect(OUTLET_TYPES.length).toBe(8);
  });
});

describe("scoreRelevance", () => {
  const ctx = { candidateNames: ["Francesca Hong", "Tom Tiffany"], raceKeywords: ["governor", "u.s. senate"] };
  test("names a tracked candidate → hub-eligible", () => {
    const r = scoreRelevance("Francesca Hong unveils housing plan", ctx);
    expect(r.score).toBeGreaterThanOrEqual(HUB_RELEVANCE_MIN);
    expect(r.reason).toContain("Francesca Hong");
  });
  test("off-topic (no candidate, no race, no WI-election term) → below floor", () => {
    expect(scoreRelevance("Packers sign new quarterback", ctx).score).toBeLessThan(HUB_RELEVANCE_MIN);
  });
  test("WI-election term without a candidate still scores low but non-zero", () => {
    const r = scoreRelevance("Wisconsin governor race heats up", ctx);
    expect(r.score).toBeGreaterThanOrEqual(HUB_RELEVANCE_MIN);
  });
});
