import type { Metadata } from "next";
import { generalField } from "../../../../../convex/lib/ballot";
import { notFound } from "next/navigation";
import { ArchiveBanner } from "@/components/guide/archive-banner";
import { PrimaryRaceView } from "@/components/guide/primary-race-view";
import { RacePolls } from "@/components/guide/race-polls";
import { SourceList } from "@/components/guide/sources";
import { InTheNews } from "@/components/guide/in-the-news";
import { getInTheNewsForRace, getPollsForRace, getRace, listRaces } from "@/lib/data";
import { PRIMARY_ARCHIVE } from "@/lib/election";
import { JsonLd, breadcrumbNode, organizationNode } from "@/lib/jsonld";
import { splitPolls } from "@/lib/race-ballot";
import { raceIdToSlug, slugToRaceId } from "@/lib/site";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const races = await listRaces();
  return races.map((r) => ({ slug: raceIdToSlug(r.raceId) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getRace(slugToRaceId(slug));
  if (!data) return {};
  const title = `${data.race.office} — ${PRIMARY_ARCHIVE.label} (archive)`;
  const description = `Archived: who ran for ${data.race.office} in Wisconsin's ${PRIMARY_ARCHIVE.label}. Kept as a record; no longer updated.`;
  return {
    title,
    description,
    alternates: { canonical: `${PRIMARY_ARCHIVE.path}/races/${slug}` },
    openGraph: { title, description, url: `${PRIMARY_ARCHIVE.path}/races/${slug}`, type: "article" },
  };
}

export default async function ArchivedRacePage({ params }: Props) {
  const { slug } = await params;
  const data = await getRace(slugToRaceId(slug));
  if (!data) notFound();
  const { race, candidates } = data;
  // Everything the November page leaves out, so no published poll disappears.
  const onBallot = new Set(generalField(candidates).map((c) => c.slug));
  const polls = splitPolls(await getPollsForRace(race.raceId), onBallot).archive;
  const inTheNews = (await getInTheNewsForRace(race.raceId)).filter((r) => r.article.archive);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <JsonLd
        nodes={[
          organizationNode(),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Primary archive", path: PRIMARY_ARCHIVE.path },
            { name: race.office, path: `${PRIMARY_ARCHIVE.path}/races/${slug}` },
          ]),
        ]}
      />
      <ArchiveBanner currentHref={`/races/${slug}`} currentLabel={`See ${race.office} on the November ballot`} />
      <PrimaryRaceView race={race} candidates={candidates} />
      <RacePolls polls={polls} raceName={race.office} archive />
      <InTheNews items={inTheNews} heading={`Primary-season news about the ${race.office} race`} />
      <section id="sources" className="mt-10 scroll-mt-16">
        <SourceList sources={race.sources} />
      </section>
    </main>
  );
}
