import { buildIssueComparison, type CompareCandidate, type ComparePosition } from "./compare";
import { labelForSlug } from "./candidate-order";

export type RaceInput = {
  raceId: string;
  office: string;
  candidates: CompareCandidate[];
  positions: ComparePosition[];
};
export type IssueMatchRace = {
  raceId: string;
  office: string;
  onRecord: { candidate: CompareCandidate; position: ComparePosition }[];
  noRecord: CompareCandidate[];
};
export type IssueMatchGroup = {
  issueSlug: string;
  label: string;
  /** Races where at least one candidate has a published position on this issue. */
  races: IssueMatchRace[];
  /** Races with a position on another chosen issue, but none on this one. */
  silent: { raceId: string; office: string }[];
};
export type UncoveredRace = { raceId: string; office: string; candidates: CompareCandidate[] };

/**
 * Where the candidates on a voter's ballot stand on the issues they picked.
 *
 * The rule this function exists to keep: a race on the ballot is never left
 * out because the guide has nothing published for it. For each chosen issue a
 * race is either shown with positions, or named as silent on that issue; a race
 * with no position on any chosen issue is listed once, with its candidates.
 */
export function buildIssueMatch(
  races: readonly RaceInput[],
  selectedIssueSlugs: readonly string[],
): { groups: IssueMatchGroup[]; uncovered: UncoveredRace[]; totalOnRecord: number } {
  const selected = [...new Set(selectedIssueSlugs)]; // dedupe, keep selection order

  const perRace = races
    .filter((race) => race.candidates.length > 0)
    .map((race) => {
      const issues = buildIssueComparison(race.candidates, race.positions).issues;
      const byIssue = new Map(selected.map((slug) => [slug, issues.find((i) => i.issueSlug === slug)]));
      const covered = selected.some((slug) => (byIssue.get(slug)?.onRecord.length ?? 0) > 0);
      return { race, byIssue, covered };
    });

  const groups = selected.map((issueSlug): IssueMatchGroup => {
    const shown: IssueMatchRace[] = [];
    const silent: { raceId: string; office: string }[] = [];
    for (const { race, byIssue, covered } of perRace) {
      const match = byIssue.get(issueSlug);
      if (match && match.onRecord.length > 0) {
        shown.push({ raceId: race.raceId, office: race.office, onRecord: match.onRecord, noRecord: match.noRecord });
      } else if (covered) {
        silent.push({ raceId: race.raceId, office: race.office });
      }
    }
    return { issueSlug, label: labelForSlug(issueSlug), races: shown, silent };
  });

  const uncovered = perRace
    .filter((r) => !r.covered)
    .map(({ race }) => ({ raceId: race.raceId, office: race.office, candidates: race.candidates }));
  const totalOnRecord = groups.reduce((n, g) => n + g.races.reduce((m, r) => m + r.onRecord.length, 0), 0);
  return { groups, uncovered, totalOnRecord };
}
