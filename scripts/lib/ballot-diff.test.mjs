import { describe, expect, test } from "vitest";
import {
  assertCertified,
  assertTarget,
  diffAll,
  diffRace,
  toCertification,
  toMarkdown,
} from "./ballot-diff.mjs";

const state = (ballotName, party, ballotOrder, extra = {}) => {
  const [matchName, runningMate] = ballotName.split(" / ");
  return { ballotName, matchName, runningMate: runningMate ?? null, party, ballotOrder, committeeId: null, ...extra };
};

describe("diffRace", () => {
  test("matches by surname and keeps the address when the printed name differs", () => {
    const d = diffRace({
      raceId: "WI-US-HOUSE-D6-2026",
      dbCandidates: [{ slug: "bradley-smith", name: "Bradley Smith", party: "Democratic", status: "Active" }],
      stateCandidates: [state("Brad Smith", "Democratic", 2)],
    });
    expect(d.advancing).toEqual([
      {
        slug: "bradley-smith",
        storedName: "Bradley Smith",
        matchName: "Brad Smith",
        ballotName: "Brad Smith",
        party: "Democratic",
        ballotOrder: 2,
        runningMate: null,
        nameDiffers: true,
        partyDiffers: false,
      },
    ]);
    expect(d.unresolved).toEqual([]);
    expect(d.uncontested).toBe(true);
  });

  test("handles suffixes, hyphens and accents", () => {
    const d = diffRace({
      raceId: "WI-STATE-ASSEMBLY-D12-2026",
      dbCandidates: [
        { slug: "russell-goodwin", name: "Russell Goodwin", party: "Democratic" },
        { slug: "rachael-cabral-guevara", name: "Rachael Cabral-Guevara", party: "Republican" },
        { slug: "jose-pena", name: "Jose Pena", party: "Independent" },
      ],
      stateCandidates: [
        state("Russell Antonio Goodwin, Sr.", "Democratic", 1),
        state("Rachael Ann Cabral-Guevara", "Republican", 2),
        state("José Peña", "Independent", 3),
      ],
    });
    expect(d.advancing.map((a) => a.slug)).toEqual([
      "russell-goodwin",
      "rachael-cabral-guevara",
      "jose-pena",
    ]);
    expect(d.advancing[0].ballotName).toBe("Russell Antonio Goodwin, Sr.");
    expect(d.newCandidates).toEqual([]);
    expect(d.notOnBallot).toEqual([]);
  });

  test("a candidate missing from the state's list is not on the ballot", () => {
    const d = diffRace({
      raceId: "WI-GOV-2026",
      dbCandidates: [
        { slug: "david-crowley", name: "David Crowley", party: "Democratic", status: "Active" },
        { slug: "francesca-hong", name: "Francesca Hong", party: "Democratic", status: "Active" },
      ],
      stateCandidates: [state("David Crowley / Sarah Godlewski", "Democratic", 2)],
    });
    expect(d.advancing[0]).toMatchObject({ slug: "david-crowley", runningMate: "Sarah Godlewski" });
    expect(d.notOnBallot).toEqual([{ slug: "francesca-hong", name: "Francesca Hong", status: "Active" }]);
  });

  test("a state candidate we have never stored is new", () => {
    const d = diffRace({
      raceId: "WI-US-HOUSE-D4-2026",
      dbCandidates: [{ slug: "gwen-moore", name: "Gwen Moore", party: "Democratic" }],
      stateCandidates: [state("Gwen Moore", "Democratic", 2), state("Arthur Burks", "Independent", 3)],
    });
    expect(d.newCandidates).toEqual([
      { slug: "arthur-burks", name: "Arthur Burks", ballotName: "Arthur Burks", party: "Independent", ballotOrder: 3 },
    ]);
    expect(d.uncontested).toBe(false);
  });

  test("two stored candidates with one surname are never guessed", () => {
    const d = diffRace({
      raceId: "WI-STATE-ASSEMBLY-D45-2026",
      dbCandidates: [
        { slug: "clinton-anderson", name: "Clinton Anderson", party: "Democratic" },
        { slug: "jim-anderson", name: "Jim Anderson", party: "Republican" },
      ],
      stateCandidates: [state("Clinton Anderson", "Democratic", 2)],
    });
    expect(d.advancing).toEqual([]);
    expect(d.notOnBallot).toEqual([]);
    expect(d.unresolved).toHaveLength(1);
    expect(d.unresolved[0]).toMatchObject({ surname: "ANDERSON", state: ["Clinton Anderson"] });
    expect(d.unresolved[0].db.map((c) => c.slug).sort()).toEqual(["clinton-anderson", "jim-anderson"]);
  });

  test("two state candidates with one surname are never guessed", () => {
    const d = diffRace({
      raceId: "WI-STATE-ASSEMBLY-D45-2026",
      dbCandidates: [{ slug: "clinton-anderson", name: "Clinton Anderson", party: "Democratic" }],
      stateCandidates: [state("Clinton Anderson", "Democratic", 1), state("Jim Anderson", "Republican", 2)],
    });
    expect(d.advancing).toEqual([]);
    expect(d.newCandidates).toEqual([]);
    expect(d.notOnBallot).toEqual([]);
    expect(d.unresolved).toHaveLength(1);
  });

  test("a shared surname with different first names is never guessed", () => {
    const d = diffRace({
      raceId: "WI-STATE-ASSEMBLY-D50-2026",
      dbCandidates: [{ slug: "john-smith", name: "John Smith", party: "Republican" }],
      stateCandidates: [state("Jane Smith", "Republican", 1)],
    });
    expect(d.advancing).toEqual([]);
    expect(d.newCandidates).toEqual([]);
    expect(d.notOnBallot).toEqual([]);
    expect(d.unresolved[0].reason).toMatch(/first names differ/);
  });

  test("a short form of the same first name still matches", () => {
    const d = diffRace({
      raceId: "WI-STATE-ASSEMBLY-D24-2026",
      dbCandidates: [{ slug: "daniel-knodl", name: "Daniel Knodl", party: "Republican" }],
      stateCandidates: [state("Dan Knodl", "Republican", 1)],
    });
    expect(d.advancing.map((a) => a.slug)).toEqual(["daniel-knodl"]);
    expect(d.unresolved).toEqual([]);
  });

  test("a newcomer sharing a first name with a stored candidate leaving the ballot is never guessed", () => {
    // "Jane Doe" may have become "Jane Doe-Smith". Creating a second page and
    // marking the first off the ballot would turn one person into two.
    const d = diffRace({
      raceId: "WI-STATE-ASSEMBLY-D50-2026",
      dbCandidates: [
        { slug: "jane-doe", name: "Jane Doe", party: "Democratic" },
        { slug: "al-roe", name: "Al Roe", party: "Republican" },
      ],
      stateCandidates: [state("Jane Doe-Smith", "Democratic", 1), state("Al Roe", "Republican", 2)],
    });
    expect(d.newCandidates).toEqual([]);
    expect(d.notOnBallot).toEqual([]);
    expect(d.advancing.map((a) => a.slug)).toEqual(["al-roe"]);
    expect(d.unresolved[0].reason).toMatch(/same person/);
    expect(d.unresolved[0].db).toEqual([{ slug: "jane-doe", name: "Jane Doe" }]);
  });

  test("matches a stored name that still carries a raw character code", () => {
    const d = diffRace({
      raceId: "WI-STATE-SENATE-D5-2026",
      dbCandidates: [{ slug: "tony-castaneda", name: "Tony Casta&#xF1;eda", party: "Democratic" }],
      stateCandidates: [state("Tony Castañeda", "Democratic", 2)],
    });
    expect(d.advancing.map((a) => a.slug)).toEqual(["tony-castaneda"]);
    expect(d.advancing[0].nameDiffers).toBe(false);
    expect(d.newCandidates).toEqual([]);
  });

  test("a new candidate whose address is already taken is unresolved", () => {
    const d = diffRace({
      raceId: "WI-US-HOUSE-D6-2026",
      dbCandidates: [{ slug: "mike-thurow", name: "Michael Thurow-Lang", party: "Independent" }],
      stateCandidates: [state("Mike Thurow", "Independent", 5)],
    });
    expect(d.newCandidates).toEqual([]);
    expect(d.unresolved[0].reason).toMatch(/address/);
  });

  test("does not change what it was given", () => {
    const db = Object.freeze([Object.freeze({ slug: "gwen-moore", name: "Gwen Moore", party: "Democratic" })]);
    const st = Object.freeze([Object.freeze(state("Gwen Moore", "Democratic", 2))]);
    expect(() => diffRace({ raceId: "WI-US-HOUSE-D4-2026", dbCandidates: db, stateCandidates: st })).not.toThrow();
  });
});

const SOURCE = { url: "https://elections.wi.gov/media/41846/download", documentDate: "2026-10-06", retrievedAt: "2026-10-12T21:32:56Z" };

const fixture = () =>
  diffAll({
    dbRaces: [{ raceId: "WI-GOV-2026" }, { raceId: "WI-LTGOV-2026" }, { raceId: "WI-SCOTUS-2026" }],
    dbCandidates: [
      { raceId: "WI-GOV-2026", slug: "tom-tiffany", name: "Tom Tiffany", party: "Republican", status: "Active" },
      { raceId: "WI-GOV-2026", slug: "david-crowley", name: "David Crowley", party: "Democratic", status: "Active" },
      { raceId: "WI-GOV-2026", slug: "francesca-hong", name: "Francesca Hong", party: "Democratic", status: "Active" },
      { raceId: "WI-LTGOV-2026", slug: "sarah-godlewski", name: "Sarah Godlewski", party: "Democratic" },
      { raceId: "WI-LTGOV-2026", slug: "david-varnam", name: "David Varnam", party: "Republican" },
      { raceId: "WI-LTGOV-2026", slug: "will-martin", name: "Will Martin", party: "Republican" },
      { raceId: "WI-SCOTUS-2026", slug: "a-judge", name: "A Judge" },
    ],
    contests: new Map([
      ["WI-GOV-2026", [state("Tom Tiffany / David Varnam", "Republican", 1), state("David Crowley / Sarah Godlewski", "Democratic", 2)]],
      ["WI-US-HOUSE-D9-2026", [state("Nobody Known", "Independent", 1)]],
    ]),
  });

describe("diffAll", () => {
  test("links each running mate to the Lieutenant Governor candidate", () => {
    const { runningMates } = fixture();
    expect(runningMates.unresolved).toEqual([]);
    expect(runningMates.linked).toEqual([
      { raceId: "WI-LTGOV-2026", slug: "david-varnam", storedName: "David Varnam", ballotName: "Tom Tiffany / David Varnam", party: "Republican", ballotOrder: 1, runningMate: "Tom Tiffany" },
      { raceId: "WI-LTGOV-2026", slug: "sarah-godlewski", storedName: "Sarah Godlewski", ballotName: "David Crowley / Sarah Godlewski", party: "Democratic", ballotOrder: 2, runningMate: "David Crowley" },
    ]);
  });

  test("a stored race with no state contest is listed with its reason", () => {
    const { racesWithoutContest } = fixture();
    expect(racesWithoutContest.map((r) => r.raceId)).toEqual(["WI-LTGOV-2026", "WI-SCOTUS-2026"]);
    expect(racesWithoutContest[0].note).toMatch(/running mate/);
    expect(racesWithoutContest[1].note).toMatch(/April 7, 2026/);
  });

  test("a state contest with no stored race is reported, not created", () => {
    expect(fixture().contestsWithoutRace).toEqual(["WI-US-HOUSE-D9-2026"]);
  });
});

describe("nothing is dropped in silence", () => {
  const certify = (diff) => toCertification({ diff, source: SOURCE, dataAsOf: "2026-10-12", database: "dev" });

  test("a stored race with no state contest and no known reason is unresolved", () => {
    // If the state relabels a contest, its race must not be quietly marked
    // off the ballot along with everyone in it.
    const file = certify(
      diffAll({
        dbRaces: [{ raceId: "WI-AG-2026" }],
        dbCandidates: [{ raceId: "WI-AG-2026", slug: "josh-kaul", name: "Josh Kaul", party: "Democratic" }],
        contests: new Map(),
      }),
    );
    expect(file.unresolved).toHaveLength(1);
    expect(file.unresolved[0]).toMatchObject({ raceId: "WI-AG-2026", db: [{ slug: "josh-kaul", name: "Josh Kaul" }] });
    expect(file.unresolved[0].reason).toMatch(/no contest/);
    expect(() => assertCertified({ ...file, certifiedBy: "T", certifiedAt: "2026-10-13" })).toThrow(/unresolved/);
  });

  test("a state contest whose name we do not recognize is unresolved", () => {
    const file = certify(diffAll({ dbRaces: [], dbCandidates: [], contests: new Map(), unrecognized: ["STATE SENATE DISTRICT 1"] }));
    expect(file.unresolved).toHaveLength(1);
    expect(file.unresolved[0].reason).toMatch(/STATE SENATE DISTRICT 1/);
  });

  test("a newcomer whose address is used in another race is unresolved", () => {
    // Candidate pages are looked up by address alone, so two people cannot share one.
    const diff = diffAll({
      dbRaces: [{ raceId: "WI-STATE-SENATE-D1-2026" }, { raceId: "WI-STATE-ASSEMBLY-D3-2026" }],
      dbCandidates: [{ raceId: "WI-STATE-SENATE-D1-2026", slug: "mark-becker", name: "Mark Becker", party: "Independent" }],
      contests: new Map([
        ["WI-STATE-SENATE-D1-2026", [state("Mark Becker", "Independent", 2)]],
        ["WI-STATE-ASSEMBLY-D3-2026", [state("Mark Becker", "Democratic", 1)]],
      ]),
    });
    const d3 = diff.races.find((r) => r.raceId === "WI-STATE-ASSEMBLY-D3-2026");
    expect(d3.newCandidates).toEqual([]);
    expect(d3.unresolved[0].reason).toMatch(/another race/);
    expect(diff.races.find((r) => r.raceId === "WI-STATE-SENATE-D1-2026").advancing).toHaveLength(1);
  });

  test("two newcomers in different races cannot take the same address", () => {
    const diff = diffAll({
      dbRaces: [{ raceId: "WI-STATE-ASSEMBLY-D1-2026" }, { raceId: "WI-STATE-ASSEMBLY-D2-2026" }],
      dbCandidates: [],
      contests: new Map([
        ["WI-STATE-ASSEMBLY-D1-2026", [state("Pat Lee", "Independent", 1)]],
        ["WI-STATE-ASSEMBLY-D2-2026", [state("Pat Lee", "Independent", 1)]],
      ]),
    });
    expect(diff.races.flatMap((r) => r.newCandidates)).toEqual([]);
    expect(diff.races.flatMap((r) => r.unresolved)).toHaveLength(2);
  });

  test("the file records which database it was compared against", () => {
    expect(certify(fixture()).database).toBe("dev");
  });
});

describe("assertTarget", () => {
  test("refuses a file compared against a different database", () => {
    expect(() => assertTarget({ database: "dev" }, "prod")).toThrow(/dev/);
    expect(() => assertTarget({ database: "prod" }, "prod")).not.toThrow();
    expect(() => assertTarget({}, "prod")).toThrow(/does not say/);
  });
});

describe("toCertification", () => {
  const file = () => toCertification({ diff: fixture(), source: SOURCE, dataAsOf: "2026-10-12" });

  test("lists every stored candidate once, on or off the ballot", () => {
    const { candidates } = file();
    const key = (c) => `${c.raceId}/${c.slug}`;
    expect(candidates.map(key).sort()).toEqual([
      "WI-GOV-2026/david-crowley",
      "WI-GOV-2026/francesca-hong",
      "WI-GOV-2026/tom-tiffany",
      "WI-LTGOV-2026/david-varnam",
      "WI-LTGOV-2026/sarah-godlewski",
      "WI-LTGOV-2026/will-martin",
      "WI-SCOTUS-2026/a-judge",
    ]);
    const by = Object.fromEntries(candidates.map((c) => [c.slug, c]));
    expect(by["francesca-hong"]).toEqual({ raceId: "WI-GOV-2026", slug: "francesca-hong", onBallot: false });
    expect(by["will-martin"].onBallot).toBe(false);
    expect(by["david-varnam"]).toEqual({
      raceId: "WI-LTGOV-2026", slug: "david-varnam", onBallot: true,
      ballotName: "Tom Tiffany / David Varnam", party: "Republican", ballotOrder: 1, runningMate: "Tom Tiffany",
    });
    expect(by["tom-tiffany"].runningMate).toBe("David Varnam");
  });

  test("never writes null: empty optional values are left out", () => {
    const text = JSON.stringify(file());
    expect(text).not.toContain("null");
  });

  test("marks races and carries unresolved items and blank signature lines", () => {
    const f = file();
    expect(f.races).toEqual([
      { raceId: "WI-GOV-2026", onBallot: true },
      { raceId: "WI-LTGOV-2026", onBallot: false, note: expect.stringMatching(/running mate/) },
      { raceId: "WI-SCOTUS-2026", onBallot: false, note: expect.stringMatching(/April 7, 2026/) },
    ]);
    expect(f.certifiedBy).toBe("");
    expect(f.certifiedAt).toBe("");
    expect(f.unresolved).toEqual([
      { raceId: "WI-US-HOUSE-D9-2026", surname: "", reason: "the state lists this contest but the database has no such race", state: ["Nobody Known"], db: [] },
    ]);
    expect(f.source).toEqual(SOURCE);
  });
});

describe("assertCertified", () => {
  const signed = { certifiedBy: "Tarik Moody", certifiedAt: "2026-10-13", unresolved: [] };

  test("accepts a signed, fully resolved file", () => {
    expect(() => assertCertified(signed)).not.toThrow();
  });

  test("refuses an unsigned file", () => {
    expect(() => assertCertified({ ...signed, certifiedBy: "  " })).toThrow(/certifiedBy/);
    expect(() => assertCertified({ ...signed, certifiedAt: "" })).toThrow(/certifiedAt/);
  });

  test("refuses a file that still has unresolved items", () => {
    expect(() => assertCertified({ ...signed, unresolved: [{ raceId: "X" }] })).toThrow(/unresolved/);
  });
});

describe("toMarkdown", () => {
  test("the report names the counts a reviewer needs", () => {
    const md = toMarkdown({ diff: fixture(), source: SOURCE });
    expect(md).toContain("On the November ballot: 2");
    // The certifier must be able to add the totals up: running mates are on
    // the ballot too, but counted in their own section.
    expect(md).toContain("On the November ballot: 2 (plus 2 running mates, listed below)");
    expect(md).toContain("Francesca Hong");
    expect(md).toContain("Unresolved: 1");
    expect(md).toContain("2026-10-06");
  });

  test("every stored candidate is named somewhere, so the totals add up", () => {
    // 2 advancing + 2 running mates + 3 off the ballot = the 7 stored.
    const md = toMarkdown({ diff: fixture(), source: SOURCE });
    expect(md).toContain("Stored, not on the November ballot: 3");
    expect(md).toContain("Will Martin");
    expect(md).toContain("A Judge");
  });
});
