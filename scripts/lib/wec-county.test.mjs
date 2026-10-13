// @vitest-environment node
import { describe, expect, test } from "vitest";
import { buildCountyContests, countyKey } from "./wec-county.mjs";
import { readWecWorkbook } from "./wec-legislative.mjs";

const STATE_FILE =
  "docs/evidence/2026-10-12-wec-general/All-Contests-and-Candidates_November-3-2026.xlsx";

const row = (over) => ({
  Election: "2026 General Election",
  IsReferendum: "",
  Candidate: "",
  "Name On Ballot": "Curt Vandertie",
  CommitteeID: "",
  "Political Party": "Republican",
  Jurisdiction: "DOOR COUNTY",
  Contest: "Door County Sheriff",
  District: "Door County",
  "Contest Ballot Position": "21504",
  "Candidate Ballot Position": "1",
  ...over,
});

describe("countyKey", () => {
  test("gives one key for every way a county name is written", () => {
    expect(countyKey("ST. CROIX COUNTY")).toBe("st-croix");
    expect(countyKey("St. Croix County")).toBe("st-croix");
    expect(countyKey("St. Croix")).toBe("st-croix");
    expect(countyKey("Fond du Lac")).toBe("fond-du-lac");
    expect(countyKey("  Milwaukee County ")).toBe("milwaukee");
  });
});

describe("buildCountyContests", () => {
  test("keeps a countywide office, candidates in ballot order, names as printed", () => {
    const built = buildCountyContests([
      row({ "Name On Ballot": "Tammy Weckler-Sternard", "Political Party": "Democratic", "Candidate Ballot Position": "2" }),
      row(),
    ]);
    expect(built).toEqual({
      contests: [
        {
          county: "door",
          countyName: "Door County",
          office: "Sheriff",
          contestAsPrinted: "Door County Sheriff",
          ballotPosition: 21504,
          candidates: [
            { ballotName: "Curt Vandertie", party: "Republican", ballotOrder: 1 },
            { ballotName: "Tammy Weckler-Sternard", party: "Democratic", ballotOrder: 2 },
          ],
        },
      ],
      excluded: [],
      unrecognized: [],
      notes: [],
    });
  });

  test("reads the office when the state words the title differently", () => {
    const { contests } = buildCountyContests([
      row({ Jurisdiction: "FOND DU LAC COUNTY", District: "Fond du Lac County", Contest: "Fond du Lac Sheriff", "Contest Ballot Position": "22004" }),
      row({ Jurisdiction: "COLUMBIA COUNTY", District: "Columbia County", Contest: "Columbia County Clerk of Circuit Courts", "Contest Ballot Position": "21106" }),
    ]);
    expect(contests.map((c) => [c.county, c.office, c.contestAsPrinted])).toEqual([
      ["columbia", "Clerk of Circuit Court", "Columbia County Clerk of Circuit Courts"],
      ["fond-du-lac", "Sheriff", "Fond du Lac Sheriff"],
    ]);
  });

  test("keeps an office nobody filed for, with no candidates, and flags it", () => {
    const built = buildCountyContests([
      row({ Jurisdiction: "IRON COUNTY", District: "Iron County", Contest: "Iron County Coroner", "Contest Ballot Position": "22605", "Name On Ballot": "", "Political Party": "", "Candidate Ballot Position": "0" }),
    ]);
    expect(built.contests).toEqual([
      { county: "iron", countyName: "Iron County", office: "Coroner", contestAsPrinted: "Iron County Coroner", ballotPosition: 22605, candidates: [] },
    ]);
    expect(built.notes).toEqual(["Iron County Coroner: the state lists no candidate."]);
  });

  test("sets aside an office that covers part of a county, with the reason", () => {
    const built = buildCountyContests([
      row(),
      row({ Jurisdiction: "CITY OF VERONA - DANE COUNTY", District: "City of Verona", Contest: "Verona Municipal Judge", "Political Party": "", "Name On Ballot": "A Judge" }),
      row({ Jurisdiction: "WOOD COUNTY", District: "MARSHFIELD AREA JOINT MUNICIPAL COURT", Contest: "Municipal Judge Marshfield Area Joint Municipal Court", "Political Party": "", "Name On Ballot": "B Judge" }),
      row({ Jurisdiction: "PRICE COUNTY", District: "Price County Supervisory District 5", Contest: "Price County Supervisor District 5", "Political Party": "", "Name On Ballot": "C Supervisor" }),
    ]);
    expect(built.contests.map((c) => c.contestAsPrinted)).toEqual(["Door County Sheriff"]);
    expect(built.excluded.map((e) => e.contestAsPrinted)).toEqual([
      "Municipal Judge Marshfield Area Joint Municipal Court",
      "Price County Supervisor District 5",
      "Verona Municipal Judge",
    ]);
    expect(built.excluded[2]).toEqual({
      contestAsPrinted: "Verona Municipal Judge",
      jurisdiction: "CITY OF VERONA - DANE COUNTY",
      district: "City of Verona",
      reason: "Covers part of a county. My Ballot knows a voter's county, not their city, town or supervisory district.",
    });
    expect(built.unrecognized).toEqual([]);
  });

  test("reports a contest it does not recognize instead of dropping it", () => {
    const built = buildCountyContests([
      row(),
      row({ Jurisdiction: "DANE COUNTY", District: "Dane County", Contest: "Dane County Register of Deeds" }),
      row({ Jurisdiction: "CITY OF VERONA - DANE COUNTY", District: "City of Verona", Contest: "Verona Sheriff" }),
    ]);
    expect(built.unrecognized).toEqual([
      "CITY OF VERONA - DANE COUNTY: Verona Sheriff",
      "DANE COUNTY: Dane County Register of Deeds",
    ]);
    expect(built.contests.map((c) => c.contestAsPrinted)).toEqual(["Door County Sheriff"]);
  });

  test("ignores state contests and referendum rows", () => {
    const built = buildCountyContests([
      row(),
      row({ Jurisdiction: "STATE OF WISCONSIN", District: "Wisconsin", Contest: "ATTORNEY GENERAL", "Name On Ballot": "Eric Toney" }),
      row({ IsReferendum: "Referendum", Contest: "Sevastopol School District Referendum", "Name On Ballot": "", "Candidate Ballot Position": "0" }),
    ]);
    expect(built.contests).toHaveLength(1);
    expect(built.unrecognized).toEqual([]);
  });

  test("keeps the state's order when two candidates share a position, and flags it", () => {
    const built = buildCountyContests([
      row({ Jurisdiction: "CLARK COUNTY", District: "Clark County", Contest: "Clark County Sheriff", "Name On Ballot": "First Listed" }),
      row({ Jurisdiction: "CLARK COUNTY", District: "Clark County", Contest: "Clark County Sheriff", "Name On Ballot": "Second Listed", "Political Party": "Independent" }),
    ]);
    expect(built.contests[0].candidates.map((c) => c.ballotName)).toEqual(["First Listed", "Second Listed"]);
    expect(built.notes).toEqual([
      "Clark County Sheriff: the state gives more than one candidate the same ballot position. They are kept in the order the state lists them.",
    ]);
  });

  test("orders contests by county, then by the state's office order", () => {
    const mke = { Jurisdiction: "MILWAUKEE COUNTY", District: "Milwaukee County" };
    const { contests } = buildCountyContests([
      row({ ...mke, Contest: "Milwaukee County Clerk of Circuit Court", "Contest Ballot Position": "24107", "Name On Ballot": "Anna Maria Hodges" }),
      row({ ...mke, Contest: "Milwaukee County Sheriff", "Contest Ballot Position": "24104", "Name On Ballot": "Denita R. Ball" }),
      row({ Jurisdiction: "ADAMS COUNTY", District: "Adams County", Contest: "Adams County Sheriff", "Contest Ballot Position": "20104" }),
    ]);
    expect(contests.map((c) => c.contestAsPrinted)).toEqual([
      "Adams County Sheriff",
      "Milwaukee County Sheriff",
      "Milwaukee County Clerk of Circuit Court",
    ]);
  });

  test("stores an accented name as text, not as a raw character code", () => {
    const { contests } = buildCountyContests([row({ "Name On Ballot": "Ana Casta&#xF1;eda" })]);
    expect(contests[0].candidates[0].ballotName).toBe("Ana Castañeda");
  });

  test("refuses the primary spreadsheet", () => {
    expect(() => buildCountyContests([row({ Election: "2026 Partisan Primary" })])).toThrow(/expected only "2026 General Election"/);
  });

  test("refuses a file missing a column it depends on", () => {
    const { District: _district, ...withoutDistrict } = row();
    expect(() => buildCountyContests([withoutDistrict])).toThrow(/missing column\(s\): District/);
  });

  test("refuses the same name twice in one contest", () => {
    expect(() => buildCountyContests([row(), row()])).toThrow(/duplicate "Curt Vandertie" in Door County Sheriff/);
  });

  test("refuses a candidate position that is not a whole number", () => {
    expect(() => buildCountyContests([row({ "Candidate Ballot Position": "1.5" })])).toThrow(/no usable ballot position/);
  });

  test("refuses two differently worded contests for one office in one county", () => {
    expect(() =>
      buildCountyContests([row(), row({ Contest: "Door Sheriff", "Name On Ballot": "Someone Else" })]),
    ).toThrow(/two contests for Sheriff in Door County/);
  });

  test("refuses an empty file and a file with no county offices", () => {
    expect(() => buildCountyContests([])).toThrow(/no rows/);
    expect(() =>
      buildCountyContests([row({ Jurisdiction: "STATE OF WISCONSIN", District: "Wisconsin", Contest: "ATTORNEY GENERAL" })]),
    ).toThrow(/no county offices found/);
  });
});

describe("the state's file for November 3, 2026", () => {
  const built = buildCountyContests(readWecWorkbook(STATE_FILE));
  const count = (office) => built.contests.filter((c) => c.office === office).length;

  test("has a sheriff and a clerk of circuit court in all 72 counties, and 20 coroners", () => {
    expect(new Set(built.contests.map((c) => c.county)).size).toBe(72);
    expect([count("Sheriff"), count("Clerk of Circuit Court"), count("Coroner")]).toEqual([72, 72, 20]);
    expect(built.contests).toHaveLength(164);
  });

  test("names 180 candidates; three contests have none", () => {
    expect(built.contests.reduce((n, c) => n + c.candidates.length, 0)).toBe(180);
    expect(built.contests.filter((c) => c.candidates.length === 0).map((c) => c.contestAsPrinted)).toEqual([
      "Iron County Coroner",
      "Pepin County Coroner",
      "Richland County Coroner",
    ]);
  });

  test("sets aside exactly the four contests that cover part of a county", () => {
    expect(built.excluded.map((e) => e.contestAsPrinted)).toEqual([
      "City of Jefferson Municipal Judge",
      "Municipal Judge Marshfield Area Joint Municipal Court",
      "Price County Supervisor District 5",
      "Verona Municipal Judge",
    ]);
  });

  test("recognizes every contest", () => {
    expect(built.unrecognized).toEqual([]);
  });

  test("prints Milwaukee County's two contests as the state does", () => {
    expect(built.contests.filter((c) => c.county === "milwaukee")).toEqual([
      { county: "milwaukee", countyName: "Milwaukee County", office: "Sheriff", contestAsPrinted: "Milwaukee County Sheriff", ballotPosition: 24104, candidates: [{ ballotName: "Denita R. Ball", party: "Democratic", ballotOrder: 1 }] },
      { county: "milwaukee", countyName: "Milwaukee County", office: "Clerk of Circuit Court", contestAsPrinted: "Milwaukee County Clerk of Circuit Court", ballotPosition: 24107, candidates: [{ ballotName: "Anna Maria Hodges", party: "Democratic", ballotOrder: 1 }] },
    ]);
  });
});
