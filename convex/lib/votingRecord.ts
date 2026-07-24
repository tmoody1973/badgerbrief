/**
 * Pure helpers for the voting-record UI. No Convex ctx, no network — the same
 * split as lib/rollCall.ts, so the queries in votesQueries.ts and the vitest
 * suite can both use them.
 */
export type Position = "aye" | "nay" | "not_voting";

/**
 * Whole-word, order-independent match of every query word against the title
 * and bill number. Lifted verbatim from votingRecord's inline matcher: an
 * agent-phrased "child care loan" is not a contiguous substring of "CHILD CARE
 * CENTER RENOVATIONS LOAN PROGRAM", so every word must appear (any order),
 * each boundary-anchored so "aid" cannot match inside "paid".
 */
export function matchesQuery(billTitle: string, billNumber: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${billTitle} ${billNumber}`.toLowerCase();
  return words.every((w) => {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(haystack);
  });
}

export type VotingSummary = {
  total: number;
  byPosition: { aye: number; nay: number; not_voting: number };
  participationRate: number;
  sessions: { session: string; count: number }[];
  chamber: "assembly" | "senate";
};

/**
 * Per-candidate aggregate, computed from the lightweight legislator_votes rows
 * alone. voteKey is "{session}-{chamber}-{voteId}", so both session and chamber
 * come from the key with no join to legislative_votes. participationRate is
 * mechanical — (aye + nay) / total — never framed as good or bad.
 */
export function summarize(rows: { voteKey: string; position: Position }[]): VotingSummary {
  const byPosition = { aye: 0, nay: 0, not_voting: 0 };
  const sessionCounts = new Map<string, number>();
  let chamber: "assembly" | "senate" = "assembly";
  for (const r of rows) {
    byPosition[r.position]++;
    const [session, ch] = r.voteKey.split("-");
    if (ch === "assembly" || ch === "senate") chamber = ch;
    sessionCounts.set(session, (sessionCounts.get(session) ?? 0) + 1);
  }
  const total = rows.length;
  const sessions = [...sessionCounts.entries()]
    .map(([session, count]) => ({ session, count }))
    .sort((a, b) => b.session.localeCompare(a.session)); // newest first
  const participationRate = total === 0 ? 0 : (byPosition.aye + byPosition.nay) / total;
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
