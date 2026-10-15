import Link from "next/link";
import type { Doc } from "../../../convex/_generated/dataModel";
import { generalBallotName, generalParty } from "../../../convex/lib/ballot";
import { PartyBadge } from "./labels";

/**
 * The contest as the state prints it: one bordered unit, candidates as
 * numbered rows in ballot order, names at front-page weight, and what the
 * guide holds on each one. Phase 1b brief: "the record made visible", "fewer
 * boxes", "one red thing per screen, and it is the action" (Compare).
 */

export type Holds = { questionnaire: boolean; money: boolean; ads: boolean };

const STAMP = "font-mono text-xs font-bold uppercase tracking-widest";
const HOLD_LINK = "tap underline decoration-2 underline-offset-4 hover:text-primary";

function HoldsLine({ holds }: { holds?: Holds }) {
  const items = [
    holds?.questionnaire && { href: "#questionnaire", label: "Questionnaire" },
    holds?.money && { href: "#money", label: "Money" },
    holds?.ads && { href: "#ad-money", label: "Ads" },
  ].filter((x): x is { href: string; label: string } => Boolean(x));
  if (items.length === 0) {
    return <p className={`mt-2 ${STAMP} text-muted-foreground`}>No questionnaire, money or ads on record</p>;
  }
  return (
    <p className={`mt-2 ${STAMP} text-muted-foreground`}>
      {items.map((item, i) => (
        <span key={item.href}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          <a href={item.href} className={HOLD_LINK}>
            {item.label}
          </a>
        </span>
      ))}
    </p>
  );
}

export function BallotContest({
  candidates,
  holds,
  compare,
}: {
  candidates: readonly Doc<"candidates">[];
  /** Omitted where the holds links' targets (#money, …) are not on the page. */
  holds?: Record<string, Holds>;
  compare?: { href: string; label: string };
}) {
  return (
    <section id="candidates" aria-labelledby="contest-heading" className="mt-6 scroll-mt-16 border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
      <h2 id="contest-heading" className={`border-b-2 border-border px-4 py-2.5 ${STAMP}`}>
        As printed · ballot order
      </h2>
      <ol>
        {candidates.map((c, i) => (
          <li key={c.slug} className="flex gap-4 border-b-2 border-dashed border-border px-4 py-5 last:border-b-0">
            <span aria-hidden="true" className="font-display w-7 shrink-0 text-3xl leading-none text-muted-foreground tabular-nums">
              {c.general?.ballotOrder ?? i + 1}
            </span>
            <div className="min-w-0">
              <Link href={`/candidates/${c.slug}`} className="font-display text-2xl leading-tight hover:underline sm:text-3xl">
                {generalBallotName(c)}
              </Link>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <PartyBadge party={generalParty(c)} />
                {c.incumbent && <span className={`border-2 border-border bg-secondary px-2 py-0.5 ${STAMP}`}>Incumbent</span>}
              </div>
              {c.currentOccupation && c.currentOccupation !== "Unknown" && (
                <p className="mt-2 text-sm text-muted-foreground">{c.currentOccupation}</p>
              )}
              {holds && <HoldsLine holds={holds[c.slug]} />}
            </div>
          </li>
        ))}
      </ol>
      {compare && (
        <div className="border-t-2 border-border p-4">
          <Link
            href={compare.href}
            className="press flex min-h-12 w-full items-center justify-center border-2 border-border bg-primary px-5 font-bold text-primary-foreground shadow-[var(--shadow-brutal)] sm:w-auto sm:inline-flex"
          >
            {compare.label} →
          </Link>
        </div>
      )}
    </section>
  );
}
