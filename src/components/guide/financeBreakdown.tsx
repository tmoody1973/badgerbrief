"use client";

import { useState } from "react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { computeSegments, type BreakdownCategory, type Segment } from "@/lib/financeSegments";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

/** Plain-English takeaways, warning-box style (renders nothing when empty). */
function Takeaways({ takeaways }: { takeaways: string[] }) {
  if (takeaways.length === 0) return null;
  return (
    <div className="mt-3 border-2 border-border bg-warning p-4 text-sm text-foreground shadow-[var(--shadow-brutal)]">
      <strong>What it means.</strong>{" "}
      {takeaways.map((t) => (
        <span key={t}>{t} </span>
      ))}
    </div>
  );
}

/** Interactive stacked funding-mix bar; tap a segment for its top donors. */
function FundingMixBar({ categories }: { categories: BreakdownCategory[] }) {
  const segments = computeSegments(categories);
  const [open, setOpen] = useState<string | null>(null);
  if (segments.length === 0) return null;
  const openSeg = segments.find((s) => s.key === open);
  return (
    <div className="mt-3">
      <h3 className="font-mono text-xs font-bold uppercase tracking-widest">
        Where the money comes from
      </h3>
      <div className="mt-2 flex h-9 w-full overflow-hidden border-2 border-border shadow-[var(--shadow-brutal)]">
        {segments.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-expanded={open === s.key}
            title={`${s.label}: ${s.pct}% (${fmt(s.amount)})`}
            onClick={() => setOpen(open === s.key ? null : s.key)}
            style={{ width: `${s.pct}%`, backgroundColor: s.color }}
            className={`h-full min-w-[2px] border-r border-border last:border-r-0 ${
              open === s.key ? "outline outline-2 outline-offset-[-3px] outline-foreground" : ""
            }`}
          >
            {s.pct >= 12 && (
              <span className="px-1 font-mono text-[10px] font-bold text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.6)]">
                {s.pct}%
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setOpen(open === s.key ? null : s.key)}
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
          >
            <span
              className="inline-block h-2.5 w-2.5 border border-border"
              style={{ backgroundColor: s.color }}
            />
            {s.label} {s.pct}%
          </button>
        ))}
      </div>
      {/* Screen-reader equivalent of the bar */}
      <table className="sr-only">
        <caption>Funding mix by source type</caption>
        <tbody>
          {segments.map((s) => (
            <tr key={s.key}>
              <th scope="row">{s.label}</th>
              <td>{s.pct}%</td>
              <td>{fmt(s.amount)}</td>
              <td>{s.count} donors</td>
            </tr>
          ))}
        </tbody>
      </table>
      {openSeg && <SegmentPanel segment={openSeg} />}
    </div>
  );
}

function SegmentPanel({ segment }: { segment: Segment }) {
  return (
    <div className="mt-2 border-2 border-dashed border-border bg-secondary/40 p-3">
      <p className="text-xs">
        <span className="font-bold">{segment.label}:</span>{" "}
        <span className="font-mono font-bold">{fmt(segment.amount)}</span> from{" "}
        {segment.count.toLocaleString("en-US")} donor{segment.count === 1 ? "" : "s"}.
        {segment.topDonors.length > 0 ? " Largest:" : ""}
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {segment.topDonors.map((d) => (
          <li key={d.name} className="flex justify-between gap-2 border-b border-dashed border-border pb-1">
            <span>
              {d.name}
              {d.location ? ` (${d.location})` : ""}
            </span>
            <span className="font-mono">{fmt(d.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Small-vs-big donors and in/out-of-state, as two expandable stat tiles. */
function SizeGeoTiles({ breakdown }: { breakdown: Doc<"finance_breakdowns"> }) {
  const size = breakdown.sizeBuckets;
  const sizeTotal = size.reduce((s, b) => s + b.amount, 0);
  const small = size.find((b) => b.key === "small");
  const geo = breakdown.geo;
  const geoKnown = geo.inState.amount + geo.outOfState.amount;
  const bucketLabel: Record<string, string> = {
    small: "under $200",
    mid: "$200–$999",
    large: "$1,000 and up",
  };
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {sizeTotal > 0 && small && (
        <details className="border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)]">
          <summary className="cursor-pointer">
            <span className="font-display text-xl">
              {Math.round((100 * small.amount) / sizeTotal)}%
            </span>{" "}
            <span className="text-sm">
              from donations under $200 ({small.count.toLocaleString("en-US")} donors)
            </span>
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {size.map((b) => (
              <li key={b.key} className="flex justify-between border-b border-dashed border-border pb-1">
                <span>{bucketLabel[b.key] ?? b.key}</span>
                <span className="font-mono">
                  {fmt(b.amount)} · {b.count.toLocaleString("en-US")} donors
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">
            Individual donors only, grouped by each donor&apos;s total
          </p>
        </details>
      )}
      {geoKnown > 0 && (
        <details className="border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)]">
          <summary className="cursor-pointer">
            <span className="font-display text-xl">
              {Math.round((100 * geo.inState.amount) / geoKnown)}%
            </span>{" "}
            <span className="text-sm">from Wisconsin</span>
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {(
              [
                ["Wisconsin", geo.inState],
                ["Out of state", geo.outOfState],
                ["Unknown", geo.unknown],
              ] as const
            ).map(([label, g]) => (
              <li key={label} className="flex justify-between border-b border-dashed border-border pb-1">
                <span>{label}</span>
                <span className="font-mono">
                  {fmt(g.amount)} · {g.count.toLocaleString("en-US")} donors
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">
            Individuals and businesses; committees excluded
          </p>
        </details>
      )}
    </div>
  );
}

/** Monthly fundraising mini bars. */
function MomentumBars({ monthly }: { monthly: { month: string; receipts: number }[] }) {
  if (monthly.length < 2) return null;
  const max = Math.max(...monthly.map((m) => m.receipts));
  if (max <= 0) return null;
  const latest = monthly[monthly.length - 1].month;
  const monthLabel = (m: string) =>
    new Date(`${m}-15T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return (
    <div className="mt-3 border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)]">
      <h3 className="font-mono text-xs font-bold uppercase tracking-widest">Monthly fundraising</h3>
      <div className="mt-2 flex h-20 items-end gap-1">
        {monthly.map((m) => (
          <div key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${monthLabel(m.month)}: ${fmt(m.receipts)}`}>
            <div
              style={{ height: `${Math.max(4, Math.round((100 * m.receipts) / max))}%` }}
            className={`w-full border border-border ${m.month === latest ? "bg-foreground" : "bg-muted-foreground/40"}`}
            />
            <span className="font-mono text-[9px] uppercase text-muted-foreground">
              {monthLabel(m.month)}
            </span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Monthly fundraising totals</caption>
        <tbody>
          {monthly.map((m) => (
            <tr key={m.month}>
              <th scope="row">{m.month}</th>
              <td>{fmt(m.receipts)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Non-interactive mini mix bar for the race comparison table. */
export function MixBarMini({ categories }: { categories: BreakdownCategory[] }) {
  const segments = computeSegments(categories);
  if (segments.length === 0) return null;
  return (
    <div
      className="flex h-4 w-28 overflow-hidden border border-border"
      role="img"
      aria-label={segments.map((s) => `${s.label} ${s.pct}%`).join(", ")}
    >
      {segments.map((s) => (
        <div key={s.key} style={{ width: `${s.pct}%`, backgroundColor: s.color }} className="h-full" />
      ))}
    </div>
  );
}

/** Shared legend for mini bars (render once above the race table). */
export function MixLegend({ keys }: { keys: string[] }) {
  const segments = computeSegments(
    keys.map((key) => ({ key, amount: 1, count: 1, topDonors: [] })),
  );
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {segments.map((s) => (
        <span key={s.key} className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          <span className="inline-block h-2.5 w-2.5 border border-border" style={{ backgroundColor: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Full candidate-page breakdown block. Renders nothing when no breakdown doc
 * exists (federal races and un-imported candidates look exactly like before).
 */
export function FinanceBreakdownSection({
  breakdown,
}: {
  breakdown?: Doc<"finance_breakdowns"> | null;
}) {
  if (!breakdown || breakdown.categories.length === 0) return null;
  return (
    <section className="mt-3">
      <Takeaways takeaways={breakdown.takeaways} />
      <FundingMixBar categories={breakdown.categories} />
      <SizeGeoTiles breakdown={breakdown} />
      <MomentumBars monthly={breakdown.monthly} />
    </section>
  );
}
