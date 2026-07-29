import type { DebateCandidate } from "./debate-topics";

export type DebateHandVote = {
  id: string;
  question: string;
  /** The moderator's own readout of the result, verbatim. */
  spoken: string;
  yes: string[];
  no: string[];
};

/**
 * The three show-of-hands votes — the hardest, least arguable content of the
 * night, and the fastest thing on the page to read.
 *
 * Candidates are ROWS and votes are COLUMNS, which is the transpose of how a
 * newspaper would set it. With five candidates and three votes, candidates-as-
 * columns needs six columns and overflows a 320px phone; this way the table is
 * four columns and fits without horizontal scroll at every width.
 *
 * We have audio, not video, so no hand was seen. Each result is what a
 * moderator said aloud, printed underneath so the reader can weigh it.
 */

/** Short enough to head a column on a 320px screen. */
const SHORT: Record<string, string> = {
  "body-cameras": "Body cameras",
  "tax-deal": "Tax deal",
  "property-tax-cut": "Property tax cut",
};

export function DebateVotes({
  votes,
  candidates,
}: {
  votes: DebateHandVote[];
  candidates: DebateCandidate[];
}) {
  return (
    <div className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <h2 className="font-display text-xl" style={{ overflowWrap: "anywhere" }}>
        Three votes taken by show of hands
      </h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
        The moderators asked the candidates to raise their hands three times.
        These are the results as the moderators read them out.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Each candidate&apos;s answer to the three show-of-hands questions
          </caption>
          <thead>
            <tr>
              <th scope="col" className="border-b-2 border-border p-2 text-left font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
                Candidate
              </th>
              {votes.map((v) => (
                <th
                  key={v.id}
                  scope="col"
                  className="border-b-2 border-border p-2 text-left font-mono text-[11px] font-bold tracking-[0.1em] uppercase"
                >
                  {SHORT[v.id] ?? v.id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.slug}>
                <th
                  scope="row"
                  className="border-b-2 border-dashed border-border p-2 text-left font-bold"
                  style={{ overflowWrap: "anywhere" }}
                >
                  {c.short}
                </th>
                {votes.map((v) => {
                  const yes = v.yes.includes(c.slug);
                  const no = v.no.includes(c.slug);
                  // The glyph never carries the meaning alone — the word next
                  // to it does, so this reads the same in monochrome, to a
                  // screen reader, and to anyone who can't separate the hues.
                  return (
                    <td
                      key={v.id}
                      className="border-b-2 border-dashed border-border p-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase"
                    >
                      {yes ? "✓ Yes" : no ? "✗ No" : "— Unclear"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The table already answers "who voted what". The exact wording and the
          moderator's readout are the evidence behind it — needed, but not
          needed first, and unfolded they cost more vertical space on a phone
          than the table they support. */}
      <details className="mt-4 border-t-2 border-dashed border-border pt-4">
        <summary className="press inline-block cursor-pointer border-2 border-border bg-background px-3 py-2 text-sm font-bold shadow-[var(--shadow-brutal)]">
          What each vote asked, and how it was called
        </summary>
        <ul className="mt-3 space-y-3">
          {votes.map((v) => (
            <li key={v.id}>
              <p className="font-mono text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                {SHORT[v.id] ?? v.id}
              </p>
              <p className="max-w-[70ch] text-sm">{v.question}</p>
              <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
                Read out on stage as: “{v.spoken}”
              </p>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
