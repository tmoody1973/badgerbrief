"use client";

import { useMemo, useState } from "react";
import type { Doc } from "../../../convex/_generated/dataModel";

type StatusFilter = "all" | "active" | "inactive";
type MatchFilter = "all" | "matched" | "unverified";
type SortKey = "spend" | "sponsor" | "platform";
type SortDir = "asc" | "desc";

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

const platformLabel = (p: string) =>
  p === "meta" ? "Meta" : p === "google" ? "Google" : p === "tv" ? "TV" : p;

function money(n: number | undefined): string | null {
  if (n === undefined) return null;
  return "$" + n.toLocaleString("en-US");
}
function spendRange(ad: Doc<"ads">): string {
  const lo = money(ad.spendLower);
  const hi = money(ad.spendUpper);
  if (!lo && !hi) return "—";
  if (lo && !hi) return `${lo}+`;
  if (!lo && hi) return `up to ${hi}`;
  return lo === hi ? lo! : `${lo}–${hi}`;
}

/**
 * The full tracked-ad record as a dense, sortable table — built to scan
 * hundreds of ads, not a card gallery. Search + status/attribution filters
 * narrow the set; column headers sort it. Scrolls horizontally on small screens
 * inside its own container so the page body never scrolls sideways.
 */
export function AdsBrowser({ ads }: { ads: Doc<"ads">[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [match, setMatch] = useState<MatchFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "spend",
    dir: "desc",
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = ads.filter((a) => {
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
    const dir = sort.dir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      if (sort.key === "spend")
        return dir * ((a.spendUpper ?? 0) - (b.spendUpper ?? 0));
      if (sort.key === "platform")
        return dir * a.platform.localeCompare(b.platform);
      return dir * a.pageOrCommittee.localeCompare(b.pageOrCommittee);
    });
  }, [ads, q, status, match, sort]);

  const CAP = 150;
  const shown = filtered.slice(0, CAP);

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "spend" ? "desc" : "asc" },
    );

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
        <PillGroup label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        <PillGroup label="Attribution" value={match} options={MATCH_OPTIONS} onChange={setMatch} />
      </div>

      <p className="mt-3 font-mono text-xs text-muted-foreground">
        Showing {shown.length} of {filtered.length.toLocaleString()} tracked ad
        {filtered.length === 1 ? "" : "s"}
        {filtered.length > CAP ? " — refine your search to see more" : ""}
      </p>

      {filtered.length === 0 ? (
        <p className="mt-4 border-2 border-dashed border-border p-6 text-center text-muted-foreground">
          No ads match &ldquo;{q}&rdquo;.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto border-2 border-border shadow-[var(--shadow-brutal)]">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-border bg-card text-left">
                <Th label="Sponsor" sortKey="sponsor" sort={sort} onSort={toggleSort} />
                <Th label="Platform" sortKey="platform" sort={sort} onSort={toggleSort} />
                <Th label="Spend" sortKey="spend" sort={sort} onSort={toggleSort} align="right" />
                <th className="px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Attribution
                </th>
                <th className="px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Ad
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((ad) => (
                <tr
                  key={ad._id}
                  className="border-b-2 border-border last:border-b-0 hover:bg-secondary/40"
                >
                  <td className="px-3 py-2 align-top">
                    <span className="font-bold">{ad.pageOrCommittee}</span>
                    {ad.fundingEntity && ad.fundingEntity !== ad.pageOrCommittee && (
                      <span className="block text-xs text-muted-foreground">
                        Paid for by {ad.fundingEntity}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    {platformLabel(ad.platform)}
                    {ad.status ? ` · ${ad.status}` : ""}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right align-top font-mono font-bold">
                    {spendRange(ad)}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {ad.candidateSlug ? (
                      <span className="border-2 border-border bg-secondary px-1.5 py-0.5 text-xs font-bold">
                        {ad.candidateSlug}
                      </span>
                    ) : (
                      <span className="border-2 border-border bg-warning px-1.5 py-0.5 text-xs font-bold text-foreground">
                        Unverified
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top">
                    {ad.snapshotUrl && (
                      <a
                        href={ad.snapshotUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs underline decoration-2 underline-offset-2"
                      >
                        View ↗
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  return (
    <th className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
      >
        {label}
        <span aria-hidden className={active ? "text-foreground" : "opacity-30"}>
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "▼"}
        </span>
      </button>
    </th>
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
