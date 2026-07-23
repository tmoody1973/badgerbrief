import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { htmlToLines, parseHeader, parseTallies, parseVacantSeats, parseVoteDate, parseAssemblyVotes, parseRollCall, parseSenateVotes, type Position } from "./rollCall";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", name), "utf8");

const asmLines = htmlToLines(fixture("wi-assembly-av0083.html"));
const senLines = htmlToLines(fixture("wi-senate-sv0260.html"));
const senNoVacancy = htmlToLines(fixture("wi-senate-sv0050.html"));

describe("parseHeader", () => {
  test("reads bill, title and vote type from an Assembly roll call", () => {
    expect(parseHeader(asmLines)).toEqual({
      billNumber: "AB 388",
      billTitle: "CHILD CARE CENTER RENOVATIONS LOAN PROGRAM",
      voteType: "PASSAGE",
    });
  });

  test("reads them from a Senate roll call, where the title differs", () => {
    // Same bill, different title text per chamber — store what each doc says.
    expect(parseHeader(senLines)).toEqual({
      billNumber: "AB 388",
      billTitle: "CHILD CARE CENTER LOAN PROGRAM",
      voteType: "CONCURRENCE",
    });
  });

  test("reads an amendment vote's extra trailing 'OFFERED BY' line as neither title nor vote type", () => {
    // wi-senate-sv0050.html header runs: SB 330 / BY STROEBEL / title /
    // "REJECT AMENDMENT" / "SA5 OFFERED BY LARSON". The vote type is the
    // SECOND line after the sponsor, not the last line in the header.
    expect(parseHeader(senNoVacancy)).toEqual({
      billNumber: "SB 330",
      billTitle: "CHARTER AND CHOICE PER PUPIL PAYMENTS (REVENUE CEI",
      voteType: "REJECT AMENDMENT",
    });
  });
});

describe("parseTallies", () => {
  test("reads Assembly tallies", () => {
    expect(parseTallies(asmLines)).toEqual({ ayes: 62, nays: 35, notVoting: 2 });
  });

  test("reads Senate tallies", () => {
    expect(parseTallies(senLines)).toEqual({ ayes: 22, nays: 10, notVoting: 0 });
  });
});

describe("parseVacantSeats", () => {
  test("counts listed district NUMBERS, not their values", () => {
    // "VACANT DISTRICTS: 4" = district 4 is vacant = ONE seat.
    // Reading it as four would reject every Senate roll call taken during a vacancy.
    expect(parseVacantSeats(senLines)).toBe(1);
  });

  test("returns 0 for NO VACANT DISTRICTS", () => {
    expect(parseVacantSeats(senNoVacancy)).toBe(0);
    expect(parseVacantSeats(asmLines)).toBe(0);
  });
});

describe("parseVoteDate", () => {
  test("reads the date from the document footer", () => {
    expect(parseVoteDate(asmLines)).toBe("2023-09-14");
    expect(parseVoteDate(senLines)).toBe("2024-02-13");
    expect(parseVoteDate(senNoVacancy)).toBe("2023-06-14");
  });
});

describe("htmlToLines", () => {
  test("normalizes a non-breaking space (U+00A0) to a regular space", () => {
    expect(htmlToLines("<p>AYES\u00A0-\u00A05</p>")).toEqual(["AYES - 5"]);
  });
});

describe("parseAssemblyVotes", () => {
  const votes = parseAssemblyVotes(asmLines);

  test("returns one row per seat", () => {
    expect(votes).toHaveLength(99);
  });

  test("reads a named member's position and party", () => {
    expect(votes.find((v) => v.name === "HONG")).toEqual({
      name: "HONG",
      party: "D",
      position: "nay",
    });
    expect(votes.find((v) => v.name === "ALLEN")).toEqual({
      name: "ALLEN",
      party: "R",
      position: "aye",
    });
  });

  test("keeps the first initial that disambiguates a shared surname", () => {
    // ANDERSON, C and ANDERSON, J are different people in the same chamber.
    const andersons = votes.filter((v) => v.name.startsWith("ANDERSON"));
    expect(andersons.map((v) => v.name).sort()).toEqual(["ANDERSON, C", "ANDERSON, J"]);
  });

  test("positions sum to the document's own tallies", () => {
    const count = (p: Position) => votes.filter((v) => v.position === p).length;
    expect(count("aye")).toBe(62);
    expect(count("nay")).toBe(35);
    expect(count("not_voting")).toBe(2);
  });

  test("accepts member names with curly apostrophes", () => {
    // Verify NAME_RE accepts both straight (') and curly (') apostrophes.
    const testLines = [
      "AYES - 2",
      "Y",
      "O’CONNOR",
      "R",
      "N",
      "O'CONNOR",
      "D",
      "VACANT DISTRICTS",
    ];
    const result = parseAssemblyVotes(testLines);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("O’CONNOR");
    expect(result[0].position).toBe("aye");
    expect(result[1].name).toBe("O'CONNOR");
    expect(result[1].position).toBe("nay");
  });
});

describe("parseSenateVotes", () => {
  const votes = parseSenateVotes(senLines);

  test("returns every member who voted, grouped under the tally headers", () => {
    // 33 seats minus one vacancy.
    expect(votes).toHaveLength(32);
  });

  test("reads a named senator's position", () => {
    expect(votes.find((v) => v.name === "ROYS")).toEqual({
      name: "ROYS",
      position: "nay",
    });
    expect(votes.find((v) => v.name === "BALLWEG")).toEqual({
      name: "BALLWEG",
      position: "aye",
    });
  });

  test("carries no party — the Senate document does not print one", () => {
    expect(votes.every((v) => v.party === undefined)).toBe(true);
  });
});

describe("parseRollCall", () => {
  test("parses a complete Assembly roll call", () => {
    const rc = parseRollCall(fixture("wi-assembly-av0083.html"), {
      session: "2023",
      chamber: "assembly",
      voteId: "av0083",
    });
    expect("error" in rc).toBe(false);
    if ("error" in rc) return;
    expect(rc.billNumber).toBe("AB 388");
    expect(rc.voteType).toBe("PASSAGE");
    expect(rc.votedOn).toBe("2023-09-14");
    expect(rc.votes).toHaveLength(99);
    expect(rc.sourceUrl).toBe(
      "https://docs.legis.wisconsin.gov/2023/related/votes/assembly/av0083",
    );
  });

  test("parses a Senate roll call taken during a vacancy", () => {
    const rc = parseRollCall(fixture("wi-senate-sv0260.html"), {
      session: "2023",
      chamber: "senate",
      voteId: "sv0260",
    });
    expect("error" in rc).toBe(false);
    if ("error" in rc) return;
    expect(rc.voteType).toBe("CONCURRENCE");
    expect(rc.vacantSeats).toBe(1);
    expect(rc.votes).toHaveLength(32);
  });

  test("REJECTS a roll call whose rows do not match its own tallies", () => {
    // Drop one member row; the parse must fail rather than store 98 of 99.
    const broken = fixture("wi-assembly-av0083.html").replace(">HONG<", "><");
    const rc = parseRollCall(broken, {
      session: "2023",
      chamber: "assembly",
      voteId: "av0083",
    });
    expect("error" in rc).toBe(true);
  });

  test("rejects a document with no tallies at all", () => {
    const rc = parseRollCall("<html><body>Not a roll call</body></html>", {
      session: "2023",
      chamber: "assembly",
      voteId: "av9999",
    });
    expect("error" in rc).toBe(true);
  });
});
