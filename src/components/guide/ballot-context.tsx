import Link from "next/link";
import { ballotSummary, type FieldEntry } from "@/lib/candidate-ballot";
import { PRIMARY_ARCHIVE } from "@/lib/election";
import { raceIdToSlug } from "@/lib/site";
import { PartyBadge } from "./labels";

/**
 * The race a candidate is in on Nov 3, 2026, and who else is on that ballot.
 *
 * WHY THIS EXISTS. Most candidate pages carry only a name and a party. What a
 * voter arrives asking is "who am I choosing between?", and that is answerable
 * for every candidate from the state's list. It also links the incumbent's
 * voting record, which a challenger's page is exactly where a voter wants.
 */
const STAMP = "font-mono text-xs font-bold uppercase tracking-widest";
const linkClass = "underline decoration-2 underline-offset-2";

export function BallotContext({
  candidateSlug,
  candidateName,
  raceId,
  raceOffice,
  raceOnBallot,
  raceNote,
  hadPrimary,
  opponents,
}: {
  candidateSlug: string;
  candidateName: string;
  raceId: string;
  raceOffice: string;
  /** undefined when the race's November facts are not loaded. */
  raceOnBallot?: boolean;
  raceNote?: string;
  /** False for a race that was never on the August primary ballot. */
  hadPrimary: boolean;
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
  // The contest as the state prints it, this candidate included (Phase 1b:
  // the candidate page speaks the race page's "as printed" language).
  const rows = me && showOthers ? [me, ...others].sort((a, b) => position(a) - position(b)) : [];
  const noun = rows.some((o) => o.ballotName.includes("/")) ? "tickets" : "candidates";
  const compareLabel =
    rows.length === 2 ? `Compare ${rows[0].name} and ${rows[1].name}` : `Compare these ${rows.length} ${noun}`;

  return (
    <section id="ballot" className="mt-6 scroll-mt-16 border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
      <div className="px-4 pt-4">
        <h2 className="font-display text-xl">Is {candidateName} on the November 3 ballot?</h2>
        <p className="mt-2 max-w-[60ch]">
          {ballotSummary({ candidateName, office: raceOffice, me, others, raceOnBallot, raceNote, hadPrimary })}
        </p>
      </div>

      {rows.length > 0 && (
        <>
          <h3 className={`mt-4 border-y-2 border-border px-4 py-2.5 ${STAMP}`}>As printed · ballot order</h3>
          <ol>
            {rows.map((o, i) => (
              <li key={o.slug} className="flex gap-4 border-b-2 border-dashed border-border px-4 py-4 last:border-b-0">
                <span aria-hidden="true" className="font-display w-6 shrink-0 text-2xl leading-none text-muted-foreground tabular-nums">
                  {o.ballotOrder ?? i + 1}
                </span>
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                  {o.slug === candidateSlug ? (
                    <span className="font-display text-xl leading-tight">
                      {o.ballotName}
                      <span className={`ml-2 align-middle text-muted-foreground ${STAMP}`}>· this page</span>
                    </span>
                  ) : (
                    <Link href={`/candidates/${o.slug}`} className="font-display text-xl leading-tight underline decoration-2 underline-offset-4">
                      {o.ballotName}
                    </Link>
                  )}
                  <PartyBadge party={o.generalParty} />
                  {o.incumbent && <span className={`border-2 border-border bg-secondary px-2 py-0.5 ${STAMP}`}>Incumbent</span>}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      <div className={`space-y-1 px-4 py-3 text-sm ${rows.length > 0 ? "border-t-2 border-border" : ""}`}>
        <p>
          <Link href={`/races/${raceSlug}`} className={`inline-flex min-h-11 items-center font-bold ${linkClass}`}>
            {raceOnBallot === false ? `About ${raceOffice}` : `${raceOffice} on the November ballot`}&nbsp;→
          </Link>
        </p>
        {!me?.onGeneralBallot && hadPrimary && (
          <p>
            <Link href={`${PRIMARY_ARCHIVE.path}/races/${raceSlug}`} className={`inline-flex min-h-11 items-center ${linkClass}`}>
              See everyone who ran in the {PRIMARY_ARCHIVE.label}&nbsp;→
            </Link>
          </p>
        )}
        {me?.onGeneralBallot && incumbent?.hasRecord && (
          // The most useful link on a challenger's page: what the person they
          // are running against actually voted for.
          <p>
            <Link href={`/candidates/${incumbent.slug}#votes`} className={`inline-flex min-h-11 items-center ${linkClass}`}>
              See {incumbent.name}&rsquo;s voting record&nbsp;→
            </Link>
          </p>
        )}
      </div>

      {rows.length > 1 && (
        <div className="border-t-2 border-border p-4">
          <Link
            href={`/compare/${raceSlug}`}
            className="press flex min-h-12 w-full items-center justify-center border-2 border-border bg-primary px-5 text-center font-bold text-primary-foreground shadow-[var(--shadow-brutal)] sm:inline-flex sm:w-auto"
          >
            {compareLabel} →
          </Link>
        </div>
      )}
    </section>
  );
}
