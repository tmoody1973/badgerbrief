"use client";

import { useMemo, useState } from "react";
import type { Doc } from "../../../convex/_generated/dataModel";

/** Client-side search over synced ads. Sorted by spend (biggest spenders lead —
 * that's the newsworthy end), filterable by sponsor / funder / creative text. */
export function AdsBrowser({ ads }: { ads: Doc<"ads">[] }) {
  const [q, setQ] = useState("");

  const sorted = useMemo(
    () => [...ads].sort((a, b) => (b.spendUpper ?? 0) - (a.spendUpper ?? 0)),
    [ads],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter((a) =>
      `${a.pageOrCommittee} ${a.fundingEntity ?? ""} ${a.creativeText ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [sorted, q]);

  const CAP = 120;
  const shown = filtered.slice(0, CAP);

  return (
    <div>
      <label className="block">
        <span className="sr-only">Search ads by sponsor, funder, or text</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search sponsor, funder, or ad text…"
          className="w-full border-2 border-border bg-card px-3 py-2 font-mono text-sm shadow-[var(--shadow-brutal)] focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </label>

      <p className="mt-3 font-mono text-xs text-muted-foreground">
        Showing {shown.length} of {filtered.length.toLocaleString()} tracked ad
        {filtered.length === 1 ? "" : "s"}
        {filtered.length > CAP ? " — refine your search to see more" : ""}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((ad) => (
          <AdCard key={ad._id} ad={ad} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-8 border-2 border-dashed border-border p-6 text-center text-muted-foreground">
          No ads match “{q}”.
        </p>
      )}
    </div>
  );
}

function money(n: number | undefined): string | null {
  if (n === undefined) return null;
  return "$" + n.toLocaleString("en-US");
}

function spendRange(ad: Doc<"ads">): string {
  const lo = money(ad.spendLower);
  const hi = money(ad.spendUpper);
  if (!lo && !hi) return "Spend not disclosed";
  if (lo && !hi) return `${lo}+`;
  if (!lo && hi) return `up to ${hi}`;
  return lo === hi ? lo! : `${lo}–${hi}`;
}

function impressionRange(ad: Doc<"ads">): string | null {
  const lo = ad.impressionsLower;
  const hi = ad.impressionsUpper;
  if (lo === undefined && hi === undefined) return null;
  const f = (n: number) => n.toLocaleString("en-US");
  if (lo !== undefined && hi !== undefined)
    return lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`;
  if (hi !== undefined) return `up to ${f(hi)}`;
  return `${f(lo!)}+`;
}

function AdCard({ ad }: { ad: Doc<"ads"> }) {
  const impressions = impressionRange(ad);
  return (
    <div className="flex flex-col border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {ad.platform === "meta" ? "Meta" : "Google"} · {ad.status ?? "—"}
        </p>
      </div>

      <h3 className="font-display mt-1 text-base leading-tight">
        {ad.pageOrCommittee}
      </h3>

      {ad.fundingEntity && ad.fundingEntity !== ad.pageOrCommittee && (
        <p className="mt-1 text-xs text-muted-foreground">
          Paid for by {ad.fundingEntity}
        </p>
      )}

      {ad.creativeText && (
        <p className="mt-2 line-clamp-4 text-sm">{ad.creativeText}</p>
      )}

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
        <div>
          <dt className="text-muted-foreground">Spend</dt>
          <dd className="font-bold">{spendRange(ad)}</dd>
        </div>
        {impressions && (
          <div>
            <dt className="text-muted-foreground">Impressions</dt>
            <dd className="font-bold">{impressions}</dd>
          </div>
        )}
      </dl>

      <div className="mt-auto flex items-center gap-2 pt-3">
        {ad.candidateSlug ? (
          <span className="border-2 border-border bg-secondary px-2 py-0.5 text-xs font-bold">
            {ad.candidateSlug}
          </span>
        ) : (
          <span className="border-2 border-border bg-warning px-2 py-0.5 text-xs font-bold text-foreground">
            Unverified sponsor
          </span>
        )}
        {ad.snapshotUrl && (
          <a
            href={ad.snapshotUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto font-mono text-xs underline decoration-2 underline-offset-2"
          >
            View ad ↗
          </a>
        )}
      </div>
    </div>
  );
}
