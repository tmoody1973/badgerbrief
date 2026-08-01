"use client";
import type { Shares } from "@/lib/signals";

const HOW_IT_LIES: Record<string, string> = {
  Polls: "The witness everyone quotes — but old and sparse in a primary.",
  "Social reach": "Buzz ≠ votes: skews young and online; August primary voters skew old.",
  "Ad spend": "Where the campaign THINKS the vote is — a revealed belief, not a result.",
  "News tone": "Earned media reaches older voters — but tone-scoring is error-prone, so we link every headline.",
};

function ShareRow({ label, shares }: { label: string; shares: Shares }) {
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
    </div>
  );
}

export function Witnesses({ signals }: { signals: Record<string, Shares> }) {
  return (
    <section className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
      <h2 className="font-display text-2xl">Meet the witnesses</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The same field, measured four different ways — as each candidate&apos;s <b className="text-foreground">share of the field</b>.
        Watch them disagree. Every witness lies in its own way.
      </p>
      <div className="mt-4">
        {Object.entries(signals).map(([label, shares]) => (
          <ShareRow key={label} label={label} shares={shares} />
        ))}
      </div>
    </section>
  );
}
