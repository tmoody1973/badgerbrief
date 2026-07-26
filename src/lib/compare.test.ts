// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildIssueComparison, type CompareCandidate, type ComparePosition } from "./compare";

const cands: CompareCandidate[] = [
  { slug: "smith", name: "Ann Smith" },
  { slug: "barnes", name: "Bo Barnes" },
  { slug: "lee", name: "Cy Lee" },
];
const pos = (candidateSlug: string, issueSlug: string): ComparePosition => ({
  candidateSlug, issueSlug, stance: "support", summary: `${candidateSlug} on ${issueSlug}`, sources: [],
});

describe("buildIssueComparison", () => {
  it("sorts issues by coverage desc, then label asc; candidates alpha by last name", () => {
    const positions = [
      pos("smith", "education"),                          // education: 1
      pos("smith", "abortion"), pos("barnes", "abortion"), // abortion: 2
    ];
    const { issues, totalOnRecord } = buildIssueComparison(cands, positions);
    expect(issues.map((i) => i.issueSlug)).toEqual(["abortion", "education"]); // coverage 2 before 1
    expect(issues[0].label).toBe("Abortion");
    // abortion onRecord alpha by last name: Barnes, Smith
    expect(issues[0].onRecord.map((r) => r.candidate.slug)).toEqual(["barnes", "smith"]);
    // Lee has no abortion position -> noRecord
    expect(issues[0].noRecord.map((c) => c.slug)).toEqual(["lee"]);
    expect(totalOnRecord).toBe(3);
  });

  it("multi-word label and duplicate position for one candidate/issue keeps the first", () => {
    const positions = [pos("smith", "gun-policy"), pos("smith", "gun-policy")];
    const { issues } = buildIssueComparison(cands, positions);
    expect(issues[0].label).toBe("Gun Policy");
    expect(issues[0].onRecord).toHaveLength(1);
  });

  it("no positions -> no issues, totalOnRecord 0", () => {
    expect(buildIssueComparison(cands, [])).toEqual({ issues: [], totalOnRecord: 0 });
  });
});
