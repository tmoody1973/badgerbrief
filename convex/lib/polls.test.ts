import { describe, expect, test } from "vitest";
import {
  isScientific,
  matchCandidate,
  normalizePoll,
  normalizeResults,
  normalizeSampleSize,
  parseConducted,
} from "./polls";

const CANDIDATES = [
  { name: "Francesca Hong", slug: "francesca-hong" },
  { name: "Mandela Barnes", slug: "mandela-barnes" },
  { name: "Kelda Roys", slug: "kelda-roys" },
  { name: "Tom Tiffany", slug: "tom-tiffany" },
];

describe("parseConducted", () => {
  test("reads a range and a single date the same way", () => {
    expect(parseConducted("2026-07-08 to 2026-07-16")).toEqual({
      start: "2026-07-08",
      end: "2026-07-16",
    });
    expect(parseConducted("2026-07-06")).toEqual({
      start: "2026-07-06",
      end: "2026-07-06",
    });
  });

  test("returns null rather than guessing at an unparseable date", () => {
    expect(parseConducted("sometime in July")).toBeNull();
    expect(parseConducted(undefined)).toBeNull();
  });
});

describe("normalizeSampleSize", () => {
  test("keeps the qualifier that makes a straw poll a straw poll", () => {
    // Coercing this to a number would drop "delegates/guests" — the part that
    // tells a reader it is not a voter sample.
    expect(normalizeSampleSize("~600 delegates/guests")).toBe("~600 delegates/guests");
    expect(normalizeSampleSize(430)).toBe("430");
    expect(normalizeSampleSize(undefined)).toBeNull();
  });
});

describe("isScientific", () => {
  test("flags straw polls", () => {
    expect(isScientific("Non-scientific straw poll (Democratic activists/delegates)")).toBe(false);
    expect(isScientific("Democratic primary")).toBe(true);
  });
});

describe("matchCandidate", () => {
  test("matches a full name and a unique surname", () => {
    expect(matchCandidate("Francesca Hong", CANDIDATES)).toBe("francesca-hong");
    // Head-to-head polls print bare surnames.
    expect(matchCandidate("Barnes", CANDIDATES)).toBe("mandela-barnes");
  });

  test("refuses a shared surname rather than linking the wrong person", () => {
    const twoHongs = [...CANDIDATES, { name: "Peter Hong", slug: "peter-hong" }];
    expect(matchCandidate("Hong", twoHongs)).toBeNull();
  });

  test("never matches a name carrying a qualifier", () => {
    // "(undeclared)" people are not on our ballot; linking them to a candidate
    // page would assert a candidacy that does not exist.
    expect(matchCandidate("Josh Kaul (undeclared)", CANDIDATES)).toBeNull();
  });

  test("never matches non-candidate rows", () => {
    expect(matchCandidate("Undecided", CANDIDATES)).toBeNull();
    expect(matchCandidate("Other", CANDIDATES)).toBeNull();
  });
});

describe("normalizeResults", () => {
  test("orders by the leading percentage, prose last", () => {
    const [group] = normalizeResults(
      {
        "Kelda Roys": "2%",
        "Francesca Hong": "26-27%",
        Undecided: "45-48%",
        Note: "Full breakdown available via Wikipedia table.",
      },
      CANDIDATES,
    );
    expect(group.rows.map((r) => r.label)).toEqual([
      "Undecided",
      "Francesca Hong",
      "Kelda Roys",
      "Note",
    ]);
  });

  test("keeps the published value verbatim, ranges and prose alike", () => {
    const [group] = normalizeResults(
      { "Francesca Hong": "26-27%", Margin: "R +2.2" },
      CANDIDATES,
    );
    // A range must survive as a range — turning "26-27%" into 26.5 invents
    // precision the pollster declined to publish.
    expect(group.rows.find((r) => r.label === "Francesca Hong")?.value).toBe("26-27%");
    expect(group.rows.find((r) => r.label === "Margin")?.value).toBe("R +2.2");
  });

  test("splits a poll that covers both primaries into labelled groups", () => {
    const groups = normalizeResults(
      {
        democratic: { "Mandela Barnes": "16%", Undecided: "38%" },
        republican: { "Tom Tiffany": "30%", Undecided: "34%" },
      },
      CANDIDATES,
    );
    expect(groups.map((g) => g.label)).toEqual(["Democratic", "Republican"]);
    expect(groups[0].rows[0].label).toBe("Undecided"); // 38% > 16%
  });
});

describe("normalizePoll", () => {
  const base = {
    pollster: "Marquette University Law School Poll",
    poll_type: "Democratic primary",
    date_conducted: "2026-07-08 to 2026-07-16",
    date_released: "2026-07-22",
    sample_size: 430,
    sample_type: "Registered voters",
    margin_of_error: "+/- 6.1%",
    results: { "Francesca Hong": "26-27%", "Mandela Barnes": "15-18%" },
    urls: ["https://law.marquette.edu/poll/"],
  };
  const ref = { raceId: "WI-GOV-2026", candidates: CANDIDATES };

  test("normalizes a real Marquette poll", () => {
    const p = normalizePoll(base, ref);
    if ("error" in p) throw new Error(p.error);
    expect(p.pollster).toContain("Marquette");
    expect(p.conductedStart).toBe("2026-07-08");
    expect(p.conductedEnd).toBe("2026-07-16");
    expect(p.sampleSize).toBe("430");
    expect(p.scientific).toBe(true);
    expect(p.sources[0]).toEqual({ name: "law.marquette.edu", url: "https://law.marquette.edu/poll/" });
  });

  test("the natural key is stable, so re-importing does not duplicate", () => {
    const a = normalizePoll(base, ref);
    const b = normalizePoll({ ...base }, ref);
    if ("error" in a || "error" in b) throw new Error("expected both to parse");
    expect(a.pollKey).toBe(b.pollKey);
  });

  test("REFUSES a poll with no source url", () => {
    // Every claim on the site links to its source; an unsourced poll cannot
    // meet that bar, so it is not shown at all.
    expect(normalizePoll({ ...base, urls: [] }, ref)).toEqual({
      error: "Marquette University Law School Poll: no source urls",
    });
  });

  test("REFUSES a poll with no usable date", () => {
    expect(normalizePoll({ ...base, date_conducted: "last spring" }, ref)).toEqual({
      error: 'Marquette University Law School Poll: unparseable date_conducted "last spring"',
    });
  });

  test("REFUSES a poll with no results", () => {
    expect(normalizePoll({ ...base, results: {} }, ref)).toEqual({
      error: "Marquette University Law School Poll: no results",
    });
  });

  test("carries the straw-poll flag through", () => {
    const p = normalizePoll(
      {
        ...base,
        poll_type: "Non-scientific straw poll (Democratic activists/delegates)",
        sample_size: "~600 delegates/guests",
      },
      ref,
    );
    if ("error" in p) throw new Error(p.error);
    expect(p.scientific).toBe(false);
    expect(p.sampleSize).toBe("~600 delegates/guests");
  });
});
