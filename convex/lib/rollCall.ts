/**
 * Pure parsing of Wisconsin Legislature roll-call documents.
 *
 * No network, no Convex ctx — a plain mutation cannot import from a "use node"
 * module, so everything shared between the fetching action and the storing
 * mutation lives here (same split as scoutParse.ts).
 *
 * Source: docs.legis.wisconsin.gov/{session}/related/votes/{chamber}/{av|sv}NNNN
 * Open States is NOT usable for Wisconsin — their own report card notes the
 * state "does not provide stand-alone roll call votes".
 */

export type Chamber = "assembly" | "senate";
export type Position = "aye" | "nay" | "not_voting";

/** Seats per chamber, used by the reconciliation gate. */
export const SEATS: Record<Chamber, number> = { assembly: 99, senate: 33 };

/** Strip tags to a list of non-empty trimmed text lines. */
export function htmlToLines(html: string): string[] {
  return html
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((s) => s.replace(/\u00A0/g, " ").trim())
    .filter((s) => s.length > 0);
}

const TALLY_RE = /^AYES\s*-\s*(\d+)/i;
/** Marks the footer that follows the member rows: vacancy note, presiding
 * officer, or the "SEQUENCE NO." line — whichever comes first. */
const FOOTER_RE = /VACANT\s+DISTRICTS?|^PRESIDING|SEQUENCE\s+NO\.?/i;

/** Index of the line carrying the AYES tally — the boundary between header and rows. */
function talliesIndex(lines: string[]): number {
  return lines.findIndex((l) => TALLY_RE.test(l));
}

export function parseTallies(
  lines: string[],
): { ayes: number; nays: number; notVoting: number } | null {
  const i = talliesIndex(lines);
  if (i === -1) return null;
  const rest = lines.slice(i);
  const footerIdx = rest.findIndex((l) => FOOTER_RE.test(l));
  const end = footerIdx === -1 ? rest.length : footerIdx;
  // Assembly puts all three on one line; the Senate splits them across lines.
  const joined = rest.slice(0, end).join(" ");
  const num = (label: string) => {
    const m = joined.match(new RegExp(`${label}\\s*-\\s*(\\d+)`, "i"));
    return m ? Number(m[1]) : null;
  };
  const ayes = num("AYES");
  const nays = num("NAYS");
  const notVoting = num("NOT VOTING");
  if (ayes === null || nays === null || notVoting === null) return null;
  return { ayes, nays, notVoting };
}

/**
 * Bill number, title and vote type, taken from the lines above the tally.
 * After the bill number and its "BY <sponsor>" line, the FIRST all-caps line
 * is the title and the SECOND is the vote type (PASSAGE, CONCURRENCE,
 * ADOPTION, REJECT AMENDMENT, ...). Amendment votes can carry a further
 * trailing line naming who offered the amendment (e.g. "SA5 OFFERED BY
 * LARSON" in wi-senate-sv0050.html) — that line is neither the title nor the
 * vote type, so anything past the second line is ignored.
 */
export function parseHeader(
  lines: string[],
): { billNumber: string; billTitle: string; voteType: string } | null {
  const end = talliesIndex(lines);
  if (end === -1) return null;
  const head = lines.slice(0, end);
  const billIdx = head.findIndex((l) => /^[AS]B\s+\d+$/.test(l));
  if (billIdx === -1) return null;
  const after = head.slice(billIdx + 1).filter((l) => !/^BY\s/i.test(l));
  if (after.length < 2) return null;
  return {
    billNumber: head[billIdx],
    billTitle: after[0],
    voteType: after[1],
  };
}

/**
 * How many seats are vacant.
 *
 * "VACANT DISTRICTS: 4" names district number 4 — ONE seat, not four.
 * Verified: sv0260 says "VACANT DISTRICTS: 4" and totals 22+10+0 = 32 = 33-1,
 * while sv0050 says "NO VACANT DISTRICTS" and totals exactly 33. Reading the
 * number as a count rejects every Senate roll call taken during a vacancy.
 */
export function parseVacantSeats(lines: string[]): number {
  const line = lines.find((l) => /VACANT\s+DISTRICTS?/i.test(l));
  if (!line || /NO\s+VACANT/i.test(line)) return 0;
  const after = line.split(":")[1] ?? "";
  return (after.match(/\d+/g) ?? []).length;
}

export type MemberVote = { name: string; party?: string; position: Position };

/** Maps vote marks to their position. The "x" mark was discovered via real document
 * inspection; the original reference code assumed "NV". Note: "NV" appears only as a
 * COLUMN HEADER in documents, never as a data mark, so is currently unused. */
const POSITION_BY_MARK: Record<string, Position> = {
  Y: "aye",
  N: "nay",
  NV: "not_voting",
  x: "not_voting",
};

/**
 * A member name cell: surname, optionally with a disambiguating first initial.
 * Requires 2+ letters \u2014 no real surname is one character, and a bare mark
 * (e.g. a stray "N") must never be mistaken for a name. This matters: when a
 * name cell is emptied out from the source HTML, htmlToLines drops the empty
 * line entirely, which shifts a neighboring mark letter into the name slot.
 * Without the 2+ floor that phantom row keeps the same party/position as the
 * real row it replaced, so the tally counts stay balanced and the
 * reconciliation gate in parseRollCall would miss it.
 */
const NAME_RE = /^[A-Z][A-Z'\u2019.\- ]+(?:,\s?[A-Z])?$/;

const MONTHS: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

/** "Thursday, September 14, 2023" -> "2023-09-14". */
export function parseVoteDate(lines: string[]): string | null {
  for (const l of lines) {
    const m = l.match(/^[A-Za-z]+day,\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
    if (!m) continue;
    const month = MONTHS[m[1]];
    if (!month) continue;
    return `${m[3]}-${String(month).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
  }
  return null;
}

/**
 * Assembly roll calls are a table: a Y/N/NV mark in one of three columns,
 * then the member name, then the party.
 *
 * The Speaker is listed as the literal string "SPEAKER" rather than by surname,
 * so a Speaker's own vote cannot be attributed by name. No tracked candidate
 * has held the office; if that changes, map their slug to "SPEAKER" for the
 * sessions they presided.
 */
export function parseAssemblyVotes(lines: string[]): MemberVote[] {
  const start = lines.findIndex((l) => TALLY_RE.test(l));
  if (start === -1) return [];
  const out: MemberVote[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const name = lines[i];
    const party = lines[i + 1];
    if (!NAME_RE.test(name) || !["R", "D", "I"].includes(party)) continue;
    // The mark sits in one of the up-to-three cells before the name.
    const mark = lines
      .slice(Math.max(0, i - 3), i)
      .reverse()
      .find((c) => c in POSITION_BY_MARK);
    if (!mark) continue;
    out.push({ name, party, position: POSITION_BY_MARK[mark] });
    i++; // party line consumed
  }
  return out;
}

const GROUP_HEADERS: { re: RegExp; position: Position }[] = [
  { re: /^AYES\s*-\s*\d+/i, position: "aye" },
  { re: /^NAYS\s*-\s*\d+/i, position: "nay" },
  { re: /^NOT VOTING\s*-\s*\d+/i, position: "not_voting" },
];

/** Lines that follow the name groups and must not be read as members. */
const SENATE_STOP = /^(VACANT|NO VACANT|PRESIDING|SEQUENCE NO|PAIRED)/i;

/**
 * Senate roll calls list names in groups under each tally header — no vote
 * column and no party, unlike the Assembly. Entirely different markup for the
 * same data, which is why there are two parsers.
 */
export function parseSenateVotes(lines: string[]): MemberVote[] {
  const out: MemberVote[] = [];
  let position: Position | null = null;
  for (const line of lines) {
    const header = GROUP_HEADERS.find((h) => h.re.test(line));
    if (header) {
      position = header.position;
      continue;
    }
    if (position === null) continue;
    if (SENATE_STOP.test(line)) break;
    if (NAME_RE.test(line)) out.push({ name: line, position });
  }
  return out;
}

export type RollCall = {
  voteKey: string;
  session: string;
  chamber: Chamber;
  voteId: string;
  billNumber: string;
  billTitle: string;
  voteType: string;
  votedOn: string;
  ayes: number;
  nays: number;
  notVoting: number;
  vacantSeats: number;
  sourceUrl: string;
  votes: MemberVote[];
};

export const rollCallUrl = (session: string, chamber: Chamber, voteId: string) =>
  `https://docs.legis.wisconsin.gov/${session}/related/votes/${chamber}/${voteId}`;

/**
 * Parse and RECONCILE. A roll call is only returned when the parsed rows agree
 * with the document's own numbers — parsed positions must equal the printed
 * tallies, and rows plus vacant seats must equal the chamber's seat count.
 *
 * Anything else returns { error } and the caller must not store it. The failure
 * mode this guards is a parser silently mis-reading a page, which no amount of
 * human review of the output would catch.
 */
export function parseRollCall(
  html: string,
  ref: { session: string; chamber: Chamber; voteId: string },
): RollCall | { error: string } {
  const lines = htmlToLines(html);
  const tallies = parseTallies(lines);
  if (!tallies) return { error: "no AYES/NAYS/NOT VOTING tallies found" };
  const header = parseHeader(lines);
  if (!header) return { error: "no bill number / title / vote type found" };
  const votedOn = parseVoteDate(lines);
  if (!votedOn) return { error: "no vote date found" };

  const vacantSeats = parseVacantSeats(lines);
  const votes =
    ref.chamber === "assembly" ? parseAssemblyVotes(lines) : parseSenateVotes(lines);

  const count = (p: Position) => votes.filter((v) => v.position === p).length;
  if (
    count("aye") !== tallies.ayes ||
    count("nay") !== tallies.nays ||
    count("not_voting") !== tallies.notVoting
  ) {
    return {
      error:
        `parsed ${count("aye")}/${count("nay")}/${count("not_voting")} does not match ` +
        `printed ${tallies.ayes}/${tallies.nays}/${tallies.notVoting}`,
    };
  }
  if (votes.length + vacantSeats !== SEATS[ref.chamber]) {
    return {
      error: `${votes.length} rows + ${vacantSeats} vacant != ${SEATS[ref.chamber]} seats`,
    };
  }

  return {
    voteKey: `${ref.session}-${ref.chamber}-${ref.voteId}`,
    session: ref.session,
    chamber: ref.chamber,
    voteId: ref.voteId,
    ...header,
    votedOn,
    ...tallies,
    vacantSeats,
    sourceUrl: rollCallUrl(ref.session, ref.chamber, ref.voteId),
    votes,
  };
}
