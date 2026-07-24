import { StatTile } from "./stat-tile";
import { VotingRecordSessions } from "./voting-record-sessions";

type VotingSummary = {
  total: number;
  byPosition: { aye: number; nay: number; present: number; not_voting: number };
  participationRate: number;
  sessions: { session: string; count: number }[];
  chamber: "assembly" | "senate" | "us_house";
};

const nf = new Intl.NumberFormat("en-US");

/** "119" -> "119th". Handles the 11x exceptions (11th/12th/13th, not 11st). */
function ordinal(n: string): string {
  const num = Number(n);
  if (!Number.isFinite(num)) return n;
  const tens = num % 100;
  if (tens >= 11 && tens <= 13) return `${num}th`;
  return `${num}${["th", "st", "nd", "rd"][num % 10] ?? "th"}`;
}

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
  const federal = summary.chamber === "us_house";
  const sessionLabels = summary.sessions.map((s) => s.session).sort().reverse();
  const periods = federal
    ? sessionLabels.map((s) => `${ordinal(s)} Congress`)
    : sessionLabels.map((s) => `${s} session`);
  const body = federal ? "the U.S. House of Representatives" : "the Wisconsin Legislature";

  return (
    <section id="votes" className="mt-6 scroll-mt-16">
      <h2 className="font-display text-xl">Voting record</h2>
      <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
        Recorded floor votes {candidateName} cast in {body}, newest first, across the{" "}
        {periods.join(", ")}. Every entry links to its official roll call
        {federal ? "" : " and the full bill"}. We don&rsquo;t rate or score votes.
      </p>
      {federal && (
        // Coverage is genuinely partial, so the page says so rather than
        // implying a complete record. Verified against the live source: votes
        // like "Election of the Speaker" ARE published, but they record a
        // choice between people rather than a yes/no, so there is no position
        // to show and they are deliberately excluded.
        <p className="mt-1 max-w-[60ch] text-xs text-muted-foreground">
          Covers recorded votes on bills, resolutions and amendments. Votes
          without a yes/no position — electing a Speaker, quorum calls — aren&rsquo;t
          included.
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Recorded votes" value={nf.format(summary.total)} />
        <StatTile label="Voted yes" value={nf.format(summary.byPosition.aye)} />
        <StatTile label="Voted no" value={nf.format(summary.byPosition.nay)} />
        <StatTile
          label="Participation"
          value={`${Math.round(summary.participationRate * 100)}%`}
          note={
            summary.byPosition.present > 0
              ? `${nf.format(summary.byPosition.not_voting)} did not vote · ${nf.format(summary.byPosition.present)} present`
              : `${nf.format(summary.byPosition.not_voting)} did not vote`
          }
        />
      </div>

      <VotingRecordSessions
        candidateSlug={candidateSlug}
        sessions={summary.sessions}
        federal={federal}
      />
    </section>
  );
}
