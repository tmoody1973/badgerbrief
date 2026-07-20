import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { CandidatePhoto } from "@/components/guide/candidate-photo";
import { sourceLabel } from "@/lib/source-label";
import { FinancePanel } from "@/components/guide/finance";
import {
  LastUpdated,
  PartyBadge,
  StatusBadge,
} from "@/components/guide/labels";
import { SectionNav, type NavSection } from "@/components/guide/section-nav";
import { SourceList } from "@/components/guide/sources";
import { getCandidateBySlug, listCandidateSlugs } from "@/lib/data";
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
      <p className="text-sm">&ldquo;{quote.text}&rdquo;</p>
      <footer className="mt-2 font-mono text-xs text-muted-foreground">
        — {quote.speaker}, {quote.date} ·{" "}
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
  const data = await getCandidateBySlug(slug);
  if (!data) notFound();
  const { candidate, race, positions, quotes, finance, contributions, committeeFunding } = data;

  // Quotes past this point fold away — the section grows without bound as
  // extraction publishes more (MOO-330).
  const VISIBLE_QUOTES = 5;
  const shownQuotes = quotes.slice(0, VISIBLE_QUOTES);
  const foldedQuotes = quotes.slice(VISIBLE_QUOTES);

  const navSections: NavSection[] = [
    ...(candidate.background ? [{ id: "bio", label: "Background" }] : []),
    ...(candidate.keyPriorities?.length
      ? [{ id: "priorities", label: "Priorities" }]
      : []),
    ...(finance.length > 0 ? [{ id: "money", label: "The money" }] : []),
    ...(positions.length > 0
      ? [{ id: "positions", label: "Issues", count: positions.length }]
      : []),
    ...(quotes.length > 0
      ? [{ id: "quotes", label: "Quotes", count: quotes.length }]
      : []),
    { id: "sources", label: "Sources" },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
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

      {candidate.background && (
        <section id="bio" className="mt-6 scroll-mt-16 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
          <h2 className="font-display text-xl">
            Who is {candidate.name}?
          </h2>
          <p className="mt-2">{candidate.background}</p>
          {candidate.notes && (
            <p className="mt-2 text-sm text-muted-foreground">
              {candidate.notes}
            </p>
          )}
        </section>
      )}

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

      <FinancePanel
        totals={finance}
        contributions={contributions}
        committeeFunding={committeeFunding}
        candidateName={candidate.name}
      />

      {positions.length > 0 && (
        <section id="positions" className="mt-6 scroll-mt-16">
          <h2 className="font-display text-xl">
            Where does {candidate.name} stand on the issues?
          </h2>
          <div className="mt-3 space-y-3">
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
                <p className="mt-2 text-sm">{p.summary}</p>
                <SourceList sources={p.sources} title="Position sources" collapsible />
              </div>
            ))}
          </div>
        </section>
      )}

      {quotes.length > 0 && (
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
                Show all {quotes.length} quotes
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

      <section id="sources" className="mt-10 scroll-mt-16 space-y-3">
        <SourceList sources={candidate.sources} />
        <LastUpdated date={candidate.dataAsOf} />
      </section>
    </main>
  );
}
