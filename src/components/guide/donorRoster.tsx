"use client";

import { useState } from "react";
import Link from "next/link";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { CATEGORY_META } from "@/lib/financeSegments";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const donorHref = (key: string) => `/donors/${encodeURIComponent(key)}`;

function DonorRow({ d }: { d: Doc<"donor_totals"> }) {
  const meta = CATEGORY_META[d.category];
  return (
    <li className="flex items-center justify-between gap-2 border-b border-dashed border-border pb-1">
      <span className="min-w-0">
        <Link href={donorHref(d.donorKey)} className="font-bold underline">
          {d.donorName}
        </Link>
        {d.location ? <span className="text-muted-foreground"> ({d.location})</span> : null}
        {meta && (
          <span className="ml-1 inline-flex items-center gap-1 font-mono text-[10px] uppercase text-muted-foreground">
            <span className="inline-block h-2 w-2 border border-border" style={{ backgroundColor: meta.color }} />
            {meta.label}
          </span>
        )}
      </span>
      <span className="shrink-0 font-mono">
        {fmt(d.total)}
        <span className="ml-1 text-[10px] text-muted-foreground">·{d.giftCount}</span>
      </span>
    </li>
  );
}

function RosterBody({ raceId, candidateSlug }: { raceId: string; candidateSlug: string }) {
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const paged = usePaginatedQuery(
    api.donors.roster,
    { raceId, candidateSlug },
    { initialNumItems: 50 },
  );
  const searched = useQuery(
    api.donors.searchRoster,
    term.trim().length >= 2 ? { raceId, candidateSlug, term } : "skip",
  );
  const searching = term.trim().length >= 2;
  const rows = (searching ? (searched ?? []) : paged.results).filter(
    (d) => !category || d.category === category,
  );
  const coverage = rows[0]?.coverageEndDate ?? paged.results[0]?.coverageEndDate;
  return (
    <div className="mt-2 border-2 border-dashed border-border bg-secondary/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search donors by name…"
          aria-label="Search donors by name"
          className="w-56 border-2 border-border bg-card px-2 py-1 text-sm"
        />
        {Object.entries(CATEGORY_META).map(([key, meta]) => (
          <button
            key={key}
            type="button"
            aria-pressed={category === key}
            onClick={() => setCategory(category === key ? null : key)}
            className={`flex items-center gap-1 border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
              category === key ? "bg-foreground text-background" : "text-muted-foreground"
            }`}
          >
            <span className="inline-block h-2 w-2 border border-border" style={{ backgroundColor: meta.color }} />
            {meta.label}
          </button>
        ))}
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {rows.map((d) => (
          <DonorRow key={d._id} d={d} />
        ))}
      </ul>
      {rows.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          {searching ? "No donors match that search." : "Loading donors…"}
        </p>
      )}
      {!searching && paged.status === "CanLoadMore" && (
        <button
          type="button"
          onClick={() => paged.loadMore(200)}
          className="mt-3 border-2 border-border bg-warning px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-widest shadow-[var(--shadow-brutal)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
        >
          Load more donors
        </button>
      )}
      <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {coverage ? `Itemized contributions, ${coverage} · ` : ""}
        <a href={`/api/donors?race=${raceId}&candidate=${candidateSlug}`} className="underline">
          Download CSV
        </a>{" "}
        · Names as reported; the same person may appear under multiple spellings
      </p>
    </div>
  );
}

/** "See all N donors" expander under the candidate money section. */
export function DonorRosterSection({
  raceId,
  candidateSlug,
  breakdown,
}: {
  raceId: string;
  candidateSlug: string;
  breakdown?: Doc<"finance_breakdowns"> | null;
}) {
  const [open, setOpen] = useState(false);
  if (!breakdown || breakdown.categories.length === 0) return null;
  const donorCount = breakdown.categories.reduce((s, c) => s + c.count, 0);
  return (
    <section className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="border-2 border-border bg-card px-3 py-2 font-mono text-xs font-bold uppercase tracking-widest shadow-[var(--shadow-brutal)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
      >
        {open ? "▾" : "▸"} See all {donorCount.toLocaleString("en-US")} donors
      </button>
      {open && <RosterBody raceId={raceId} candidateSlug={candidateSlug} />}
    </section>
  );
}
