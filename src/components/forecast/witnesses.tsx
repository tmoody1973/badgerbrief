"use client";
import type { Shares } from "@/lib/signals";
import { ACTIVE_DEM } from "@/lib/forecast";

const HOW_IT_LIES: Record<string, string> = {
  Polls: "The witness everyone quotes — but old and sparse in a primary.",
  "Social reach": "Buzz ≠ votes: skews young and online; August primary voters skew old.",
  "Ad spend": "Where the campaign THINKS the vote is — a revealed belief, not a result.",
  "News tone": "Earned media reaches older voters — but tone-scoring is error-prone, so we link every headline.",
};

export type NewsToneRow = {
  candidateSlug: string;
  positive: number;
  neutral: number;
  negative: number;
  net: number;
  count: number;
  stories: Array<{ headline: string; url: string; outlet: string; tone: "positive" | "neutral" | "negative" }>;
};

const TONE_MARK: Record<string, string> = { positive: "+", neutral: "·", negative: "−" };

/** Per-candidate +/neutral/− split AND the real linked headlines — the audit trail behind the News-tone bar. */
function NewsToneDetail({ rows }: { rows: NewsToneRow[] }) {
  const withStories = rows.filter((r) => ACTIVE_DEM[r.candidateSlug] && r.count > 0);
  if (withStories.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-dashed border-border pt-3">
      {withStories.map((r) => (
        <details key={r.candidateSlug} className="group">
          <summary className="flex cursor-pointer list-none items-center gap-3">
            <span className="w-16 shrink-0 font-mono text-sm">{ACTIVE_DEM[r.candidateSlug]}</span>
            <span className="flex h-3 flex-1 overflow-hidden border border-border">
              <span className="block h-full bg-success" style={{ width: `${(r.positive / r.count) * 100}%` }} />
              <span className="block h-full bg-muted" style={{ width: `${(r.neutral / r.count) * 100}%` }} />
              <span className="block h-full bg-destructive" style={{ width: `${(r.negative / r.count) * 100}%` }} />
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {r.positive}+ {r.neutral}· {r.negative}−
            </span>
          </summary>
          <ul className="mt-2 flex flex-col gap-1 pl-[4.75rem]">
            {r.stories.map((s) => (
              <li key={s.url} className="text-xs text-muted-foreground">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline decoration-dotted underline-offset-2 hover:text-primary"
                >
                  {s.outlet}: {s.headline}
                </a>{" "}
                <span className="font-mono">({TONE_MARK[s.tone] ?? s.tone})</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function ShareRow({
  label,
  shares,
  children,
}: {
  label: string;
  shares: Shares;
  children?: React.ReactNode;
}) {
  const rows = Object.entries(shares).sort((a, b) => b[1] - a[1]);
  const has = rows.some(([, v]) => v > 0);
  return (
    <div className="border-t border-border py-4 first:border-t-0">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs font-bold uppercase tracking-widest text-primary">{label}</span>
        <span className="text-xs text-muted-foreground">{HOW_IT_LIES[label]}</span>
      </div>
      {!has ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground">no data yet</p>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {rows.map(([name, v]) => (
            <div key={name} className="grid grid-cols-[4.5rem_1fr_2.6rem] items-center gap-3">
              <span className="font-mono text-sm">{name}</span>
              <span className="h-3 overflow-hidden border border-border bg-muted">
                <span className="block h-full bg-primary" style={{ width: `${Math.round(v * 100)}%` }} />
              </span>
              <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">{Math.round(v * 100)}%</span>
            </div>
          ))}
        </div>
      )}
      {has && children}
    </div>
  );
}

export function Witnesses({
  signals,
  newsDetail,
}: {
  signals: Record<string, Shares>;
  /** Raw per-candidate news-tone rows (incl. linked stories) — optional, News-tone row only. */
  newsDetail?: NewsToneRow[];
}) {
  return (
    <section className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
      <h2 className="font-display text-2xl">Meet the witnesses</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The same field, measured four different ways — as each candidate&apos;s <b className="text-foreground">share of the field</b>.
        Watch them disagree. Every witness lies in its own way.
      </p>
      <div className="mt-4">
        {Object.entries(signals).map(([label, shares]) => (
          <ShareRow key={label} label={label} shares={shares}>
            {label === "News tone" && newsDetail && <NewsToneDetail rows={newsDetail} />}
          </ShareRow>
        ))}
      </div>
    </section>
  );
}
