import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { htmlToLines, parseHeader, parseTallies, parseVacantSeats, parseVoteDate } from "./rollCall";

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
