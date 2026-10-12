/**
 * What a candidate page says about the Nov 3, 2026 ballot.
 *
 * It states only what the state's list supports: on the ballot, or not on it.
 * It never says a candidate lost or won; that needs the official results.
 */
import { CURRENT_ELECTION, PRIMARY_ARCHIVE } from "./election";

export type FieldEntry = {
  slug: string;
  name: string;
  party?: string;
  incumbent?: boolean;
  hasRecord?: boolean;
  onGeneralBallot: boolean;
  ballotName: string;
  generalParty?: string;
  ballotOrder?: number;
};

const ON = `on the ${CURRENT_ELECTION.longDate} ballot`;

export function ballotSummary({
  candidateName,
  office,
  me,
  others,
  raceOnBallot,
  raceNote,
}: {
  candidateName: string;
  office: string;
  me: FieldEntry | undefined;
  /** Everyone else on the November ballot for this office. */
  others: readonly FieldEntry[];
  raceOnBallot: boolean | undefined;
  raceNote?: string;
}): string {
  if (!me?.onGeneralBallot) {
    return `${candidateName} is not ${ON} for ${office}. This page is kept as a record of the ${PRIMARY_ARCHIVE.label}.`;
  }
  if (raceOnBallot === false) {
    return `${candidateName} is ${ON} as part of the ticket "${me.ballotName}".${raceNote ? ` ${raceNote}` : ""}`;
  }
  const opening = `${candidateName} is ${ON} for ${office}${me.incumbent ? ", as the incumbent" : ""}.`;
  if (others.length === 0) return `${opening} No other candidate is on the ballot for this office.`;
  return `${opening} ${others.length === 1 ? "One other candidate is" : `${others.length} other candidates are`} on the ballot.`;
}

/** The search-result description for a candidate page. */
export function candidateDescription({
  who,
  office,
  onBallot,
  incumbent,
  has,
}: {
  who: string;
  office: string;
  onBallot: boolean;
  incumbent: boolean;
  /** What the page actually holds, e.g. ["published positions", "voting record"]. */
  has: readonly string[];
}): string {
  if (!onBallot) {
    return `${who} is not ${ON} for ${office}. This page is a record of the ${PRIMARY_ARCHIVE.label}.`;
  }
  const opening = `${who}${incumbent ? ", the incumbent," : ""} is ${ON} for ${office}.`;
  if (has.length === 0) return `${opening} Candidate details from the Wisconsin Elections Commission.`;
  const list = has.slice(0, 3).join(", ").replace(/, ([^,]*)$/, " and $1");
  return `${opening} ${list}, every claim linked to its source.`;
}
