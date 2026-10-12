import type { Doc } from "../../../convex/_generated/dataModel";
import { CandidateCard } from "@/components/guide/cards";
import { hadAugustPrimary, partySectionId, primaryField, wasOnPrimaryBallot } from "@/lib/ballot-status";
import { PRIMARY_ARCHIVE } from "@/lib/election";

/** On-ballot candidates in a compact grid; the rest in a collapsed fold. */
function CandidateGrid({ list }: { list: Doc<"candidates">[] }) {
  const onBallot = list.filter((c) => wasOnPrimaryBallot(c.status));
  const offBallot = list.filter((c) => !wasOnPrimaryBallot(c.status));
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {onBallot.map((c) => (
          <CandidateCard key={c.slug} candidate={c} variant="compact" />
        ))}
      </div>
      {offBallot.length > 0 && (
        <details className="mt-3">
          {/* analytics-events.tsx matches the words "not on the aug" in this summary. */}
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

/** The race as it stood for the August 11, 2026 primary. */
export function PrimaryRaceView({ race, candidates }: { race: Doc<"races">; candidates: Doc<"candidates">[] }) {
  const field = primaryField(candidates);
  const parties = [...new Set(field.map((c) => c.primaryParty).filter(Boolean))] as string[];
  const nonPartisan = field.filter((c) => !c.primaryParty);
  const byParty = (party: string) => field.filter((c) => c.primaryParty === party);

  if (!hadAugustPrimary(race)) {
    return (
      <>
        <h1 className="font-display mt-2 text-3xl leading-tight sm:text-4xl">{race.office}</h1>
        <p className="mt-3 max-w-2xl text-lg">
          This office was not on the {PRIMARY_ARCHIVE.label} ballot. {race.general?.note}
        </p>
      </>
    );
  }

  return (
    <>
      <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {race.level} · Primary {race.primaryDate ?? PRIMARY_ARCHIVE.shortDate}
      </p>
      <h1 className="font-display mt-2 text-3xl leading-tight sm:text-4xl">
        Who ran for {race.office} in the {PRIMARY_ARCHIVE.label}?
      </h1>
      <p className="mt-3 max-w-2xl text-lg">
        {field.length === 1 ? "1 candidate was" : `${field.length} candidates were`} listed for this office.
      </p>
      {race.notes && <p className="mt-3 max-w-2xl">{race.notes}</p>}

      {parties.map((party) => (
        <section key={party} id={partySectionId(party)} className="mt-8 scroll-mt-16">
          <h2 className="font-display text-2xl">
            {party === "Independent" ? "Independent — did not run in the primary" : `${party} primary`}
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
    </>
  );
}
