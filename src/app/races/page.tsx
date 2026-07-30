import type { Metadata } from "next";
import Link from "next/link";
import { RaceCard } from "@/components/guide/cards";
import { DistrictRaces } from "@/components/guide/district-races";
import { listRaces } from "@/lib/data";
import { splitHomeRaces } from "@/lib/home-races";
import { raceLevelLabel } from "@/lib/i18n/race-card-dict";
import { JsonLd, breadcrumbNode, organizationNode } from "@/lib/jsonld";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Wisconsin 2026 races",
  description:
    "Every race on the Wisconsin 2026 ballot — Governor, Attorney General, Supreme Court, Congress, and all state legislative districts. Nonpartisan candidate guides, side-by-side comparisons, and money in each race.",
  alternates: { canonical: "/races" },
  openGraph: {
    title: "Wisconsin 2026 races — BadgerBrief",
    description:
      "Every race on the Wisconsin 2026 ballot: statewide, congressional, and legislative. Nonpartisan guides, comparisons, and campaign finance.",
    url: "/races",
    type: "website",
  },
};

export default async function RacesIndexPage() {
  const races = await listRaces();
  const { listed, byLevel } = splitHomeRaces(races);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <JsonLd
        nodes={[
          organizationNode(),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Races", path: "/races" },
          ]),
        ]}
      />

      <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Wisconsin 2026
      </p>
      <h1 className="font-display mt-2 text-4xl leading-none sm:text-5xl">
        All races on the ballot
      </h1>
      <p className="mt-4 max-w-2xl text-lg">
        {listed.length} races across Wisconsin&rsquo;s 2026 ballot — from
        statewide offices to every legislative district. Open any race for a
        nonpartisan guide to who&rsquo;s running, or{" "}
        <Link href="/candidates" className="font-bold underline decoration-2 underline-offset-2">
          browse candidates by name
        </Link>
        .
      </p>

      {[...byLevel.entries()].map(([level, group]) => (
        <section key={level} className="mt-8">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {raceLevelLabel(level, "en")}
          </h2>
          {level === "State Legislative" ? (
            <div className="mt-2">
              <DistrictRaces races={group} />
            </div>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((race) => (
                <RaceCard key={race.raceId} race={race} locale="en" />
              ))}
            </div>
          )}
        </section>
      ))}
    </main>
  );
}
