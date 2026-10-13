import Link from "next/link";
import type { BallotContest, Stamp } from "@/lib/my-ballot";
import { PartyBadge } from "@/components/guide/labels";

/**
 * One contest on a voter's ballot, drawn as a ledger entry: its place in the
 * state's order, the office, and the names as the state prints them.
 *
 * Every candidate gets the same markup and every party the same badge. Where
 * the guide holds nothing more than the names, it says so.
 *
 * Every link here carries prefetch={false}. These are the voter's own
 * contests; letting Next pre-load them would ask the server for a voter's
 * districts before the voter chose to open anything (decision 018).
 */

type ContestNumber = { n: number; of: number };

const STAMP_LABEL: Record<Stamp["label"], string> = {
  positions: "Positions",
  money: "Money",
  ads: "Ads",
  questionnaire: "Questionnaire",
};

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
// A link standing on its own gets a 44px target.
const NAME_LINK = `inline-flex min-h-11 items-center text-lg font-bold leading-tight underline decoration-2 underline-offset-4 ${FOCUS}`;
const CHIP = `press inline-flex min-h-11 items-center border-2 border-border bg-background px-3 font-mono text-xs font-bold uppercase tracking-wide ${FOCUS}`;
const ACTION = `press inline-flex min-h-11 items-center border-2 border-border px-4 font-bold shadow-[var(--shadow-brutal)] ${FOCUS}`;

function Place({ number }: { number: ContestNumber }) {
  return (
    <p className="flex w-16 shrink-0 flex-col items-center justify-center border-r-2 border-border bg-secondary px-2 py-3 font-mono leading-none">
      <span className="sr-only">
        Contest {number.n} of {number.of}
      </span>
      <span aria-hidden="true" className="text-2xl font-bold tabular-nums">
        {number.n}
      </span>
      <span aria-hidden="true" className="mt-1 text-xs tabular-nums">
        of {number.of}
      </span>
    </p>
  );
}

/** `number` is left off where the voter's own ballot is not known yet, so no place in it can be stated. */
export function ContestCard({ contest, number }: { contest: BallotContest; number?: ContestNumber }) {
  return (
    <article className="border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
      <header className="flex items-stretch border-b-2 border-border">
        {number && <Place number={number} />}
        <h3 className="font-display flex-1 self-center px-4 py-3 text-xl leading-tight text-balance">{contest.office}</h3>
      </header>
      <div className="p-4">
        <ul className="space-y-2">
          {contest.candidates.map((candidate) => (
            <li key={candidate.name} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {candidate.href ? (
                <Link prefetch={false} href={candidate.href} className={NAME_LINK}>
                  {candidate.name}
                </Link>
              ) : (
                <span className="inline-flex min-h-11 items-center text-lg font-bold leading-tight">{candidate.name}</span>
              )}
              <PartyBadge party={candidate.party} />
            </li>
          ))}
        </ul>

        {contest.stamps.length > 0 ? (
          <div className="mt-4 border-t-2 border-dashed border-border pt-3">
            <p className="text-sm">BadgerBrief has, for this contest:</p>
            <p className="mt-2 flex flex-wrap gap-2">
              {contest.stamps.map((stamp) => (
                <Link key={stamp.label} prefetch={false} href={stamp.href} className={CHIP}>
                  {STAMP_LABEL[stamp.label]}
                </Link>
              ))}
            </p>
          </div>
        ) : (
          <p className="mt-4 border-t-2 border-dashed border-border pt-3 text-sm">BadgerBrief has no further information on this office.</p>
        )}

        {contest.href && (
          <p className="mt-4 flex flex-wrap gap-3">
            <Link prefetch={false} href={contest.href} className={`${ACTION} bg-secondary`}>
              Open this contest
            </Link>
            {contest.compareHref && (
              <Link prefetch={false} href={contest.compareHref} className={`${ACTION} bg-card`}>
                Compare side by side
              </Link>
            )}
          </p>
        )}
      </div>
    </article>
  );
}

/** Offices with one name on the ballot: a short strip, each one named, none hidden. */
export function OneNameStrip({ contests, numbers }: { contests: readonly BallotContest[]; numbers: ReadonlyMap<string, ContestNumber> }) {
  if (contests.length === 0) return null;
  return (
    <ul className="border-t-2 border-border">
      {contests.map((contest) => {
        const number = numbers.get(contest.key);
        const [only] = contest.candidates;
        return (
          <li key={contest.key} className="flex gap-3 border-b-2 border-border py-3">
            <span className="w-14 shrink-0 pt-1 font-mono text-xs font-bold tabular-nums text-muted-foreground">{number ? `${number.n} of ${number.of}` : ""}</span>
            <div className="min-w-0">
              <p className="font-bold leading-tight">
                {contest.href ? (
                  <Link prefetch={false} href={contest.href} className={`underline decoration-2 underline-offset-4 ${FOCUS}`}>
                    {contest.office}
                  </Link>
                ) : (
                  contest.office
                )}
              </p>
              <p className="mt-1 text-sm">
                {only ? (
                  <>
                    {only.name}
                    {only.party && <span className="text-muted-foreground"> · {only.party}</span>}
                  </>
                ) : (
                  "No candidate is on the ballot for this office."
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
