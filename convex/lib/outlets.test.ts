import { describe, expect, test } from "vitest";
import { normalizeOutletKey, OUTLET_TYPES, scoreRelevance, HUB_RELEVANCE_MIN, parseOutletTransparency, cleanPublishedAt, decorateCoverageRow } from "./outlets";
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

describe("decorateCoverageRow reads the url slug, not just the headline", () => {
  const ctx = {
    candidateNames: ["Sara Rodriguez", "Francesca Hong"],
    raceKeywords: ["governor", "treasurer"],
  };

  test("recovers an article whose candidate is only in the slug", () => {
    // Real row that sat below the gate: the headline never names her, the
    // publisher's slug does.
    const r = decorateCoverageRow(
      {
        outlet: "WisPolitics",
        headline: "Straw poll results announced at state convention",
        url: "https://www.wispolitics.com/2026/rodriguez-wins-wispolitics-straw-poll-for-governor/",
      },
      ctx,
    );
    // 0.7, not 1: the slug carries the surname but not the full name, and a
    // bare surname must not assert the story is about THAT person — the same
    // collision risk the roll-call matching refuses to take. Clearing the gate
    // is the requirement; claiming certainty is not.
    expect(r.relevanceScore).toBeGreaterThanOrEqual(HUB_RELEVANCE_MIN);
    expect(r.hubStatus).toBe("auto");
  });

  test("recovers a race-keyword article from the slug", () => {
    const r = decorateCoverageRow(
      {
        outlet: "WPR",
        headline: "A closer look at an office few voters think about",
        url: "https://www.wpr.org/economy/wisconsin-treasurer-race-focuses-whether-expand-office",
      },
      ctx,
    );
    expect(r.relevanceScore).toBeGreaterThanOrEqual(HUB_RELEVANCE_MIN);
  });

  test("does not let the DOMAIN alone qualify an unrelated story", () => {
    // The domain is stripped before scoring: an outlet called "governor
    // something" must not make every one of its pages relevant.
    const r = decorateCoverageRow(
      { outlet: "Example", headline: "Packers sign new quarterback", url: "https://governor.example.com/sports/packers-qb" },
      ctx,
    );
    expect(r.relevanceScore).toBeLessThan(HUB_RELEVANCE_MIN);
  });
});
