"use client";

import { useState } from "react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { SourceTransparencyCard } from "./source-transparency-card";
import { ArticleThumb } from "./article-thumb";

type Row = { article: Doc<"article_sources">; outlet: Doc<"outlets"> | null };

/** One filter row: chips with live counts, keyboard- and screen-reader safe. */
function FilterRow({
  label, options, value, onChange,
}: {
  label: string;
  options: { key: string; label: string; count: number }[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  if (options.length < 2) return null; // nothing to choose between
  const chip = (active: boolean) =>
    `border-2 border-border px-2 py-1 font-mono text-xs ${active ? "bg-foreground text-background" : "bg-card"}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div role="group" aria-label={`Filter by ${label.toLowerCase()}`} className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={value === null} onClick={() => onChange(null)} className={chip(value === null)}>
          All
        </button>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={value === o.key}
            onClick={() => onChange(value === o.key ? null : o.key)}
            className={chip(value === o.key)}
          >
            {o.label} <span className="opacity-60">{o.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function NewsFeed({
  items,
  raceLabels = {},
}: {
  items: Row[];
  /** raceId → office name, so the race chips read "Governor", not "WI-GOV-2026". */
  raceLabels?: Record<string, string>;
}) {
  const [race, setRace] = useState<string | null>(null);
  const [outlet, setOutlet] = useState<string | null>(null);

  // Counts are computed against the OTHER filter's result, so a chip's number
  // is what you'd actually get if you clicked it.
  const tally = (rows: Row[], pick: (r: Row) => string | undefined) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = pick(r);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };

  const byOutlet = (r: Row) => r.article.outlet;
  const byRace = (r: Row) => r.article.raceId;

  const forRaceChips = outlet ? items.filter((r) => byOutlet(r) === outlet) : items;
  const forOutletChips = race ? items.filter((r) => byRace(r) === race) : items;

  const raceOptions = [...tally(forRaceChips, byRace)]
    .map(([key, count]) => ({ key, label: raceLabels[key] ?? key, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const outletOptions = [...tally(forOutletChips, byOutlet)]
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  // Server already sorted: verified-dated coverage first, newest first.
  const visible = items
    .filter((r) => (race ? byRace(r) === race : true))
    .filter((r) => (outlet ? byOutlet(r) === outlet : true));

  const filtered = race !== null || outlet !== null;

  return (
    <section className="mt-8">
      <div className="space-y-2">
        <FilterRow label="Race" options={raceOptions} value={race} onChange={setRace} />
        <FilterRow label="Outlet" options={outletOptions} value={outlet} onChange={setOutlet} />
      </div>

      {filtered ? (
        <p className="mt-3 font-mono text-xs text-muted-foreground" aria-live="polite">
          Showing {visible.length} of {items.length}.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => { setRace(null); setOutlet(null); }}
          >
            Clear filters
          </button>
        </p>
      ) : null}

      {visible.length === 0 ? (
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          {items.length === 0
            ? "We haven’t found tracked coverage yet."
            : "No tracked coverage matches those filters."}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {visible.map(({ article, outlet: o }) => (
            <li key={article._id} className="flex gap-3 border-2 border-border bg-card p-3">
              <ArticleThumb src={article.imageUrl} />
              <div className="min-w-0 flex-1">
                <a href={article.url} target="_blank" rel="noopener noreferrer" className="font-bold underline">
                  {article.headline}&nbsp;↗
                </a>
                {article.publishedAt ? (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{article.publishedAt}</span>
                ) : null}
                <div className="mt-1">
                  <SourceTransparencyCard outlet={o} outletName={article.outlet} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
