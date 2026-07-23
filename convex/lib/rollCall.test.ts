import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { htmlToLines, parseHeader, parseTallies, parseVacantSeats, parseVoteDate, parseAssemblyVotes, parseRollCall, parseSenateVotes, parseVoteIndex, type Position } from "./rollCall";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", name), "utf8");

const asmLines = htmlToLines(fixture("wi-assembly-av0083.html"));
const senLines = htmlToLines(fixture("wi-senate-sv0260.html"));
const senNoVacancy = htmlToLines(fixture("wi-senate-sv0050.html"));
const resolutionLines = htmlToLines(fixture("wi-assembly-av0003-sjr.html"));
const oldAsmLines = htmlToLines(fixture("wi-assembly-av0100-2013.html"));

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

  test("reads a resolution's measure number, title and vote type (SJR, not a bill)", () => {
    // 2023 Assembly av0003 is a real recorded vote on a Joint Resolution, not a
    // bill. Same document structure, different measure-type prefix — this pins
    // the regex widening that lets AJR/SJR/AR/SR through parseHeader.
    expect(parseHeader(resolutionLines)).toEqual({
      billNumber: "SJR 1",
      billTitle: "SESSION SCHEDULE FOR 2023-2024 LEGISLATIVE SESSION",
      voteType: "CONCURRENCE",
    });
  });

  test("accepts AJR/SJR/AR/SR measure numbers and still parses existing AB/SB fixtures unchanged", () => {
    // Pins the regex widening directly, independent of any fixture, and
    // guards against a future edit narrowing it back to bills only.
    const header = (billLine: string) => [
      "WISCONSIN ASSEMBLY",
      billLine,
      "BY COMMITTEE",
      "SOME TITLE",
      "ADOPTION",
      "AYES - 1",
    ];
    expect(parseHeader(header("AJR 15"))?.billNumber).toBe("AJR 15");
    expect(parseHeader(header("SJR 1"))?.billNumber).toBe("SJR 1");
    expect(parseHeader(header("AR 3"))?.billNumber).toBe("AR 3");
    expect(parseHeader(header("SR 2"))?.billNumber).toBe("SR 2");
    // "AJR 5" must be read whole, never mis-split as if "AR" matched a prefix.
    expect(parseHeader(header("AJR 5"))?.billNumber).toBe("AJR 5");

    // Regression: existing bill fixtures parse exactly as before.
    expect(parseHeader(asmLines)).toEqual({
      billNumber: "AB 388",
      billTitle: "CHILD CARE CENTER RENOVATIONS LOAN PROGRAM",
      voteType: "PASSAGE",
    });
    expect(parseHeader(senLines)).toEqual({
      billNumber: "AB 388",
      billTitle: "CHILD CARE CENTER LOAN PROGRAM",
      voteType: "CONCURRENCE",
    });
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

  test("never spends one mark on two rows", () => {
    // htmlToLines drops empty lines, so a row with a blank mark cell would
    // otherwise scan back into the previous row and consume its mark a second
    // time. Here BROWN has no mark of its own: it must be dropped, not given
    // SMITH's "Y".
    const testLines = ["AYES - 1", "Y", "SMITH", "R", "BROWN", "D", "VACANT DISTRICTS"];
    expect(parseAssemblyVotes(testLines)).toEqual([
      { name: "SMITH", party: "R", position: "aye" },
    ]);
  });

  test("never lets the FIRST data row consume the table's own column headers", () => {
    // The <th> texts are A / N / NV / NAME, and "N" and "NV" are also vote
    // marks. Row 1 sits directly under them, so without a floor at the header
    // an unmarked first row reaches back and steals one — the single row the
    // once-only invariant does not cover. Both must yield no member at all.
    expect(
      parseAssemblyVotes(["AYES - 1", "A", "N", "NV", "NAME", "ALLEN", "R", "VACANT DISTRICTS"]),
    ).toEqual([]);
    expect(parseAssemblyVotes(["AYES - 1", "A", "N", "NAME", "ALLEN", "R"])).toEqual([]);
  });

  test("still reads the first data row when it has a mark of its own", () => {
    // The header floor must not swallow row 1's legitimate mark.
    expect(
      parseAssemblyVotes(["AYES - 1", "A", "N", "NV", "NAME", "Y", "ALLEN", "R"]),
    ).toEqual([{ name: "ALLEN", party: "R", position: "aye" }]);
  });

  test("reads a dotted disambiguating initial from a pre-2019 document", () => {
    // 2023/2025 print "ANDERSON, C"; pre-2019 print the initial with a trailing
    // period: "OTT, A." / "OTT, J.". Both Otts sat together through 2015, so
    // dropping the dotted rows made every 2011–2017 roll call parse two short.
    const otts = parseAssemblyVotes(oldAsmLines).filter((v) => v.name.startsWith("OTT"));
    expect(otts).toEqual([
      { name: "OTT, A.", party: "R", position: "aye" },
      { name: "OTT, J.", party: "R", position: "aye" },
    ]);
  });

  test("a bare dotted initial pins the NAME_RE widening independent of any fixture", () => {
    // Guards against a future edit dropping the "\\." and silently losing the
    // dotted-initial rows again.
    const testLines = ["AYES - 1", "Y", "OTT, A.", "R", "VACANT DISTRICTS"];
    expect(parseAssemblyVotes(testLines)).toEqual([
      { name: "OTT, A.", party: "R", position: "aye" },
    ]);
  });

  test("old-format Assembly roll call reconciles to a full 99 seats", () => {
    const votes = parseAssemblyVotes(oldAsmLines);
    expect(votes).toHaveLength(99);
    const count = (p: Position) => votes.filter((v) => v.position === p).length;
    expect(count("aye")).toBe(57);
    expect(count("nay")).toBe(37);
    expect(count("not_voting")).toBe(5);
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

  test("STOPS at the footer rather than skipping it and reading on", () => {
    // SENATE_STOP must BREAK, not merely skip the matched line. A footer group
    // such as PAIRED is followed by more all-caps names; skipping the header
    // would file each of them under the last tally group's position — here
    // BROWN and JONES would both be recorded as voting nay.
    expect(parseSenateVotes(["NAYS - 1", "SMITH", "PAIRED - 2", "BROWN", "JONES"])).toEqual([
      { name: "SMITH", position: "nay" },
    ]);
    expect(parseSenateVotes(senNoVacancy)).toHaveLength(33);
  });
});

describe("parseRollCall", () => {
  const asmRef = { session: "2023", chamber: "assembly" as const, voteId: "av0083" };
  const senateRef = (voteId: string) => ({
    session: "2023",
    chamber: "senate" as const,
    voteId,
  });

  /** Empty a row's three leading mark cells, leaving its name and party intact. */
  const blankMarkCells = (html: string, name: string) => {
    const row = html.match(
      new RegExp(`<tr>(?:\\s*<td>[^<]*</td>){3}\\s*<td class="name">${name}</td>[\\s\\S]*?</tr>`),
    );
    if (!row) throw new Error(`no row for ${name}`);
    const nameAt = row[0].indexOf('class="name"');
    return html.replace(
      row[0],
      row[0].replace(/<td>[^<]*<\/td>/g, (td, off: number) => (off < nameAt ? "<td></td>" : td)),
    );
  };

  test("parses a complete Assembly roll call", () => {
    const rc = parseRollCall(fixture("wi-assembly-av0083.html"), asmRef);
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

  test("REJECTS offsetting blank mark cells that would flip two members' votes", () => {
    // The demonstrated attack: blanking ARMSTRONG's and ANDERSON, C's mark cells
    // made each row consume its predecessor's mark, storing ARMSTRONG (aye) as
    // nay and ANDERSON, C (nay) as aye — with 99 rows, matching tallies and a
    // passing seat check.
    let broken = blankMarkCells(fixture("wi-assembly-av0083.html"), "ARMSTRONG");
    broken = blankMarkCells(broken, "ANDERSON, C");
    expect(parseRollCall(broken, asmRef)).toEqual({
      error: "parsed 61/34/2 does not match printed 62/35/2",
    });
  });

  test("REJECTS a blank mark cell on ANY row", () => {
    // Sweeps every Assembly row: none may be accepted with its mark removed.
    const html = fixture("wi-assembly-av0083.html");
    const names = [...html.matchAll(/<td class="name">([^<]*)<\/td>/g)].map((m) => m[1]);
    expect(names).toHaveLength(99);
    const accepted = names.filter(
      (n) => !("error" in parseRollCall(blankMarkCells(html, n), asmRef)),
    );
    expect(accepted).toEqual([]);
  });

  test("parses a real resolution roll call (SJR) all the way through the gate", () => {
    // Resolutions take recorded floor votes exactly like bills; this fixture
    // (2023 Assembly av0003, SJR 1) proves one now flows through parseRollCall
    // end to end instead of being rejected by the bill-only header regex.
    const rc = parseRollCall(
      fixture("wi-assembly-av0003-sjr.html"),
      { session: "2023", chamber: "assembly" as const, voteId: "av0003" },
    );
    expect("error" in rc).toBe(false);
    if ("error" in rc) return;
    expect(rc.billNumber).toBe("SJR 1");
    expect(rc.billTitle).toBe("SESSION SCHEDULE FOR 2023-2024 LEGISLATIVE SESSION");
    expect(rc.voteType).toBe("CONCURRENCE");
    expect(rc.votes).toHaveLength(99);
    expect(rc.ayes).toBe(99);
    expect(rc.nays).toBe(0);
    expect(rc.notVoting).toBe(0);
  });

  test("REJECTS a corrupted resolution exactly as it rejects a corrupted bill", () => {
    // The reconciliation gate must bite on resolutions too: blanking one
    // member's mark cell on the SJR fixture must still fail the tally check.
    const resolutionRef = { session: "2023", chamber: "assembly" as const, voteId: "av0003" };
    const html = fixture("wi-assembly-av0003-sjr.html");
    const names = [...html.matchAll(/<td class="name">([^<]*)<\/td>/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    const rc = parseRollCall(blankMarkCells(html, names[0]), resolutionRef);
    expect("error" in rc).toBe(true);
  });

  test("parses a real pre-2019 Assembly roll call end to end", () => {
    // 2013 av0100 (AB 181, TABLE AMENDMENT) is the old document format whose
    // dotted-initial rows (OTT, A. / OTT, J.) the parser previously dropped,
    // making the whole document fail the reconciliation gate. It must now flow
    // through cleanly and fill all 99 seats.
    const oldRef = { session: "2013", chamber: "assembly" as const, voteId: "av0100" };
    const rc = parseRollCall(fixture("wi-assembly-av0100-2013.html"), oldRef);
    expect("error" in rc).toBe(false);
    if ("error" in rc) return;
    expect(rc.billNumber).toBe("AB 181");
    expect(rc.voteType).toBe("TABLE AMENDMENT");
    expect(rc.votedOn).toBe("2013-06-06");
    expect(rc.votes).toHaveLength(99);
    expect(rc.ayes).toBe(57);
    // The two Otts specifically — the rows the fix restores — are present.
    expect(rc.votes.filter((v) => v.name.startsWith("OTT"))).toHaveLength(2);
  });

  test("REJECTS a blank mark cell on ANY row of the pre-2019 format too", () => {
    // The gate must still fail closed on the old format: sweep every row and
    // confirm none is accepted with its mark removed. Proves the NAME_RE
    // widening did not open a hole in the reconciliation guard for old docs.
    const oldRef = { session: "2013", chamber: "assembly" as const, voteId: "av0100" };
    const html = fixture("wi-assembly-av0100-2013.html");
    const names = [...html.matchAll(/<td class="name">([^<]*)<\/td>/g)].map((m) => m[1]);
    expect(names).toHaveLength(99);
    const accepted = names.filter(
      (n) => !("error" in parseRollCall(blankMarkCells(html, n), oldRef)),
    );
    expect(accepted).toEqual([]);
  });

  test("parses a Senate roll call taken during a vacancy", () => {
    const rc = parseRollCall(fixture("wi-senate-sv0260.html"), senateRef("sv0260"));
    expect("error" in rc).toBe(false);
    if ("error" in rc) return;
    expect(rc.voteType).toBe("CONCURRENCE");
    expect(rc.vacantSeats).toBe(1);
    expect(rc.votes).toHaveLength(32);
  });

  test("parses a Senate roll call with no vacancy", () => {
    const rc = parseRollCall(fixture("wi-senate-sv0050.html"), senateRef("sv0050"));
    expect("error" in rc).toBe(false);
    if ("error" in rc) return;
    expect(rc.vacantSeats).toBe(0);
    expect(rc.votes).toHaveLength(33);
  });

  test("REJECTS a roll call whose rows do not match its own tallies", () => {
    // Drop one member row; the parse must fail rather than store 98 of 99.
    // The exact message pins WHICH gate fired — asserting only that some error
    // came back leaves the tally check free to be deleted.
    const broken = fixture("wi-assembly-av0083.html").replace(">HONG<", "><");
    expect(parseRollCall(broken, asmRef)).toEqual({
      error: "parsed 62/34/2 does not match printed 62/35/2",
    });
  });

  test("REJECTS a roll call whose rows do not fill the chamber", () => {
    // Internally consistent tallies (22/10/0 parsed AND printed) that leave a
    // seat unaccounted for once the vacancy note is removed. Only the seat
    // check can catch this; the tally check sees nothing wrong.
    const broken = fixture("wi-senate-sv0260.html").replace(
      "VACANT DISTRICTS: 4",
      "NO VACANT DISTRICTS",
    );
    expect(parseRollCall(broken, senateRef("sv0260"))).toEqual({
      error: "32 rows + 0 vacant != 33 seats",
    });
  });

  test("REJECTS a document where one member's cell carries another's name", () => {
    // Every count still balances — only the names reveal that HONG's vote was
    // filed under HAYWOOD, who now appears twice.
    const broken = fixture("wi-assembly-av0083.html").replace(">HONG<", ">HAYWOOD<");
    expect(parseRollCall(broken, asmRef)).toEqual({
      error: "duplicate member name: HAYWOOD",
    });
  });

  test("REJECTS a Senate document with a duplicated senator", () => {
    const broken = fixture("wi-senate-sv0050.html").replace(">ROYS<", ">AGARD<");
    expect(parseRollCall(broken, senateRef("sv0050"))).toEqual({
      error: "duplicate member name: AGARD",
    });
  });

  test("REJECTS a document whose own identity contradicts the ref", () => {
    // Every real page prints its canonical path. Without the cross-check a
    // Senate page is happily stored under an Assembly vote key.
    expect(
      parseRollCall(fixture("wi-senate-sv0260.html"), {
        session: "9999",
        chamber: "senate",
        voteId: "av0260",
      }),
    ).toEqual({ error: "document does not identify itself as /9999/related/votes/senate/av0260" });
  });

  test("REJECTS a voteId that is only a PREFIX of the printed one", () => {
    // A bare substring test accepts "av008" (and "") against the av0083 page,
    // then builds voteKey and sourceUrl from the unvalidated ref — 99 correct
    // votes filed under another vote's id, linking to a URL that 404s.
    const html = fixture("wi-assembly-av0083.html");
    for (const voteId of ["av008", ""]) {
      expect(parseRollCall(html, { ...asmRef, voteId })).toEqual({
        error: `document does not identify itself as /2023/related/votes/assembly/${voteId}`,
      });
    }
  });

  test("still accepts each real fixture's own exact voteId", () => {
    // The boundary must not reject the documents it was added to protect.
    expect("error" in parseRollCall(fixture("wi-assembly-av0083.html"), asmRef)).toBe(false);
    expect(
      "error" in parseRollCall(fixture("wi-senate-sv0260.html"), senateRef("sv0260")),
    ).toBe(false);
    expect(
      "error" in parseRollCall(fixture("wi-senate-sv0050.html"), senateRef("sv0050")),
    ).toBe(false);
  });

  test("REJECTS a document whose printed AYES tally is off by one", () => {
    // Pins the ayes clause of the tally check on its own.
    const broken = fixture("wi-assembly-av0083.html").replace("AYES - 62", "AYES - 61");
    expect(parseRollCall(broken, asmRef)).toEqual({
      error: "parsed 62/35/2 does not match printed 61/35/2",
    });
  });

  test("REJECTS a document whose printed NOT VOTING tally is off by one", () => {
    // Pins the not_voting clause of the tally check on its own.
    const broken = fixture("wi-assembly-av0083.html").replace("NOT VOTING - 2", "NOT VOTING - 1");
    expect(parseRollCall(broken, asmRef)).toEqual({
      error: "parsed 62/35/2 does not match printed 62/35/1",
    });
  });

  test("REJECTS a document with no bill number / title / vote type", () => {
    // Without this branch the header spread is `...null`, which yields nothing:
    // the roll call is returned with billNumber/billTitle/voteType absent while
    // still typed as string, and a candidate profile shows an undefined bill.
    const broken = fixture("wi-assembly-av0083.html").replace(">AB 388<", "><");
    expect(parseRollCall(broken, asmRef)).toEqual({
      error: "no bill number / title / vote type found",
    });
  });

  test("REJECTS a document with no vote date", () => {
    const broken = fixture("wi-assembly-av0083.html").replace(
      "Thursday, September 14, 2023<br>",
      "",
    );
    expect(parseRollCall(broken, asmRef)).toEqual({ error: "no vote date found" });
  });

  test("rejects a document with no tallies at all", () => {
    const rc = parseRollCall(
      "<html><body>/2023/related/votes/assembly/av9999 Not a roll call</body></html>",
      { session: "2023", chamber: "assembly", voteId: "av9999" },
    );
    expect(rc).toEqual({ error: "no AYES/NAYS/NOT VOTING tallies found" });
  });
});

describe("parseVoteIndex", () => {
  test("extracts unique, sorted vote ids for the chamber", () => {
    const html = `
      <a href="/2023/related/votes/assembly/av0083">Assembly Vote 83</a>
      <a href="/2023/related/votes/assembly/av0001">Assembly Vote 1</a>
      <a href="/2023/related/votes/assembly/av0083">dup</a>
      <a href="/2023/related/votes/senate/sv0260">Senate Vote 260</a>`;
    expect(parseVoteIndex(html, "assembly")).toEqual(["av0001", "av0083"]);
  });

  test("ignores the other chamber", () => {
    const html = `<a href="/2023/related/votes/senate/sv0260">x</a>`;
    expect(parseVoteIndex(html, "assembly")).toEqual([]);
    expect(parseVoteIndex(html, "senate")).toEqual(["sv0260"]);
  });

  test("returns an empty list rather than throwing on junk", () => {
    expect(parseVoteIndex("", "assembly")).toEqual([]);
  });
});
