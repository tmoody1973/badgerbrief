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
    expect(s.byPosition).toEqual({ aye: 2, nay: 1, present: 0, not_voting: 1 });
    expect(s.chamber).toBe("assembly");
    expect(s.sessions).toEqual([
      { session: "2015", count: 2 },
      { session: "2013", count: 2 },
    ]);
    expect(s.participationRate).toBeCloseTo(0.75); // (2 aye + 1 nay) / 4
  });

  test("reads us_house out of a federal voteKey", () => {
    // The federal key is "119-us_house-1-100": the chamber MUST stay at index 1,
    // because summarize takes it from the key with no join. Ordering it as
    // congress-session-chamber-roll instead would silently read chamber "1" and
    // every federal record would render as an Assembly one.
    const s = summarize([
      { voteKey: "119-us_house-1-100", position: "aye" },
      { voteKey: "119-us_house-1-122", position: "nay" },
    ]);
    expect(s.chamber).toBe("us_house");
    expect(s.sessions).toEqual([{ session: "119", count: 2 }]);
  });

  test("counts Present as participation, in its own bucket", () => {
    // Voting Present is a deliberate act on the record — the member was there
    // and declined to take a side. Folding it into not_voting would understate
    // attendance; folding it into aye/nay would invent a position.
    const s = summarize([
      { voteKey: "119-us_house-1-100", position: "aye" },
      { voteKey: "119-us_house-1-101", position: "present" },
      { voteKey: "119-us_house-1-102", position: "not_voting" },
    ]);
    expect(s.byPosition).toEqual({ aye: 1, nay: 0, present: 1, not_voting: 1 });
    expect(s.participationRate).toBeCloseTo(2 / 3);
  });
});

describe("billUrl", () => {
  test("builds the canonical proposal URL, lowercased and space-stripped", () => {
    expect(billUrl("2013", "AB 181")).toBe("https://docs.legis.wisconsin.gov/2013/related/proposals/ab181");
    expect(billUrl("2023", "SJR 1")).toBe("https://docs.legis.wisconsin.gov/2023/related/proposals/sjr1");
  });
});
