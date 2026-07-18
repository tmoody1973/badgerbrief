import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LastUpdated } from "@/components/guide/labels";
import { getRace, listRaces } from "@/lib/data";
import { JsonLd, breadcrumbNode, organizationNode } from "@/lib/jsonld";
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
    title: `Compare ${data.race.office} candidates — Wisconsin 2026`,
    description: `Side-by-side comparison of all ${data.candidates.length} candidates for ${data.race.office} in the 2026 Wisconsin primary.`,
    alternates: { canonical: `/compare/${slug}` },
  };
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;
  const data = await getRace(slugToRaceId(slug));
  if (!data || data.candidates.length === 0) notFound();
  const { race, candidates } = data;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <JsonLd
        nodes={[
          organizationNode(),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: race.office, path: `/races/${slug}` },
            { name: "Compare", path: `/compare/${slug}` },
          ]),
        ]}
      />

      <Link
        href={`/races/${slug}`}
        className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground underline-offset-2 hover:underline"
      >
        ← {race.office}
      </Link>
      <h1 className="font-display mt-2 text-3xl leading-tight">
        How do the {race.office} candidates compare?
      </h1>
      <p className="mt-2 max-w-2xl">
        All {candidates.length} candidates side by side: party, background, and
        stated priorities. Priorities are the campaigns&apos; own claims —
        follow each candidate&apos;s page for sources.
      </p>

      <div className="mt-6 overflow-x-auto border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-border bg-secondary text-left">
              <th className="p-3 font-display text-sm">Candidate</th>
              <th className="p-3 font-mono text-xs font-bold uppercase">Party</th>
              <th className="p-3 font-mono text-xs font-bold uppercase">
                Occupation
              </th>
              <th className="p-3 font-mono text-xs font-bold uppercase">
                Stated priorities
              </th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.slug} className="border-b border-dashed border-border align-top">
                <td className="p-3">
                  <Link
                    href={`/candidates/${c.slug}`}
                    className="font-bold underline decoration-2 underline-offset-2"
                  >
                    {c.name}
                  </Link>
                  {c.incumbent && (
                    <span className="ml-2 border border-border bg-secondary px-1 font-mono text-[10px] font-bold uppercase">
                      Inc.
                    </span>
                  )}
                </td>
                <td className="p-3">{c.party ?? "—"}</td>
                <td className="p-3">
                  {c.currentOccupation && c.currentOccupation !== "Unknown"
                    ? c.currentOccupation
                    : "—"}
                </td>
                <td className="p-3">
                  {c.keyPriorities && c.keyPriorities.length > 0
                    ? c.keyPriorities.slice(0, 3).join(" · ")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <LastUpdated date={race.dataAsOf} />
      </div>
    </main>
  );
}
