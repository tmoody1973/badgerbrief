import { getCandidateBySlug } from "@/lib/data";
import { OG_SIZE, OG_CONTENT_TYPE, ogCard, fetchImageDataUri, initials } from "@/lib/og-card";

// Per-candidate share card: a link to a candidate previews with THAT candidate
// (name, office, party, photo when we have one) instead of the generic site
// card. Next wires this to og:image AND twitter:image for the route.
export const alt = "BadgerBrief candidate — Wisconsin 2026";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getCandidateBySlug(slug);

  if (!data) {
    return ogCard({ eyebrow: "Wisconsin 2026", title: "Candidate" });
  }

  const { candidate, race } = data;
  const office = race?.office ?? "Wisconsin 2026";
  const party = candidate.party
    ? `${candidate.party}${candidate.incumbent ? " · Incumbent" : ""}`
    : candidate.incumbent
      ? "Incumbent"
      : undefined;

  // Photo when available, prefetched with a timeout so a dead Ballotpedia URL
  // falls back to initials instead of failing the whole card.
  const photo = await fetchImageDataUri(candidate.photoUrl);

  return ogCard({
    eyebrow: office,
    title: candidate.name,
    subtitle: party,
    photo,
    initialsText: initials(candidate.name),
  });
}
