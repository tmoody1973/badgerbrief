// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { BallotIndexRace } from "../../convex/public";
import type { CountyContest } from "../../convex/lib/ballotExtras";
import { buildBallotData, byAttention, contestPosition, numbered, voterBallot, type BallotContest } from "./my-ballot";

const SOURCE = { url: "https://elections.wi.gov/media/41846/download", documentDate: "2026-10-06" };
const NOTHING = { positions: false, money: false, ads: false };

function race(raceId: string, office: string, names: string[], holds = NOTHING): BallotIndexRace {
  return {
    raceId,
    office,
    level: "any",
    source: SOURCE,
    candidates: names.map((ballotName, i) => ({ slug: `c${i}-${raceId.toLowerCase()}`, ballotName, party: i === 0 ? "Democratic" : "Republican" })),
    holds,
  };
}

function county(key: string, name: string, office: string, ballotPosition: number, names: string[]): CountyContest {
  return {
    county: key,
    countyName: name,
    office,
    contestAsPrinted: `${name} County ${office}`,
    ballotPosition,
    candidates: names.map((ballotName) => ({ ballotName, party: "Independent", ballotOrder: 1 })),
  };
}

const INDEX: BallotIndexRace[] = [
  race("WI-STATE-ASSEMBLY-D19-2026", "State Assembly District 19", ["Only Assembly"]),
  race("WI-GOV-2026", "Governor", ["A Gov / A Mate", "B Gov / B Mate"]),
  race("WI-AG-2026", "Attorney General", ["A General", "B General"]),
  race("WI-US-HOUSE-D4-2026", "U.S. House District 4", ["A House", "B House"]),
  race("WI-STATE-SENATE-D7-2026", "State Senate District 7", ["A Senate", "B Senate"]),
  race("WI-US-HOUSE-D2-2026", "U.S. House District 2", ["Other House"]),
  race("WI-STATE-ASSEMBLY-D76-2026", "State Assembly District 76", ["Other Assembly", "Second Assembly"]),
];
const COUNTY: CountyContest[] = [
  county("milwaukee", "Milwaukee", "Sheriff", 24004, ["Sheriff One", "Sheriff Two"]),
  county("milwaukee", "Milwaukee", "Clerk of Circuit Court", 24005, ["Clerk Only"]),
  county("dane", "Dane", "Sheriff", 21304, ["Dane Sheriff"]),
];
const data = (countyContests: CountyContest[] | null = COUNTY) => buildBallotData({ index: INDEX, countyContests, answered: () => false });

describe("contestPosition", () => {
  test.each([
    ["WI-GOV-2026", 250],
    ["WI-AG-2026", 252],
    ["WI-SOS-2026", 253],
    ["WI-TREAS-2026", 254],
    ["WI-US-HOUSE-D4-2026", 1204],
    ["WI-STATE-SENATE-D7-2026", 1307],
    ["WI-STATE-ASSEMBLY-D19-2026", 1419],
    ["WI-STATE-ASSEMBLY-D99-2026", 1499],
  ])("%s is contest %i in the state's order", (raceId, position) => {
    expect(contestPosition(raceId)).toBe(position);
  });

  test.each(["WI-LTGOV-2026", "WI-SCOTUS-2026", "WI-STATE-SENATE-2026", "WI-US-HOUSE-D4-2028", "nonsense", "constructor"])("%s has no place on this ballot", (raceId) => {
    expect(contestPosition(raceId)).toBeNull();
  });
});

describe("buildBallotData", () => {
  test("files each contest under its district", () => {
    const d = data();
    expect(d.statewide.map((c) => c.key)).toEqual(["WI-GOV-2026", "WI-AG-2026"]);
    expect(d.congressional[4].office).toBe("U.S. House District 4");
    expect(d.senate[7].office).toBe("State Senate District 7");
    expect(d.assembly[19].office).toBe("State Assembly District 19");
    expect(d.ballotSource).toEqual(SOURCE);
  });

  test("a contest it cannot place is left out, not guessed", () => {
    const d = buildBallotData({ index: [...INDEX, race("WI-MYSTERY-2026", "Mystery", ["Who"])], countyContests: COUNTY, answered: () => false });
    const everything = [...d.statewide, ...Object.values(d.congressional), ...Object.values(d.senate), ...Object.values(d.assembly)];
    expect(everything.some((c) => c.office === "Mystery")).toBe(false);
  });

  test("names are the state's printing and link to the candidate; the contest links to its race page", () => {
    const gov = data().statewide[0];
    expect(gov.href).toBe("/races/wi-gov-2026");
    expect(gov.candidates).toEqual([
      { name: "A Gov / A Mate", party: "Democratic", href: "/candidates/c0-wi-gov-2026" },
      { name: "B Gov / B Mate", party: "Republican", href: "/candidates/c1-wi-gov-2026" },
    ]);
  });

  test("stamps link to where the record is", () => {
    const d = buildBallotData({
      index: [race("WI-GOV-2026", "Governor", ["A", "B"], { positions: true, money: true, ads: true })],
      countyContests: null,
      answered: (raceId) => raceId === "WI-GOV-2026",
    });
    expect(d.statewide[0].stamps).toEqual([
      { label: "positions", href: "/compare/wi-gov-2026" },
      { label: "money", href: "/races/wi-gov-2026#money" },
      { label: "ads", href: "/races/wi-gov-2026#ad-money" },
      { label: "questionnaire", href: "/races/wi-gov-2026#questionnaire" },
    ]);
    expect(d.statewide[0].compareHref).toBe("/compare/wi-gov-2026");
  });

  test("one name on the ballot gets no compare link, and positions link to the race", () => {
    const d = buildBallotData({ index: [race("WI-AG-2026", "Attorney General", ["Only"], { positions: true, money: false, ads: false })], countyContests: null, answered: () => false });
    expect(d.statewide[0].stamps).toEqual([{ label: "positions", href: "/races/wi-ag-2026#candidates" }]);
    expect(d.statewide[0].compareHref).toBeUndefined();
  });

  test("two names with no published position get no compare link", () => {
    expect(data().statewide[0].compareHref).toBeUndefined();
    expect(data().statewide[0].stamps).toEqual([]);
  });

  test("a county office has names in the file's order and nothing else", () => {
    const sheriff = data().counties?.milwaukee.contests[0];
    expect(data().counties?.milwaukee.name).toBe("Milwaukee");
    expect(sheriff).toEqual({
      key: "county:milwaukee:24004",
      position: 24004,
      office: "Milwaukee County Sheriff",
      candidates: [
        { name: "Sheriff One", party: "Independent" },
        { name: "Sheriff Two", party: "Independent" },
      ],
      stamps: [],
    });
  });

  test("an uncertified county file gives no counties at all", () => {
    expect(data(null).counties).toBeNull();
  });

  test("does not change what it was given", () => {
    const before = JSON.stringify([INDEX, COUNTY]);
    data();
    expect(JSON.stringify([INDEX, COUNTY])).toBe(before);
  });
});

describe("voterBallot", () => {
  const milwaukee = { congressional: 4, senate: 7, assembly: 19, county: "milwaukee" };

  test("Milwaukee: statewide, House, Senate, Assembly, then county, in the state's order", () => {
    const b = voterBallot(data(), milwaukee);
    expect(b.contests.map((c) => c.position)).toEqual([250, 252, 1204, 1307, 1419, 24004, 24005]);
    expect(b.senate).toBe("on-ballot");
    expect(b.county).toEqual({ status: "ok", name: "Milwaukee" });
  });

  test("an even Senate district has no Senate contest and says so", () => {
    const b = voterBallot(data(), { congressional: 2, senate: 26, assembly: 76, county: "dane" });
    expect(b.contests.some((c) => c.position >= 1300 && c.position < 1400)).toBe(false);
    expect(b.senate).toBe("not-up");
    expect(b.contests.map((c) => c.position)).toEqual([250, 252, 1202, 1476, 21304]);
  });

  test("districts with no county still show the state and federal contests", () => {
    const b = voterBallot(data(), { congressional: 4, senate: 7, assembly: 19 });
    expect(b.county).toEqual({ status: "missing" });
    expect(b.contests.map((c) => c.position)).toEqual([250, 252, 1204, 1307, 1419]);
  });

  test("a county the file does not know", () => {
    expect(voterBallot(data(), { ...milwaukee, county: "atlantis" }).county).toEqual({ status: "unknown" });
  });

  test("an uncertified county file, whatever the county", () => {
    expect(voterBallot(data(null), milwaukee).county).toEqual({ status: "not-certified" });
    expect(voterBallot(data(null), { congressional: 4, senate: 7, assembly: 19 }).county).toEqual({ status: "not-certified" });
  });

  test("a district with no contest in the data is skipped, never borrowed from a neighbour", () => {
    const b = voterBallot(data(), { ...milwaukee, assembly: 20, congressional: 8 });
    expect(b.contests.some((c) => c.position >= 1400 && c.position < 1500)).toBe(false);
    expect(b.contests.some((c) => c.position >= 1200 && c.position < 1300)).toBe(false);
  });
});

describe("byAttention and numbered", () => {
  const contests = voterBallot(data(), { congressional: 4, senate: 7, assembly: 19, county: "milwaukee" }).contests;

  test("more than one name is a decision; one name goes to the strip; both keep the state's order", () => {
    const { decisions, oneName } = byAttention(contests);
    expect(decisions.map((c) => c.position)).toEqual([250, 252, 1204, 1307, 24004]);
    expect(oneName.map((c) => c.position)).toEqual([1419, 24005]);
  });

  test("numbers count through the whole ballot in the state's order, so a contest keeps its number in either view", () => {
    const n = numbered(contests);
    expect(n.get("WI-GOV-2026")).toEqual({ n: 1, of: 7 });
    expect(n.get("WI-STATE-ASSEMBLY-D19-2026")).toEqual({ n: 5, of: 7 });
    expect(n.get("county:milwaukee:24005")).toEqual({ n: 7, of: 7 });
  });

  test("a contest nobody is on the ballot for is a strip line, not a decision", () => {
    const empty: BallotContest = { key: "x", position: 1, office: "Empty", candidates: [], stamps: [] };
    expect(byAttention([empty])).toEqual({ decisions: [], oneName: [empty] });
  });
});
