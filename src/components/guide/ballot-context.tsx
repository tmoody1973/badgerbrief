import Link from "next/link";
import { ballotSummary, type FieldEntry } from "@/lib/candidate-ballot";
import { PRIMARY_ARCHIVE } from "@/lib/election";
import { raceIdToSlug } from "@/lib/site";

/**
 * The race a candidate is in on Nov 3, 2026, and who else is on that ballot.
 *
 * WHY THIS EXISTS. Most candidate pages carry only a name and a party. What a
 * voter arrives asking is "who am I choosing between?", and that is answerable
 * for every candidate from the state's list. It also links the incumbent's
 * voting record, which a challenger's page is exactly where a voter wants.
 */
const meta = "font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground";
const linkClass = "underline decoration-2 underline-offset-2";

export function BallotContext({
  candidateSlug,
  candidateName,
  raceId,
  raceOffice,
  raceOnBallot,
  raceNote,
  opponents,
}: {
  candidateSlug: string;
  candidateName: string;
  raceId: string;
  raceOffice: string;
  /** undefined when the race's November facts are not loaded. */
  raceOnBallot?: boolean;
  raceNote?: string;
  opponents: FieldEntry[];
}) {
  const me = opponents.find((o) => o.slug === candidateSlug);
  const position = (o: FieldEntry) => o.ballotOrder ?? Number.POSITIVE_INFINITY;
  const others = opponents
    .filter((o) => o.slug !== candidateSlug && o.onGeneralBallot)
    .sort((a, b) => position(a) - position(b) || a.name.localeCompare(b.name));
  const incumbent = others.find((o) => o.incumbent);
  const raceSlug = raceIdToSlug(raceId);
  const showOthers = me?.onGeneralBallot && raceOnBallot !== false && others.length > 0;

  return (
    <section id="ballot" className="mt-6 scroll-mt-16 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <h2 className="font-display text-xl">Is {candidateName} on the November 3 ballot?</h2>
      <p className="mt-2 max-w-[54ch]">
        {ballotSummary({ candidateName, office: raceOffice, me, others, raceOnBallot, raceNote })}
      </p>
      <p className="mt-2 text-sm">
        <Link href={`/races/${raceSlug}`} className={`font-bold ${linkClass}`}>
          {raceOffice} on the November ballot →
        </Link>
      </p>

      {showOthers && (
        <>
          <p className={`mt-3 ${meta}`}>Also on this ballot</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {others.map((o) => (
              <li key={o.slug} className="text-sm">
                <Link href={`/candidates/${o.slug}`} className={linkClass}>
                  {o.ballotName}
                </Link>
                {o.generalParty ? <span className="text-muted-foreground"> ({o.generalParty})</span> : null}
                {o.incumbent ? <span className="text-muted-foreground"> · incumbent</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}

      {!me?.onGeneralBallot && (
        <p className="mt-3 text-sm">
          <Link href={`${PRIMARY_ARCHIVE.path}/races/${raceSlug}`} className={linkClass}>
            See everyone who ran in the {PRIMARY_ARCHIVE.label} →
          </Link>
        </p>
      )}

      {me?.onGeneralBallot && incumbent?.hasRecord && (
        // The most useful link on a challenger's page: what the person they
        // are running against actually voted for.
        <p className="mt-3 text-sm">
          <Link href={`/candidates/${incumbent.slug}#votes`} className={linkClass}>
            See {incumbent.name}&rsquo;s voting record →
          </Link>
        </p>
      )}
    </section>
  );
}
