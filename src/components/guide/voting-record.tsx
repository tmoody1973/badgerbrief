type VoteRow = {
  billNumber: string;
  billTitle: string;
  voteType: string;
  votedOn: string;
  session: string;
  chamber: string;
  position: "aye" | "nay" | "not_voting";
  ayes: number;
  nays: number;
  sourceUrl: string;
  otherVotesOnBill: number;
};

const POSITION_LABEL: Record<VoteRow["position"], string> = {
  aye: "Voted yes",
  nay: "Voted no",
  not_voting: "Did not vote",
};

const VISIBLE = 5;

/**
 * A legislator's floor votes, newest first.
 *
 * SELECTION IS RECENCY, AND THE PAGE SAYS SO. Ordering by "most important
 * votes" would be an editorial judgment we'd have to defend, and picking which
 * of a legislator's votes matter is exactly the cherry-picking that ingesting
 * the complete record avoids. Recency is a neutral rule we can state.
 *
 * DESIGN.md: one card, never nested — entries are separated by dashed rules.
 */
export function VotingRecord({
  votes,
  candidateName,
}: {
  votes: VoteRow[];
  candidateName: string;
}) {
  if (votes.length === 0) return null;

  const ordered = [...votes].sort((a, b) => b.votedOn.localeCompare(a.votedOn));
  const shown = ordered.slice(0, VISIBLE);
  const folded = ordered.slice(VISIBLE);
  const sessions = [...new Set(ordered.map((v) => v.session))].sort();

  const Entry = ({ v }: { v: VoteRow }) => (
    <li className="px-4 py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        {v.billNumber} · {v.voteType} · {v.votedOn}
      </p>
      <p className="mt-1 max-w-[62ch] text-sm">{v.billTitle}</p>
      <p className="mt-1 text-sm">
        <span className="font-bold">{POSITION_LABEL[v.position]}</span>
        <span className="text-muted-foreground">
          {" "}
          · passed {v.ayes}&ndash;{v.nays}
          {v.otherVotesOnBill > 0
            ? ` · ${v.otherVotesOnBill} other recorded vote${v.otherVotesOnBill === 1 ? "" : "s"} on this bill`
            : ""}
        </span>
      </p>
      <a
        href={v.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-block font-mono text-[11px] uppercase tracking-[0.1em] underline decoration-2 underline-offset-2"
      >
        Official roll call ↗
      </a>
    </li>
  );

  return (
    <section id="votes" className="mt-6 scroll-mt-16">
      <h2 className="font-display text-xl">Voting record</h2>
      <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
        Floor votes {candidateName} cast in the Wisconsin Legislature, most recent first,
        from the {sessions.join(" and ")} session{sessions.length > 1 ? "s" : ""}. Every
        entry links to the official roll call. We don&rsquo;t rate or score votes.
      </p>

      <div className="mt-3 border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
        <div className="border-b-2 border-border bg-secondary/40 px-4 py-2">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em]">
            Wisconsin Legislature · {votes.length} recorded vote{votes.length === 1 ? "" : "s"}
          </span>
        </div>
        <ol className="divide-y-2 divide-dashed divide-border">
          {shown.map((v) => (
            <Entry key={v.sourceUrl} v={v} />
          ))}
        </ol>
        {folded.length > 0 && (
          <details className="border-t-2 border-dashed border-border">
            <summary className="cursor-pointer px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Show all {ordered.length} votes
            </summary>
            <ol className="divide-y-2 divide-dashed divide-border border-t-2 border-dashed border-border">
              {folded.map((v) => (
                <Entry key={v.sourceUrl} v={v} />
              ))}
            </ol>
          </details>
        )}
      </div>
    </section>
  );
}
