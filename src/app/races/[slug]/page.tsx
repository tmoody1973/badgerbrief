import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GeneralCandidateCard } from "@/components/guide/cards";
import { RaceFinanceTable } from "@/components/guide/finance";
import { InTheNews } from "@/components/guide/in-the-news";
import { LastUpdated } from "@/components/guide/labels";
import { RaceAdMoney } from "@/components/guide/race-ad-money";
import { RacePolls } from "@/components/guide/race-polls";
import { RaceTvAds } from "@/components/guide/race-tv-ads";
import { SectionNav, type NavSection } from "@/components/guide/section-nav";
import { SourceList } from "@/components/guide/sources";
import { WhatThisMeans } from "@/components/guide/what-this-means";
import { ShareButton } from "@/components/contribute/share-button";
import {
  getAdMoneyForRace,
  getInTheNewsForRace,
  getPollsForRace,
  getRace,
  getTvAdsForRace,
  listRaces,
} from "@/lib/data";
import { CURRENT_ELECTION, PRIMARY_ARCHIVE, formatIsoDate } from "@/lib/election";
import { JsonLd, breadcrumbNode, faqNode, organizationNode, personNode } from "@/lib/jsonld";
import { buildRaceBallot, countSentence, raceDescription, raceFaq } from "@/lib/race-ballot";
import { raceIdToSlug, slugToRaceId, SITE_URL } from "@/lib/site";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

const STATE_LIST = "Wisconsin Elections Commission — candidates on the November 3, 2026 ballot";
const linkClass = "font-bold underline decoration-2 underline-offset-2";

export async function generateStaticParams() {
  const races = await listRaces();
  return races.map((r) => ({ slug: raceIdToSlug(r.raceId) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getRace(slugToRaceId(slug));
  if (!data) return {};
  // "Wisconsin State Assembly — District 1" already says Wisconsin; the layout
  // appends the brand, so the page supplies only what distinguishes it.
  const office = data.race.office;
  const title = /wisconsin/i.test(office) ? `${office} — 2026` : `${office} — Wisconsin 2026`;
  const description = raceDescription(office, buildRaceBallot(data.race, data.candidates));
  return {
    title,
    description,
    alternates: { canonical: `/races/${slug}` },
    openGraph: { title, description, url: `/races/${slug}`, type: "profile" },
  };
}

export default async function RacePage({ params }: Props) {
  const { slug } = await params;
  const raceId = slugToRaceId(slug);
  const data = await getRace(raceId);
  if (!data) notFound();
  const { race, candidates, finance, financeBreakdowns } = data;

  const ballot = buildRaceBallot(race, candidates);
  const onBallot = ballot.kind === "contest" ? ballot.onBallot : [];
  const slugs = new Set(onBallot.map((c) => c.slug));
  const archiveHref = `${PRIMARY_ARCHIVE.path}/races/${slug}`;

  const [adMoneyAll, tvAds, inTheNews, pollsAll] = await Promise.all([
    getAdMoneyForRace(raceId),
    getTvAdsForRace(raceId),
    getInTheNewsForRace(race.raceId),
    getPollsForRace(race.raceId),
  ]);
  // The November page is about the November field. Rows for people who are not
  // on the ballot, and polls of the finished primary, live in the archive.
  const raceFinance = finance.filter((f) => slugs.has(f.candidateSlug));
  const raceBreakdowns = financeBreakdowns.filter((b) => slugs.has(b.candidateSlug));
  const adMoney = { ...adMoneyAll, candidates: adMoneyAll.candidates.filter((c) => slugs.has(c.slug)) };
  const polls = pollsAll.filter((p) => !/primary/i.test(p.pollType));

  const navSections: NavSection[] = [
    ...(onBallot.length > 0 ? [{ id: "candidates", label: "On the ballot", count: onBallot.length }] : []),
    ...(raceFinance.length > 0 ? [{ id: "money", label: "The money" }] : []),
    ...(adMoney.candidates.length > 0 ? [{ id: "ad-money", label: "Ad money" }] : []),
    ...(tvAds.length > 0 ? [{ id: "tv-ads", label: "TV ads" }] : []),
    ...(polls.length > 0 ? [{ id: "polls", label: "Polls", count: polls.length }] : []),
    ...(inTheNews.length > 0 ? [{ id: "news", label: "In the news", count: inTheNews.length }] : []),
    { id: "sources", label: "Sources" },
  ];

  const sources = race.general
    ? [{ name: STATE_LIST, url: race.general.source.url }, ...race.sources]
    : race.sources;

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
          // Answers are built from the same data the page renders, so the
          // markup cannot drift from what a reader sees.
          faqNode(raceFaq(race.office, ballot, race.incumbent)),
          ...onBallot.map(personNode),
        ]}
      />

      <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {race.level} · {CURRENT_ELECTION.name} · {CURRENT_ELECTION.shortDate}
      </p>

      {ballot.kind === "contest" && (
        <>
          <h1 className="font-display mt-2 text-3xl leading-tight sm:text-4xl">
            Who is on the ballot for {race.office} on November 3?
          </h1>
          <p className="mt-3 max-w-2xl text-lg">
            {countSentence(onBallot.length)}
            {ballot.uncontested && " No other candidate is on the ballot for this office."}{" "}
            {race.incumbent && <>Incumbent: {race.incumbent}.</>}{" "}
            {race.seatHeldBy && <>Seat held by {race.seatHeldBy}.</>}
          </p>
        </>
      )}

      {ballot.kind === "no-contest" && (
        <>
          <h1 className="font-display mt-2 text-3xl leading-tight sm:text-4xl">{race.office}</h1>
          <p className="mt-3 max-w-2xl text-lg">{ballot.note}</p>
          {ballot.runningMates.length > 0 && (
            <div className="mt-4 max-w-2xl">
              <p>
                On the ballot as running mates, on the{" "}
                <Link href="/races/wi-gov-2026" className={linkClass}>
                  Governor
                </Link>{" "}
                line:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {ballot.runningMates.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/candidates/${c.slug}`} className={linkClass}>
                      {c.name}
                    </Link>{" "}
                    — on the ticket &ldquo;{c.general?.ballotName}&rdquo;
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {ballot.kind === "not-loaded" && (
        <>
          <h1 className="font-display mt-2 text-3xl leading-tight sm:text-4xl">{race.office}</h1>
          <p className="mt-3 max-w-2xl text-lg">
            The {CURRENT_ELECTION.longDate} ballot for this office has not been loaded into the guide yet. For
            your own ballot, use{" "}
            <a href="https://myvote.wi.gov/en-us/Whats-On-My-Ballot" className={linkClass} rel="noopener noreferrer" target="_blank">
              MyVote Wisconsin
            </a>
            , the state&rsquo;s official system.
          </p>
        </>
      )}

      {(race.officeDescription || race.districtDescription || race.notes) && (
        <div className="mt-6 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
          <h2 className="font-display text-xl">Why this race matters</h2>
          {race.officeDescription && <p className="mt-2">{race.officeDescription}</p>}
          {race.districtDescription && <p className="mt-2">{race.districtDescription}</p>}
          {race.notes && <p className="mt-2">{race.notes}</p>}
        </div>
      )}

      {onBallot.length > 0 && (
        <section id="candidates" className="mt-8 scroll-mt-16">
          <h2 className="font-display text-2xl">On the November 3 ballot</h2>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            In the order the state lists them. Names and parties as printed on the ballot.
          </p>
          <WhatThisMeans topic="party-labels" />
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {onBallot.map((c) => (
              <GeneralCandidateCard key={c.slug} candidate={c} />
            ))}
          </div>
        </section>
      )}

      {ballot.hadPrimary && (
        <p className="mt-6 text-sm">
          <Link href={archiveHref} className={linkClass}>
            See everyone who ran in the {PRIMARY_ARCHIVE.label} →
          </Link>
        </p>
      )}

      {/* After the candidates, before the money: polls are about the same
          people the reader has just met. */}
      <RacePolls polls={polls} raceName={race.office} />

      <RaceFinanceTable finance={raceFinance} candidates={onBallot} breakdowns={raceBreakdowns} />

      <RaceAdMoney data={adMoney} />

      <RaceTvAds ads={tvAds} />

      <InTheNews items={inTheNews} heading={`In the news about the ${race.office} race`} />

      {onBallot.length > 1 && (
        <div className="mt-8">
          <Link
            href={`/compare/${slug}`}
            className="press inline-block border-2 border-border bg-secondary px-4 py-2 font-bold shadow-[var(--shadow-brutal)]"
          >
            Compare the {race.office} candidates →
          </Link>
        </div>
      )}

      <section id="sources" className="mt-10 scroll-mt-16 space-y-3">
        <SourceList sources={sources} />
        <LastUpdated date={race.general ? formatIsoDate(race.general.source.documentDate) : race.dataAsOf} />
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t-2 border-border pt-4">
        <p className="font-mono text-xs text-muted-foreground">
          <Link href={`/contribute?kind=data_gap&ref=${slug}`} className="underline-offset-2 hover:underline">
            Flag a gap
          </Link>
        </p>
        <ShareButton url={`${SITE_URL}/races/${slug}`} title={`${race.office} — BadgerBrief`} />
      </div>
    </main>
  );
}
