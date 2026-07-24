import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { CandidateCard } from "@/components/guide/cards";
import { RaceFinanceTable } from "@/components/guide/finance";
import { InTheNews } from "@/components/guide/in-the-news";
import { LastUpdated } from "@/components/guide/labels";
import { RaceAdMoney } from "@/components/guide/race-ad-money";
import { RacePolls } from "@/components/guide/race-polls";
import { RaceTvAds } from "@/components/guide/race-tv-ads";
import {
  SectionNav,
  type NavSection,
} from "@/components/guide/section-nav";
import { SourceList } from "@/components/guide/sources";
import { isOnBallot, partySectionId } from "@/lib/ballot-status";
import {
  getAdMoneyForRace,
  getInTheNewsForRace,
  getPollsForRace,
  getRace,
  getTvAdsForRace,
  listRaces,
} from "@/lib/data";
import {
  JsonLd,
  faqNode,
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
  // "Wisconsin State Assembly — District 1" already says Wisconsin; appending
  // "Wisconsin 2026" made a 68-character title that said it three times and
  // truncated in results. The layout appends the brand, so the page supplies
  // only what distinguishes it.
  const office = data.race.office;
  const title = /wisconsin/i.test(office) ? `${office} — 2026` : `${office} — Wisconsin 2026`;

  // A description differentiated by the thing a voter is actually searching
  // for: who is on THIS ballot. 116 district pages sharing one template
  // sentence read as duplicates and tell the reader nothing. "Race ratings"
  // was also simply untrue for district races, which carry none.
  const onBallot = data.candidates.filter((c) => isOnBallot(c.status));
  const incumbent = onBallot.find((c) => c.incumbent);
  const named = onBallot
    .slice(0, 3)
    .map((c) => (c.party ? `${c.name} (${c.party[0]})` : c.name))
    .join(", ");
  const description = onBallot.length
    ? `${named}${onBallot.length > 3 ? ` and ${onBallot.length - 3} more` : ""} ${
        onBallot.length === 1 ? "is" : "are"
      } on the August 11, 2026 primary ballot for ${office}.${
        incumbent ? ` ${incumbent.name} is the incumbent.` : " Open seat."
      }`
    : `Candidates, campaign finance and sourced coverage for ${office} in the August 11, 2026 Wisconsin primary.`;

  return {
    title,
    description,
    alternates: { canonical: `/races/${slug}` },
    openGraph: { title, description, url: `/races/${slug}`, type: "profile" },
  };
}

/** On-ballot candidates in a compact 2-up grid; the rest in a collapsed fold. */
function CandidateGrid({ list }: { list: Doc<"candidates">[] }) {
  const onBallot = list.filter((c) => isOnBallot(c.status));
  const offBallot = list.filter((c) => !isOnBallot(c.status));
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {onBallot.map((c) => (
          <CandidateCard key={c.slug} candidate={c} variant="compact" />
        ))}
      </div>
      {offBallot.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Not on the Aug 11 ballot ({offBallot.length})
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {offBallot.map((c) => (
              <CandidateCard key={c.slug} candidate={c} variant="compact" />
            ))}
          </div>
        </details>
      )}
    </>
  );
}

export default async function RacePage({ params }: Props) {
  const { slug } = await params;
  const data = await getRace(slugToRaceId(slug));
  if (!data) notFound();
  const { race, candidates, finance } = data;
  const adMoney = await getAdMoneyForRace(slugToRaceId(slug));
  const tvAds = await getTvAdsForRace(slugToRaceId(slug));
  const inTheNews = await getInTheNewsForRace(race.raceId);
  const polls = await getPollsForRace(race.raceId);

  const parties = [
    ...new Set(candidates.map((c) => c.primaryParty).filter(Boolean)),
  ] as string[];
  const nonPartisan = candidates.filter((c) => !c.primaryParty);
  const onBallotCandidates = candidates.filter((c) => isOnBallot(c.status));

  const byParty = (party: string) =>
    candidates.filter((c) => c.primaryParty === party);
  const partyChipLabel = (party: string) =>
    party === "Democratic"
      ? "Democrats"
      : party === "Republican"
        ? "Republicans"
        : party;

  const navSections: NavSection[] = [
    ...parties.map((party) => ({
      id: partySectionId(party),
      label: partyChipLabel(party),
      count: byParty(party).filter((c) => isOnBallot(c.status)).length,
    })),
    ...(nonPartisan.length > 0
      ? [
          {
            id: "candidates",
            label: "Candidates",
            count: nonPartisan.filter((c) => isOnBallot(c.status)).length,
          },
        ]
      : []),
    ...(finance.length > 0 ? [{ id: "money", label: "The money" }] : []),
    ...(adMoney.candidates.length > 0 ? [{ id: "ad-money", label: "Ad money" }] : []),
    ...(tvAds.length > 0 ? [{ id: "tv-ads", label: "TV ads" }] : []),
    ...(polls.length > 0 ? [{ id: "polls", label: "Polls", count: polls.length }] : []),
    ...(inTheNews.length > 0
      ? [{ id: "news", label: "In the news", count: inTheNews.length }]
      : []),
    { id: "sources", label: "Sources" },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <SectionNav sections={navSections} />
      <JsonLd
        nodes={[
          organizationNode(),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: race.office, path: `/races/${slug}` },
          ]),
          // The page's own H1 is already the question a voter types, and the
          // answer is on the page. Stating that as FAQPage makes it extractable
          // by an answer engine instead of leaving it to be inferred from
          // prose — the single highest-leverage markup for "who is running
          // for X" queries, which is most of the traffic this guide exists to
          // serve. Answers are built from the same data the page renders, so
          // the markup can never drift from what a reader sees.
          faqNode(
            [
              {
                q: `Who is running for ${race.office} in 2026?`,
                a: onBallotCandidates.length
                  ? `${onBallotCandidates
                      .map((c) => (c.party ? `${c.name} (${c.party})` : c.name))
                      .join(", ")} ${onBallotCandidates.length === 1 ? "is" : "are"} on the ballot for ${race.office} in Wisconsin's partisan primary on ${race.primaryDate ?? "August 11, 2026"}.`
                  : "",
              },
              {
                q: `When is the primary for ${race.office}?`,
                a: `Wisconsin's partisan primary is ${race.primaryDate ?? "August 11, 2026"}. The general election is ${race.generalDate ?? "November 3, 2026"}.`,
              },
              ...(race.incumbent
                ? [
                    {
                      q: `Who currently holds ${race.office}?`,
                      a: `${race.incumbent} is the incumbent.`,
                    },
                  ]
                : []),
            ].filter((f) => f.a),
          ),
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
        <section
          key={party}
          id={partySectionId(party)}
          className="mt-8 scroll-mt-16"
        >
          <h2 className="font-display text-2xl">
            {/* Independents don't run in Wisconsin's partisan primary — they
                go straight to the Nov 3 general (MOO-314 launch check). */}
            {party === "Independent" ? "Independent — November general election only" : `${party} primary`}
          </h2>
          <CandidateGrid list={byParty(party)} />
        </section>
      ))}

      {nonPartisan.length > 0 && (
        <section id="candidates" className="mt-8 scroll-mt-16">
          <h2 className="font-display text-2xl">Candidates</h2>
          <CandidateGrid list={nonPartisan} />
        </section>
      )}

      {/* After the candidates, before the money: polls are about the same
          people the reader has just met. */}
      <RacePolls polls={polls} raceName={race.office} />

      <RaceFinanceTable finance={finance} candidates={candidates} />

      <RaceAdMoney data={adMoney} />

      <RaceTvAds ads={tvAds} />

      <InTheNews items={inTheNews} heading={`In the news about the ${race.office} race`} />

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

      <section id="sources" className="mt-10 scroll-mt-16 space-y-3">
        <SourceList sources={race.sources} />
        <LastUpdated date={race.dataAsOf} />
      </section>
    </main>
  );
}
