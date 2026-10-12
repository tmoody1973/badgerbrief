import { getRace } from "@/lib/data";
import { slugToRaceId } from "@/lib/site";
import { buildRaceBallot, shareLines } from "@/lib/race-ballot";
import { OG_SIZE, OG_CONTENT_TYPE, ogCard } from "@/lib/og-card";

// Per-race share card: a link to a race previews with THAT office and how many
// candidates are on the ballot, instead of the generic site card. Text-only —
// a race has no single portrait. Next wires this to og:image + twitter:image.
export const alt = "BadgerBrief race — Wisconsin 2026";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getRace(slugToRaceId(slug));

  if (!data) {
    return ogCard({ eyebrow: "Wisconsin 2026", title: "Race" });
  }

  const office = data.race.office;
  const lines = shareLines(buildRaceBallot(data.race, data.candidates));

  return ogCard({
    eyebrow: lines.raceEyebrow,
    title: /wisconsin/i.test(office) ? office : `${office}`,
    subtitle: lines.raceSubtitle,
  });
}
