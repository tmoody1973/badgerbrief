import Link from "next/link";
import { DebateTopics } from "@/components/guide/debate-topics";
import { DebateVotes } from "@/components/guide/debate-votes";
import { getDebateForRace } from "@/lib/debates";

/**
 * The debate, rendered on /compare.
 *
 * /compare exists to answer "where do they differ" and until now had almost
 * nothing to answer it with — the page's own empty state admits as much. A
 * debate is the one occasion where every candidate is asked the SAME question
 * on the SAME day, which makes it the best comparison material this race will
 * produce, and it is already sourced, timestamped and clip-verified.
 *
 * This reuses the debate page's own switcher and vote table rather than
 * restating them. Same interaction, same mobile behaviour, one place to fix.
 *
 * It is kept as a distinct block, not merged into the sourced-position
 * comparison above, because the two are different kinds of claim: those are
 * editorially summarised stances carrying a support/oppose label, these are
 * verbatim answers with no stance assigned. Flattening them together would
 * quietly present a quote as a classified position.
 */
export function DebateCompare({ raceId }: { raceId: string }) {
  const debate = getDebateForRace(raceId);
  if (!debate) return null;

  const dateLabel = new Date(`${debate.date}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <section id="debate" className="scroll-mt-16">
      <div className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)] sm:p-6">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          {dateLabel} · {debate.broadcaster} · {debate.venue}
        </p>
        <h2
          className="font-display mt-2 text-2xl"
          style={{ overflowWrap: "anywhere" }}
        >
          Every candidate, the same question, the same night
        </h2>
        <p className="mt-2 max-w-[70ch] leading-relaxed">
          The clearest comparison this race has produced. All five Democrats on
          stage were asked about the same {debate.topics.length} subjects — here
          is what each said, in their own voice. No stance label is applied to
          these; they are what the candidates actually said.
        </p>
        <p className="mt-3">
          <Link
            href={`/debate/${debate.slug}`}
            className="font-mono text-xs font-bold uppercase tracking-widest underline underline-offset-2"
          >
            Full debate page, with transcript →
          </Link>
        </p>
      </div>

      <div className="mt-6">
        <DebateVotes votes={debate.handVotes} candidates={debate.candidates} />
      </div>

      <div className="mt-6">
        <DebateTopics
          topics={debate.topics}
          candidates={debate.candidates}
          quotes={debate.quotes}
          youtubeId={debate.youtubeId}
        />
      </div>
    </section>
  );
}
