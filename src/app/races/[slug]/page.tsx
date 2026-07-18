import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidateCard } from "@/components/guide/cards";
import { LastUpdated } from "@/components/guide/labels";
import { SourceList } from "@/components/guide/sources";
import { getRace, listRaces } from "@/lib/data";
import {
  JsonLd,
  breadcrumbNode,
  organizationNode,
  personNode,
} from "@/lib/jsonld";
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
  return {
    title: `${data.race.office} — Wisconsin 2026`,
    description: `Who is running for ${data.race.office} in 2026: ${data.candidates.length} candidates, race ratings, and sourced backgrounds.`,
    alternates: { canonical: `/races/${slug}` },
  };
}

export default async function RacePage({ params }: Props) {
  const { slug } = await params;
  const data = await getRace(slugToRaceId(slug));
  if (!data) notFound();
  const { race, candidates } = data;

  const parties = [
    ...new Set(candidates.map((c) => c.primaryParty).filter(Boolean)),
  ] as string[];
  const nonPartisan = candidates.filter((c) => !c.primaryParty);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <JsonLd
        nodes={[
          organizationNode(),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: race.office, path: `/races/${slug}` },
          ]),
          ...candidates.map(personNode),
        ]}
      />

      <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {race.level} · Primary {race.primaryDate ?? "Aug 11, 2026"}
      </p>
      <h1 className="font-display mt-2 text-3xl leading-tight sm:text-4xl">
        Who is running for {race.office} in 2026?
      </h1>
      <p className="mt-3 max-w-2xl text-lg">
        {candidates.length > 0
          ? `${candidates.length} candidates are running.`
          : "Candidate filings for this race are tracked at the district level."}{" "}
        {race.incumbent && <>Incumbent: {race.incumbent}.</>}{" "}
        {race.seatHeldBy && <>Seat held by {race.seatHeldBy}.</>}
      </p>

      {race.raceRating && (
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(race.raceRating).map(([outlet, rating]) => (
            <span
              key={outlet}
              className="border-2 border-border bg-warning px-2 py-1 text-xs font-bold"
              title={outlet.replaceAll("_", " ")}
            >
              {outlet.replaceAll("_", " ")}: {rating}
            </span>
          ))}
        </div>
      )}

      {(race.officeDescription || race.districtDescription || race.notes) && (
        <div className="mt-6 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
          <h2 className="font-display text-xl">Why this race matters</h2>
          {race.officeDescription && <p className="mt-2">{race.officeDescription}</p>}
          {race.districtDescription && (
            <p className="mt-2">{race.districtDescription}</p>
          )}
          {race.notes && <p className="mt-2">{race.notes}</p>}
        </div>
      )}

      {parties.map((party) => (
        <section key={party} className="mt-8">
          <h2 className="font-display text-2xl">{party} primary</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {candidates
              .filter((c) => c.primaryParty === party)
              .map((c) => (
                <CandidateCard key={c.slug} candidate={c} />
              ))}
          </div>
        </section>
      ))}

      {nonPartisan.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-2xl">Candidates</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {nonPartisan.map((c) => (
              <CandidateCard key={c.slug} candidate={c} />
            ))}
          </div>
        </section>
      )}

      {candidates.length > 1 && (
        <div className="mt-8">
          <Link
            href={`/compare/${slug}`}
            className="press inline-block border-2 border-border bg-secondary px-4 py-2 font-bold shadow-[var(--shadow-brutal)]"
          >
            Compare all {race.office} candidates →
          </Link>
        </div>
      )}

      <div className="mt-10 space-y-3">
        <SourceList sources={race.sources} />
        <LastUpdated date={race.dataAsOf} />
      </div>
    </main>
  );
}
