/**
 * Helpers for quotes taken from a WisconsinEye candidate interview.
 *
 * These are editorially different from a quote lifted out of a news article:
 * the candidate sat down for a scheduled interview and every rival in the race
 * answered the same interviewer, so the answers are comparable in a way that
 * article quotes are not.
 *
 * Note: we do NOT pair each quote with the interviewer's question. Diarization
 * is reliable for WHO is speaking but not for where one exchange ends, and a
 * question printed above an answer asserts what the candidate was responding
 * to. Two attempts produced confidently wrong pairs; the section shows the
 * answer, its timestamp, and a link to the recording instead.
 */

/** The outlet name written by scripts/extract-wiseye-quotes.mjs. */
export const INTERVIEW_OUTLET = "WisconsinEye";

export type QuoteLike = {
  outlet?: string;
  context?: string;
  sourceUrl?: string;
};

export const isInterviewQuote = (q: QuoteLike): boolean =>
  q.outlet === INTERVIEW_OUTLET && !!q.sourceUrl?.includes("wiseye.org");

/** Seconds from the `?t=` anchor, or null when the URL carries none. */
export function timestampSeconds(sourceUrl?: string): number | null {
  if (!sourceUrl) return null;
  const m = sourceUrl.match(/[?&]t=(\d+)\b/);
  return m ? Number(m[1]) : null;
}

/** `1474` -> `24:34`, `65` -> `1:05`. Hours only appear when present. */
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
