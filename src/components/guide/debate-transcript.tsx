import type { DebateTopic } from "./debate-topics";

export type TranscriptTurn = {
  start: number;
  name: string;
  personSlug: string;
  role: string;
  text: string;
};

/**
 * The whole hour, on the record, folded into the same ten blocks the moderators
 * used.
 *
 * Every summary above this point is a selection, and a selection is an
 * editorial act. This section is the check on it: the reader can open any block
 * and see what surrounded a quote we chose to pull. It is collapsed by default
 * because 230 turns unfolded is roughly thirty phone screens of scrolling past
 * content nobody asked for — but it is on the page, not behind a download.
 *
 * Native <details> rather than a React accordion: it works before hydration,
 * it is keyboard-operable for free, and Ctrl-F finds the text inside a closed
 * block in most browsers.
 */
export function DebateTranscript({
  topics,
  transcript,
}: {
  topics: DebateTopic[];
  transcript: TranscriptTurn[];
}) {
  const mmss = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  const blocks = topics.map((t, i) => {
    const next = topics[i + 1];
    const end = next ? next.start : Number.POSITIVE_INFINITY;
    return { ...t, turns: transcript.filter((x) => x.start >= t.start && x.start < end) };
  });
  const preamble = transcript.filter((x) => x.start < (topics[0]?.start ?? 0));

  return (
    <div className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <h2 className="font-display text-xl" style={{ overflowWrap: "anywhere" }}>
        Full transcript
      </h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
        All {transcript.length} speaking turns, machine-transcribed and
        attributed by voice. Open any block to read what surrounded a quote.
      </p>

      <div className="mt-4 space-y-2 border-t-2 border-dashed border-border pt-4">
        {preamble.length > 0 && (
          <TranscriptBlock label="Opening" turns={preamble} mmss={mmss} />
        )}
        {blocks.map((b) => (
          <TranscriptBlock key={b.id} label={b.label} turns={b.turns} mmss={mmss} />
        ))}
      </div>
    </div>
  );
}

function TranscriptBlock({
  label,
  turns,
  mmss,
}: {
  label: string;
  turns: TranscriptTurn[];
  mmss: (s: number) => string;
}) {
  if (turns.length === 0) return null;
  return (
    <details>
      <summary className="press inline-block cursor-pointer border-2 border-border bg-background px-3 py-2 text-sm font-bold shadow-[var(--shadow-brutal)]">
        {label}{" "}
        <span className="font-mono text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
          ({turns.length})
        </span>
      </summary>
      <ol className="mt-3 space-y-3">
        {turns.map((t, i) => (
          <li key={`${t.start}-${i}`} className="min-w-0">
            <p className="font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              <span className={t.role === "candidate" ? "" : "text-muted-foreground"}>
                {t.name}
              </span>{" "}
              <span className="text-muted-foreground">{mmss(t.start)}</span>
            </p>
            <p className="max-w-[75ch] text-sm leading-relaxed">{t.text}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}
