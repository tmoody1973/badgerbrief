"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { FinancePanel } from "@/components/guide/finance";
import { sourceLabel } from "@/lib/source-label";
import { BriefSkeleton, NotFoundCard } from "./chrome";

const hostnameOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export function IssueStanceCardView({
  candidateSlug,
  issueSlug,
}: {
  candidateSlug: string;
  issueSlug: string;
}) {
  const data = useQuery(api.public.getCandidateBySlug, { slug: candidateSlug });
  if (data === undefined) return <BriefSkeleton lines={3} />;
  if (data === null) return <NotFoundCard entity={`candidate ${candidateSlug}`} />;
  const position = data.positions.find((p) => p.issueSlug === issueSlug);
  if (!position)
    return (
      <NotFoundCard
        entity={`${data.candidate.name}'s published position on ${issueSlug}`}
      />
    );
  return (
    <section className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {issueSlug.replaceAll("-", " ")} — {data.candidate.name}
      </p>
      <p className="mt-1 font-display">{position.stance}</p>
      <p className="mt-2 text-sm">{position.summary}</p>
      {position.sources.length > 0 && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          Source:{" "}
          <a href={position.sources[0].url} className="underline" rel="noopener noreferrer" target="_blank">
            {hostnameOf(position.sources[0].url)}
          </a>
        </p>
      )}
    </section>
  );
}

export function QuoteCardView({ candidateSlug }: { candidateSlug: string }) {
  const data = useQuery(api.public.getCandidateBySlug, { slug: candidateSlug });
  if (data === undefined) return <BriefSkeleton lines={3} />;
  if (data === null) return <NotFoundCard entity={`candidate ${candidateSlug}`} />;
  if (data.quotes.length === 0) return null; // no published quotes — render nothing
  return (
    <div className="space-y-3">
      {data.quotes.slice(0, 2).map((q) => (
        <blockquote
          key={q._id}
          className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]"
        >
          <p className="text-sm">&ldquo;{q.text}&rdquo;</p>
          <footer className="mt-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            — {q.speaker}, {q.date} ·{" "}
            <a href={q.sourceUrl} className="underline" rel="noopener noreferrer" target="_blank">
              {sourceLabel(q.sourceUrl, q.outlet)}
            </a>
          </footer>
        </blockquote>
      ))}
    </div>
  );
}

export function FinanceSnapshotView({ candidateSlug }: { candidateSlug: string }) {
  const data = useQuery(api.public.getCandidateBySlug, { slug: candidateSlug });
  if (data === undefined) return <BriefSkeleton lines={4} />;
  if (data === null) return <NotFoundCard entity={`candidate ${candidateSlug}`} />;
  if (data.finance.length === 0)
    return <NotFoundCard entity={`finance data for ${data.candidate.name}`} />;
  return (
    <FinancePanel
      totals={data.finance}
      contributions={data.contributions}
      committeeFunding={data.committeeFunding}
      candidateName={data.candidate.name}
    />
  );
}
