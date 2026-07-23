import { describe, expect, test } from "vitest";
import { normalizeOutletKey, OUTLET_TYPES, scoreRelevance, HUB_RELEVANCE_MIN, parseOutletTransparency, cleanPublishedAt } from "./outlets";
import outletRaw from "./fixtures/outlet-firecrawl.json";

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

test("parseOutletTransparency maps a payload to transparency fields", () => {
  const p = parseOutletTransparency(outletRaw);
  expect(p.type).toBe("nonprofit");
  expect(p.ownership).toMatch(/nonprofit/i);
  expect(p.ownershipSourceUrl).toMatch(/^https?:\/\//);
});
test("parseOutletTransparency falls back to 'other' on unknown type", () => {
  expect(parseOutletTransparency({ type: "??", ownership: "x", sourceUrl: "https://a" }).type).toBe("other");
});

describe("cleanPublishedAt", () => {
  const NOW = Date.parse("2026-07-22T12:00:00Z");
  test("keeps a real past date, normalized to YYYY-MM-DD", () => {
    expect(cleanPublishedAt("2026-06-15", NOW)).toBe("2026-06-15");
  });
  test("drops a hallucinated FUTURE date", () => {
    expect(cleanPublishedAt("2026-09-30", NOW)).toBeUndefined();
  });
  test("drops unparseable junk the LLM emits", () => {
    expect(cleanPublishedAt("N/A", NOW)).toBeUndefined();
    expect(cleanPublishedAt("2026-06-", NOW)).toBeUndefined();
    expect(cleanPublishedAt("", NOW)).toBeUndefined();
    expect(cleanPublishedAt(undefined, NOW)).toBeUndefined();
  });
  test("tolerates one day of clock/timezone skew", () => {
    expect(cleanPublishedAt("2026-07-23", NOW)).toBe("2026-07-23");
    expect(cleanPublishedAt("2026-07-25", NOW)).toBeUndefined();
  });
});
