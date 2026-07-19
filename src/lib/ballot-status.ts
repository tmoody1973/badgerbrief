/**
 * Ballot-status classification for the race page.
 *
 * Mirrors StatusBadge's label logic in components/guide/labels.tsx: only
 * "not on" / "did not file" statuses mean off the printed ballot. Withdrawn
 * and Suspended candidates STAY on it per WEC's official contest list
 * (MOO-314 verification) — they must remain visible, not folded.
 */
export function isOnBallot(status?: string): boolean {
  if (!status) return true;
  const low = status.toLowerCase();
  return !low.includes("not on") && !low.includes("did not file");
}

/**
 * Anchor id for a party section on the race page. Shared by the section
 * headings (ids) and RaceSectionNav (hrefs) so they can't drift apart.
 * Independent has no primary — it links to the general-election section.
 */
export function partySectionId(party: string): string {
  const slug = party.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return party === "Independent" ? slug : `${slug}-primary`;
}
