"use client";

import { useMemo, useState } from "react";
import type { Doc } from "../../../convex/_generated/dataModel";

type StatusFilter = "all" | "active" | "inactive";
type MatchFilter = "all" | "matched" | "unverified";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];
const MATCH_OPTIONS: { value: MatchFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "matched", label: "Matched" },
  { value: "unverified", label: "Unverified" },
];

/** Client-side search + filter over synced ads. Sorted by spend (biggest
 * spenders lead — the newsworthy end). */
export function AdsBrowser({ ads }: { ads: Doc<"ads">[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [match, setMatch] = useState<MatchFilter>("all");

  const sorted = useMemo(
    () => [...ads].sort((a, b) => (b.spendUpper ?? 0) - (a.spendUpper ?? 0)),
    [ads],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sorted.filter((a) => {
      if (status !== "all" && (a.status ?? "") !== status) return false;
      if (match === "matched" && !a.candidateSlug) return false;
      if (match === "unverified" && a.candidateSlug) return false;
      if (
        needle &&
        !`${a.pageOrCommittee} ${a.fundingEntity ?? ""} ${a.creativeText ?? ""}`
          .toLowerCase()
          .includes(needle)
      )
        return false;
      return true;
    });
  }, [sorted, q, status, match]);

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

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <PillGroup
          label="Status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={setStatus}
        />
        <PillGroup
          label="Attribution"
          value={match}
          options={MATCH_OPTIONS}
          onChange={setMatch}
        />
      </div>

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

function PillGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="flex">
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`border-2 border-border px-2 py-1 font-mono text-xs font-bold ${
              i > 0 ? "-ml-0.5" : ""
            } ${value === o.value ? "bg-primary text-primary-foreground" : "bg-card"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
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
