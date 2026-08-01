"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  aggregate,
  parsePrimaryPolls,
  project,
  winProbability,
  ACTIVE_DEM,
} from "@/lib/forecast";

function Bars({
  data,
  max,
  suffix = "%",
}: {
  data: Record<string, number>;
  max: number;
  suffix?: string;
}) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div className="mt-4 flex flex-col gap-2.5">
      {rows.map(([name, v]) => (
        <div key={name} className="grid grid-cols-[4.5rem_1fr_3.2rem] items-center gap-3">
          <span className="font-mono text-sm">{name}</span>
          <span className="h-4 overflow-hidden border border-border bg-muted">
            <span
              className="block h-full bg-primary transition-[width] duration-300"
              style={{ width: `${Math.max(0, Math.min(100, (v / max) * 100))}%` }}
            />
          </span>
          <span className="text-right font-mono text-sm tabular-nums text-muted-foreground">
            {suffix === "%" ? Math.round(v) : v.toLocaleString()}
            {suffix === "%" ? "%" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function Slider({
  label,
  hint,
  min,
  max,
  value,
  onChange,
}: {
  label: React.ReactNode;
  hint: string;
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="mt-5">
      <label className="block font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-primary"
      />
      <p className="mt-1.5 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

export function ForecastExperience({ raceId }: { raceId: string }) {
  const rawPolls = useQuery(api.pollsQueries.forRace, { raceId });
  const social = useQuery(api.social.socialForRace, { raceId });

  const [halfLife, setHalfLife] = useState(21);
  const [split, setSplit] = useState(0);
  const [sd, setSd] = useState(10);

  const polls = useMemo(
    () => (rawPolls ? parsePrimaryPolls(rawPolls) : []),
    [rawPolls],
  );
  const avg = useMemo(() => aggregate(polls, halfLife), [polls, halfLife]);
  const { projected, leftover } = useMemo(() => project(avg, split), [avg, split]);
  const winProb = useMemo(() => winProbability(avg, sd), [avg, sd]);

  // Social reach: total followers per active-Dem candidate (live).
  const reach = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [slug, name] of Object.entries(ACTIVE_DEM)) {
      const rows = (social ?? []).filter((r) => r.candidateSlug === slug);
      const total = rows.reduce((s, r) => s + (r.followers ?? 0), 0);
      if (total > 0) out[name] = total;
    }
    return out;
  }, [social]);

  if (!rawPolls) {
    return <p className="mt-8 font-mono text-xs text-muted-foreground">Loading polls…</p>;
  }

  const oddsLeader = Object.entries(winProb).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="mt-8 space-y-8">
      {/* framing */}
      <div className="border-l-4 border-primary bg-card p-4">
        <p className="text-sm text-muted-foreground">
          <b className="text-foreground">This is not a prediction.</b> It combines public
          polls into one picture and shows how much is still uncertain. Move the sliders — the
          answer moves with your assumptions. That movement is the point.
        </p>
      </div>

      {/* standing */}
      <section className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
        <h2 className="font-display text-2xl">Where the polls put the race</h2>
        <Slider
          label={`Recency — old polls fade every ${halfLife} days`}
          hint="Left: only the freshest polls matter. Right: older polls still count."
          min={7}
          max={60}
          value={halfLife}
          onChange={setHalfLife}
        />
        <Slider
          label={`The ${Math.round(leftover)}% up for grabs — where do those voters go?`}
          hint="Undecided + Barnes's freed voters. 0 = follow the current standing · 100 = split evenly."
          min={0}
          max={100}
          value={split}
          onChange={setSplit}
        />
        <Bars data={projected} max={Math.max(...Object.values(projected), 1) * 1.05} />
      </section>

      {/* odds */}
      <section className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
        <h2 className="font-display text-2xl">Turning a lead into a probability</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We run the election 10,000 times, nudging each number within the uncertainty, and count
          how often each finishes first.
        </p>
        <Slider
          label={`How far off could the polls be? ${sd} points`}
          hint="Primaries are volatile with many undecideds — a wide spread is realistic."
          min={3}
          max={20}
          value={sd}
          onChange={setSd}
        />
        <Bars data={winProb} max={100} />
        <p className="mt-4 border-l-2 border-primary bg-muted/40 p-3 text-sm text-muted-foreground">
          <b className="text-foreground">Read it honestly:</b> this says {oddsLeader[0]} ~
          {Math.round(oddsLeader[1])}% — but it only models polling noise, and ignores the huge
          undecided bloc. Widen the slider and watch the “lock” melt into a real race.
        </p>
      </section>

      {/* social reach (live) */}
      {Object.keys(reach).length > 0 && (
        <section className="border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
          <h2 className="font-display text-2xl">Social reach</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Total followers across X, Instagram, Facebook &amp; YouTube (updated daily).{" "}
            <b className="text-foreground">Buzz ≠ votes</b> — attention, not a predictor.
          </p>
          <Bars data={reach} max={Math.max(...Object.values(reach), 1)} suffix="" />
        </section>
      )}

      <p className="font-mono text-xs text-muted-foreground">
        Poll aggregation + live social reach · not a prediction · built to show how to read a race.
      </p>
    </div>
  );
}
