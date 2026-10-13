/**
 * What each Voter Help tool tells the model.
 *
 * The model repeats what a tool hands it. So the rule that matters for the
 * November ballot lives here, in plain functions that can be tested without a
 * model: who is on the ballot comes from the state's certified list, and the
 * old free-text `status` field never leaves the database. An eliminated
 * candidate still reads "Active" there.
 */
import { GENERAL_ELECTION_DATE, generalParty, generalPersonName, isOnGeneralBallot } from "./ballot";
import { hadAugustPrimary } from "../../src/lib/ballot-status";
import { ballotSummary, type FieldEntry } from "../../src/lib/candidate-ballot";
import { PRIMARY_ARCHIVE } from "../../src/lib/election";
import { OFFICIAL_LINKS } from "../../src/lib/official-links";
import { hasCoverage, type IssueMatchGroup, type UncoveredRace } from "../../src/lib/issue-match";
import { ballotLine, buildRaceBallot, countSentence } from "../../src/lib/race-ballot";

type Link = { name: string; url: string };
type BallotSource = { url: string; documentDate: string };
type General = { onBallot: boolean; ballotName?: string; party?: string; ballotOrder?: number; source?: BallotSource };
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
  general?: { onBallot: boolean; note?: string; source?: BallotSource };
};
type Position = { candidateSlug: string; issueSlug: string; stance: string; summary: string; sources: Link[] };
type Finance = { candidateSlug: string; receipts?: number; disbursements?: number; cashOnHand?: number; debts?: number; coverageEndDate?: string };

const NOT_ON = "not on the November 3, 2026 ballot";
// "Election results", not "vote totals": a roll-call tally is a vote count the
// chat must give (instructions rule 9).
const NEVER = "Never say anyone lost, won, was defeated or was eliminated, and report no election results or candidates' vote counts: the guide holds the certified ballot, not the results.";

const STATE_LIST = "Wisconsin Elections Commission — candidates on the November 3, 2026 ballot";
/** The link a ballot claim cites: the state's certified list. */
const certified = (source: BallotSource | undefined) =>
  source ? { name: STATE_LIST, url: source.url, documentDate: source.documentDate } : undefined;

const RACE_RULE =
  `The November 3, 2026 field is exactly the onBallot list. Name those candidates using ballotLine. ` +
  `Anyone under notOnBallot is ${NOT_ON}: say exactly that if the voter asks about them, and do not list or count them otherwise ` +
  `(you may link primaryArchive for the August primary field). Cite november.source for any statement about who is on the ballot. ${NEVER}`;

const CANDIDATE_RULE =
  `Say whether this person is on the November 3, 2026 ballot using november.statement, and cite november.source for it. ${NEVER} ` +
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
      ? { kind: "contest" as const, statement: countSentence(field.length), source: certified(race.general?.source) }
      : ballot.kind === "no-contest"
        ? { kind: "no-november-contest" as const, statement: ballot.note, source: certified(race.general?.source) }
        : { kind: "not-loaded" as const, statement: NOT_LOADED };

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
    // When the ballot is not loaded nobody is "not on it"; the list is simply unknown.
    notOnBallot: ballot.kind === "not-loaded" ? [] : data.candidates.filter((c) => !on.has(c.slug)).map((c) => ({ slug: c.slug, name: c.name })),
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

/**
 * The only fields of a stored candidate record the model may see. An
 * allow-list, because the record also holds free text written during the
 * primary ("re-entered the primary", "widely viewed as the frontrunner"), the
 * old status field, and finance blobs with placeholder API keys in their URLs.
 */
const PUBLIC_FIELDS = ["slug", "incumbent", "currentOccupation", "keyPriorities", "sources"] as const;

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
  const shown = Object.fromEntries(PUBLIC_FIELDS.filter((key) => candidate[key] !== undefined).map((key) => [key, candidate[key]]));
  // A stored biography describes the campaign as it stood in the primary. For
  // someone who is off the ballot that campaign is over, so it is left out.
  const background = onBallot && candidate.background ? { background: candidate.background } : {};
  const office = race?.office ?? "this office";
  // The web page's sentence ends "This page is kept as a record…". A chat
  // answer is not a page, so an off-ballot statement is built here: the plain
  // fact, plus the race's own reason when it never had an August primary.
  const reason = race && !hadAugustPrimary(race) && race.general?.note ? ` ${race.general.note}` : "";
  const statement = onBallot
    ? ballotSummary({
        candidateName: name,
        office,
        me: data.field.find((f) => f.slug === candidate.slug),
        others: data.field.filter((f) => f.slug !== candidate.slug && f.onGeneralBallot),
        raceOnBallot: race?.general?.onBallot,
        raceNote: race?.general?.note,
        hadPrimary: true,
      })
    : `${name} is ${NOT_ON} for ${office}.${reason}`;
  return {
    candidate: { ...shown, ...background, name, party: generalParty(candidate) },
    november: {
      onBallot,
      ballotLine: onBallot ? ballotLine(candidate) : undefined,
      statement,
      source: certified(candidate.general?.source),
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

const HIDDEN_VOTING = new Set(["primaryDate", "_id", "_creationTime"]);

/**
 * For getVotingInfo. The stored record still carries `primaryDate` (other code
 * reads it) and holds no general-election date, so the date is supplied here
 * and the primary's is withheld.
 */
export function votingInfoPayload(info: Record<string, unknown>) {
  return {
    electionDay: `Tuesday, ${GENERAL_ELECTION_DATE}`,
    ...Object.fromEntries(Object.entries(info).filter(([key]) => !HIDDEN_VOTING.has(key))),
  };
}

type CoverageRow = {
  article: { headline: string; url: string; publishedAt?: string | null; outlet?: string; archive?: boolean };
  outlet?: { displayName?: string } | null;
};

/** For getCoverage: current coverage first, newest first, primary-season stories marked. */
export function coveragePayload(rows: readonly CoverageRow[]) {
  const old = (r: CoverageRow) => Number(Boolean(r.article.archive));
  const sorted = [...rows].sort(
    (a, b) => old(a) - old(b) || (b.article.publishedAt ?? "").localeCompare(a.article.publishedAt ?? ""),
  );
  return {
    // Only what a citation needs. Our internal relevance notes are not for readers or the model.
    articles: sorted.slice(0, 12).map((r) => ({
      headline: r.article.headline,
      url: r.article.url,
      publishedAt: r.article.publishedAt ?? null,
      outlet: r.outlet?.displayName ?? r.article.outlet,
      primarySeason: Boolean(r.article.archive),
    })),
    rule: "An article marked primarySeason was published during the primary season, or is about someone who is not on the November ballot: say so when you cite it. A headline is reporting, never a statement of who is on the ballot.",
  };
}

/** For getMyBallot, when the voter has a saved address. */
export function myBallotPayload<B extends { districts: unknown; races: unknown[] }>(ballot: B) {
  return {
    ...ballot,
    notCovered:
      "This list holds state and federal contests only. County offices and referendum questions on this voter's ballot are not in BadgerBrief yet: say so, and point to the official link for the complete ballot.",
    official: OFFICIAL_LINKS.myBallot,
  };
}

/**
 * The answer a voter sees: every step's text, in order. The chat shows text
 * the model wrote before a tool call as well as after it
 * (voterHelpQueries.listThreadMessages keeps it on purpose), so a harness that
 * reads only the last step judges answers with their opening sentences cut off.
 */
export function visibleAnswer(steps: readonly { text: string }[], lastStepText: string): string {
  const all = steps.map((step) => step.text.trim()).filter((text) => text.length > 0);
  return all.length > 0 ? all.join("\n\n") : lastStepText;
}
