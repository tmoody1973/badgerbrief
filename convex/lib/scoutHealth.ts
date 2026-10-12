/**
 * Whether a news-discovery run should raise an alert.
 *
 * The job once failed every search for two weeks and wrote only log lines.
 * Two conditions are worth an editor's attention: most searches failing, and
 * several days of finding nothing at all.
 */
export type ScoutRun = {
  attempted: number;
  errors: number;
  proposed: number;
  sampleError?: string;
  /** Whole days since the guide last recorded any article; null if it never has. */
  daysSinceLastArticle: number | null;
};

export type HealthAlert = {
  /** Stable per condition, so an ongoing failure is one alert. */
  refId: "article-scout:failing" | "article-scout:quiet";
  kind: "sync_failure" | "staleness";
  severity: "critical" | "warning";
  message: string;
};

export const QUIET_DAYS = 3;

export function scoutHealthAlert(run: ScoutRun): HealthAlert | null {
  if (run.attempted > 0 && run.errors * 2 >= run.attempted) {
    const why = run.sampleError ? ` (${run.sampleError})` : "";
    return {
      refId: "article-scout:failing",
      kind: "sync_failure",
      severity: "critical",
      message: `News discovery: ${run.errors} of ${run.attempted} searches failed${why}. /news is not receiving new coverage.`,
    };
  }
  if (run.proposed === 0 && run.daysSinceLastArticle !== null && run.daysSinceLastArticle >= QUIET_DAYS) {
    return {
      refId: "article-scout:quiet",
      kind: "staleness",
      severity: "warning",
      message: `News discovery has found nothing new for ${run.daysSinceLastArticle} days.`,
    };
  }
  return null;
}
