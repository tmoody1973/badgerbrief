import { describe, expect, test } from "vitest";
import { isFullSweep, scoutHealthAlert } from "./scoutHealth";

const run = (over: Partial<Parameters<typeof scoutHealthAlert>[0]>) =>
  scoutHealthAlert({ attempted: 32, errors: 0, proposed: 5, daysSinceLastArticle: 0, ...over });

describe("scoutHealthAlert", () => {
  test("a healthy run raises nothing", () => {
    expect(run({})).toBeNull();
  });

  test("every search failing is critical, and quotes the error", () => {
    // The live state from Sept 29 to Oct 12, 2026.
    expect(run({ errors: 32, proposed: 0, sampleError: "perplexity request failed (http 401)", daysSinceLastArticle: 14 })).toEqual({
      refId: "article-scout:failing",
      kind: "sync_failure",
      severity: "critical",
      message: "News discovery: 32 of 32 searches failed (perplexity request failed (http 401)). /news is not receiving new coverage.",
    });
  });

  test("half failing is still a failure; a few is not", () => {
    expect(run({ errors: 16 })?.refId).toBe("article-scout:failing");
    expect(run({ errors: 3 })).toBeNull();
  });

  test("three days of finding nothing is a warning", () => {
    expect(run({ proposed: 0, daysSinceLastArticle: 3 })).toMatchObject({
      refId: "article-scout:quiet",
      kind: "staleness",
      severity: "warning",
      message: "News discovery has found nothing new for 3 days.",
    });
  });

  test("a quiet day or two is normal", () => {
    expect(run({ proposed: 0, daysSinceLastArticle: 2 })).toBeNull();
    expect(run({ proposed: 0, daysSinceLastArticle: null })).toBeNull();
  });
});

describe("isFullSweep", () => {
  test("only the scheduled run, with no arguments, is judged for health", () => {
    // A one-candidate test run must not open, or close, the alert for the daily job.
    expect(isFullSweep({})).toBe(true);
    expect(isFullSweep({ limit: 1 })).toBe(false);
    expect(isFullSweep({ candidateSlugs: ["tom-tiffany"] })).toBe(false);
  });
});
