import { getRace } from "@/lib/data";
import { slugToRaceId } from "@/lib/site";
import { buildRaceBallot, shareLines } from "@/lib/race-ballot";
import { OG_SIZE, OG_CONTENT_TYPE, ogCard } from "@/lib/og-card";

// Per-race share card for the side-by-side comparison page. Framed as "compare"
// so it reads differently from the race overview card. Text-only.
export const alt = "Compare Wisconsin 2026 candidates — BadgerBrief";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getRace(slugToRaceId(slug));

  if (!data) {
    return ogCard({ eyebrow: "Compare candidates", title: "Wisconsin 2026" });
  }

  const office = data.race.office;
  const subtitle = shareLines(buildRaceBallot(data.race, data.candidates)).compareSubtitle;

  return ogCard({ eyebrow: "Compare candidates", title: office, subtitle });
}
