"use client";

import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/retroui/Button";
import { asMessage, ErrorLine } from "./draft-row";

/**
 * MOO-309: resolve ad→candidate attributions. Each open ad_match task shows the
 * ad and a candidate picker (defaulted to the sync's suggestion). Confirming
 * attributes the ad publicly; dismissing leaves it unattributed on /ads.
 */
export function AdReviewQueue() {
  const { isAuthenticated } = useConvexAuth();
  const data = useQuery(api.adminQueue.adQueue, isAuthenticated ? {} : "skip");
  const confirmMatch = useMutation(api.adminQueue.confirmAdMatch);
  const resolveTask = useMutation(api.adminQueue.resolveTask);

  const [picks, setPicks] = useState<Record<string, string>>({});
  const [stances, setStances] = useState<Record<string, "support" | "oppose">>(
    {},
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stanceFilter, setStanceFilter] = useState<"all" | "oppose" | "support">(
    "all",
  );

  const nameOf = (slug?: string) =>
    data?.candidates.find((c) => c.slug === slug)?.name;

  const filteredRows = (data?.rows ?? []).filter((row) => {
    const guess = defaultStance(nameOf(row.suggestedSlug), row.ad);
    if (stanceFilter !== "all" && guess !== stanceFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${row.ad.pageOrCommittee} ${row.ad.fundingEntity ?? ""} ${
      row.ad.creativeText ?? ""
    } ${nameOf(row.suggestedSlug) ?? ""}`
      .toLowerCase()
      .includes(q);
  });

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(asMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-6 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Ad attribution
        </p>
        {data && (
          <span className="border-2 border-border bg-card px-1.5 font-mono text-[10px] font-bold">
            {data.openCount} open
          </span>
        )}
      </div>
      <ErrorLine message={error} />

      {data === undefined ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : data.rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No ad attributions to review.
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search candidate, sponsor, or ad text…"
              className="min-w-48 flex-1 border-2 border-border bg-card px-2 py-1.5 font-mono text-sm"
            />
            <div className="flex">
              {(
                [
                  ["all", "All"],
                  ["oppose", "Likely attacks"],
                  ["support", "Likely support"],
                ] as const
              ).map(([val, label], i) => (
                <button
                  key={val}
                  type="button"
                  aria-pressed={stanceFilter === val}
                  onClick={() => setStanceFilter(val)}
                  className={`border-2 border-border px-2 py-1.5 font-mono text-xs font-bold ${
                    i > 0 ? "-ml-0.5" : ""
                  } ${
                    stanceFilter === val
                      ? "bg-primary text-primary-foreground"
                      : "bg-card"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {filteredRows.length} shown · {data.openCount} open total (biggest
            spenders first). Confirm attributes the ad to that candidate&apos;s
            page; dismiss leaves it unattributed.
          </p>
          <ul className="mt-3 space-y-3">
            {filteredRows.map(({ task, ad, suggestedSlug }) => {
              const selected = picks[task._id] ?? suggestedSlug ?? "";
              const cand = data.candidates.find((c) => c.slug === selected);
              const stance =
                stances[task._id] ?? defaultStance(cand?.name, ad);
              const busy = busyId === task._id;
              return (
                <li
                  key={task._id}
                  className="border-2 border-border bg-background p-3"
                >
                  <AdSummary ad={ad} />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`cand-${task._id}`}>
                      Candidate
                    </label>
                    <select
                      id={`cand-${task._id}`}
                      value={selected}
                      onChange={(e) =>
                        setPicks((p) => ({ ...p, [task._id]: e.target.value }))
                      }
                      className="border-2 border-border bg-card px-2 py-1.5 font-mono text-sm"
                    >
                      <option value="">— pick candidate —</option>
                      {data.candidates.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <StanceToggle
                      value={stance}
                      onChange={(v) =>
                        setStances((s) => ({ ...s, [task._id]: v }))
                      }
                    />
                    <Button
                      disabled={busy || !selected}
                      onClick={() =>
                        run(task._id, () =>
                          confirmMatch({
                            taskId: task._id as Id<"review_tasks">,
                            candidateSlug: selected,
                            stance,
                          }),
                        )
                      }
                    >
                      {busy ? "Saving…" : "Confirm"}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(task._id, () =>
                          resolveTask({
                            taskId: task._id as Id<"review_tasks">,
                            outcome: "dismissed",
                          }),
                        )
                      }
                    >
                      Dismiss
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Default guess: an ad from the candidate's own committee (their name is in
 * the sponsor/funder) supports them; anyone else naming them is treated as an
 * attack until the reviewer says otherwise. */
function defaultStance(
  candidateName: string | undefined,
  ad: Doc<"ads">,
): "support" | "oppose" {
  if (!candidateName) return "oppose";
  const surname = candidateName.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
  const hay = `${ad.pageOrCommittee} ${ad.fundingEntity ?? ""}`.toLowerCase();
  return surname && hay.includes(surname) ? "support" : "oppose";
}

function StanceToggle({
  value,
  onChange,
}: {
  value: "support" | "oppose";
  onChange: (v: "support" | "oppose") => void;
}) {
  const opts: { value: "support" | "oppose"; label: string; active: string }[] =
    [
      { value: "support", label: "Supports", active: "bg-success text-white" },
      { value: "oppose", label: "Attacks", active: "bg-destructive text-white" },
    ];
  return (
    <div className="flex" role="group" aria-label="Ad stance">
      {opts.map((o, i) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`border-2 border-border px-2 py-1.5 font-mono text-xs font-bold ${
            i > 0 ? "-ml-0.5" : ""
          } ${value === o.value ? o.active : "bg-card"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AdSummary({ ad }: { ad: Doc<"ads"> }) {
  const spend =
    ad.spendLower !== undefined && ad.spendUpper !== undefined
      ? `$${ad.spendLower.toLocaleString()}–$${ad.spendUpper.toLocaleString()}`
      : "spend n/a";
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold">{ad.pageOrCommittee}</p>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {spend}
        </span>
      </div>
      {ad.fundingEntity && ad.fundingEntity !== ad.pageOrCommittee && (
        <p className="text-xs text-muted-foreground">
          Paid for by {ad.fundingEntity}
        </p>
      )}
      {ad.creativeText && (
        <p className="mt-1 line-clamp-3 text-sm">{ad.creativeText}</p>
      )}
      {ad.snapshotUrl && (
        <a
          href={ad.snapshotUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block font-mono text-xs underline decoration-2 underline-offset-2"
        >
          View ad on Meta ↗
        </a>
      )}
    </div>
  );
}
