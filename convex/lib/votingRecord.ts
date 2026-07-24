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

/**
 * A query that is ONLY a measure designation, e.g. "AB 388" or "H CON RES 14".
 *
 * The letters must squash to a designation we actually know. A looser shape
 * test ("letters then digits") also swallows ordinary phrases like "child care
 * 388", which would then be judged by an exact-number rule instead of by words.
 */
function measureDesignation(query: string): string | null {
  const m = query.trim().match(/^([A-Za-z][A-Za-z\s.]*?)\s*(\d+)$/);
  if (!m) return null;
  const type = squash(m[1]).toUpperCase();
  return type in MEASURE_WORDS ? `${type}${m[2]}` : null;
}

export function matchesQuery(billTitle: string, billNumber: string, query: string): boolean {
  const trimmed = query.trim();
  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  // Asking for a specific measure means that measure ONLY.
  //
  // Federal designations are printed with spaces — the House Clerk writes
  // "H CON RES 14" — while we store the squashed "HCONRES 14", so word matching
  // missed the form a reader is most likely to type and the vote looked absent.
  //
  // This returns decisively either way rather than falling through: the words of
  // "H CON RES 14" are h/con/res/14, which word-match unrelated bills through
  // fragments like the "h" in "H.R. 1" and turn a precise lookup into 17 hits
  // led by the wrong measure. Equality, not substring, so "AB 3" never reaches
  // AB 388.
  const designation = measureDesignation(trimmed);
  if (designation) return designation === squash(billNumber).toUpperCase();

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
