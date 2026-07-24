import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { CandidatePhoto } from "@/components/guide/candidate-photo";
import { sourceLabel } from "@/lib/source-label";
import { CandidateAds } from "@/components/guide/candidate-ads";
import { FinanceDetail, FinanceSummary } from "@/components/guide/finance";
import {
  LastUpdated,
  PartyBadge,
  StatusBadge,
} from "@/components/guide/labels";
import { InTheNews } from "@/components/guide/in-the-news";
import { InterviewQuotes } from "@/components/guide/interview-quotes";
import { VotingRecord } from "@/components/guide/voting-record";
import { isInterviewQuote } from "@/lib/interview-quote";
import { SectionNav, type NavSection } from "@/components/guide/section-nav";
import { SourceList } from "@/components/guide/sources";
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
import { raceIdToSlug } from "@/lib/site";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const slugs = await listCandidateSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCandidateBySlug(slug);
  if (!data) return {};
  return {
    title: `${data.candidate.name} — ${data.race?.office ?? "Wisconsin 2026"}`,
    description: `${data.candidate.name}${data.candidate.party ? ` (${data.candidate.party})` : ""}: background, priorities, and sourced positions in the 2026 ${data.race?.office ?? "Wisconsin"} race.`,
    alternates: { canonical: `/candidates/${slug}` },
  };
}

function Quote({ quote }: { quote: Doc<"quote_published"> }) {
  return (
    <blockquote className="border-l-4 border-primary bg-card p-3">
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
  const { candidate, race, positions, quotes, finance, contributions, committeeFunding, ads, votingRecordSummary } = data;

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

  const navSections: NavSection[] = [
    ...(candidate.background ? [{ id: "bio", label: "Background" }] : []),
    ...(candidate.keyPriorities?.length
      ? [{ id: "priorities", label: "Priorities" }]
      : []),
    ...(finance.length > 0 ? [{ id: "money", label: "The money" }] : []),
    ...(ads.length > 0 ? [{ id: "ads", label: "The ads", count: ads.length }] : []),
    ...(positions.length > 0
      ? [{ id: "positions", label: "Issues", count: positions.length }]
      : []),
    ...(interviewQuotes.length > 0
      ? [{ id: "interview", label: "The interview", count: interviewQuotes.length }]
      : []),
    ...(otherQuotes.length > 0
      ? [{ id: "quotes", label: "Quotes", count: otherQuotes.length }]
      : []),
    ...(votingRecordSummary
      ? [{ id: "votes", label: "Voting record", count: votingRecordSummary.total }]
      : []),
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

      {race && (
        <Link
          href={`/races/${raceIdToSlug(race.raceId)}`}
          className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground underline-offset-2 hover:underline"
        >
          ← {race.office}
        </Link>
      )}
      <div className="mt-2 flex items-start gap-4">
        <CandidatePhoto
          photoUrl={candidate.photoUrl}
          photoSource={candidate.photoSource}
          name={candidate.name}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl leading-tight sm:text-4xl">
              {candidate.name}
            </h1>
            <PartyBadge party={candidate.party} />
            <StatusBadge status={candidate.status} />
            {candidate.incumbent && (
              <span className="border-2 border-border bg-secondary px-2 py-0.5 font-mono text-xs font-bold uppercase">
                Incumbent
              </span>
            )}
          </div>
          {candidate.currentOccupation &&
            candidate.currentOccupation !== "Unknown" && (
              <p className="mt-1 text-lg text-muted-foreground">
                {candidate.currentOccupation}
              </p>
            )}
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 lg:col-span-8">
        {candidate.background && (
          <section id="bio" className="mt-6 scroll-mt-16 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
            <h2 className="font-display text-xl">
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
          <section id="positions" className="mt-6 scroll-mt-16">
            <h2 className="font-display text-xl">
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
                    <span className="border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase">
                      {p.stance}
                    </span>
                  </div>
                  <p className="mt-2 max-w-[54ch] text-sm">{p.summary}</p>
                  <SourceList sources={p.sources} title="Position sources" collapsible />
                </div>
              ))}
            </div>
          </section>
        )}

        <InterviewQuotes quotes={interviewQuotes} candidateName={candidate.name} />

        {votingRecordSummary && (
          <VotingRecord
            summary={votingRecordSummary}
            candidateSlug={candidate.slug}
            candidateName={candidate.name}
          />
        )}

        {otherQuotes.length > 0 && (
          <section id="quotes" className="mt-6 scroll-mt-16">
            <h2 className="font-display text-xl">In their own words</h2>
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
          <FinanceDetail
            totals={finance}
            contributions={contributions}
            committeeFunding={committeeFunding}
          />

          <CandidateAds ads={ads} candidateName={candidate.name} enrichedKeys={enrichedKeys} />

          <InTheNews items={inTheNews} heading={`In the news about ${candidate.name}`} />

          <section id="sources" className="mt-10 scroll-mt-16 space-y-3">
            <SourceList sources={candidate.sources} />
            <LastUpdated date={candidate.dataAsOf} />
          </section>
        </div>

        {/* Reference rail (MOO-331): at-a-glance facts that otherwise
            interrupt the reading flow. Sticky below the section nav. */}
        <aside className="lg:col-span-4 lg:sticky lg:top-20 lg:self-start">
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
            <ul className="mt-3 space-y-2">
              {candidate.keyPriorities.map((p) => (
                <li
                  key={p}
                  className="border-2 border-border bg-secondary p-2 text-sm font-medium"
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
      </div>

    </main>
  );
}
