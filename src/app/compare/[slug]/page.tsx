import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PartyBadge } from "@/components/guide/labels";
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
import { generalParty, generalPersonName } from "../../../../convex/lib/ballot";
import { PRIMARY_ARCHIVE } from "@/lib/election";
import { buildRaceBallot, compareDescription, compareIntro } from "@/lib/race-ballot";

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

      {navSections.length > 0 && <SectionNav sections={navSections} />}

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
        {compareIntro(ballot)}{" "}
        <Link href={`${PRIMARY_ARCHIVE.path}/races/${slug}`} className="underline decoration-2 underline-offset-2">
          See the August primary field
        </Link>
        .
      </p>
      <p className="mt-3">
        <Link
          href="/match"
          className="font-mono text-xs font-bold uppercase tracking-widest underline underline-offset-2"
        >
          Or start from the issues you care about →
        </Link>
      </p>

      {candidates.length < 2 ? null : totalOnRecord === 0 ? (
        <div className="mt-6 border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
          <p className="font-display text-lg">No sourced positions on record yet for these candidates.</p>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            When candidates publish positions we can source, they’ll appear here issue by issue. In the meantime,
            see each candidate’s page for background, finance, and coverage.
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
          <WhatThisMeans topic="stance-labels" />
          <WhatThisMeans topic="sourced-position-vs-claim" />
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
                        {generalPersonName(candidate)}
                      </Link>
                      <PartyBadge party={generalParty(candidate)} />
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
                <NoRecordLine candidates={issue.noRecord} />
              )}
            </section>
          ))}
        </div>
      )}

      <TrustBlock sources={candidateSources([], race.general)} updated={pageUpdated(race.general, race.dataAsOf)} />

      <div className="mt-6 flex flex-col gap-4">
        <ShareButton
          url={`${SITE_URL}/compare/${slug}`}
          title={`Compare the ${race.office} candidates — BadgerBrief`}
        />
      </div>
    </main>
  );
}

function NoRecordLine({
  candidates,
}: {
  candidates: { slug: string; name: string }[];
}) {
  const HEAD = 3;
  const rest = candidates.slice(HEAD);
  const links = candidates.map((c, i) => (
    <span key={c.slug}>
      {i > 0 ? ", " : ""}
      <Link
        href={`/candidates/${c.slug}`}
        className="underline underline-offset-2 hover:decoration-2"
      >
        {c.name}
      </Link>
    </span>
  ));

  // ≤3 names: no fold needed — show them inline, all linked.
  if (rest.length === 0) {
    return (
      <p className="mt-3 font-mono text-xs text-muted-foreground">
        No position on record: {links}
      </p>
    );
  }

  // >3: summary shows the first 3 names as plain text plus a "+N more" toggle
  // (plain text so the summary click toggles rather than following a link);
  // the expanded body lists every name as a link.
  return (
    <details className="mt-3">
      <summary className="cursor-pointer font-mono text-xs text-muted-foreground">
        No position on record: {candidates.slice(0, HEAD).map((c) => c.name).join(", ")}, +{rest.length} more
      </summary>
      <p className="mt-2 font-mono text-xs text-muted-foreground">{links}</p>
    </details>
  );
}
