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
};

// ponytail: last whitespace token as "last name" — approximation, fine for a
// neutral A–Z sort; revisit only if a real ordering complaint appears (suffixes).
const lastName = (name: string) => name.trim().split(/\s+/).pop()!.toLowerCase();

// ponytail: slug -> Title Case; acronym-blind (edu-ok). Upgrade to a label map
// only if an issue slug reads wrong on the page.
const labelForSlug = (slug: string) =>
  slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

export function buildIssueComparison(
  candidates: CompareCandidate[],
  positions: ComparePosition[],
): { issues: IssueGroup[]; totalOnRecord: number } {
  const bySlug = new Map(candidates.map((c) => [c.slug, c]));
  const byLast = (a: CompareCandidate, b: CompareCandidate) =>
    lastName(a.name).localeCompare(lastName(b.name));

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
      .sort((a, b) => byLast(a.candidate, b.candidate));
    const onSet = new Set(byCand.keys());
    const noRecord = candidates.filter((c) => !onSet.has(c.slug)).sort(byLast);
    return { issueSlug, label: labelForSlug(issueSlug), onRecord, noRecord };
  });

  issues.sort(
    (a, b) => b.onRecord.length - a.onRecord.length || a.label.localeCompare(b.label),
  );

  const totalOnRecord = issues.reduce((n, i) => n + i.onRecord.length, 0);
  return { issues, totalOnRecord };
}
