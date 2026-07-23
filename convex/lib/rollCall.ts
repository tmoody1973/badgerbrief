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
