// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildIssueMatch, type RaceInput } from "./issue-match";

const pos = (candidateSlug: string, issueSlug: string) => ({
  candidateSlug, issueSlug, stance: "support", summary: `${candidateSlug}/${issueSlug}`, sources: [],
});
const races: RaceInput[] = [
  {
    raceId: "WI-GOV-2026", office: "Governor",
    candidates: [{ slug: "barnes", name: "Mandela Barnes" }, { slug: "roys", name: "Kelda Roys" }],
    positions: [pos("barnes", "healthcare"), pos("roys", "healthcare"), pos("barnes", "abortion")],
  },
  {
    raceId: "WI-AG-2026", office: "Attorney General",
    candidates: [{ slug: "kaul", name: "Josh Kaul" }, { slug: "toney", name: "Eric Toney" }],
    positions: [pos("kaul", "healthcare")],
  },
];

describe("buildIssueMatch", () => {
  it("groups issue-primary in selection order; races with coverage only; on/noRecord per race", () => {
    const { groups, totalOnRecord } = buildIssueMatch(races, ["healthcare", "abortion"]);
    expect(groups.map((g) => g.issueSlug)).toEqual(["healthcare", "abortion"]);
    expect(groups[0].label).toBe("Healthcare");
    // healthcare: both races have coverage
    expect(groups[0].races.map((r) => r.raceId)).toEqual(["WI-GOV-2026", "WI-AG-2026"]);
    // gov healthcare onRecord alpha by last name: Barnes, Roys
    expect(groups[0].races[0].onRecord.map((r) => r.candidate.slug)).toEqual(["barnes", "roys"]);
    // AG healthcare: kaul on record, toney no record
    expect(groups[0].races[1].onRecord.map((r) => r.candidate.slug)).toEqual(["kaul"]);
    expect(groups[0].races[1].noRecord.map((c) => c.slug)).toEqual(["toney"]);
    // abortion: only Governor has coverage -> AG dropped from this group
    expect(groups[1].races.map((r) => r.raceId)).toEqual(["WI-GOV-2026"]);
    expect(totalOnRecord).toBe(4); // gov healthcare 2 + ag healthcare 1 + gov abortion 1
  });

  it("selecting an uncovered issue yields no group; dup selections dedupe", () => {
    expect(buildIssueMatch(races, ["immigration"])).toEqual({ groups: [], totalOnRecord: 0 });
    const { groups } = buildIssueMatch(races, ["abortion", "abortion"]);
    expect(groups).toHaveLength(1);
  });
});
