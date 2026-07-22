import { notFound } from "next/navigation";
import { getSponsorProfile, getSponsorScorecard, getSponsorAds, candidateDirectory } from "@/lib/data";
import { sponsorSlugToKey } from "@/lib/site";
import { SponsorProfile } from "@/components/guide/sponsor-profile";

export const revalidate = 300;

export default async function SponsorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const key = sponsorSlugToKey(slug);
  const [profile, scorecard, ads, candidates] = await Promise.all([
    getSponsorProfile(key), getSponsorScorecard(key), getSponsorAds(key), candidateDirectory(),
  ]);
  if (!profile) notFound();
  const names = Object.fromEntries(candidates.map((c) => [c.slug, c.name]));
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <SponsorProfile profile={profile} scorecard={scorecard} ads={ads} names={names} />
    </main>
  );
}
