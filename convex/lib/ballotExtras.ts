import { countyKey } from "./countyKey";
import countyData from "./data/county-contests-2026.json";
import questionsData from "./data/ballot-questions-2026.json";

/**
 * County offices and statewide questions on the Nov 3, 2026 ballot.
 *
 * Both come from files built from state documents and signed by a person
 * (scripts/ballot-extras.mjs). Until a file is signed, nothing in it is shown:
 * the readers answer "not-certified" and the page says the list is not loaded.
 *
 * This module imports both data files (about 70 KB). Import it from server
 * code only; a browser component that needs a county key imports ./countyKey.
 */

export type ExtrasSource = {
  name: string;
  url: string;
  documentUrl?: string;
  documentDate: string;
  retrievedAt: string;
};

type Signature = { certifiedBy: string; certifiedAt: string };

export type CountyCandidate = { ballotName: string; party?: string; ballotOrder: number };

export type CountyContest = {
  county: string;
  countyName: string;
  /** "Sheriff", "Clerk of Circuit Court" or "Coroner". */
  office: string;
  contestAsPrinted: string;
  ballotPosition: number;
  candidates: CountyCandidate[];
};

export type CountyFile = Signature & { source: ExtrasSource; contests: CountyContest[] };

export type BallotQuestion = {
  number: number;
  ballotPosition: number;
  title: string;
  resolution: string;
  ballotText: string;
  explanation: string[];
  yesVote: string;
  noVote: string;
  /** The guide's own sentence, never the state's. Shown labelled as such. */
  note?: string;
};

export type QuestionsFile = Signature & { source: ExtrasSource; questions: BallotQuestion[] };

const isSigned = (file: Signature): boolean =>
  file.certifiedBy.trim() !== "" && file.certifiedAt.trim() !== "";

export type CountyBallot =
  | { status: "not-certified" }
  | { status: "no-county" }
  | { status: "unknown-county"; county: string }
  | { status: "ok"; countyName: string; contests: CountyContest[]; source: ExtrasSource; certifiedAt: string };

export function countyBallotFrom(file: CountyFile, county: string | undefined): CountyBallot {
  if (!isSigned(file)) return { status: "not-certified" };
  if (!county?.trim()) return { status: "no-county" };
  const key = countyKey(county);
  const contests = file.contests.filter((contest) => contest.county === key);
  if (contests.length === 0) return { status: "unknown-county", county: key };
  return {
    status: "ok",
    countyName: contests[0].countyName,
    contests,
    source: file.source,
    certifiedAt: file.certifiedAt,
  };
}

/** Every countywide contest in the file, in the file's order. Null until the file is signed. */
export function allCountyContestsFrom(file: CountyFile): CountyContest[] | null {
  return isSigned(file) ? file.contests : null;
}

/** Every countywide contest in the state, for a page that lets the browser pick one county's. Null until signed. */
export const allCountyContests = (): CountyContest[] | null => allCountyContestsFrom(countyData);

/** The countywide contests for a voter's county, from the signed file. */
export const countyBallot = (county: string | undefined): CountyBallot =>
  countyBallotFrom(countyData, county);

export type StatewideQuestions =
  | { status: "not-certified" }
  | { status: "ok"; questions: BallotQuestion[]; source: ExtrasSource; certifiedAt: string };

export function statewideQuestionsFrom(file: QuestionsFile): StatewideQuestions {
  if (!isSigned(file)) return { status: "not-certified" };
  return {
    status: "ok",
    questions: [...file.questions].sort((a, b) => a.number - b.number),
    source: file.source,
    certifiedAt: file.certifiedAt,
  };
}

/** The three statewide questions, in ballot order, from the signed file. */
export const statewideQuestions = (): StatewideQuestions => statewideQuestionsFrom(questionsData);
