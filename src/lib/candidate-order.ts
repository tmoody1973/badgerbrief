// ponytail: last whitespace token as "last name" — approximation, fine for a
// neutral A–Z sort; revisit only if a real ordering complaint appears (suffixes).
export const lastName = (name: string) => name.trim().split(/\s+/).pop()!.toLowerCase();

export const byLastName = <T extends { name: string }>(a: T, b: T) =>
  lastName(a.name).localeCompare(lastName(b.name));

// ponytail: slug -> Title Case; acronym-blind. Upgrade to a label map only if an
// issue slug reads wrong on the page.
export const labelForSlug = (slug: string) =>
  slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
