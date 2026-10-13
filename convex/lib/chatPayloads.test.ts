import { describe, expect, test } from "vitest";
import { candidatePayload, matchPayload, racePayload } from "./chatPayloads";

const SOURCE = { url: "https://elections.wi.gov/media/41846/download", documentDate: "2026-10-06", retrievedAt: "2026-10-12T21:32:56Z" };
const link = { name: "Site", url: "https://example.org" };
type BallotFacts = { onBallot: boolean; ballotName?: string; party?: string; ballotOrder?: number };
const person = (slug: string, name: string, general: BallotFacts | undefined, extra: { raceId?: string; party?: string; primaryParty?: string } = {}) => ({
  slug, name, raceId: "WI-GOV-2026", party: "Democratic", primaryParty: "Democratic", status: "Active",
  sources: [link], dataAsOf: "2026-07-17", ...(general ? { general: { source: SOURCE, ...general } } : {}), ...extra,
});
const governor = {
  raceId: "WI-GOV-2026", office: "Governor of Wisconsin", level: "State Executive", sources: [link],
  primaryDate: "August 11, 2026", generalDate: "November 3, 2026", general: { onBallot: true, source: SOURCE },
};
const crowley = person("david-crowley", "David Crowley", { onBallot: true, ballotName: "David Crowley / Sarah Godlewski", party: "Democratic", ballotOrder: 2 });
const tiffany = person("tom-tiffany", "Tom Tiffany", { onBallot: true, ballotName: "Tom Tiffany / David Varnam", party: "Republican", ballotOrder: 1 }, { party: "Republican", primaryParty: "Republican" });
const hong = person("francesca-hong", "Francesca Hong", { onBallot: false });
const pos = (candidateSlug: string) => ({ candidateSlug, issueSlug: "healthcare", stance: "support", summary: "…", sources: [link] });
const fin = (candidateSlug: string) => ({ candidateSlug, receipts: 100, disbursements: 50, cashOnHand: 50, debts: 0, coverageEndDate: "2026-09-30" });

describe("racePayload", () => {
  const out = racePayload({ race: governor, candidates: [hong, crowley, tiffany], positions: [pos("francesca-hong"), pos("david-crowley")], finance: [fin("francesca-hong"), fin("tom-tiffany")] });

  test("the November field is the certified ballot, in the state's order, as printed", () => {
    expect(out.november).toEqual({ kind: "contest", statement: "2 candidates are on the November 3, 2026 ballot." });
    expect(out.onBallot.map((c) => c.ballotLine)).toEqual([
      "Tom Tiffany / David Varnam (Republican)",
      "David Crowley / Sarah Godlewski (Democratic)",
    ]);
    expect(out.onBallot.map((c) => c.name)).toEqual(["Tom Tiffany", "David Crowley"]);
  });

  test("people off the ballot are listed apart, by name only, with the archive page", () => {
    expect(out.notOnBallot).toEqual([{ slug: "francesca-hong", name: "Francesca Hong" }]);
    expect(out.primaryArchive).toBe("/primary-2026/races/wi-gov-2026");
  });

  test("positions and finance are for the November field only", () => {
    expect(out.positions.map((p) => p.candidateSlug)).toEqual(["david-crowley"]);
    expect(out.finance.map((f) => f.candidateSlug)).toEqual(["tom-tiffany"]);
  });

  test("the old status field and the primary date never reach the model", () => {
    // An eliminated candidate still reads status "Active" in the database.
    const text = JSON.stringify(out);
    // Not the value, and not the word: nothing named "status" is in the payload at all.
    expect(text).not.toMatch(/"status"/);
    expect(text).not.toMatch(/primaryDate|August 11/);
    expect(out.rule).toMatch(/never say .*lost/i);
  });

  test("Lieutenant Governor is not a separate contest, and names the tickets", () => {
    const ltgov = { ...governor, raceId: "WI-LTGOV-2026", office: "Lieutenant Governor of Wisconsin", general: { onBallot: false, note: "Not a separate November contest. Each party's nominee is the running mate on a governor ticket.", source: SOURCE } };
    const godlewski = person("sarah-godlewski", "Sarah Godlewski", { onBallot: true, ballotName: "David Crowley / Sarah Godlewski", party: "Democratic" }, { raceId: "WI-LTGOV-2026" });
    const o = racePayload({ race: ltgov, candidates: [godlewski], positions: [], finance: [] });
    expect(o.november).toEqual({ kind: "not-a-separate-contest", statement: "Not a separate November contest. Each party's nominee is the running mate on a governor ticket." });
    expect(o.onBallot.map((c) => c.ballotLine)).toEqual(["David Crowley / Sarah Godlewski (Democratic)"]);
  });

  test("a race with no ballot facts says so and lists nobody as on the ballot", () => {
    const o = racePayload({ race: { ...governor, general: undefined }, candidates: [crowley, tiffany], positions: [pos("david-crowley")], finance: [] });
    expect(o.november.kind).toBe("not-loaded");
    expect(o.onBallot).toEqual([]);
    expect(o.positions).toEqual([]);
  });
});

describe("candidatePayload", () => {
  const field = [
    { slug: "david-crowley", name: "David Crowley", onGeneralBallot: true, ballotName: "David Crowley / Sarah Godlewski", generalParty: "Democratic", ballotOrder: 2 },
    { slug: "tom-tiffany", name: "Tom Tiffany", onGeneralBallot: true, ballotName: "Tom Tiffany / David Varnam", generalParty: "Republican", ballotOrder: 1 },
    { slug: "francesca-hong", name: "Francesca Hong", onGeneralBallot: false, ballotName: "Francesca Hong" },
  ];
  const base = { race: governor, field, positions: [pos("x")], quotes: [], finance: [] };

  test("someone on the ballot", () => {
    const o = candidatePayload({ ...base, candidate: crowley });
    expect(o.november).toEqual({
      onBallot: true,
      ballotLine: "David Crowley / Sarah Godlewski (Democratic)",
      statement: "David Crowley is on the November 3, 2026 ballot for Governor of Wisconsin. One other candidate is on the ballot.",
    });
  });

  test("someone off the ballot: a plain statement, and no claim about winning or losing", () => {
    const o = candidatePayload({ ...base, candidate: hong });
    expect(o.november.onBallot).toBe(false);
    // A chat answer is not a page: the web page's "This page is kept as a record…" sentence stays out.
    expect(o.november.statement).toBe("Francesca Hong is not on the November 3, 2026 ballot for Governor of Wisconsin.");
    // The statement itself makes no claim about results; the rule tells the model not to either.
    expect(o.november.statement).not.toMatch(/lost|won|defeated|eliminated/i);
    expect(JSON.stringify(o)).not.toMatch(/"status"/);
    expect(o.rule).toMatch(/never say .*lost/i);
  });

  test("the candidate record is trimmed: no status, no raw ballot block, no database ids", () => {
    const o = candidatePayload({ ...base, candidate: { ...crowley, _id: "abc", _creationTime: 1 } });
    for (const hidden of ["status", "general", "_id", "_creationTime"]) {
      expect(o.candidate).not.toHaveProperty(hidden);
    }
    expect(o.candidate).toMatchObject({ slug: "david-crowley", name: "David Crowley", party: "Democratic" });
    expect(o.race).toEqual({ raceId: "WI-GOV-2026", office: "Governor of Wisconsin", level: "State Executive", generalDate: "November 3, 2026" });
  });
});

describe("matchPayload", () => {
  const result = {
    groups: [
      { issueSlug: "healthcare", label: "Healthcare", silent: [{ raceId: "WI-AG-2026", office: "Attorney General" }],
        races: [{ raceId: "WI-GOV-2026", office: "Governor", onRecord: [{ candidate: { slug: "david-crowley", name: "David Crowley", party: "Democratic" }, position: { candidateSlug: "david-crowley", issueSlug: "healthcare", stance: "support", summary: "S", sources: [link] } }], noRecord: [{ slug: "tom-tiffany", name: "Tom Tiffany" }] }] },
      { issueSlug: "immigration", label: "Immigration", silent: [], races: [] },
    ],
    uncovered: [{ raceId: "WI-TREAS-2026", office: "State Treasurer", candidates: [{ slug: "a", name: "A Person" }] }],
    totalOnRecord: 1,
  };
  const o = matchPayload(result, ["healthcare", "immigration"], "statewide");

  test("coverage means a position exists, not that a section exists", () => {
    expect(o.issues.map((i) => [i.issue, i.coverage])).toEqual([["healthcare", "some"], ["immigration", "none"]]);
  });

  test("races with nothing published are named, never dropped", () => {
    expect(o.issues[0].noPublishedPositionInRace).toEqual(["Attorney General"]);
    expect(o.alsoOnBallot).toEqual([{ office: "State Treasurer", candidates: ["A Person"] }]);
    expect(o.issues[0].races[0]).toMatchObject({ office: "Governor", noPosition: ["Tom Tiffany"] });
  });

  test("with no saved address it says so", () => {
    expect(o.scope).toBe("statewide");
    expect(o.scopeNote).toContain("/brief");
  });
});

describe("candidatePayload for a race that had no August primary", () => {
  test("gives the race's own reason", () => {
    const court = { raceId: "WI-SCOTUS-2026", office: "Wisconsin Supreme Court", level: "State Judicial", sources: [link], primaryDate: "February 17, 2026 (if needed)", general: { onBallot: false, note: "Decided in the April 7, 2026 spring election.", source: SOURCE } };
    const taylor = person("chris-taylor", "Chris Taylor", { onBallot: false }, { raceId: "WI-SCOTUS-2026" });
    const o = candidatePayload({ candidate: taylor, race: court, field: [{ slug: "chris-taylor", name: "Chris Taylor", onGeneralBallot: false, ballotName: "Chris Taylor" }], positions: [], quotes: [], finance: [] });
    expect(o.november.statement).toBe("Chris Taylor is not on the November 3, 2026 ballot for Wisconsin Supreme Court. Decided in the April 7, 2026 spring election.");
  });
});
