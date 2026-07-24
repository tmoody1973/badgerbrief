/**
 * Pure helpers for the voting-record UI. No Convex ctx, no network — the same
 * split as lib/rollCall.ts, so the queries in votesQueries.ts and the vitest
 * suite can both use them.
 */
export type Position = "aye" | "nay" | "present" | "not_voting";

/** Wisconsin's two chambers plus the U.S. House. */
export type RecordChamber = "assembly" | "senate" | "us_house";

/**
 * Whole-word, order-independent match of every query word against the title
 * and bill number. Lifted verbatim from votingRecord's inline matcher: an
 * agent-phrased "child care loan" is not a contiguous substring of "CHILD CARE
 * CENTER RENOVATIONS LOAN PROGRAM", so every word must appear (any order),
 * each boundary-anchored so "aid" cannot match inside "paid".
 */
/** A query that is nothing but a measure designation: "AB 388", "H CON RES 14". */
const BILL_NUMBER_QUERY = /^[A-Za-z][A-Za-z\s.]*\d+$/;
const squash = (s: string) => s.toLowerCase().replace(/[\s.]+/g, "");

/**
 * Measure designations spelled out, so the words people actually use are
 * searchable.
 *
 * Nothing stored on a vote contains the word "resolution": the type lives only
 * in the squashed prefix ("HCONRES") and the official title rarely repeats it.
 * A voter asking about the "budget resolution" therefore matched nothing.
 * Adding the expansion to the haystack only ever makes matching more permissive,
 * never less, so no previously-matching query stops working.
 */
const MEASURE_WORDS: Record<string, string> = {
  AB: "assembly bill",
  SB: "senate bill",
  AJR: "assembly joint resolution",
  SJR: "senate joint resolution",
  AR: "assembly resolution",
  SR: "senate resolution",
  HR: "house bill",
  HRES: "house resolution",
  HJRES: "house joint resolution",
  HCONRES: "house concurrent resolution",
  HAMDT: "house amendment",
};

const measureWords = (billNumber: string): string => {
  const prefix = billNumber.trim().split(/[\s\d]/)[0]?.toUpperCase() ?? "";
  return MEASURE_WORDS[prefix] ?? "";
};

export function matchesQuery(billTitle: string, billNumber: string, query: string): boolean {
  const trimmed = query.trim();
  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  // Federal measures are printed with spaces inside the designation — the House
  // Clerk writes "H CON RES 14" — while we store the squashed "HCONRES 14".
  // Word matching then fails on the form a reader is most likely to type, and
  // the vote silently looks absent. Compared as an EQUALITY of squashed forms,
  // not a substring, so "AB 3" still does not match AB 388.
  if (BILL_NUMBER_QUERY.test(trimmed) && squash(trimmed) === squash(billNumber)) {
    return true;
  }

  const haystack = `${billTitle} ${billNumber} ${measureWords(billNumber)}`.toLowerCase();
  return words.every((w) => {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(haystack);
  });
}

export type VotingSummary = {
  total: number;
  byPosition: { aye: number; nay: number; present: number; not_voting: number };
  participationRate: number;
  sessions: { session: string; count: number }[];
  chamber: RecordChamber;
};

/**
 * Per-candidate aggregate, computed from the lightweight legislator_votes rows
 * alone. voteKey is "{session}-{chamber}-{voteId}", so both session and chamber
 * come from the key with no join to legislative_votes. participationRate is
 * mechanical — never framed as good or bad.
 *
 * "Present" counts as participation. A member who votes Present showed up and
 * declined to take a side, which is a deliberate act on the record; folding it
 * into non-participation would understate their attendance. It stays a separate
 * bucket rather than being merged into either aye/nay or not_voting.
 */
export function summarize(rows: { voteKey: string; position: Position }[]): VotingSummary {
  const byPosition = { aye: 0, nay: 0, present: 0, not_voting: 0 };
  const sessionCounts = new Map<string, number>();
  let chamber: RecordChamber = "assembly";
  for (const r of rows) {
    byPosition[r.position]++;
    const [session, ch] = r.voteKey.split("-");
    if (ch === "assembly" || ch === "senate" || ch === "us_house") chamber = ch;
    sessionCounts.set(session, (sessionCounts.get(session) ?? 0) + 1);
  }
  const total = rows.length;
  const sessions = [...sessionCounts.entries()]
    .map(([session, count]) => ({ session, count }))
    .sort((a, b) => b.session.localeCompare(a.session)); // newest first
  const participationRate =
    total === 0
      ? 0
      : (byPosition.aye + byPosition.nay + byPosition.present) / total;
  return { total, byPosition, participationRate, sessions, chamber };
}

/**
 * Canonical Wisconsin Legislature bill page. "AB 388" -> ab388. Deterministic
 * from session + billNumber, so the "Full bill" link needs no fetch.
 */
export function billUrl(session: string, billNumber: string): string {
  const slug = billNumber.replace(/\s+/g, "").toLowerCase();
  return `https://docs.legis.wisconsin.gov/${session}/related/proposals/${slug}`;
}
