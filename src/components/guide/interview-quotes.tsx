import type { Doc } from "../../../convex/_generated/dataModel";
import { formatTimestamp, timestampSeconds } from "@/lib/interview-quote";

/**
 * WisconsinEye interview answers, rendered as a transcript excerpt.
 *
 * This is a separate section from "In their own words" for an editorial
 * reason, not a decorative one: every candidate in the race sat for the same
 * scheduled interview with the same interviewer, so these answers are
 * comparable across the field in a way that quotes lifted from different
 * articles never are. Each carries the moment it was said and a link to the
 * recording — it reads as the public record because it is one.
 *
 * DESIGN.md: one card, never nested — sub-sections are dashed rules inside it.
 * Lake (not cardinal) carries the accent: this marks provenance, and cardinal
 * is rationed for genuine emphasis.
 */
export function InterviewQuotes({
  quotes,
  candidateName,
}: {
  quotes: Doc<"quote_published">[];
  candidateName: string;
}) {
  if (quotes.length === 0) return null;

  // Chronological, so the section reads as the interview actually ran. The
  // publish order is arbitrary (whenever a reviewer got to each draft), which
  // made the excerpt jump backwards through the conversation.
  const ordered = [...quotes].sort(
    (a, b) => (timestampSeconds(a.sourceUrl) ?? 0) - (timestampSeconds(b.sourceUrl) ?? 0),
  );

  // Every quote links to the same program; the timestamp is what differs.
  const programUrl = ordered[0].sourceUrl.split("?")[0];
  const date = ordered[0].date;

  return (
    <section id="interview" className="mt-6 scroll-mt-16">
      <h2 className="font-display text-xl">The interview</h2>
      <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
        {candidateName} sat down with WisconsinEye and WisPolitics for a half-hour
        interview. Every candidate in this race sat for the same interview, so these
        answers are directly comparable. Each is transcribed verbatim, timestamped to
        the recording.
      </p>

      <div className="mt-3 border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
        {/* Provenance stamp — the source is stated before any of its content. */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-border bg-secondary/40 px-4 py-2">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em]">
            WisconsinEye · Campaign 2026
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            Recorded {date}
          </span>
        </div>

        <ol className="divide-y-2 divide-dashed divide-border">
          {ordered.map((q) => {
            const seconds = timestampSeconds(q.sourceUrl);
            return (
              <li key={q._id} className="px-4 py-4">
                {/* No interviewer question is printed above the answer. Two
                    attempts at reconstructing it from the diarized turns gave
                    confidently wrong pairs, and a question above a quote is a
                    claim about what the candidate was responding to. */}
                <blockquote className="border-l-4 border-accent pl-3">
                  <p className="max-w-[58ch] text-[0.95rem] leading-relaxed">
                    &ldquo;{q.text}&rdquo;
                  </p>
                </blockquote>
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                  {/* The timestamp is shown as text, not only buried in the href:
                      it has to stay useful even if wiseye.org ignores ?t=. */}
                  {seconds !== null && <span>At {formatTimestamp(seconds)} · </span>}
                  <a
                    href={q.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-2 underline-offset-2 hover:text-foreground"
                  >
                    Watch on WisconsinEye ↗
                  </a>
                </p>
              </li>
            );
          })}
        </ol>

        <div className="border-t-2 border-dashed border-border px-4 py-2">
          <a
            href={programUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] uppercase tracking-[0.1em] underline decoration-2 underline-offset-2"
          >
            Full program on wiseye.org ↗
          </a>
          <p className="mt-1 text-xs text-muted-foreground">
            Quotes are transcribed verbatim from the recording and checked against it
            before publication. Watching the video requires a free WisconsinEye account.
          </p>
        </div>
      </div>
    </section>
  );
}
