import { describe, expect, test } from "vitest";
import { matchesQuery, summarize, billUrl } from "./votingRecord";

describe("matchesQuery", () => {
  test("matches every query word whole-word, any order, case-insensitively", () => {
    expect(matchesQuery("CHILD CARE CENTER RENOVATIONS LOAN PROGRAM", "AB 388", "child care loan")).toBe(true);
    expect(matchesQuery("CHILD CARE CENTER RENOVATIONS LOAN PROGRAM", "AB 388", "AB 388")).toBe(true);
    expect(matchesQuery("CHILD CARE CENTER RENOVATIONS LOAN PROGRAM", "AB 388", "transportation")).toBe(false);
    expect(matchesQuery("", "", "")).toBe(true); // empty query matches
  });
  test("boundary-anchored: 'aid' does not match 'paid'", () => {
    expect(matchesQuery("REQUIRING WAGES BE PAID PROMPTLY", "AB 1", "aid")).toBe(false);
  });
});

describe("summarize", () => {
  test("buckets by position and session (session = voteKey prefix), newest session first", () => {
    const s = summarize([
      { voteKey: "2015-assembly-av0001", position: "aye" },
      { voteKey: "2015-assembly-av0002", position: "nay" },
      { voteKey: "2013-assembly-av0001", position: "aye" },
      { voteKey: "2013-assembly-av0002", position: "not_voting" },
    ]);
    expect(s.total).toBe(4);
    expect(s.byPosition).toEqual({ aye: 2, nay: 1, not_voting: 1 });
    expect(s.chamber).toBe("assembly");
    expect(s.sessions).toEqual([
      { session: "2015", count: 2 },
      { session: "2013", count: 2 },
    ]);
    expect(s.participationRate).toBeCloseTo(0.75); // (2 aye + 1 nay) / 4
  });
});

describe("billUrl", () => {
  test("builds the canonical proposal URL, lowercased and space-stripped", () => {
    expect(billUrl("2013", "AB 181")).toBe("https://docs.legis.wisconsin.gov/2013/related/proposals/ab181");
    expect(billUrl("2023", "SJR 1")).toBe("https://docs.legis.wisconsin.gov/2023/related/proposals/sjr1");
  });
});
