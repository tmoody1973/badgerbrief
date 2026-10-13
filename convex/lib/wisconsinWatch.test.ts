import { describe, expect, test } from "vitest";
import certification from "../../docs/evidence/general-ballot/general-ballot-certification.json";
import data from "./data/wisconsin-watch-2026.json";
import { WISCONSIN_WATCH, questionnaireStatus, questionnaireStatusFrom, type QuestionnaireFile } from "./wisconsinWatch";

const file: QuestionnaireFile = {
  source: { name: "Guide", publisher: "Newsroom", url: "https://example.test/", supportUrl: "https://example.test/donate/", via: "Commons", viaUrl: "https://commons.test/", guideUpdated: "2026-08-20", retrievedAt: "2026-10-13T14:00:00Z" },
  races: ["WI-STATE-ASSEMBLY-D19-2026"],
  candidates: [
    { raceId: "WI-STATE-ASSEMBLY-D19-2026", slug: "sam-sample", candidateId: "s-sample1", url: "https://example.test/candidate/s-sample1/", answered: 4 },
    { raceId: "WI-STATE-ASSEMBLY-D19-2026", slug: "pat-example", candidateId: "p-example1", url: "https://example.test/candidate/p-example1/", answered: 0 },
  ],
  notInGuide: [{ raceId: "WI-STATE-ASSEMBLY-D19-2026", slug: "new-person", ballotName: "New Person" }],
};

describe("questionnaireStatusFrom", () => {
  test("says a candidate answered, how many questions, and where", () => {
    expect(questionnaireStatusFrom(file, "WI-STATE-ASSEMBLY-D19-2026", "sam-sample")).toEqual({
      status: "answered",
      candidateId: "s-sample1",
      url: "https://example.test/candidate/s-sample1/",
      answered: 4,
    });
  });

  test("says a candidate did not answer, plainly", () => {
    expect(questionnaireStatusFrom(file, "WI-STATE-ASSEMBLY-D19-2026", "pat-example")).toEqual({
      status: "did-not-answer",
      candidateId: "p-example1",
      url: "https://example.test/candidate/p-example1/",
    });
  });

  test("says when their guide has no page for a certified candidate", () => {
    expect(questionnaireStatusFrom(file, "WI-STATE-ASSEMBLY-D19-2026", "new-person")).toEqual({ status: "not-in-guide" });
  });

  test("says nothing about a candidate or race it does not know", () => {
    expect(questionnaireStatusFrom(file, "WI-STATE-ASSEMBLY-D19-2026", "someone-off-the-ballot")).toBeNull();
    expect(questionnaireStatusFrom(file, "WI-COUNTY-SHERIFF", "sam-sample")).toBeNull();
  });

  test("looks a candidate up in their own race only", () => {
    expect(questionnaireStatusFrom(file, "WI-STATE-ASSEMBLY-D20-2026", "sam-sample")).toBeNull();
  });
});

describe("the link list in the repository", () => {
  const onBallot = [
    ...certification.candidates.filter((c) => c.onBallot).map((c) => `${c.raceId}/${c.slug}`),
    ...certification.newCandidates.map((c) => `${c.raceId}/${c.slug}`),
  ];
  const key = (c: { raceId: string; slug: string }) => `${c.raceId}/${c.slug}`;

  test("links only candidates on the certified ballot", () => {
    const certified = new Set(onBallot);
    expect([...data.candidates, ...data.notInGuide].filter((c) => !certified.has(key(c)))).toEqual([]);
  });

  test("accounts for every certified candidate in the races their guide covers", () => {
    const covered = new Set(data.races);
    const known = new Set([...data.candidates, ...data.notInGuide].map(key));
    expect(onBallot.filter((k) => covered.has(k.split("/")[0]) && !known.has(k))).toEqual([]);
  });

  test("never links two candidates to one page, or one candidate twice", () => {
    expect(new Set(data.candidates.map(key)).size).toBe(data.candidates.length);
    expect(new Set(data.candidates.map((c) => c.candidateId)).size).toBe(data.candidates.length);
  });

  test("every link is a candidate page on Wisconsin Watch's guide, for that candidate", () => {
    for (const c of data.candidates) {
      expect(c.url).toBe(`https://voterguide26.wisconsinwatch.org/candidate/${c.candidateId}/`);
      expect(Number.isInteger(c.answered) && c.answered >= 0).toBe(true);
    }
  });

  test("covers 129 races and names its source", () => {
    expect(data.races).toHaveLength(129);
    expect(WISCONSIN_WATCH.publisher).toBe("Wisconsin Watch");
    expect(WISCONSIN_WATCH.guideUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("answers for a real candidate through the bound reader", () => {
    expect(questionnaireStatus("WI-GOV-2026", "tom-tiffany")?.status).toBe("answered");
    expect(questionnaireStatus("WI-STATE-ASSEMBLY-D3-2026", "michael-j-goodwin")).toEqual({ status: "not-in-guide" });
  });
});
