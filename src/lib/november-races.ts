/**
 * Races to list as "on the November ballot". A race the state's list marks as
 * not a separate contest (Lieutenant Governor, the spring Supreme Court race)
 * is left out of lists; its own page still exists and explains why.
 */
export function novemberRaces<R extends { general?: { onBallot: boolean } }>(races: readonly R[]): R[] {
  return races.filter((r) => r.general?.onBallot !== false);
}
