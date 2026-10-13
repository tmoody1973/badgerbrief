/**
 * What each Voter Help tool tells the model.
 *
 * The model repeats what a tool hands it. So the rule that matters for the
 * November ballot lives here, in plain functions that can be tested without a
 * model: who is on the ballot comes from the state's certified list, and the
 * old free-text `status` field never leaves the database. An eliminated
 * candidate still reads "Active" there.
 */
import { generalParty, generalPersonName, isOnGeneralBallot } from "./ballot";
import { hadAugustPrimary } from "../../src/lib/ballot-status";
import { ballotSummary, type FieldEntry } from "../../src/lib/candidate-ballot";
import { PRIMARY_ARCHIVE } from "../../src/lib/election";
import { hasCoverage, type IssueMatchGroup, type UncoveredRace } from "../../src/lib/issue-match";
import { ballotLine, buildRaceBallot, countSentence } from "../../src/lib/race-ballot";

type Link = { name: string; url: string };
type General = { onBallot: boolean; ballotName?: string; party?: string; ballotOrder?: number };
type Candidate = {
  slug: string;
  name: string;
  party?: string;
  primaryParty?: string;
  incumbent?: boolean;
  background?: string;
  currentOccupation?: string;
  keyPriorities?: unknown;
  sources: Link[];
  general?: General;
};
type Race = {
  raceId: string;
  office: string;
  level: string;
  primaryDate?: string;
  generalDate?: string;
  incumbent?: string;
  officeDescription?: string;
  districtDescription?: string;
  sources: Link[];
  general?: { onBallot: boolean; note?: string };
};
type Position = { candidateSlug: string; issueSlug: string; stance: string; summary: string; sources: Link[] };
type Finance = { candidateSlug: string; receipts?: number; disbursements?: number; cashOnHand?: number; debts?: number; coverageEndDate?: string };

const NOT_ON = "not on the November 3, 2026 ballot";
const NEVER = "Never say anyone lost, won, was defeated or was eliminated, and give no vote totals: the guide holds the certified ballot, not the results.";

const RACE_RULE =
  `The November 3, 2026 field is exactly the onBallot list. Name those candidates using ballotLine. ` +
  `Anyone under notOnBallot is ${NOT_ON}: say exactly that if the voter asks about them, and do not list them otherwise ` +
  `(you may say how many others ran in the August primary and link primaryArchive). ${NEVER}`;

const CANDIDATE_RULE =
  `Say whether this person is on the November 3, 2026 ballot using november.statement. ${NEVER} ` +
  `Published positions, quotes and finance below are theirs regardless of ballot status; cite each.`;

const NOT_LOADED = "The November 3, 2026 ballot for this office has not been loaded into the guide.";

/** For getRaceInfo. */
export function racePayload(data: { race: Race; candidates: Candidate[]; positions: Position[]; finance: Finance[] }) {
  const { race } = data;
  const ballot = buildRaceBallot(race, data.candidates);
  const field = ballot.kind === "contest" ? ballot.onBallot : ballot.kind === "no-contest" ? ballot.runningMates : [];
  const on = new Set(field.map((c) => c.slug));
  const november =
    ballot.kind === "contest"
      ? { status: "contest" as const, statement: countSentence(field.length) }
      : ballot.kind === "no-contest"
        ? { status: "not-a-separate-contest" as const, statement: ballot.note }
        : { status: "not-loaded" as const, statement: NOT_LOADED };

  return {
    race: {
      raceId: race.raceId,
      office: race.office,
      level: race.level,
      generalDate: race.generalDate,
      incumbent: race.incumbent,
      officeDescription: race.officeDescription,
      districtDescription: race.districtDescription,
      source: race.sources[0],
    },
    november,
    onBallot: field.map((c) => ({
      slug: c.slug,
      name: generalPersonName(c),
      ballotLine: ballotLine(c),
      party: generalParty(c),
      incumbent: c.incumbent,
      background: c.background,
      currentOccupation: c.currentOccupation,
      keyPriorities: c.keyPriorities,
      source: c.sources[0],
    })),
    notOnBallot: data.candidates.filter((c) => !on.has(c.slug)).map((c) => ({ slug: c.slug, name: c.name })),
    primaryArchive: ballot.hadPrimary ? `${PRIMARY_ARCHIVE.path}/races/${race.raceId.toLowerCase()}` : undefined,
    rule: RACE_RULE,
    positions: data.positions
      .filter((p) => on.has(p.candidateSlug))
      .map((p) => ({ candidateSlug: p.candidateSlug, issueSlug: p.issueSlug, stance: p.stance, summary: p.summary, source: p.sources[0] })),
    finance: data.finance
      .filter((f) => on.has(f.candidateSlug))
      .map((f) => ({ candidateSlug: f.candidateSlug, receipts: f.receipts, disbursements: f.disbursements, cashOnHand: f.cashOnHand, debts: f.debts, coverageEndDate: f.coverageEndDate })),
  };
}

/** Fields that must not reach the model, or are noise to it. */
const HIDDEN = new Set(["status", "general", "_id", "_creationTime"]);

/** For getCandidateInfo. */
export function candidatePayload(data: {
  candidate: Candidate & Record<string, unknown>;
  race: Race | null;
  field: FieldEntry[];
  positions: unknown[];
  quotes: unknown[];
  finance: unknown[];
}) {
  const { candidate, race } = data;
  const name = generalPersonName(candidate);
  const onBallot = isOnGeneralBallot(candidate);
  const trimmed = Object.fromEntries(Object.entries(candidate).filter(([key]) => !HIDDEN.has(key)));
  return {
    candidate: { ...trimmed, name, party: generalParty(candidate) },
    november: {
      onBallot,
      ballotLine: onBallot ? ballotLine(candidate) : undefined,
      statement: ballotSummary({
        candidateName: name,
        office: race?.office ?? "this office",
        me: data.field.find((f) => f.slug === candidate.slug),
        others: data.field.filter((f) => f.slug !== candidate.slug && f.onGeneralBallot),
        raceOnBallot: race?.general?.onBallot,
        raceNote: race?.general?.note,
        hadPrimary: race ? hadAugustPrimary(race) : true,
      }),
    },
    race: race ? { raceId: race.raceId, office: race.office, level: race.level, generalDate: race.generalDate } : null,
    positions: data.positions,
    quotes: data.quotes,
    finance: data.finance,
    rule: CANDIDATE_RULE,
  };
}

/** For matchBallotByIssues. */
export function matchPayload(
  result: { groups: IssueMatchGroup[]; uncovered: UncoveredRace[] },
  issueSlugs: readonly string[],
  scope: "ballot" | "statewide",
) {
  return {
    scope,
    scopeNote:
      scope === "statewide"
        ? "No saved address — these results cover the statewide races only. Tell the user they can save their address on the Brief page (/brief) to include their local races too."
        : "The user's own ballot races (from their saved address).",
    issues: issueSlugs.map((slug) => {
      const group = result.groups.find((g) => g.issueSlug === slug);
      return {
        issue: slug,
        // A section exists for every requested issue; coverage means a position does.
        coverage: hasCoverage(group) ? ("some" as const) : ("none" as const),
        races: (group?.races ?? []).map((r) => ({
          office: r.office,
          onRecord: r.onRecord.map((o) => ({
            name: o.candidate.name,
            party: o.candidate.party,
            stance: o.position.stance,
            summary: o.position.summary,
            source: o.position.sources[0]?.url,
          })),
          noPosition: r.noRecord.map((c) => c.name),
        })),
        // On the ballot, with a position on another requested issue but not this one.
        noPublishedPositionInRace: (group?.silent ?? []).map((r) => r.office),
      };
    }),
    // On the ballot, with no published position on any requested issue.
    alsoOnBallot: result.uncovered.map((r) => ({ office: r.office, candidates: r.candidates.map((c) => c.name) })),
    rule: "Present each issue's candidates neutrally, each with its source link; for anyone under noPosition say 'no position on record'. Name the races under noPublishedPositionInRace and alsoOnBallot as on the ballot with no published position, so no race is left out. Never rank, score, or recommend a candidate (rule 6).",
  };
}
