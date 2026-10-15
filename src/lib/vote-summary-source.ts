const CRS = "Congressional Research Service";
const LRB = "Legislative Reference Bureau";

/**
 * Who wrote the "what a YES did" lines, from the votes themselves: U.S. House
 * sessions are a Congress number ("119"), Wisconsin ones a year ("2025").
 * Not from the race: a congressman running for governor has federal votes.
 */
export function voteSummarySource(sessions: readonly string[]): string {
  const federal = sessions.some((s) => Number(s) < 1000);
  const state = sessions.some((s) => Number(s) >= 1000);
  if (federal && state) return `${CRS} (U.S. House votes) and the ${LRB} (Wisconsin votes)`;
  return federal ? CRS : LRB;
}
