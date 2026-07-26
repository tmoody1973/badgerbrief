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
export type IssueMatchGroup = { issueSlug: string; label: string; races: IssueMatchRace[] };

export function buildIssueMatch(
  races: RaceInput[],
  selectedIssueSlugs: string[],
): { groups: IssueMatchGroup[]; totalOnRecord: number } {
  // Compute each race's full issue breakdown once, then look issues up.
  const perRace = races.map((race) => ({
    race,
    issues: buildIssueComparison(race.candidates, race.positions).issues,
  }));

  const groups: IssueMatchGroup[] = [];
  let totalOnRecord = 0;
  const seen = new Set<string>();

  for (const issueSlug of selectedIssueSlugs) {
    if (seen.has(issueSlug)) continue; // dedupe, preserve selection order
    seen.add(issueSlug);

    const raceRows: IssueMatchRace[] = [];
    for (const { race, issues } of perRace) {
      const match = issues.find((i) => i.issueSlug === issueSlug);
      if (!match || match.onRecord.length === 0) continue; // drop races with no coverage on this issue
      raceRows.push({
        raceId: race.raceId,
        office: race.office,
        onRecord: match.onRecord,
        noRecord: match.noRecord,
      });
      totalOnRecord += match.onRecord.length;
    }
    if (raceRows.length > 0) {
      groups.push({ issueSlug, label: labelForSlug(issueSlug), races: raceRows });
    }
  }
  return { groups, totalOnRecord };
}
