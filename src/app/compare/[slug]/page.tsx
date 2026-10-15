import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BallotContest } from "@/components/guide/ballot-contest";
import { SectionNav, type NavSection } from "@/components/guide/section-nav";
import { SourceList } from "@/components/guide/sources";
import { TrustBlock } from "@/components/guide/trust-block";
import { candidateSources, pageUpdated } from "@/lib/candidate-sources";
import { WhatThisMeans } from "@/components/guide/what-this-means";
import { ShareButton } from "@/components/contribute/share-button";
import { buildIssueComparison } from "@/lib/compare";
import { getRace, listRaces } from "@/lib/data";
import { JsonLd, breadcrumbNode, organizationNode } from "@/lib/jsonld";
import { SITE_URL, raceIdToSlug, slugToRaceId } from "@/lib/site";
import { generalPersonName } from "../../../../convex/lib/ballot";
import { PRIMARY_ARCHIVE } from "@/lib/election";
import { buildRaceBallot, compareDescription, compareIntro } from "@/lib/race-ballot";

export const revalidate = 300;

/** Side by side only while the columns stay readable; 4+ stack in ballot order. */
const COLS: Record<number, string> = {
  2: "sm:grid-cols-2 sm:divide-x-2 sm:divide-y-0",
  3: "lg:grid-cols-3 lg:divide-x-2 lg:divide-y-0",
};

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
    description: compareDescription(data.race.office, buildRaceBallot(data.race, data.candidates)),
    alternates: { canonical: `/compare/${slug}` },
  };
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;
  const data = await getRace(slugToRaceId(slug));
  if (!data) notFound();
  const { race } = data;
  // Running mates on a governor ticket are on the ballot, but they are not a
  // contest to compare: only a real November contest fills this page.
  const ballot = buildRaceBallot(race, data.candidates);
  const candidates = ballot.kind === "contest" ? ballot.onBallot : [];
  const onBallot = new Set(candidates.map((c) => c.slug));
  const positions = data.positions.filter((p) => onBallot.has(p.candidateSlug));
  const { issues, totalOnRecord } = buildIssueComparison(candidates, positions);

  const orderOf = new Map(candidates.map((c, i) => [c.slug, c.general?.ballotOrder ?? i + 1]));

  const navSections: NavSection[] = issues.map((i) => ({
    id: i.issueSlug,
    label: i.label,
    count: i.onRecord.length,
  }));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-4 pb-10">
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

      {navSections.length > 0 && <SectionNav sections={navSections} />}

      {/* Stamp line, as on the race and candidate pages. */}
      <p className="mt-5 flex flex-wrap gap-x-5 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        <Link href={`/races/${slug}`} className="inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline">
          ← Race page
        </Link>
        {race.general && (
          <a href={race.general.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline decoration-2 underline-offset-4 hover:text-foreground">
            Certified ballot ↗
          </a>
        )}
      </p>
      <h1 className="font-display mt-1 text-[clamp(2.25rem,8vw,3.5rem)] leading-[1.05] [text-wrap:balance]">
        {race.office}
      </h1>
      <p className="mt-3 max-w-2xl">{compareIntro(ballot, totalOnRecord)}</p>
      <p>
        <Link href="/match" className="inline-flex min-h-11 items-center font-mono text-xs font-bold uppercase tracking-widest underline underline-offset-2">
          Or start from the issues you care about →
        </Link>
      </p>

      {/* The contest as printed: names the field even when nobody has a
          position on record, and its numbers key the columns below. */}
      {candidates.length > 0 && <BallotContest candidates={candidates} />}
      {ballot.hadPrimary && (
        <p className="mt-2 text-sm">
          <Link href={`${PRIMARY_ARCHIVE.path}/races/${slug}`} className="inline-flex min-h-11 items-center underline decoration-2 underline-offset-2">
            See everyone who ran in the {PRIMARY_ARCHIVE.label} →
          </Link>
        </p>
      )}

      {candidates.length > 1 && totalOnRecord > 0 && (
        <div className="mt-10 space-y-10">
          {issues.map((issue) => (
            <section key={issue.issueSlug} id={issue.issueSlug} className="scroll-mt-16">
              <h2 className="font-display text-2xl">{issue.label}</h2>
              {/* One unit per issue. Each candidate keeps the same slot in
                  ballot order, filled or not, so a column never changes owner. */}
              <div className={`mt-3 grid divide-y-2 divide-dashed divide-border border-2 border-border bg-card shadow-[var(--shadow-brutal)] ${COLS[issue.cells.length] ?? ""}`}>
                {issue.cells.map(({ candidate, position }) => (
                  <div key={candidate.slug} className="flex flex-col px-4 py-3">
                    <p className="flex items-baseline gap-2">
                      <span aria-hidden="true" className="font-display w-5 text-xl leading-none text-muted-foreground tabular-nums">
                        {orderOf.get(candidate.slug)}
                      </span>
                      <Link href={`/candidates/${candidate.slug}`} className="tap font-bold underline decoration-2 underline-offset-2">
                        {generalPersonName(candidate)}
                      </Link>
                    </p>
                    {position ? (
                      <>
                        <p className="mt-2 font-mono text-xs font-bold uppercase tracking-widest">Stance · {position.stance}</p>
                        <p className="mt-1 max-w-[54ch] text-sm leading-relaxed">{position.summary}</p>
                        <div className="mt-auto pt-2">
                          <SourceList sources={position.sources} title="Position sources" collapsible />
                        </div>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">No sourced position on record.</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
          <div>
            <WhatThisMeans topic="stance-labels" />
            <WhatThisMeans topic="sourced-position-vs-claim" />
          </div>
        </div>
      )}

      <TrustBlock sources={candidateSources([], race.general)} updated={pageUpdated(race.general, race.dataAsOf)} />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t-2 border-border pt-4">
        <p className="font-mono text-xs text-muted-foreground">
          <Link href={`/contribute?kind=data_gap&ref=${slug}`} className="tap underline-offset-2 hover:underline">
            Flag a gap
          </Link>
        </p>
        <ShareButton url={`${SITE_URL}/compare/${slug}`} title={`Compare the ${race.office} candidates — BadgerBrief`} />
      </div>
    </main>
  );
}
