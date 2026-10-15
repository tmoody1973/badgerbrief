// ponytail: last whitespace token as "last name" — approximation, fine for a
// neutral A–Z sort; revisit only if a real ordering complaint appears (suffixes).
export const lastName = (name: string) => name.trim().split(/\s+/).pop()!.toLowerCase();

export const byLastName = <T extends { name: string }>(a: T, b: T) =>
  lastName(a.name).localeCompare(lastName(b.name));

// ponytail: slug -> Title Case; acronym-blind. Upgrade to a label map only if an
// issue slug reads wrong on the page.
/** Plain-English issue names, matching ISSUE_LABEL in convex/votesQueries.ts
 * (kept as a copy so the website ships without a database deploy). */
const ISSUE_LABEL: Record<string, string> = {
  healthcare: "Healthcare", education: "Education", "public-safety": "Public safety",
  "taxes-budget": "Taxes & budget", abortion: "Abortion", housing: "Housing", immigration: "Immigration",
  "environment-energy": "Environment & energy", "economy-jobs": "Economy & jobs",
  "elections-democracy": "Elections & democracy", agriculture: "Agriculture",
};

export const labelForSlug = (slug: string) =>
  ISSUE_LABEL[slug] ??
  slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
