"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CATEGORY_META } from "@/lib/financeSegments";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/** Site-wide donor lookup for /money. searchDonors returns one row per
 * (donor, candidate) — dedupe by donorKey with summed totals. */
export function DonorSearch() {
  const [term, setTerm] = useState("");
  const searching = term.trim().length >= 2;
  const rows = useQuery(api.donors.searchDonors, searching ? { term } : "skip");
  const donors = new Map<
    string,
    { donorName: string; location?: string; category: string; total: number; campaigns: number }
  >();
  for (const r of rows ?? []) {
    const d = donors.get(r.donorKey) ?? {
      donorName: r.donorName,
      location: r.location,
      category: r.category,
      total: 0,
      campaigns: 0,
    };
    d.total = Math.round((d.total + r.total) * 100) / 100;
    d.campaigns += 1;
    donors.set(r.donorKey, d);
  }
  const list = [...donors.entries()].sort((a, b) => b[1].total - a[1].total);
  return (
    <div className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <label htmlFor="donor-search" className="font-mono text-xs font-bold uppercase tracking-widest">
        Look up a donor
      </label>
      <input
        id="donor-search"
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Name of a person, PAC, union, or business…"
        className="mt-2 w-full border-2 border-border bg-background px-3 py-2 text-sm"
      />
      {searching && (
        <ul className="mt-3 space-y-1 text-sm">
          {list.map(([key, d]) => {
            const meta = CATEGORY_META[d.category];
            return (
              <li key={key} className="flex items-center justify-between gap-2 border-b border-dashed border-border pb-1">
                <span className="min-w-0">
                  <Link href={`/donors/${encodeURIComponent(key)}`} className="font-bold underline">
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
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    ·{d.campaigns} campaign{d.campaigns === 1 ? "" : "s"}
                  </span>
                </span>
              </li>
            );
          })}
          {list.length === 0 && rows !== undefined && (
            <li className="text-muted-foreground">No donors match that search.</li>
          )}
        </ul>
      )}
      <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        Names as reported; the same person may appear under multiple spellings · Totals reflect top
        matches — tap a donor for exact figures
      </p>
    </div>
  );
}
