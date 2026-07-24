import Link from "next/link";

/**
 * Published polls for a race, shown individually and NEVER averaged.
 *
 * The design decision this component encodes: BadgerBrief cites what a pollster
 * published, the same way it cites a roll call. An average is a new number no
 * pollster published — a modelling claim, not a citation — and doing it well
 * needs house effects, recency weighting and likely-voter models. Sites that do
 * that work are linked at the bottom instead.
 *
 * It is also not computable from this data. Published values include ranges
 * ("26-27%"), bare margins ("R +2.2") and whole sentences, so an average would
 * require inventing midpoints the pollster declined to publish. Values are
 * therefore rendered as text, exactly as printed — no bars, because a bar
 * length IS a point estimate and would quietly manufacture one.
 */
type PollRow = {
  label: string;
  value: string;
  candidateSlug: string | null;
};
type PollGroup = { label: string | null; rows: PollRow[] };
export type RacePoll = {
  pollKey: string;
  pollster: string;
  pollType: string;
  matchup?: string;
  conductedStart: string;
  conductedEnd: string;
  sampleSize?: string;
  sampleType?: string;
  marginOfError?: string;
  scientific: boolean;
  groups: PollGroup[];
  notes?: string;
  sources: { name: string; url: string }[];
};

/** Aggregators that DO model polls properly — linked rather than imitated. */
const AGGREGATORS: { name: string; url: string }[] = [
  { name: "Marquette Law School Poll (official)", url: "https://law.marquette.edu/poll/" },
  { name: "270toWin — Wisconsin Governor", url: "https://www.270towin.com/2026-governor-polls/wisconsin" },
  {
    name: "RealClearPolling — WI Governor Dem primary",
    url: "https://www.realclearpolling.com/polls/governor/democratic-primary/2026/wisconsin",
  },
  { name: "Pollsmax — Wisconsin Governor", url: "https://www.pollsmax.com/governor/wisconsin/" },
];

const fmtRange = (start: string, end: string) =>
  start === end ? start : `${start} – ${end}`;

const meta = "font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground";

function Poll({ poll }: { poll: RacePoll }) {
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">{poll.matchup ?? poll.pollster}</h3>
        <span className={meta}>{fmtRange(poll.conductedStart, poll.conductedEnd)}</span>
      </div>
      <p className={`mt-0.5 ${meta}`}>
        {poll.matchup ? `${poll.pollster} · ` : ""}
        {poll.pollType}
        {poll.sampleSize ? ` · n=${poll.sampleSize}` : ""}
        {poll.sampleType ? ` · ${poll.sampleType}` : ""}
        {poll.marginOfError ? ` · MoE ${poll.marginOfError}` : ""}
      </p>

      {!poll.scientific && (
        // A straw poll is real news but is not a poll of voters. Saying so
        // beside the number is the whole reason it can be shown at all.
        <p className="mt-2 border-2 border-border bg-warning px-2 py-1 font-mono text-[11px] uppercase tracking-[0.1em]">
          Not a scientific poll — self-selected participants
        </p>
      )}

      {poll.groups.map((g, i) => (
        <div key={g.label ?? i} className="mt-2">
          {g.label && <p className={meta}>{g.label}</p>}
          <ul className="mt-1 divide-y divide-dashed divide-border">
            {g.rows.map((r) => (
              <li key={r.label} className="flex justify-between gap-4 py-1 text-sm">
                <span>
                  {r.candidateSlug ? (
                    <Link
                      href={`/candidates/${r.candidateSlug}`}
                      className="underline decoration-2 underline-offset-2"
                    >
                      {r.label}
                    </Link>
                  ) : (
                    r.label
                  )}
                </span>
                {/* Verbatim. A range stays a range. */}
                <span className="shrink-0 font-mono tabular-nums">{r.value}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {poll.notes && (
        <p className="mt-2 max-w-[62ch] text-sm text-muted-foreground">{poll.notes}</p>
      )}
      <p className="mt-2 flex flex-wrap gap-x-3">
        {poll.sources.map((s) => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${meta} underline decoration-2 underline-offset-2`}
          >
            {s.name} →
          </a>
        ))}
      </p>
    </li>
  );
}

export function RacePolls({ polls, raceName }: { polls: RacePoll[]; raceName: string }) {
  if (polls.length === 0) return null;
  const scientific = polls.filter((p) => p.scientific).length;
  return (
    <section id="polls" className="mt-8 scroll-mt-16">
      <h2 className="font-display text-2xl">Polls</h2>
      <p className="mt-2 max-w-[62ch] text-sm text-muted-foreground">
        {polls.length} published poll{polls.length === 1 ? "" : "s"} of the {raceName}
        {scientific < polls.length
          ? `, ${polls.length - scientific} of which are straw polls rather than polls of voters`
          : ""}
        , newest first. Figures are shown exactly as each pollster published them.{" "}
        <strong>We don&rsquo;t average polls</strong> — an average is a number no
        pollster published, and doing it properly takes modelling we don&rsquo;t
        do. For averages, use the trackers below.
      </p>

      <ol className="mt-3 divide-y-2 divide-border border-2 border-border bg-card px-4 shadow-[var(--shadow-brutal)]">
        {polls.map((p) => (
          <Poll key={p.pollKey} poll={p} />
        ))}
      </ol>

      <div className="mt-3 border-2 border-dashed border-border p-3">
        <p className={meta}>Poll trackers &amp; averages</p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {AGGREGATORS.map((a) => (
            <li key={a.url}>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline decoration-2 underline-offset-2"
              >
                {a.name} →
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
