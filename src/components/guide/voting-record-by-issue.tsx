"use client";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function VotingRecordByIssue({ candidateSlug, raceId }: { candidateSlug: string; raceId: string }) {
  const groups = useQuery(api.votesQueries.votingRecordByIssue, { candidateSlug, raceId });
  if (!groups || groups.length === 0) return null;
  return (
    <section className="mt-8">
      <h3 className="font-display text-lg">How they voted, by issue</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Every final-passage vote, grouped by issue. Each line is their vote plus what a YES did — drawn from the nonpartisan
        Legislative Reference Bureau. The bill is one click away; nothing here rates the candidate.
      </p>
      <div className="mt-4 flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.issueSlug} className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
            <div className="flex items-baseline justify-between">
              <h4 className="font-mono text-xs font-bold uppercase tracking-widest text-primary">{g.label}</h4>
              <span className="font-mono text-xs text-muted-foreground">voted for {g.forCount}, against {g.againstCount}</span>
            </div>
            {g.position && (
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-bold text-foreground">They said:</span> {g.position.summary}
              </p>
            )}
            <ul className="mt-3 flex flex-col gap-1.5">
              {g.votes.map((v) => (
                <li key={`${v.session}-${v.billNumber}-${v.votedOn}`} className="grid grid-cols-[1.2rem_1fr_auto] items-baseline gap-2 text-sm">
                  <span className={v.direction === "for" ? "text-success" : "text-destructive"}>{v.direction === "for" ? "✓" : "✗"}</span>
                  <span>Voted {v.direction} {v.outcome}</span>
                  <a href={v.sourceUrl} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap font-mono text-xs text-muted-foreground underline decoration-dotted underline-offset-2">
                    {v.votedOn.slice(0, 4)} · bill ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
