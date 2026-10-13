import data from "./data/wisconsin-watch-2026.json";

/**
 * Which certified candidates answered Wisconsin Watch's 2026 questionnaire,
 * and where their answers are. Built by scripts/wisconsin-watch-links.mjs from
 * Voter Guide Commons, matched to our certified ballot.
 *
 * This says only what their guide reports: answered, did not answer, or no
 * page. It never says why. Import from server code only (about 50 KB of JSON).
 */

export type QuestionnaireLink = { raceId: string; slug: string; candidateId: string; url: string; answered: number };

export type QuestionnaireFile = {
  source: {
    name: string;
    publisher: string;
    url: string;
    supportUrl: string;
    via: string;
    viaUrl: string;
    /** The date their guide says it was last updated, "2026-08-20". */
    guideUpdated: string;
    retrievedAt: string;
  };
  /** Race ids their guide covers. */
  races: string[];
  candidates: QuestionnaireLink[];
  /** On our certified ballot, with no page in their guide. */
  notInGuide: { raceId: string; slug: string; ballotName: string }[];
};

export type QuestionnaireStatus =
  | { status: "answered"; candidateId: string; url: string; answered: number }
  | { status: "did-not-answer"; candidateId: string; url: string }
  | { status: "not-in-guide" };

/** Null when their guide does not cover the race, or the candidate is not on our ballot. */
export function questionnaireStatusFrom(file: QuestionnaireFile, raceId: string, slug: string): QuestionnaireStatus | null {
  const link = file.candidates.find((c) => c.raceId === raceId && c.slug === slug);
  if (link) {
    return link.answered > 0
      ? { status: "answered", candidateId: link.candidateId, url: link.url, answered: link.answered }
      : { status: "did-not-answer", candidateId: link.candidateId, url: link.url };
  }
  return file.notInGuide.some((c) => c.raceId === raceId && c.slug === slug) ? { status: "not-in-guide" } : null;
}

export const questionnaireStatus = (raceId: string, slug: string): QuestionnaireStatus | null =>
  questionnaireStatusFrom(data, raceId, slug);

export const WISCONSIN_WATCH = data.source;
