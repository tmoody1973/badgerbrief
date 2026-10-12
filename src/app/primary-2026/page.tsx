import type { Metadata } from "next";
import Link from "next/link";
import { ArchiveBanner } from "@/components/guide/archive-banner";
import { hadAugustPrimary } from "@/lib/ballot-status";
import { listRaces } from "@/lib/data";
import { PRIMARY_ARCHIVE } from "@/lib/election";
import { splitHomeRaces } from "@/lib/home-races";
import { JsonLd, breadcrumbNode, organizationNode } from "@/lib/jsonld";
import { raceIdToSlug } from "@/lib/site";

export const revalidate = 300;

export const metadata: Metadata = {
  title: `Wisconsin ${PRIMARY_ARCHIVE.label} — archive`,
  description: `Archived coverage of Wisconsin's ${PRIMARY_ARCHIVE.label}: who ran for each office, the governor's debate, and how the polls read before the vote.`,
  alternates: { canonical: PRIMARY_ARCHIVE.path },
};

const linkClass = "font-bold underline decoration-2 underline-offset-2";

export default async function PrimaryArchivePage() {
  const { byLevel } = splitHomeRaces((await listRaces()).filter(hadAugustPrimary));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <JsonLd
        nodes={[
          organizationNode(),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Primary archive", path: PRIMARY_ARCHIVE.path },
          ]),
        ]}
      />
      <ArchiveBanner />
      <h1 className="font-display text-4xl leading-none sm:text-5xl">The {PRIMARY_ARCHIVE.label}</h1>
      <p className="mt-4 max-w-2xl text-lg">
        Everything the guide published before the primary, kept as a record. Candidate pages keep their original
        addresses.
      </p>

      <section className="mt-8">
        <h2 className="font-display text-2xl">Also in the archive</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>
            <Link href={`${PRIMARY_ARCHIVE.path}/news`} className={linkClass}>
              News coverage from the primary season
            </Link>
          </li>
          <li>
            <Link href="/debate/wi-gov-dem-primary-debate" className={linkClass}>
              The July 28 Democratic primary debate for governor
            </Link>
          </li>
          <li>
            <Link href="/forecast" className={linkClass}>
              Reading the primary polls
            </Link>
          </li>
          <li>
            <Link href="/ballot-basics" className={linkClass}>
              How the partisan primary worked
            </Link>
          </li>
        </ul>
      </section>

      {[...byLevel.entries()].map(([level, group]) => (
        <section key={level} className="mt-8">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">{level}</h2>
          <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {group.map((race) => (
              <li key={race.raceId}>
                <Link
                  href={`${PRIMARY_ARCHIVE.path}/races/${raceIdToSlug(race.raceId)}`}
                  className="underline decoration-1 underline-offset-2 hover:decoration-2"
                >
                  {race.office}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
