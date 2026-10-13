/**
 * Which candidates the scheduled jobs work on. Every answer starts from the
 * one ballot rule; a candidate with no ballot facts is never in scope.
 */
import { isOnGeneralBallot } from "./ballot";

/**
 * News discovery covers on-ballot candidates for statewide executive offices
 * and the U.S. House: about 32 people, one search each per day. The 220
 * legislative candidates are out of scope until there is budget to search them.
 */
export function inNewsScope(
  candidate: { raceId: string; general?: { onBallot: boolean } },
  raceLevel: string | undefined,
): boolean {
  if (!isOnGeneralBallot(candidate)) return false;
  return raceLevel === "State Executive" || candidate.raceId.startsWith("WI-US-HOUSE-");
}

/**
 * The ad-matching candidate list knows everyone, so an old ad naming someone
 * off the ballot is still attributed correctly. A job that SPENDS on a list
 * built from it (searches, file downloads) starts from this.
 */
export function onBallotOnly<C extends { onBallot?: boolean }>(candidates: readonly C[]): C[] {
  return candidates.filter((c) => c.onBallot === true);
}

/** One ad-library search per candidate on the ballot. */
export function metaSearchTerms(candidates: readonly { name: string; onBallot?: boolean }[]): string[] {
  return onBallotOnly(candidates).map((c) => c.name);
}
