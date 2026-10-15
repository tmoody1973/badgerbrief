"use client";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { voteSummarySource } from "@/lib/vote-summary-source";

/** Votes shown when an issue opens; the rest fold behind "all N". */
const FIRST_VOTES = 3;

type Vote = { direction: "for" | "against"; outcome: string; votedOn: string; billNumber: string; session: string; sourceUrl: string };

function VoteLine({ v }: { v: Vote }) {
  return (
    <li className="grid grid-cols-[1.2rem_1fr_auto] items-baseline gap-2 text-sm">
      {/* Neutral marks: a vote for or against is not good or bad. */}
      <span aria-hidden="true" className="font-bold">{v.direction === "for" ? "✓" : "✗"}</span>
      <span>Voted {v.direction} a bill to {v.outcome}</span>
      <a href={v.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center whitespace-nowrap font-mono text-xs text-muted-foreground underline decoration-dotted underline-offset-2 sm:min-h-0">
        {v.votedOn.slice(0, 4)} · bill<span aria-hidden="true"> ↗</span>
      </a>
    </li>
  );
}

export function VotingRecordByIssue({ candidateSlug, raceId }: { candidateSlug: string; raceId: string }) {
  const groups = useQuery(api.votesQueries.votingRecordByIssue, { candidateSlug, raceId });
  if (!groups || groups.length === 0) return null;
  const summarySource = voteSummarySource(groups.flatMap((g) => g.votes.map((v) => v.session)));
  return (
    <section className="mt-8">
      <h3 className="font-display text-xl">How they voted, by issue</h3>
      <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
        Their final-passage votes on the bills we&rsquo;ve grouped by issue. Each line is their vote plus what a YES did — from the
        nonpartisan {summarySource}. The bill is one click away; nothing here rates the candidate.
      </p>
      <ul className="mt-4 border-y-2 border-border">
        {groups.map((g) => (
          <li key={g.issueSlug} className="border-b-2 border-dashed border-border last:border-b-0">
            <details className="group">
              <summary className="flex min-h-12 cursor-pointer flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <span className="font-bold">{g.label}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  voted for {g.forCount}, against {g.againstCount}
                </span>
              </summary>
              <div className="pb-4">
                {g.position && (
                  <p className="max-w-[65ch] text-sm text-muted-foreground">
                    <span className="font-bold text-foreground">They said:</span> {g.position.summary}
                  </p>
                )}
                <ul className="mt-2 flex flex-col gap-1.5">
                  {g.votes.slice(0, FIRST_VOTES).map((v) => (
                    <VoteLine key={`${v.session}-${v.billNumber}-${v.votedOn}`} v={v} />
                  ))}
                </ul>
                {g.votes.length > FIRST_VOTES && (
                  <details className="mt-2">
                    <summary className="flex min-h-11 cursor-pointer items-center font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      All {g.votes.length} votes on {g.label.toLowerCase()}
                    </summary>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {g.votes.slice(FIRST_VOTES).map((v) => (
                        <VoteLine key={`${v.session}-${v.billNumber}-${v.votedOn}`} v={v} />
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
