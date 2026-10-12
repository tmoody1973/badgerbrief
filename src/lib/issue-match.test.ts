// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildIssueMatch, type RaceInput } from "./issue-match";

const pos = (candidateSlug: string, issueSlug: string) => ({
  candidateSlug, issueSlug, stance: "support", summary: `${candidateSlug}/${issueSlug}`, sources: [],
});
const races: RaceInput[] = [
  {
    raceId: "WI-GOV-2026", office: "Governor",
    candidates: [{ slug: "crowley", name: "David Crowley" }, { slug: "tiffany", name: "Tom Tiffany" }],
    positions: [pos("crowley", "healthcare"), pos("tiffany", "healthcare"), pos("crowley", "abortion")],
  },
  {
    raceId: "WI-AG-2026", office: "Attorney General",
    candidates: [{ slug: "kaul", name: "Josh Kaul" }, { slug: "toney", name: "Eric Toney" }],
    positions: [pos("kaul", "healthcare")],
  },
  {
    // On the voter's ballot, with no published position on anything.
    raceId: "WI-STATE-ASSEMBLY-D3-2026", office: "State Assembly — District 3",
    candidates: [{ slug: "goodwin", name: "Michael J. Goodwin" }],
    positions: [],
  },
  // A race with nobody on the ballot has nothing to show.
  { raceId: "WI-EMPTY-2026", office: "Empty", candidates: [], positions: [] },
];

describe("buildIssueMatch", () => {
  it("groups by issue in selection order, with positions where they exist", () => {
    const { groups, totalOnRecord } = buildIssueMatch(races, ["healthcare", "abortion"]);
    expect(groups.map((g) => g.issueSlug)).toEqual(["healthcare", "abortion"]);
    expect(groups[0].label).toBe("Healthcare");
    expect(groups[0].races.map((r) => r.raceId)).toEqual(["WI-GOV-2026", "WI-AG-2026"]);
    expect(groups[0].races[1].onRecord.map((r) => r.candidate.slug)).toEqual(["kaul"]);
    expect(groups[0].races[1].noRecord.map((c) => c.slug)).toEqual(["toney"]);
    expect(totalOnRecord).toBe(4);
  });

  it("names a race that has positions on another chosen issue but not this one", () => {
    // Before: Attorney General vanished from the abortion section and appeared nowhere else.
    const { groups } = buildIssueMatch(races, ["healthcare", "abortion"]);
    expect(groups[1].races.map((r) => r.raceId)).toEqual(["WI-GOV-2026"]);
    expect(groups[1].silent).toEqual([{ raceId: "WI-AG-2026", office: "Attorney General" }]);
    expect(groups[0].silent).toEqual([]);
  });

  it("lists every race with no position on any chosen issue, with its candidates", () => {
    const { uncovered } = buildIssueMatch(races, ["healthcare", "abortion"]);
    expect(uncovered).toEqual([
      { raceId: "WI-STATE-ASSEMBLY-D3-2026", office: "State Assembly — District 3", candidates: [{ slug: "goodwin", name: "Michael J. Goodwin" }] },
    ]);
  });

  it("every race with candidates appears exactly once per issue, or once in the uncovered list", () => {
    const { groups, uncovered } = buildIssueMatch(races, ["healthcare", "abortion", "immigration"]);
    const withCandidates = races.filter((r) => r.candidates.length > 0).map((r) => r.raceId).sort();
    for (const g of groups) {
      const shown = [...g.races.map((r) => r.raceId), ...g.silent.map((r) => r.raceId), ...uncovered.map((r) => r.raceId)].sort();
      expect(shown).toEqual(withCandidates);
    }
  });

  it("an issue nobody has a position on still gets its section", () => {
    const { groups, uncovered, totalOnRecord } = buildIssueMatch(races, ["immigration"]);
    expect(groups).toEqual([{ issueSlug: "immigration", label: "Immigration", races: [], silent: [] }]);
    expect(uncovered.map((r) => r.raceId)).toEqual(["WI-GOV-2026", "WI-AG-2026", "WI-STATE-ASSEMBLY-D3-2026"]);
    expect(totalOnRecord).toBe(0);
  });

  it("dedupes repeated selections and does not change its inputs", () => {
    const before = JSON.stringify(races);
    expect(buildIssueMatch(races, ["abortion", "abortion"]).groups).toHaveLength(1);
    expect(JSON.stringify(races)).toBe(before);
  });
});
