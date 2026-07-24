import { StatTile } from "./stat-tile";
import { VotingRecordSessions } from "./voting-record-sessions";

type VotingSummary = {
  total: number;
  byPosition: { aye: number; nay: number; not_voting: number };
  participationRate: number;
  sessions: { session: string; count: number }[];
  chamber: "assembly" | "senate";
};

const nf = new Intl.NumberFormat("en-US");

/**
 * A legislator's floor votes: an aggregate summary + a lazy per-session
 * accordion (VotingRecordSessions). The candidate page ships only this summary;
 * the rows load on demand, so a 2,000-vote record is navigable and cheap.
 *
 * SELECTION IS RECENCY, AND THE PAGE SAYS SO. We don't rate or score votes; the
 * aggregates here are arithmetic only.
 */
export function VotingRecord({
  summary, candidateSlug, candidateName,
}: {
  summary: VotingSummary;
  candidateSlug: string;
  candidateName: string;
}) {
  const sessionLabels = summary.sessions.map((s) => s.session).sort().reverse();
  return (
    <section id="votes" className="mt-6 scroll-mt-16">
      <h2 className="font-display text-xl">Voting record</h2>
      <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
        Recorded floor votes {candidateName} cast in the Wisconsin Legislature, newest
        first, across the {sessionLabels.join(", ")} session
        {sessionLabels.length > 1 ? "s" : ""}. Every entry links to its official roll call
        and the full bill. We don&rsquo;t rate or score votes.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Recorded votes" value={nf.format(summary.total)} />
        <StatTile label="Voted yes" value={nf.format(summary.byPosition.aye)} />
        <StatTile label="Voted no" value={nf.format(summary.byPosition.nay)} />
        <StatTile
          label="Participation"
          value={`${Math.round(summary.participationRate * 100)}%`}
          note={`${nf.format(summary.byPosition.not_voting)} did not vote`}
        />
      </div>

      <VotingRecordSessions candidateSlug={candidateSlug} sessions={summary.sessions} />
    </section>
  );
}
