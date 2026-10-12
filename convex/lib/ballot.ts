/**
 * The single rule for "is this candidate on the Nov 3, 2026 ballot".
 *
 * The answer comes only from the `general` block, which is written from the
 * state's certified list (convex/generalBallot.ts). It is deliberately NOT
 * derived from `candidates.status`: that free-text field was read four
 * different ways across the codebase, and primary losers were still "Active".
 *
 * Pure functions, no Convex imports, so both convex/ and src/ can use them.
 */

type GeneralFlag = { general?: { onBallot: boolean } };

export function isOnGeneralBallot(candidate: GeneralFlag): boolean {
  return candidate.general?.onBallot === true;
}

/** The name as the state prints it, or the stored name if we have none. */
export function generalBallotName(candidate: {
  name: string;
  general?: { ballotName?: string };
}): string {
  return candidate.general?.ballotName ?? candidate.name;
}

/** The party as the state lists it, or the stored party. */
export function generalParty(candidate: {
  party?: string;
  general?: { party?: string };
}): string | undefined {
  return candidate.general?.party ?? candidate.party;
}

/**
 * On-ballot candidates in the state's ballot order. Candidates without a
 * position sort last, by name, so the order is stable.
 */
export function generalField<
  T extends { name: string; general?: { onBallot: boolean; ballotOrder?: number } },
>(candidates: readonly T[]): T[] {
  const position = (c: T) => c.general?.ballotOrder ?? Number.POSITIVE_INFINITY;
  return candidates
    .filter(isOnGeneralBallot)
    .sort((a, b) => position(a) - position(b) || a.name.localeCompare(b.name));
}

/**
 * The state's printing of this PERSON's name. A governor ticket is printed as
 * "David Crowley / Sarah Godlewski"; on a page about one of them, the name is
 * that person's half. Falls back to the stored name when nothing matches.
 */
export function generalPersonName(candidate: {
  name: string;
  general?: { ballotName?: string };
}): string {
  const printed = candidate.general?.ballotName;
  if (!printed) return candidate.name;
  const halves = printed.split(" / ");
  if (halves.length === 1) return printed;
  const surname = (name: string) => name.trim().split(/\s+/).at(-1)?.toLowerCase();
  return halves.find((half) => surname(half) === surname(candidate.name)) ?? candidate.name;
}


/**
 * The general election's date, for backend text (job prompts). The website's
 * copy lives in src/lib/election.ts; src/lib/election.test.ts keeps them equal.
 */
export const GENERAL_ELECTION_DATE = "November 3, 2026";
