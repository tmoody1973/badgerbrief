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
  hadPrimary,
}: {
  candidateName: string;
  office: string;
  me: FieldEntry | undefined;
  /** Everyone else on the November ballot for this office. */
  others: readonly FieldEntry[];
  raceOnBallot: boolean | undefined;
  raceNote?: string;
  /** False for a race that was never on the August primary ballot (the spring Supreme Court race). */
  hadPrimary: boolean;
}): string {
  if (!me?.onGeneralBallot) {
    const why = hadPrimary ? `This page is kept as a record of the ${PRIMARY_ARCHIVE.label}.` : (raceNote ?? "");
    return `${candidateName} is not ${ON} for ${office}. ${why}`.trim();
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
  hadPrimary,
  raceNote,
  ticket,
}: {
  who: string;
  office: string;
  onBallot: boolean;
  incumbent: boolean;
  /** What the page actually holds, e.g. ["published positions", "voting record"]. */
  has: readonly string[];
  hadPrimary: boolean;
  raceNote?: string;
  /** Set for a running mate: the governor ticket as printed on the ballot. */
  ticket?: string;
}): string {
  if (!onBallot) {
    const why = hadPrimary ? `This page is a record of the ${PRIMARY_ARCHIVE.label}.` : (raceNote ?? "");
    return `${who} is not ${ON} for ${office}. ${why}`.trim();
  }
  const opening = ticket
    ? `${who} is ${ON} as part of the ticket "${ticket}".`
    : `${who}${incumbent ? ", the incumbent," : ""} is ${ON} for ${office}.`;
  if (has.length === 0) return `${opening} Candidate details from the Wisconsin Elections Commission.`;
  const list = has.slice(0, 3).join(", ").replace(/, ([^,]*)$/, " and $1");
  return `${opening} On this page: ${list}, every claim linked to its source.`;
}

/** The line under a candidate's name on their share image. */
export function candidateShareSubtitle({
  onBallot,
  party,
  incumbent,
}: {
  onBallot: boolean;
  party: string | undefined;
  incumbent: boolean;
}): string | undefined {
  if (!onBallot) return `Not ${ON}`;
  if (!party) return incumbent ? "Incumbent" : undefined;
  return incumbent ? `${party} · Incumbent` : party;
}
