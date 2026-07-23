/* Hallmark · macrostructure: Ecosystem Index · tone: neo-brutalist public record
 * theme: locked by DESIGN.md (cream/charcoal/cardinal · Archivo Black + Public Sans + Geist Mono)
 * scope: /news page body · nav + footer owned by the app, untouched
 * pre-emit critique: P5 H5 E4 S5 R5 V4
 */
"use client";

import { useState } from "react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { SourceTransparencyStamp } from "./source-transparency-card";
import { ArticleThumb } from "./article-thumb";

type Row = { article: Doc<"article_sources">; outlet: Doc<"outlets"> | null };

const MONTH = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** The Stamp Rule: dates are record stamps — uppercase mono, "JUL 17".
 * The machine-readable ISO stays in <time datetime> for a11y and crawlers. */
function DateStamp({ iso }: { iso?: string }) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return null;
  return (
    <time
      dateTime={iso}
      className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground"
    >
      {MONTH[Number(m) - 1]} {Number(d)}
    </time>
  );
}

/** Headline link. Long words break rather than overflow the grid — DESIGN.md
 * warns about exactly this with Archivo Black on a phone. */
function Headline({ row, className }: { row: Row; className: string }) {
  return (
    <a
      href={row.article.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} block [overflow-wrap:anywhere] hover:underline`}
    >
      {row.article.headline}&nbsp;↗
    </a>
  );
}

function FilterStrip({
  label, options, value, onChange,
}: {
  label: string;
  options: { key: string; label: string; count: number }[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  if (options.length < 2) return null;
  const chip = (active: boolean) =>
    `-ml-0.5 shrink-0 whitespace-nowrap border-2 border-border px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] ${
      active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
    }`;
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      {/* Scrolls inside its own track — the page never scrolls sideways, and
          chips never wrap into two-line tap targets. */}
      <div
        role="group"
        aria-label={`Filter by ${label.toLowerCase()}`}
        className="flex min-w-0 flex-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
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
  raceLabels?: Record<string, string>;
}) {
  const [race, setRace] = useState<string | null>(null);
  const [outlet, setOutlet] = useState<string | null>(null);

  const byOutlet = (r: Row) => r.article.outlet;
  const byRace = (r: Row) => r.article.raceId;

  const tally = (rows: Row[], pick: (r: Row) => string | undefined) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = pick(r);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };

  // Each chip's count reflects the OTHER filter, so the number is what you'd
  // actually get if you tapped it.
  const raceOptions = [...tally(outlet ? items.filter((r) => byOutlet(r) === outlet) : items, byRace)]
    .map(([key, count]) => ({ key, label: raceLabels[key] ?? key, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const outletOptions = [...tally(race ? items.filter((r) => byRace(r) === race) : items, byOutlet)]
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  // Server already ranked these: verified-dated coverage first, newest first.
  const visible = items
    .filter((r) => (race ? byRace(r) === race : true))
    .filter((r) => (outlet ? byOutlet(r) === outlet : true));

  const filtered = race !== null || outlet !== null;
  const [lead, ...rest] = visible;
  const secondary = rest.slice(0, 2);
  const river = rest.slice(2);

  return (
    <section className="mt-6">
      <div className="space-y-2">
        <FilterStrip label="Race" options={raceOptions} value={race} onChange={setRace} />
        <FilterStrip label="Outlet" options={outletOptions} value={outlet} onChange={setOutlet} />
      </div>

      {filtered ? (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground" aria-live="polite">
          {visible.length} of {items.length}
          {" · "}
          <button type="button" className="underline" onClick={() => { setRace(null); setOutlet(null); }}>
            Clear
          </button>
        </p>
      ) : null}

      {!lead ? (
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          {items.length === 0
            ? "We haven’t found tracked coverage yet."
            : "No tracked coverage matches those filters."}
        </p>
      ) : (
        <>
          {/* THE LEAD — rank carried by size. Labelled by what it factually is
              (most recent), never "Top story" or "Breaking": BadgerBrief does
              not make that editorial call. */}
          <article className="press mt-6 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-primary">Most recent</p>
            <div className="mt-3">
              <ArticleThumb src={lead.article.imageUrl} size="lead" />
            </div>
            <h2 className="font-display mt-3 text-[clamp(1.5rem,5.5vw,2.25rem)] leading-[1.1]">
              <Headline row={lead} className="min-w-0" />
            </h2>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <DateStamp iso={lead.article.publishedAt} />
              <SourceTransparencyStamp outlet={lead.outlet} outletName={lead.article.outlet} />
            </div>
          </article>

          {secondary.length > 0 ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {secondary.map((row) => (
                <article
                  key={row.article._id}
                  className="press border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]"
                >
                  <ArticleThumb src={row.article.imageUrl} size="secondary" />
                  <h3 className={`${row.article.imageUrl ? "mt-3" : ""} text-lg font-bold leading-snug`}>
                    <Headline row={row} className="min-w-0" />
                  </h3>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <DateStamp iso={row.article.publishedAt} />
                    <SourceTransparencyStamp outlet={row.outlet} outletName={row.article.outlet} />
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {/* THE RIVER — density lives here. Dashed rules between rows rather
              than a card per story: DESIGN.md forbids nesting cards. */}
          {river.length > 0 ? (
            <div className="mt-6 border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
              <h2 className="border-b-2 border-border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                More coverage
              </h2>
              <ul>
                {river.map((row, i) => (
                  <li
                    key={row.article._id}
                    className={`flex gap-3 px-4 py-3 ${i > 0 ? "border-t-2 border-dashed border-border" : ""}`}
                  >
                    <ArticleThumb src={row.article.imageUrl} size="river" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold leading-snug">
                        <Headline row={row} className="min-w-0" />
                      </h3>
                      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <DateStamp iso={row.article.publishedAt} />
                        <SourceTransparencyStamp outlet={row.outlet} outletName={row.article.outlet} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
