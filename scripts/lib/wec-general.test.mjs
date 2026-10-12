import { describe, expect, test } from "vitest";
import { buildGeneralBallot, raceIdForContest, splitTicket } from "./wec-general.mjs";

const row = (over) => ({
  Election: "2026 General Election",
  IsReferendum: "",
  Candidate: "",
  "Name On Ballot": "",
  CommitteeID: "",
  "Political Party": "",
  Jurisdiction: "STATE OF WISCONSIN",
  Contest: "",
  District: "",
  "Contest Ballot Position": "",
  "Candidate Ballot Position": "1",
  ...over,
});

describe("raceIdForContest", () => {
  test("maps the state's contest wording to our race IDs", () => {
    expect(raceIdForContest("GOVERNOR / LIEUTENANT GOVERNOR")).toBe("WI-GOV-2026");
    expect(raceIdForContest("ATTORNEY GENERAL")).toBe("WI-AG-2026");
    expect(raceIdForContest("SECRETARY OF STATE")).toBe("WI-SOS-2026");
    expect(raceIdForContest("STATE TREASURER")).toBe("WI-TREAS-2026");
    expect(raceIdForContest("REPRESENTATIVE IN CONGRESS DISTRICT 4")).toBe("WI-US-HOUSE-D4-2026");
    expect(raceIdForContest("STATE SENATOR DISTRICT 7")).toBe("WI-STATE-SENATE-D7-2026");
    expect(raceIdForContest("REPRESENTATIVE TO THE ASSEMBLY DISTRICT 19")).toBe(
      "WI-STATE-ASSEMBLY-D19-2026",
    );
  });

  test("returns null for anything else rather than guessing", () => {
    expect(raceIdForContest("Adams County Sheriff")).toBeNull();
    expect(raceIdForContest("STATE SUPERINTENDENT")).toBeNull();
  });
});

describe("splitTicket", () => {
  test("separates a governor ticket into candidate and running mate", () => {
    expect(splitTicket("Tom Tiffany / David Varnam")).toEqual({
      matchName: "Tom Tiffany",
      runningMate: "David Varnam",
    });
  });

  test("leaves an ordinary name alone", () => {
    expect(splitTicket("Russell Antonio Goodwin, Sr.")).toEqual({
      matchName: "Russell Antonio Goodwin, Sr.",
      runningMate: null,
    });
  });
});

describe("buildGeneralBallot", () => {
  const rows = [
    row({
      "Name On Ballot": "David Crowley / Sarah Godlewski",
      "Political Party": "Democratic",
      CommitteeID: "0105751",
      Contest: "GOVERNOR / LIEUTENANT GOVERNOR",
      "Candidate Ballot Position": "2",
    }),
    row({
      "Name On Ballot": "Tom Tiffany / David Varnam",
      "Political Party": "Republican",
      CommitteeID: "0104212",
      Contest: "GOVERNOR / LIEUTENANT GOVERNOR",
      "Candidate Ballot Position": "1",
    }),
    row({
      "Name On Ballot": "Pete Karas",
      "Political Party": "Wisconsin Green",
      Contest: "SECRETARY OF STATE",
      "Candidate Ballot Position": "3",
    }),
    // A county office: real, but not stored by this plan.
    row({
      "Name On Ballot": "Brent R. York",
      "Political Party": "Republican",
      Jurisdiction: "ADAMS COUNTY",
      Contest: "Adams County Sheriff",
    }),
    // A referendum row has no candidate.
    row({ IsReferendum: "Referendum", Contest: "State of Wisconsin Partial Veto Referendum - QUESTION 1" }),
    // The state prints a blank row for a party fielding nobody.
    row({ "Political Party": "Constitution", Contest: "ATTORNEY GENERAL" }),
  ];

  test("keeps state and federal candidates, in ballot order, names verbatim", () => {
    const { contests, unrecognized } = buildGeneralBallot(rows);
    expect([...contests.keys()].sort()).toEqual(["WI-GOV-2026", "WI-SOS-2026"]);
    expect(contests.get("WI-GOV-2026")).toEqual([
      {
        ballotName: "Tom Tiffany / David Varnam",
        matchName: "Tom Tiffany",
        runningMate: "David Varnam",
        party: "Republican",
        ballotOrder: 1,
        committeeId: "0104212",
      },
      {
        ballotName: "David Crowley / Sarah Godlewski",
        matchName: "David Crowley",
        runningMate: "Sarah Godlewski",
        party: "Democratic",
        ballotOrder: 2,
        committeeId: "0105751",
      },
    ]);
    expect(contests.get("WI-SOS-2026")[0].party).toBe("Wisconsin Green");
    expect(contests.get("WI-SOS-2026")[0].committeeId).toBeNull();
    expect(unrecognized).toEqual([]);
  });

  test("reports a state contest it does not recognize instead of dropping it", () => {
    const { contests, unrecognized } = buildGeneralBallot([
      ...rows,
      row({ "Name On Ballot": "Pat Doe", Contest: "STATE SUPERINTENDENT" }),
    ]);
    expect(unrecognized).toEqual(["STATE SUPERINTENDENT"]);
    expect(contests.has("WI-GOV-2026")).toBe(true);
  });

  test("refuses the primary spreadsheet", () => {
    const primary = rows.map((r) => ({ ...r, Election: "2026 Partisan Primary" }));
    expect(() => buildGeneralBallot(primary)).toThrow(/2026 General Election/);
  });

  test("refuses a file missing a column it depends on", () => {
    const broken = rows.map(({ Jurisdiction: _dropped, ...rest }) => rest);
    expect(() => buildGeneralBallot(broken)).toThrow(/Jurisdiction/);
  });

  test("refuses the same name twice in one race", () => {
    expect(() => buildGeneralBallot([rows[2], rows[2]])).toThrow(/duplicate/i);
  });

  test("refuses a ballot position that is not a whole number", () => {
    expect(() =>
      buildGeneralBallot([row({ "Name On Ballot": "Pete Karas", Contest: "SECRETARY OF STATE", "Candidate Ballot Position": "" })]),
    ).toThrow(/ballot position/i);
  });

  test("refuses an empty file and a file with no state candidates", () => {
    expect(() => buildGeneralBallot([])).toThrow(/no rows/);
    expect(() => buildGeneralBallot([rows[3]])).toThrow(/no state or federal candidates/);
  });
});
