import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidatePhoto } from "@/components/guide/candidate-photo";
import { sourceLabel } from "@/lib/source-label";
import { FinancePanel } from "@/components/guide/finance";
import {
  LastUpdated,
  PartyBadge,
  StatusBadge,
} from "@/components/guide/labels";
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

export default async function CandidatePage({ params }: Props) {
  const { slug } = await params;
  const data = await getCandidateBySlug(slug);
  if (!data) notFound();
  const { candidate, race, positions, quotes, finance, contributions, committeeFunding } = data;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
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
        <section className="mt-6 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
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
        <section className="mt-6">
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
        <section className="mt-6">
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
                <SourceList sources={p.sources} title="Position sources" />
              </div>
            ))}
          </div>
        </section>
      )}

      {quotes.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-xl">In their own words</h2>
          <div className="mt-3 space-y-3">
            {quotes.map((q) => (
              <blockquote
                key={q._id}
                className="border-l-4 border-primary bg-card p-3"
              >
                <p className="text-sm">&ldquo;{q.text}&rdquo;</p>
                <footer className="mt-2 font-mono text-xs text-muted-foreground">
                  — {q.speaker}, {q.date} ·{" "}
                  <a
                    href={q.sourceUrl}
                    className="underline"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {sourceLabel(q.sourceUrl, q.outlet)}
                  </a>
                </footer>
              </blockquote>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10 space-y-3">
        <SourceList sources={candidate.sources} />
        <LastUpdated date={candidate.dataAsOf} />
      </div>
    </main>
  );
}
