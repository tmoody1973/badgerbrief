/**
 * Whether a tracked article is primary-season coverage.
 *
 * Two reasons an article belongs in the archive instead of the November news
 * list: it predates the general-election season, or it is about someone who is
 * not on the November ballot. Nothing is hidden; archive coverage has its own
 * page.
 */

/** Midnight Central on the day after the August 11, 2026 primary. */
export const GENERAL_COVERAGE_STARTS = Date.parse("2026-08-12T05:00:00Z");

export function isPrimaryEra(
  article: { when: number; candidateSlug?: string },
  onBallotSlugs: ReadonlySet<string>,
): boolean {
  if (article.when < GENERAL_COVERAGE_STARTS) return true;
  return article.candidateSlug !== undefined && !onBallotSlugs.has(article.candidateSlug);
}
