import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { CandidatePhoto } from "@/components/guide/candidate-photo";
import { sourceLabel } from "@/lib/source-label";
import { CandidateAds } from "@/components/guide/candidate-ads";
import { FinanceDetail, FinanceSummary } from "@/components/guide/finance";
import { FinanceBreakdownSection } from "@/components/guide/financeBreakdown";
import { DonorRosterSection } from "@/components/guide/donorRoster";
import {
  PartyBadge,
  StatusBadge,
} from "@/components/guide/labels";
import { InTheNews } from "@/components/guide/in-the-news";
import { InterviewQuotes } from "@/components/guide/interview-quotes";
import { BallotContext } from "@/components/guide/ballot-context";
import { VotingRecord } from "@/components/guide/voting-record";
import { VotingRecordByIssue } from "@/components/guide/voting-record-by-issue";
import { WhatThisMeans } from "@/components/guide/what-this-means";
import { CandidateQuestionnaire, questionnaireRows } from "@/components/guide/questionnaire";
import { isInterviewQuote } from "@/lib/interview-quote";
import { SectionNav, type NavSection } from "@/components/guide/section-nav";
import { SourceList } from "@/components/guide/sources";
import { TrustBlock } from "@/components/guide/trust-block";
import { candidateSources, pageUpdated } from "@/lib/candidate-sources";
import { ShareButton } from "@/components/contribute/share-button";
import {
  getCandidateBySlug,
  getEnrichedSponsorKeys,
  getInTheNewsForCandidate,
  listCandidateSlugs,
} from "@/lib/data";
import {
  JsonLd,
  breadcrumbNode,
  organizationNode,
  personNode,
} from "@/lib/jsonld";
import { raceIdToSlug, SITE_URL } from "@/lib/site";
import { generalParty, generalPersonName, isOnGeneralBallot } from "../../../../convex/lib/ballot";
import { hadAugustPrimary } from "@/lib/ballot-status";
import { candidateDescription } from "@/lib/candidate-ballot";

export const revalidate = 300;

/**
 * The candidate with the name and party the state prints. "Names always come
 * from the state" (design section 3); the page address never changes.
 */
function asPrinted<C extends { name: string; party?: string; general?: { ballotName?: string; party?: string } }>(c: C): C {
  return { ...c, name: generalPersonName(c), party: generalParty(c) };
}

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const slugs = await listCandidateSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCandidateBySlug(slug);
  if (!data) return {};
  const { race } = data;
  const candidate = asPrinted(data.candidate);
  const office = race?.office ?? "Wisconsin 2026";
  const title = `${candidate.name} — ${office}`;

  // Describe what this page ACTUALLY holds. The old text promised
  // "background, priorities, and sourced positions" on every candidate,
  // including the ~220 newly imported ones that have none of those — a
  // description that oversells is both a duplicate-content signal and a
  // promise the click does not keep.
  const has = [
    data.positions?.length ? "published positions" : null,
    data.votingRecordSummary?.total ? "voting record" : null,
    data.finance?.length ? "campaign finance" : null,
    data.quotes?.length ? "quotes" : null,
  ].filter(Boolean) as string[];

  const description = candidateDescription({
    who: `${candidate.name}${candidate.party ? ` (${candidate.party})` : ""}`,
    office,
    onBallot: isOnGeneralBallot(candidate),
    incumbent: Boolean(candidate.incumbent),
    has,
    hadPrimary: hadAugustPrimary(race ?? {}),
    raceNote: race?.general?.note,
    // A running mate is on the ballot through a governor ticket, not a contest of their own.
    ticket: race?.general?.onBallot === false ? candidate.general?.ballotName : undefined,
  });

  return {
    title,
    description,
    alternates: { canonical: `/candidates/${slug}` },
    openGraph: { title, description, url: `/candidates/${slug}`, type: "profile" },
  };
}

function Quote({ quote }: { quote: Doc<"quote_published"> }) {
  return (
    <blockquote className="border-l-2 border-border pl-4">
      <p className="max-w-[54ch] text-sm">&ldquo;{quote.text}&rdquo;</p>
      <footer className="mt-2 font-mono text-xs text-muted-foreground">
        {/* A campaign-site quote often has no publication date. Show the
            separator only when there is a date to separate. */}
        — {quote.speaker}{quote.date ? `, ${quote.date}` : ""} ·{" "}
        <a
          href={quote.sourceUrl}
          className="underline"
          rel="noopener noreferrer"
          target="_blank"
        >
          {sourceLabel(quote.sourceUrl, quote.outlet)}
        </a>
      </footer>
    </blockquote>
  );
}

export default async function CandidatePage({ params }: Props) {
  const { slug } = await params;
  const [data, enrichedKeys, inTheNews] = await Promise.all([
    getCandidateBySlug(slug),
    getEnrichedSponsorKeys(),
    getInTheNewsForCandidate(slug),
  ]);
  if (!data) notFound();
  const { race, field, positions, quotes, finance, contributions, committeeFunding, ads, votingRecordSummary, financeBreakdowns } = data;
  const candidate = asPrinted(data.candidate);

  // WisconsinEye interview answers get their own section: every candidate in
  // the race sat for the same interview, so the answers are comparable across
  // the field. Mixing them into the general quote list would throw that away
  // and bury a whole sit-down under article one-liners.
  const interviewQuotes = quotes.filter(isInterviewQuote);
  const otherQuotes = quotes.filter((q) => !isInterviewQuote(q));

  // Quotes past this point fold away — the section grows without bound as
  // extraction publishes more (MOO-330).
  const VISIBLE_QUOTES = 5;
  const shownQuotes = otherQuotes.slice(0, VISIBLE_QUOTES);
  const foldedQuotes = otherQuotes.slice(VISIBLE_QUOTES);

  // In page order. The ballot, background and priorities sit on the first
  // screens, so they need no chip (Phase 1b critique: 12 chips, out of order).
  const navSections: NavSection[] = [
    ...(finance.length > 0 ? [{ id: "money", label: "The money" }] : []),
    ...(positions.length > 0
      ? [{ id: "positions", label: "Issues", count: positions.length }]
      : []),
    ...(interviewQuotes.length > 0
      ? [{ id: "interview", label: "The interview", count: interviewQuotes.length }]
      : []),
    ...(votingRecordSummary
      ? [{ id: "votes", label: "Voting record", count: votingRecordSummary.total }]
      : []),
    ...(questionnaireRows(candidate.raceId, [candidate]).length > 0
      ? [{ id: "questionnaire", label: "Questionnaire" }]
      : []),
    ...(otherQuotes.length > 0
      ? [{ id: "quotes", label: "Quotes", count: otherQuotes.length }]
      : []),
    ...(ads.length > 0 ? [{ id: "ads", label: "The ads", count: ads.length }] : []),
    ...(inTheNews.length > 0
      ? [{ id: "news", label: "In the news", count: inTheNews.length }]
      : []),
    { id: "sources", label: "Sources" },
  ];


  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 lg:max-w-6xl">
      <SectionNav sections={navSections} />
      <JsonLd
        nodes={[
          organizationNode(),
          personNode(candidate),
          breadcrumbNode([
            { name: "Home", path: "/" },
            ...(race
              ? [
                  {
                    name: race.office,
                    path: `/races/${raceIdToSlug(race.raceId)}`,
                  },
                ]
              : []),
            { name: candidate.name, path: `/candidates/${slug}` },
          ]),
        ]}
      />

      {/* Stamp line, as on the race page: where this sits and the state's file. */}
      <p className="flex flex-wrap items-center gap-x-5 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {race && (
          <Link
            href={`/races/${raceIdToSlug(race.raceId)}`}
            className="inline-flex min-h-11 items-center underline decoration-2 underline-offset-4 hover:text-foreground"
          >
            <span aria-hidden="true">←&nbsp;</span>
            {race.office}
          </Link>
        )}
        {candidate.general && (
          <>
            <a
              href={candidate.general.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center underline decoration-2 underline-offset-4 hover:text-foreground"
            >
              Certified ballot<span aria-hidden="true">&nbsp;↗</span>
            </a>
          </>
        )}
      </p>
      <div className="mt-1 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[clamp(2.25rem,8vw,3.5rem)] leading-[1.05] [text-wrap:balance]">
            {candidate.name}
          </h1>
          {/* A governor ticket prints both names; say so where the name is. */}
          {candidate.general?.ballotName && candidate.general.ballotName !== candidate.name && (
            <p className="mt-2 text-lg">
              On the ballot as <strong>{candidate.general.ballotName}</strong>
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <PartyBadge party={candidate.party} />
            <StatusBadge status={candidate.status} />
            {!isOnGeneralBallot(candidate) && (
              <span className="border-2 border-border bg-muted px-2 py-0.5 font-mono text-xs font-bold uppercase">
                Not on the Nov 3 ballot
              </span>
            )}
            {candidate.incumbent && (
              <span className="border-2 border-border bg-secondary px-2 py-0.5 font-mono text-xs font-bold uppercase">
                Incumbent
              </span>
            )}
          </div>
          {candidate.currentOccupation && candidate.currentOccupation !== "Unknown" && (
            <p className="mt-2 text-muted-foreground">{candidate.currentOccupation}</p>
          )}
        </div>
        <CandidatePhoto
          photoUrl={candidate.photoUrl}
          photoSource={candidate.photoSource}
          name={candidate.name}
        />
      </div>

      {/* Reading order = visual order at every width: the ballot, then the
          quick facts (money, priorities), then the record. On a laptop the
          facts become a sticky rail beside the record. */}
      <div className="lg:grid lg:grid-cols-12 lg:gap-x-8">
        <div className="min-w-0 lg:col-span-8 lg:row-start-1">
        {race && (
          <BallotContext
            candidateSlug={candidate.slug}
            candidateName={candidate.name}
            raceId={race.raceId}
            raceOffice={race.office}
            raceOnBallot={race.general?.onBallot}
            raceNote={race.general?.note}
            hadPrimary={hadAugustPrimary(race)}
            opponents={field}
          />
        )}
        {candidate.party && <WhatThisMeans topic="party-labels" />}
        </div>

        <aside className="lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-20 lg:self-start">
          <FinanceSummary
            totals={finance}
            candidateName={candidate.name}
            layout="rail"
          />
        {candidate.keyPriorities && candidate.keyPriorities.length > 0 && (
          <section id="priorities" className="mt-6 scroll-mt-16">
            <h2 className="font-display text-xl">
              What does {candidate.name} say their priorities are?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              As stated by the campaign — these are candidate claims, not
              BadgerBrief analysis.
            </p>
            <ul className="mt-3 border-y-2 border-border">
              {candidate.keyPriorities.map((p) => (
                <li
                  key={p}
                  className="border-b-2 border-dashed border-border py-2 text-sm font-medium last:border-b-0"
                >
                  {p}
                </li>
              ))}
            </ul>
          </section>
        )}

        {candidate.notableEndorsements &&
          candidate.notableEndorsements.length > 0 && (
            <section className="mt-6">
              <h2 className="font-display text-xl">Notable endorsements</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {candidate.notableEndorsements.map((e) => (
                  <li
                    key={e}
                    className="border border-border bg-card px-2 py-1 text-sm"
                  >
                    {e}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>

        <div className="flex min-w-0 flex-col lg:col-span-8 lg:row-start-2">

        {candidate.background && (
          <section id="bio" className="mt-8 scroll-mt-16">
            <h2 className="font-display text-2xl">
              Who is {candidate.name}?
            </h2>
            <p className="mt-2 max-w-[54ch]">{candidate.background}</p>
            {candidate.notes && (
              <p className="mt-2 max-w-[54ch] text-sm text-muted-foreground">
                {candidate.notes}
              </p>
            )}
          </section>
        )}

        {positions.length > 0 && (
          <section id="positions" className="mt-8 scroll-mt-16">
            <h2 className="font-display text-2xl">
              Where does {candidate.name} stand on the issues?
            </h2>
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {positions.map((p) => (
                <div
                  key={p._id}
                  className="border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold uppercase tracking-widest">
                      {p.issueSlug}
                    </span>
                    <span className="border border-border bg-muted px-1.5 py-0.5 font-mono text-xs font-bold uppercase">
                      {p.stance}
                    </span>
                  </div>
                  <p className="mt-2 max-w-[54ch] text-sm">{p.summary}</p>
                  <SourceList sources={p.sources} title="Position sources" collapsible />
                </div>
              ))}
            </div>
            <WhatThisMeans topic="stance-labels" className="mt-3" />
            <WhatThisMeans topic="sourced-position-vs-claim" />
          </section>
        )}

        <InterviewQuotes quotes={interviewQuotes} candidateName={candidate.name} />

        {votingRecordSummary && (
          <>
            <WhatThisMeans topic="voting-record" className="mt-6" />
            <VotingRecord
              summary={votingRecordSummary}
              candidateSlug={candidate.slug}
              candidateName={candidate.name}
            />
            <VotingRecordByIssue candidateSlug={candidate.slug} raceId={candidate.raceId} />
          </>
        )}

        <CandidateQuestionnaire raceId={candidate.raceId} candidate={candidate} />

        {otherQuotes.length > 0 && (
          <section id="quotes" className="mt-6 scroll-mt-16">
            <h2 className="font-display text-2xl">In their own words</h2>
            <div className="mt-3 space-y-3">
              {shownQuotes.map((q) => (
                <Quote key={q._id} quote={q} />
              ))}
            </div>
            {foldedQuotes.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Show all {otherQuotes.length} quotes
                </summary>
                <div className="mt-3 space-y-3">
                  {foldedQuotes.map((q) => (
                    <Quote key={q._id} quote={q} />
                  ))}
                </div>
              </details>
            )}
          </section>
        )}

          {/* Contributor + PAC tables stay in the main column — too tall
              for a sticky rail (MOO-331). */}
          {finance.length > 0 && <WhatThisMeans topic="campaign-finance" />}
          <FinanceDetail
            totals={finance}
            contributions={contributions}
            committeeFunding={committeeFunding}
          />
          <FinanceBreakdownSection
            breakdown={financeBreakdowns?.find((b) => b.source === "sunshine")}
          />
          <DonorRosterSection
            raceId={candidate.raceId}
            candidateSlug={candidate.slug}
            breakdown={financeBreakdowns?.find((b) => b.source === "sunshine")}
          />

          <CandidateAds ads={ads} candidateName={candidate.name} enrichedKeys={enrichedKeys} />

          <InTheNews items={inTheNews} heading={`In the news about ${candidate.name}`} />

          <TrustBlock sources={candidateSources(candidate.sources, candidate.general)} updated={pageUpdated(candidate.general, candidate.dataAsOf)} />

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t-2 border-border pt-4">
            <p className="font-mono text-xs text-muted-foreground">
              <Link
                href={`/contribute?kind=suggest_source&ref=${candidate.slug}`}
                className="underline-offset-2 hover:underline"
              >
                Suggest a source
              </Link>
              {" · "}
              <Link
                href={`/contribute?kind=data_gap&ref=${candidate.slug}`}
                className="underline-offset-2 hover:underline"
              >
                Flag a gap
              </Link>
            </p>
            <ShareButton
              url={`${SITE_URL}/candidates/${candidate.slug}`}
              title={`${candidate.name} — BadgerBrief`}
            />
          </div>
        </div>

      </div>

    </main>
  );
}
