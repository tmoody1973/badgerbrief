import { describe, expect, test } from "vitest";
import { candidatePayload, coveragePayload, matchPayload, myBallotPayload, racePayload, visibleAnswer, votingInfoPayload } from "./chatPayloads";

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
const fin = (candidateSlug: string, source: "sunshine" | "openfec" = "sunshine") => ({ candidateSlug, source, receipts: 100, disbursements: 50, cashOnHand: 50, debts: 0, coverageEndDate: "2026-09-30" });

describe("racePayload", () => {
  const out = racePayload({ race: governor, candidates: [hong, crowley, tiffany], positions: [pos("francesca-hong"), pos("david-crowley")], finance: [fin("francesca-hong"), fin("tom-tiffany")] });

  test("the November field is the certified ballot, in the state's order, as printed", () => {
    expect(out.november).toEqual({
      kind: "contest",
      statement: "2 candidates are on the November 3, 2026 ballot.",
      // Rule 2 wants a link for every claim; a ballot claim's source is the state's list.
      source: { name: "Wisconsin Elections Commission — candidates on the November 3, 2026 ballot", url: SOURCE.url, documentDate: "2026-10-06" },
    });
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
    // notOnBallot includes people who never filed, so a count of "others who ran" would be false.
    expect(out.rule).not.toMatch(/how many/i);
    // A roll-call tally is a vote count the chat must give (rule 9); only election results are off limits.
    expect(out.rule).not.toMatch(/no vote totals/i);
    expect(out.rule).toMatch(/election results/i);
  });

  test("Lieutenant Governor is not a separate contest, and names the tickets", () => {
    const ltgov = { ...governor, raceId: "WI-LTGOV-2026", office: "Lieutenant Governor of Wisconsin", general: { onBallot: false, note: "Not a separate November contest. Each party's nominee is the running mate on a governor ticket.", source: SOURCE } };
    const godlewski = person("sarah-godlewski", "Sarah Godlewski", { onBallot: true, ballotName: "David Crowley / Sarah Godlewski", party: "Democratic" }, { raceId: "WI-LTGOV-2026" });
    const o = racePayload({ race: ltgov, candidates: [godlewski], positions: [], finance: [] });
    expect(o.november).toMatchObject({ kind: "no-november-contest", statement: "Not a separate November contest. Each party's nominee is the running mate on a governor ticket." });
    expect(o.onBallot.map((c) => c.ballotLine)).toEqual(["David Crowley / Sarah Godlewski (Democratic)"]);
  });

  test("a race with no ballot facts says so and lists nobody as on the ballot", () => {
    const o = racePayload({ race: { ...governor, general: undefined }, candidates: [crowley, tiffany], positions: [pos("david-crowley")], finance: [] });
    expect(o.november.kind).toBe("not-loaded");
    expect(o.onBallot).toEqual([]);
    // Nobody is called "not on the ballot" when the ballot simply is not loaded.
    expect(o.notOnBallot).toEqual([]);
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
    expect(o.november).toMatchObject({
      onBallot: true,
      ballotLine: "David Crowley / Sarah Godlewski (Democratic)",
      statement: "David Crowley is on the November 3, 2026 ballot for Governor of Wisconsin. One other candidate is on the ballot.",
      source: { url: SOURCE.url, documentDate: "2026-10-06" },
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

  test("only named fields of the candidate record reach the model", () => {
    // An allow-list, not a deny-list: free-text fields written during the primary
    // ("re-entered the primary", "widely viewed as the frontrunner") stay in the database.
    const stored = { ...crowley, _id: "abc", _creationTime: 1, notes: "Withdrew July 8, 2026; re-entered the primary July 18.", notableEndorsements: ["X"], campaignFinanceInfo: { url: "https://api.example/?api_key=YOUR_KEY" }, background: "County Executive", currentOccupation: "Milwaukee County Executive", keyPriorities: ["Jobs"] };
    const o = candidatePayload({ ...base, candidate: stored });
    expect(Object.keys(o.candidate).sort()).toEqual(["background", "currentOccupation", "keyPriorities", "name", "party", "slug", "sources"]);
    expect(JSON.stringify(o)).not.toMatch(/re-entered|api_key|notableEndorsements/);
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

describe("candidatePayload for people off the ballot, and running mates", () => {
  const field = [{ slug: "mandela-barnes", name: "Mandela Barnes", onGeneralBallot: false, ballotName: "Mandela Barnes" }];
  test("the stored biography of someone off the ballot is left out: it describes a campaign that is over", () => {
    const barnes = { ...person("mandela-barnes", "Mandela Barnes", { onBallot: false }), background: "narrowly lost the 2022 U.S. Senate race; widely viewed as the Democratic frontrunner", currentOccupation: "Former Lieutenant Governor" };
    const o = candidatePayload({ candidate: barnes, race: governor, field, positions: [], quotes: [], finance: [] });
    expect(o.candidate).not.toHaveProperty("background");
    expect(o.candidate).toMatchObject({ currentOccupation: "Former Lieutenant Governor" });
    expect(JSON.stringify(o.candidate)).not.toMatch(/frontrunner|lost/);
  });

  test("a running mate is on the ballot as part of a named ticket", () => {
    const ltgov = { ...governor, raceId: "WI-LTGOV-2026", office: "Lieutenant Governor of Wisconsin", general: { onBallot: false, note: "Not a separate November contest.", source: SOURCE } };
    const godlewski = person("sarah-godlewski", "Sarah Godlewski", { onBallot: true, ballotName: "David Crowley / Sarah Godlewski", party: "Democratic" }, { raceId: "WI-LTGOV-2026" });
    const o = candidatePayload({ candidate: godlewski, race: ltgov, field: [{ slug: "sarah-godlewski", name: "Sarah Godlewski", onGeneralBallot: true, ballotName: "David Crowley / Sarah Godlewski" }], positions: [], quotes: [], finance: [] });
    expect(o.november.statement).toBe('Sarah Godlewski is on the November 3, 2026 ballot as part of the ticket "David Crowley / Sarah Godlewski". Not a separate November contest.');
  });
});

describe("votingInfoPayload", () => {
  test("gives the general election's date and never the primary's", () => {
    // The stored record still carries primaryDate "August 11, 2026" and no general date.
    const o = votingInfoPayload({ _id: "x", _creationTime: 1, primaryDate: "August 11, 2026", pollsOpen: "7:00 AM", voterRegistration: { online: "Oct 14" }, sources: [link] });
    expect(o).toEqual({ electionDay: "Tuesday, November 3, 2026", pollsOpen: "7:00 AM", voterRegistration: { online: "Oct 14" }, sources: [link] });
  });
});

describe("coveragePayload", () => {
  const row = (headline: string, publishedAt: string | undefined, archive: boolean) => ({ article: { headline, url: `https://n.example/${headline}`, publishedAt, archive }, outlet: { displayName: "WPR" } });
  test("current coverage first, newest first, and primary-season stories are marked", () => {
    const o = coveragePayload([row("july", "2026-07-18", true), row("sept-old", "2026-09-01", false), row("sept-new", "2026-09-20", false), row("undated", undefined, false)]);
    expect(o.articles.map((a) => a.headline)).toEqual(["sept-new", "sept-old", "undated", "july"]);
    expect(o.articles.map((a) => a.primarySeason)).toEqual([false, false, false, true]);
    expect(o.rule).toMatch(/primarySeason/);
  });

  test("keeps twelve at most", () => {
    const many = Array.from({ length: 20 }, (_, i) => row(`h${i}`, "2026-09-01", false));
    expect(coveragePayload(many).articles).toHaveLength(12);
  });
});

describe("myBallotPayload", () => {
  test("says what the list leaves out", () => {
    const o = myBallotPayload({ districts: { congressional: 4, senate: 7, assembly: 19 }, races: [] });
    expect(o.notCovered).toMatch(/county offices/i);
    expect(o.notCovered).toMatch(/referendum/);
    expect(o.official.url).toContain("myvote.wi.gov");
  });
});

describe("visibleAnswer", () => {
  test("is everything the model wrote, not only what came after its last tool call", () => {
    // Observed on "Who's running for mayor of Green Bay?": the sentence saying the guide does not
    // cover municipal races came BEFORE the link tool was called. The chat shows a voter both
    // paragraphs; the gate, reading only the last step, judged a bare link.
    const steps = [
      { text: "BadgerBrief doesn't include county or municipal races like mayor of Green Bay." },
      { text: "" },
      { text: "You can find local race information at [MyVote Wisconsin](https://myvote.wi.gov)." },
    ];
    expect(visibleAnswer(steps, "last step only")).toBe(
      "BadgerBrief doesn't include county or municipal races like mayor of Green Bay.\n\nYou can find local race information at [MyVote Wisconsin](https://myvote.wi.gov).",
    );
  });

  test("falls back to the given text when no step carries any", () => {
    expect(visibleAnswer([{ text: "  " }], "fallback")).toBe("fallback");
    expect(visibleAnswer([], "fallback")).toBe("fallback");
  });
});

describe("finance figures carry the link they should be cited to", () => {
  // Observed in the gate: with no link on the finance rows, the model cited Mandela Barnes's
  // fundraising to an unrelated newspaper article.
  const state = { name: "Wisconsin Campaign Finance Information System", url: "https://campaignfinance.wi.gov" };
  const federal = { name: "Federal Election Commission", url: "https://www.fec.gov/data/" };

  test("on a race", () => {
    const o = racePayload({ race: governor, candidates: [crowley, tiffany], positions: [], finance: [fin("david-crowley"), fin("tom-tiffany", "openfec")] });
    expect(o.finance.map((f) => f.sourceLink)).toEqual([state, federal]);
    expect(o.rule).toMatch(/sourceLink/);
  });

  test("on a candidate", () => {
    const o = candidatePayload({ candidate: crowley, race: governor, field: [], positions: [], quotes: [], finance: [fin("david-crowley")] });
    expect(o.finance).toEqual([{ ...fin("david-crowley"), sourceLink: state }]);
    expect(o.rule).toMatch(/sourceLink/);
  });
});
