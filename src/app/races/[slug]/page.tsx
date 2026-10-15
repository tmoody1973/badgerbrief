import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BallotContest, type Holds } from "@/components/guide/ballot-contest";
import { RaceQuestionnaire, questionnaireRows } from "@/components/guide/questionnaire";
import { RaceFinanceTable } from "@/components/guide/finance";
import { InTheNews } from "@/components/guide/in-the-news";
import { RaceAdMoney } from "@/components/guide/race-ad-money";
import { RacePolls } from "@/components/guide/race-polls";
import { RaceTvAds } from "@/components/guide/race-tv-ads";
import { SectionNav, type NavSection } from "@/components/guide/section-nav";
import { TrustBlock } from "@/components/guide/trust-block";
import { pageUpdated } from "@/lib/candidate-sources";
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
import { CURRENT_ELECTION, PRIMARY_ARCHIVE } from "@/lib/election";
import { JsonLd, breadcrumbNode, faqNode, organizationNode, personNode } from "@/lib/jsonld";
import {
  buildRaceBallot,
  countSentence,
  keepOnBallot,
  novemberAdMoney,
  novemberNotes,
  raceDescription,
  raceFaq,
  splitPolls,
} from "@/lib/race-ballot";
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
  // Lieutenant governor has no contest of its own, but its running mates
  // answered the questionnaire too.
  const questionnaireField = ballot.kind === "no-contest" ? ballot.runningMates : onBallot;
  const hasQuestionnaire = questionnaireRows(raceId, questionnaireField).length > 0;
  const archiveHref = `${PRIMARY_ARCHIVE.path}/races/${slug}`;

  const [adMoneyAll, tvAdsAll, inTheNewsAll, pollsAll] = await Promise.all([
    getAdMoneyForRace(raceId),
    getTvAdsForRace(raceId),
    getInTheNewsForRace(race.raceId),
    getPollsForRace(race.raceId),
  ]);
  // The November page is about the November field. Rows for people who are not
  // on the ballot, and polls that name anyone who is not, live in the archive.
  const raceFinance = finance.filter((f) => slugs.has(f.candidateSlug));
  const raceBreakdowns = financeBreakdowns.filter((b) => slugs.has(b.candidateSlug));
  const adMoney = novemberAdMoney(adMoneyAll, slugs);
  const tvAds = keepOnBallot(tvAdsAll, slugs);
  const notes = novemberNotes(race.notes);
  // Primary-season headlines live on the archive page for this race.
  const inTheNews = inTheNewsAll.filter((r) => !r.article.archive);
  const polls = splitPolls(pollsAll, slugs).november;

  // What the guide holds on each candidate, shown on their row in the contest.
  const answered = new Set(questionnaireRows(raceId, questionnaireField).filter((r) => r.status.status === "answered").map((r) => r.slug));
  const withMoney = new Set(raceFinance.map((f) => f.candidateSlug));
  const withAds = new Set([...(adMoney?.candidates ?? []).map((c) => c.slug), ...tvAds.flatMap((t) => (t.candidateSlug ? [t.candidateSlug] : []))]);
  const holds: Record<string, Holds> = Object.fromEntries(
    onBallot.map((c) => [c.slug, { questionnaire: answered.has(c.slug), money: withMoney.has(c.slug), ads: withAds.has(c.slug) }]),
  );
  const compareNoun = onBallot.some((c) => (c.general?.ballotName ?? "").includes("/")) ? "tickets" : "candidates";

  const navSections: NavSection[] = [
    ...(onBallot.length > 0 ? [{ id: "candidates", label: "On the ballot", count: onBallot.length }] : []),
    ...(hasQuestionnaire ? [{ id: "questionnaire", label: "Questionnaire" }] : []),
    ...(raceFinance.length > 0 ? [{ id: "money", label: "The money" }] : []),
    ...(adMoney && adMoney.candidates.length > 0 ? [{ id: "ad-money", label: "Ad money" }] : []),
    ...(tvAds.length > 0 ? [{ id: "tv-ads", label: "TV ads" }] : []),
    ...(polls.length > 0 ? [{ id: "polls", label: "Polls", count: polls.length }] : []),
    ...(inTheNews.length > 0 ? [{ id: "news", label: "In the news", count: inTheNews.length }] : []),
    { id: "sources", label: "Sources" },
  ];

  const sources = race.general
    ? [{ name: STATE_LIST, url: race.general.source.url }, ...race.sources]
    : race.sources;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-4 pb-10">
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

      <p className="mt-5 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {race.level} · {CURRENT_ELECTION.shortDate}
        {race.general && (
          <>
            {" · "}
            <a href={race.general.source.url} target="_blank" rel="noopener noreferrer" className="underline decoration-2 underline-offset-4 hover:text-foreground">
              Certified ballot ↗
            </a>
          </>
        )}
      </p>

      {ballot.kind === "contest" && (
        <>
          <h1 className="font-display mt-2 text-[clamp(2.25rem,8vw,3.5rem)] leading-[1.05] [text-wrap:balance]">{race.office}</h1>
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
          <h1 className="font-display mt-2 text-[clamp(2.25rem,8vw,3.5rem)] leading-[1.05] [text-wrap:balance]">{race.office}</h1>
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
          <h1 className="font-display mt-2 text-[clamp(2.25rem,8vw,3.5rem)] leading-[1.05] [text-wrap:balance]">{race.office}</h1>
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


      {onBallot.length > 0 && (
        <>
          <BallotContest
            candidates={onBallot}
            holds={holds}
            compare={onBallot.length > 1 ? { href: `/compare/${slug}`, label: `Compare these ${onBallot.length} ${compareNoun}` } : undefined}
          />
          <WhatThisMeans topic="party-labels" />
        </>
      )}

      {(race.officeDescription || race.districtDescription || notes) && (
        <div className="mt-8 max-w-2xl">
          <h2 className="font-display text-xl">Why this race matters</h2>
          {race.officeDescription && <p className="mt-2">{race.officeDescription}</p>}
          {race.districtDescription && <p className="mt-2">{race.districtDescription}</p>}
          {notes && <p className="mt-2">{notes}</p>}
        </div>
      )}

      <RaceQuestionnaire raceId={raceId} office={race.office} candidates={questionnaireField} />

      {ballot.hadPrimary && (
        <p className="mt-6 text-sm">
          <Link href={archiveHref} className={linkClass}>
            See everyone who ran in the {PRIMARY_ARCHIVE.label} →
          </Link>
        </p>
      )}


      <RaceFinanceTable finance={raceFinance} candidates={onBallot} breakdowns={raceBreakdowns} />

      {adMoney && <RaceAdMoney data={adMoney} />}

      <RaceTvAds ads={tvAds} names={Object.fromEntries(onBallot.map((c) => [c.slug, c.name]))} />

      {/* After the money: published polls, figures as printed, never averaged.
          A no-predictions guide does not lead with them (Tarik, 2026-10-14). */}
      <RacePolls polls={polls} raceName={race.office} />

      <InTheNews items={inTheNews} heading={`In the news about the ${race.office} race`} />


      <TrustBlock sources={sources} updated={pageUpdated(race.general, race.dataAsOf)} />

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
