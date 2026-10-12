/**
 * Rules for the AUGUST 11, 2026 PRIMARY ARCHIVE only.
 *
 * Nothing here answers "is this person on the November ballot". That question
 * has one answer, in convex/lib/ballot.ts, taken from the state's certified
 * list. These helpers read the old free-text `status` field and exist so the
 * archive can show the primary as it was.
 */

/**
 * Whether a candidate was on the printed PRIMARY ballot. Only "not on" and
 * "did not file" statuses mean off it; withdrawn and suspended candidates
 * stayed on the ballot per the state's contest list.
 */
export function wasOnPrimaryBallot(status?: string): boolean {
  if (!status) return true;
  const low = status.toLowerCase();
  return !low.includes("not on") && !low.includes("did not file");
}

/**
 * Everyone who belongs in the primary archive. A candidate with no primary
 * party who IS on the November ballot was added from the state's November
 * list and was never part of the primary.
 */
export function primaryField<C extends { primaryParty?: string; general?: { onBallot: boolean } }>(
  candidates: readonly C[],
): C[] {
  return candidates.filter((c) => Boolean(c.primaryParty) || c.general?.onBallot !== true);
}

/**
 * Anchor id for a party section in the archive. Shared by the headings and the
 * section nav so they cannot drift apart. Independents had no primary.
 */
export function partySectionId(party: string): string {
  const slug = party.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return party === "Independent" ? slug : `${slug}-primary`;
}
