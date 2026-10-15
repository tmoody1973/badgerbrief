/**
 * What a race page says about the Nov 3, 2026 ballot.
 *
 * Kept free of React and data fetching so it can be tested directly. The one
 * rule a caller must never bend: a race with no `general` block is
 * "not-loaded", and nobody is shown as on the ballot. The live site showed the
 * primary field as the ballot for two months because nothing said otherwise.
 */
import { generalBallotName, generalField, generalParty } from "../../convex/lib/ballot";
import { CURRENT_ELECTION } from "./election";

type GeneralBlock = { onBallot: boolean; ballotName?: string; party?: string; ballotOrder?: number };
// `source` is carried by every stored race; this module does not read it.
type RaceLike = { office: string; general?: { onBallot: boolean; note?: string; source?: unknown } };
type CandidateLike = {
  name: string;
  party?: string;
  primaryParty?: string;
  incumbent?: boolean;
  general?: GeneralBlock;
};

export type RaceBallot<C> =
  | { kind: "contest"; onBallot: C[]; uncontested: boolean; hadPrimary: boolean }
  | { kind: "no-contest"; note: string; runningMates: C[]; hadPrimary: boolean }
  | { kind: "not-loaded"; hadPrimary: boolean };

const DEFAULT_NOTE = `This office is not a separate contest on the ${CURRENT_ELECTION.longDate} ballot.`;

export function buildRaceBallot<C extends CandidateLike>(
  race: RaceLike,
  candidates: readonly C[],
): RaceBallot<C> {
  const hadPrimary = candidates.some((c) => Boolean(c.primaryParty));
  if (!race.general) return { kind: "not-loaded", hadPrimary };
  const onBallot = generalField(candidates);
  if (!race.general.onBallot) {
    return { kind: "no-contest", note: race.general.note ?? DEFAULT_NOTE, runningMates: onBallot, hadPrimary };
  }
  return { kind: "contest", onBallot, uncontested: onBallot.length === 1, hadPrimary };
}

/** "Tom Tiffany / David Varnam (Republican)". The party is printed in full. */
export function ballotLine(candidate: CandidateLike): string {
  const party = generalParty(candidate);
  const name = generalBallotName(candidate);
  return party ? `${name} (${party})` : name;
}

export function countSentence(n: number): string {
  const when = `on the ${CURRENT_ELECTION.longDate} ballot.`;
  if (n === 0) return `No candidate is ${when}`;
  return n === 1 ? `1 candidate is ${when}` : `${n} candidates are ${when}`;
}

/** "A, B and C" — or the first three and a count of the rest. */
function listed(lines: string[]): string {
  if (lines.length <= 3) {
    return lines.length < 2 ? lines.join("") : `${lines.slice(0, -1).join(", ")} and ${lines.at(-1)}`;
  }
  return `${lines.slice(0, 3).join(", ")} and ${lines.length - 3} more`;
}

export function raceDescription<C extends CandidateLike>(office: string, ballot: RaceBallot<C>): string {
  if (ballot.kind === "no-contest") return `${office}: ${ballot.note}`;
  if (ballot.kind === "not-loaded" || ballot.onBallot.length === 0) {
    return `Candidates, campaign finance and sourced coverage for ${office} in Wisconsin's ${CURRENT_ELECTION.longDate} general election.`;
  }
  const verb = ballot.onBallot.length === 1 ? "is" : "are";
  const incumbent = ballot.onBallot.find((c) => c.incumbent);
  const tail = incumbent ? ` ${incumbent.name} is the incumbent.` : "";
  return `${listed(ballot.onBallot.map(ballotLine))} ${verb} on the ${CURRENT_ELECTION.longDate} ballot for ${office}.${tail}`;
}

export function raceFaq<C extends CandidateLike>(
  office: string,
  ballot: RaceBallot<C>,
  incumbent?: string,
): { q: string; a: string }[] {
  if (ballot.kind === "no-contest") {
    return [{ q: `Is ${office} on the ${CURRENT_ELECTION.longDate} ballot?`, a: ballot.note }];
  }
  const names = ballot.kind === "contest" ? ballot.onBallot.map(ballotLine) : [];
  const verb = names.length === 1 ? "is" : "are";
  return [
    ...(names.length > 0
      ? [
          {
            q: `Who is on the ballot for ${office} on ${CURRENT_ELECTION.longDate}?`,
            a: `${names.join(", ")} ${verb} on the ${CURRENT_ELECTION.longDate} general election ballot for ${office}.`,
          },
        ]
      : []),
    { q: `When is the election for ${office}?`, a: `Wisconsin's general election is ${CURRENT_ELECTION.longDate}.` },
    ...(incumbent ? [{ q: `Who currently holds ${office}?`, a: `${incumbent} is the incumbent.` }] : []),
  ];
}

type PollLike = {
  pollType: string;
  groups: readonly { rows: readonly { label: string; candidateSlug: string | null }[] }[];
};

/** A poll line that is not a person: "Undecided", "Other candidate", "Undecided/Other". */
const NOT_A_CANDIDATE = /^(undecided|others?|someone else|don'?t know|not sure|unsure|refused|none|neither|no opinion)\b/i;

/**
 * Which polls belong on the November page. A poll qualifies only if it is not
 * a primary poll, links at least one candidate, every linked candidate is on
 * the November ballot, and every unlinked line is plainly not a person.
 * Anything else (a July "Hong vs. Tiffany" matchup, a generic-Democrat
 * hypothetical, a line naming someone we could not link) stays in the archive:
 * when in doubt a poll is kept off the November page, never dropped.
 */
export function splitPolls<P extends PollLike>(
  polls: readonly P[],
  onBallotSlugs: ReadonlySet<string>,
): { november: P[]; archive: P[] } {
  const isNovember = (poll: P) => {
    if (/primary/i.test(poll.pollType)) return false;
    const rows = poll.groups.flatMap((g) => g.rows);
    return (
      rows.some((r) => r.candidateSlug !== null) &&
      rows.every((r) =>
        r.candidateSlug !== null ? onBallotSlugs.has(r.candidateSlug) : NOT_A_CANDIDATE.test(r.label.trim()),
      )
    );
  };
  return { november: polls.filter(isNovember), archive: polls.filter((p) => !isNovember(p)) };
}

const ON_NOV_3 = `on the ${CURRENT_ELECTION.longDate} ballot`;
const NOT_LOADED = `The ${CURRENT_ELECTION.longDate} ballot for this office has not been loaded into the guide yet.`;

/** The compare page's opening line. Running mates are not a contest to compare. */
export function compareIntro<C>(ballot: RaceBallot<C>, onRecord?: number): string {
  if (ballot.kind === "no-contest") return ballot.note;
  if (ballot.kind === "not-loaded") return NOT_LOADED;
  const n = ballot.onBallot.length;
  if (n === 0) return `No candidates are ${ON_NOV_3} for this office.`;
  if (n === 1) return `One candidate is ${ON_NOV_3} for this office, so there is nothing to compare.`;
  if (onRecord === 0) return `The ${n} candidates ${ON_NOV_3}, as printed. None has a position on record that the guide could source yet.`;
  return `The ${n} candidates ${ON_NOV_3}, side by side, issue by issue. Each stance is a sourced summary, not a ranking or endorsement.`;
}

export function compareDescription<C extends CandidateLike>(office: string, ballot: RaceBallot<C>): string {
  if (ballot.kind === "contest" && ballot.onBallot.length > 1) {
    return `Where the ${ballot.onBallot.length} candidates ${ON_NOV_3} for ${office} stand, issue by issue — every stance linked to its source.`;
  }
  return raceDescription(office, ballot);
}

/** Text for the race and compare share images. */
export function shareLines<C>(ballot: RaceBallot<C>): {
  raceEyebrow: string;
  raceSubtitle: string;
  compareSubtitle: string;
} {
  if (ballot.kind === "no-contest") {
    return { raceEyebrow: "Wisconsin 2026", raceSubtitle: ballot.note, compareSubtitle: ballot.note };
  }
  if (ballot.kind === "not-loaded" || ballot.onBallot.length === 0) {
    return {
      raceEyebrow: "Wisconsin 2026",
      raceSubtitle: "Candidates, campaign finance, and sourced coverage",
      compareSubtitle: "Where the candidates stand, issue by issue — every stance sourced",
    };
  }
  const n = ballot.onBallot.length;
  const count = `${n} candidate${n === 1 ? "" : "s"} on the November 3 ballot`;
  return {
    raceEyebrow: "On the November 3 ballot",
    raceSubtitle: n > 1 ? `${count} · compare where they stand` : count,
    compareSubtitle: n > 1 ? `${n} candidates side by side, issue by issue — every stance sourced` : count,
  };
}

/** Rows tied to a candidate stay only if that candidate is on the ballot. */
export function keepOnBallot<R extends { candidateSlug?: string | null }>(
  rows: readonly R[],
  onBallotSlugs: ReadonlySet<string>,
): R[] {
  return rows.filter((r) => !r.candidateSlug || onBallotSlugs.has(r.candidateSlug));
}

/**
 * Ad-money cards for the November field. Null when ads were tracked but every
 * one belongs to someone off the ballot: the section is then left out, because
 * its empty state ("No ads tracked in this race yet") would be false.
 */
export function novemberAdMoney<D extends { candidates: readonly { slug: string }[] }>(
  data: D,
  onBallotSlugs: ReadonlySet<string>,
): D | null {
  const candidates = data.candidates.filter((c) => onBallotSlugs.has(c.slug));
  if (data.candidates.length > 0 && candidates.length === 0) return null;
  return { ...data, candidates };
}

/** A race note written about the primary belongs in the archive, not on the November page. */
export function novemberNotes(notes: string | undefined): string | undefined {
  return notes && !/primar/i.test(notes) ? notes : undefined;
}
