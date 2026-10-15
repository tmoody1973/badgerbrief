import { byLastName, labelForSlug } from "./candidate-order";

export type CompareCandidate = { slug: string; name: string; party?: string; incumbent?: boolean };
export type ComparePosition = {
  candidateSlug: string;
  issueSlug: string;
  stance: string;
  summary: string;
  sources: { name: string; url: string }[];
};
export type IssueGroup = {
  issueSlug: string;
  label: string;
  onRecord: { candidate: CompareCandidate; position: ComparePosition }[];
  noRecord: CompareCandidate[];
  /** One slot per candidate, in the order the caller passed them (ballot
   * order on /compare), so a column always belongs to the same candidate. */
  cells: { candidate: CompareCandidate; position: ComparePosition | null }[];
};

export function buildIssueComparison(
  candidates: CompareCandidate[],
  positions: ComparePosition[],
): { issues: IssueGroup[]; totalOnRecord: number } {
  const bySlug = new Map(candidates.map((c) => [c.slug, c]));

  // issueSlug -> candidateSlug -> position (first wins on duplicates)
  const grouped = new Map<string, Map<string, ComparePosition>>();
  for (const p of positions) {
    if (!bySlug.has(p.candidateSlug)) continue; // stale slug not in this race
    let issue = grouped.get(p.issueSlug);
    if (!issue) grouped.set(p.issueSlug, (issue = new Map()));
    if (!issue.has(p.candidateSlug)) issue.set(p.candidateSlug, p);
  }

  const issues: IssueGroup[] = [...grouped.entries()].map(([issueSlug, byCand]) => {
    const onRecord = [...byCand.entries()]
      .map(([slug, position]) => ({ candidate: bySlug.get(slug)!, position }))
      .sort((a, b) => byLastName(a.candidate, b.candidate));
    const onSet = new Set(byCand.keys());
    const noRecord = candidates.filter((c) => !onSet.has(c.slug)).sort(byLastName);
    const cells = candidates.map((candidate) => ({ candidate, position: byCand.get(candidate.slug) ?? null }));
    return { issueSlug, label: labelForSlug(issueSlug), onRecord, noRecord, cells };
  });

  // Alphabetical (Tarik, 2026-10-15): ordering by coverage put an issue lower
  // because one side had not published on it.
  issues.sort((a, b) => a.label.localeCompare(b.label));

  const totalOnRecord = issues.reduce((n, i) => n + i.onRecord.length, 0);
  return { issues, totalOnRecord };
}
