import type { Metadata } from "next";
import Link from "next/link";
import { listCandidateDirectory, listRaces } from "@/lib/data";
import { JsonLd, breadcrumbNode, organizationNode } from "@/lib/jsonld";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "All Wisconsin 2026 candidates",
  description:
    "Every candidate on the Wisconsin 2026 ballot, A–Z by office — Governor, Attorney General, Supreme Court, Congress, and state legislature. Nonpartisan, sourced profiles of who's running.",
  alternates: { canonical: "/candidates" },
  openGraph: {
    title: "All Wisconsin 2026 candidates — BadgerBrief",
    description:
      "Every candidate on the Wisconsin 2026 ballot, grouped by office. Nonpartisan, sourced profiles.",
    url: "/candidates",
    type: "website",
  },
};

// The order voters scan in: statewide first, then the courts, then federal,
// then the long tail of legislative districts.
const LEVEL_ORDER = [
  "State Executive",
  "State Judicial",
  "Federal",
  "State Legislative",
];

export default async function CandidatesIndexPage() {
  const [candidates, races] = await Promise.all([
    listCandidateDirectory(),
    listRaces(),
  ]);

  const raceById = new Map(races.map((r) => [r.raceId, r]));

  // Group candidates under their race, then bucket races by level. A candidate
  // whose race is missing (should not happen) is skipped rather than crashing
  // the whole directory.
  const byRace = new Map<string, typeof candidates>();
  for (const c of candidates) {
    if (!raceById.has(c.raceId)) continue;
    const list = byRace.get(c.raceId) ?? [];
    list.push(c);
    byRace.set(c.raceId, list);
  }

  const levels = LEVEL_ORDER.map((level) => {
    const raceIds = [...byRace.keys()].filter(
      (id) => raceById.get(id)?.level === level,
    );
    raceIds.sort((a, b) =>
      (raceById.get(a)?.office ?? "").localeCompare(
        raceById.get(b)?.office ?? "",
        undefined,
        { numeric: true },
      ),
    );
    return { level, raceIds };
  }).filter((l) => l.raceIds.length > 0);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <JsonLd
        nodes={[
          organizationNode(),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Candidates", path: "/candidates" },
          ]),
        ]}
      />

      <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Wisconsin 2026
      </p>
      <h1 className="font-display mt-2 text-4xl leading-none sm:text-5xl">
        All candidates
      </h1>
      <p className="mt-4 max-w-2xl text-lg">
        {candidates.length} candidates on the Wisconsin 2026 ballot, grouped by
        office. Or{" "}
        <Link href="/races" className="font-bold underline decoration-2 underline-offset-2">
          browse by race
        </Link>
        .
      </p>

      {levels.map(({ level, raceIds }) => (
        <section key={level} className="mt-8">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {level}
          </h2>
          <div className="mt-3 space-y-4">
            {raceIds.map((raceId) => {
              const race = raceById.get(raceId)!;
              const people = [...(byRace.get(raceId) ?? [])].sort((a, b) =>
                a.name.localeCompare(b.name),
              );
              return (
                <div key={raceId} className="border-2 border-border bg-card p-4">
                  <Link
                    href={`/races/${raceId.toLowerCase()}`}
                    className="font-bold underline decoration-2 underline-offset-2"
                  >
                    {race.office}
                  </Link>
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {people.map((c) => (
                      <li key={c.slug}>
                        <Link
                          href={`/candidates/${c.slug}`}
                          className="underline decoration-1 underline-offset-2 hover:decoration-2"
                        >
                          {c.name}
                        </Link>
                        {c.party ? (
                          <span className="ml-1 font-mono text-xs text-muted-foreground">
                            ({c.party[0]})
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
