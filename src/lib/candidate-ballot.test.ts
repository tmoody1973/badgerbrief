import { describe, expect, test } from "vitest";
import { ballotSummary, candidateDescription, type FieldEntry } from "./candidate-ballot";

const entry = (over: Partial<FieldEntry> & { slug: string; name: string }): FieldEntry => ({
  onGeneralBallot: true,
  ballotName: over.name,
  ...over,
});

describe("ballotSummary", () => {
  const crowley = entry({ slug: "david-crowley", name: "David Crowley", ballotName: "David Crowley / Sarah Godlewski" });
  const tiffany = entry({ slug: "tom-tiffany", name: "Tom Tiffany", ballotName: "Tom Tiffany / David Varnam" });

  test("a candidate on the ballot, with the count of others", () => {
    expect(ballotSummary({ candidateName: "David Crowley", office: "Governor of Wisconsin", me: crowley, others: [tiffany], raceOnBallot: true }))
      .toBe("David Crowley is on the November 3, 2026 ballot for Governor of Wisconsin. One other candidate is on the ballot.");
  });

  test("an incumbent with no opponent", () => {
    const pocan = entry({ slug: "mark-pocan", name: "Mark Pocan", incumbent: true });
    expect(ballotSummary({ candidateName: "Mark Pocan", office: "U.S. House — District 2", me: pocan, others: [], raceOnBallot: true }))
      .toBe("Mark Pocan is on the November 3, 2026 ballot for U.S. House — District 2, as the incumbent. No other candidate is on the ballot for this office.");
  });

  test("several others agree in number", () => {
    const a = entry({ slug: "a", name: "A" });
    expect(ballotSummary({ candidateName: "A", office: "X", me: a, others: [tiffany, crowley, tiffany], raceOnBallot: true }))
      .toContain("3 other candidates are on the ballot.");
  });

  test("a running mate is on the ballot as part of a named ticket", () => {
    const godlewski = entry({ slug: "sarah-godlewski", name: "Sarah Godlewski", ballotName: "David Crowley / Sarah Godlewski" });
    expect(ballotSummary({
      candidateName: "Sarah Godlewski", office: "Lieutenant Governor of Wisconsin", me: godlewski, others: [],
      raceOnBallot: false, raceNote: "Not a separate November contest.",
    })).toBe('Sarah Godlewski is on the November 3, 2026 ballot as part of the ticket "David Crowley / Sarah Godlewski". Not a separate November contest.');
  });

  test("a candidate not on the ballot is told plainly, with no claim about winning or losing", () => {
    const hong = entry({ slug: "francesca-hong", name: "Francesca Hong", onGeneralBallot: false });
    const text = ballotSummary({ candidateName: "Francesca Hong", office: "Governor of Wisconsin", me: hong, others: [tiffany, crowley], raceOnBallot: true });
    expect(text).toBe("Francesca Hong is not on the November 3, 2026 ballot for Governor of Wisconsin. This page is kept as a record of the August 11, 2026 primary.");
    expect(text).not.toMatch(/lost|won|defeated/i);
  });

  test("a candidate whose entry is missing is treated as not on the ballot", () => {
    expect(ballotSummary({ candidateName: "Nobody", office: "X", me: undefined, others: [], raceOnBallot: true }))
      .toContain("is not on the November 3, 2026 ballot for X.");
  });
});

describe("candidateDescription", () => {
  test("on the ballot, with what the page holds", () => {
    expect(candidateDescription({ who: "Josh Kaul (Democratic)", office: "Attorney General", onBallot: true, incumbent: true, has: ["published positions", "campaign finance"] }))
      .toBe("Josh Kaul (Democratic), the incumbent, is on the November 3, 2026 ballot for Attorney General. published positions and campaign finance, every claim linked to its source.");
  });

  test("on the ballot with nothing else on the page", () => {
    expect(candidateDescription({ who: "Pat Example", office: "Assembly — District 3", onBallot: true, incumbent: false, has: [] }))
      .toBe("Pat Example is on the November 3, 2026 ballot for Assembly — District 3. Candidate details from the Wisconsin Elections Commission.");
  });

  test("not on the ballot", () => {
    expect(candidateDescription({ who: "Francesca Hong (Democratic)", office: "Governor of Wisconsin", onBallot: false, incumbent: false, has: ["quotes"] }))
      .toBe("Francesca Hong (Democratic) is not on the November 3, 2026 ballot for Governor of Wisconsin. This page is a record of the August 11, 2026 primary.");
  });
});
