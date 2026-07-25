export function voterAccessToFaqs(
  rows: { title: string; summary: string }[],
): { q: string; a: string }[] {
  return rows.map((r) => ({ q: r.title, a: r.summary }));
}
