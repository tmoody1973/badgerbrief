import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LastUpdated, PartyBadge } from "@/components/guide/labels";
import { SectionNav, type NavSection } from "@/components/guide/section-nav";
import { SourceList } from "@/components/guide/sources";
import { buildIssueComparison } from "@/lib/compare";
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
    description: `Where the ${data.candidates.length} candidates for ${data.race.office} stand, issue by issue — every stance linked to its source.`,
    alternates: { canonical: `/compare/${slug}` },
  };
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;
  const data = await getRace(slugToRaceId(slug));
  if (!data || data.candidates.length === 0) notFound();
  const { race, candidates, positions } = data;
  const { issues, totalOnRecord } = buildIssueComparison(candidates, positions);

  const navSections: NavSection[] = issues.map((i) => ({
    id: i.issueSlug,
    label: i.label,
    count: i.onRecord.length,
  }));

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

      {totalOnRecord > 0 && <SectionNav sections={navSections} />}

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
        The {candidates.length} candidates side by side, issue by issue. Every
        stance is a sourced summary — follow the source links to read it in
        context. This is not a ranking or endorsement.
      </p>

      {totalOnRecord === 0 ? (
        <div className="mt-6 border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
          <p className="font-display text-lg">
            No sourced positions on record yet for these candidates.
          </p>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            When candidates publish positions we can source, they&apos;ll appear
            here issue by issue. In the meantime, see each candidate&apos;s page
            for background, finance, and coverage.
          </p>
          <Link
            href={`/races/${slug}`}
            className="mt-4 inline-block font-mono text-xs font-bold uppercase tracking-widest underline underline-offset-2"
          >
            ← Back to {race.office}
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-10">
          {issues.map((issue) => (
            <section key={issue.issueSlug} id={issue.issueSlug} className="scroll-mt-16">
              <h2 className="font-display text-2xl">{issue.label}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {issue.onRecord.map(({ candidate, position }) => (
                  <div
                    key={candidate.slug}
                    className="flex flex-col border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/candidates/${candidate.slug}`}
                        className="font-bold underline decoration-2 underline-offset-2"
                      >
                        {candidate.name}
                      </Link>
                      <PartyBadge party={candidate.party} />
                      {candidate.incumbent && (
                        <span className="border border-border bg-secondary px-1 font-mono text-[10px] font-bold uppercase">
                          Inc.
                        </span>
                      )}
                    </div>
                    <span className="mt-2 w-fit border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase">
                      {position.stance}
                    </span>
                    <p className="mt-2 max-w-[54ch] text-sm">{position.summary}</p>
                    <div className="mt-auto pt-2">
                      <SourceList sources={position.sources} title="Position sources" collapsible />
                    </div>
                  </div>
                ))}
              </div>
              {issue.noRecord.length > 0 && (
                <NoRecordLine names={issue.noRecord.map((c) => c.name)} />
              )}
            </section>
          ))}
        </div>
      )}

      <div className="mt-10">
        <LastUpdated date={race.dataAsOf} />
      </div>
    </main>
  );
}

function NoRecordLine({ names }: { names: string[] }) {
  const HEAD = 3;
  const head = names.slice(0, HEAD);
  const rest = names.slice(HEAD);
  return (
    <p className="mt-3 font-mono text-xs text-muted-foreground">
      No position on record: {head.join(", ")}
      {rest.length > 0 && (
        <>
          {", "}
          <span className="whitespace-nowrap">+{rest.length} more</span>
          {/* full list stays in the DOM for scanners/screen readers */}
          <span className="sr-only"> — {rest.join(", ")}</span>
        </>
      )}
    </p>
  );
}
