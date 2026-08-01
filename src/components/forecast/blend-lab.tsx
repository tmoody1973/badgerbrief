"use client";
import { useMemo, useState } from "react";
import { blend, rank, applyTurnoutTilt, type Shares, type SignalKey, type TurnoutScenario } from "@/lib/signals";

const SIGNAL_ORDER: Array<{ key: SignalKey; label: string; hint: string }> = [
  { key: "polls", label: "Polls", hint: "The standard read of the race." },
  { key: "social", label: "Social reach", hint: "Online following — buzz, not votes." },
  { key: "adspend", label: "Ad spend", hint: "Where campaigns bet their money." },
  { key: "news", label: "News tone", hint: "How the news coverage leans." },
];

export function BlendLab({ signals }: { signals: Partial<Record<SignalKey, Shares>> }) {
  const [weights, setWeights] = useState<Record<SignalKey, number>>({ polls: 3, social: 1, adspend: 1, news: 1 });
  const [scenario, setScenario] = useState<TurnoutScenario>("broad");

  const ordered = useMemo(() => {
    const blended = blend(signals, weights);
    const tilted = applyTurnoutTilt(blended, scenario);
    return rank(tilted);
  }, [signals, weights, scenario]);

  const top = ordered[0]?.value ?? 1;

  return (
    <section className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
      <h2 className="font-display text-2xl">You be the forecaster</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Decide how much to trust each witness. The order below is <i>your</i> forecast — and it changes with your
        assumptions. <b className="text-foreground">That movement is the point. There is no &ldquo;right&rdquo; number.</b>
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Each slider is how much you trust that witness — slide it up to count it more, down to ignore it.
      </p>

      {/* weight sliders */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {SIGNAL_ORDER.map(({ key, label, hint }) => {
          const available = signals[key] && Object.keys(signals[key]!).length > 0;
          return (
            <label key={key} className={`block ${available ? "" : "opacity-40"}`}>
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {label}{available ? "" : " — no data"}
              </span>
              <input
                type="range" min={0} max={5} value={weights[key]} disabled={!available}
                onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                className="mt-2 w-full accent-primary"
              />
              <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
            </label>
          );
        })}
      </div>

      {/* turnout scenario */}
      <div className="mt-5">
        <span className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">Who shows up in August?</span>
        <div className="mt-2 flex gap-2">
          {(["broad", "hardcore"] as TurnoutScenario[]).map((s) => (
            <button key={s} type="button" onClick={() => setScenario(s)}
              className={`border-2 border-border px-3 py-1.5 font-mono text-xs uppercase ${scenario === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {s === "broad" ? "Broad electorate" : "Small hardcore electorate"}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Only a small, older slice of Wisconsin Democrats votes in an August primary — turnout reshapes who&apos;s really ahead.
          This tilt is <i>illustrative, not a measured model.</i>
        </p>
      </div>

      {/* re-ordered field — ordering + bar length ONLY, never a number */}
      <div className="mt-6 flex flex-col gap-2">
        {ordered.map(({ slug, value }, i) => (
          <div key={slug} className="grid grid-cols-[1.5rem_4.5rem_1fr] items-center gap-3">
            <span className="font-mono text-sm text-muted-foreground">{i + 1}</span>
            <span className="font-mono text-sm">{slug}</span>
            <span className="h-4 overflow-hidden border border-border bg-muted">
              <span className="block h-full bg-primary transition-[width] duration-500" style={{ width: `${top > 0 ? (value / top) * 100 : 0}%` }} />
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 font-mono text-xs text-muted-foreground">This is not a prediction — it&apos;s your assumptions, drawn as a picture.</p>
    </section>
  );
}
