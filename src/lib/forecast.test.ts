import { describe, expect, test } from "vitest";
import { parsePct, sampleSize, parsePrimaryPolls, aggregate, project, winProbability } from "./forecast";

describe("forecast helpers", () => {
  test("parsePct handles %, ranges, junk", () => {
    expect(parsePct("38%")).toBe(38);
    expect(parsePct("26-27%")).toBe(26.5);
    expect(parsePct("Barnes +4 (44-40)")).toBeCloseTo((4 + 44 + 40) / 3); // best-effort numeric
    expect(parsePct("note")).toBeNull();
    expect(parsePct(undefined)).toBeNull();
  });

  test("sampleSize tolerates messy strings", () => {
    expect(sampleSize(407)).toBe(407);
    expect(sampleSize("~600 delegates")).toBe(600);
    expect(sampleSize(undefined)).toBe(300);
  });

  test("parsePrimaryPolls keeps only polls with >=2 active Dems", () => {
    const raw = [
      { conductedEnd: "2026-07-29", sampleSize: 407, pollster: "Marquette", groups: [{ rows: [
        { candidateSlug: "francesca-hong", value: "38%" },
        { candidateSlug: "kelda-roys", value: "2%" },
      ] }] },
      // general-election matchup — only Tiffany + one Dem -> dropped
      { conductedEnd: "2026-07-06", sampleSize: 700, pollster: "X", groups: [{ rows: [
        { candidateSlug: "tom-tiffany", value: "44%" },
        { candidateSlug: "francesca-hong", value: "47%" },
      ] }] },
    ];
    const clean = parsePrimaryPolls(raw);
    expect(clean).toHaveLength(1);
    expect(clean[0].values).toEqual({ Hong: 38, Roys: 2 });
  });

  test("aggregate + project sum sensibly and winProbability is a distribution", () => {
    const polls = [
      { date: "2026-07-29", n: 400, pollster: "M", values: { Hong: 38, Crowley: 7, Brennan: 2, Roys: 2 } },
    ];
    const avg = aggregate(polls, 21);
    expect(avg.Hong).toBeGreaterThan(avg.Crowley);
    const { projected, leftover } = project(avg, 0);
    expect(leftover).toBeGreaterThan(0); // undecided remains
    expect(Object.values(projected).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
    const wp = winProbability(avg, 7, 2000);
    const total = Object.values(wp).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 0);
    expect(wp.Hong).toBeGreaterThan(50); // clear polling lead
  });
});
