"use client";

import { type ReactNode, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/retroui/Button";
import { asMessage, ErrorLine } from "./draft-row";

/**
 * MOO-309 ad attribution. Two reviewers:
 *  - AdReviewQueue: ads the sync name-matched to a candidate (have a review
 *    task) — confirm/correct the candidate + support/attack, or dismiss.
 *  - UnattributedAds: the biggest ads with NO candidate match (issue ads /
 *    PACs, e.g. a Google $300k buy) — attribute them directly if they're about
 *    a candidate. These never got a review task, so they'd otherwise be invisible.
 * Both filter by platform (Meta/Google) and search.
 */

type Candidate = { slug: string; name: string; raceId: string; office: string };
type Platform = "all" | "meta" | "google" | "tv";

// ---------- shared bits ----------

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className="border-2 border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-secondary-foreground">
      {platform}
    </span>
  );
}

/** Own-committee sponsor (name in the sponsor) → supports; else attack. */
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
  const opts = [
    { value: "support" as const, label: "Supports", active: "bg-success text-white" },
    { value: "oppose" as const, label: "Attacks", active: "bg-destructive text-white" },
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

function Pills<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex">
      {options.map(([val, label], i) => (
        <button
          key={val}
          type="button"
          aria-pressed={value === val}
          onClick={() => onChange(val)}
          className={`border-2 border-border px-2 py-1.5 font-mono text-xs font-bold ${
            i > 0 ? "-ml-0.5" : ""
          } ${value === val ? "bg-primary text-primary-foreground" : "bg-card"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function AdSummary({ ad }: { ad: Doc<"ads"> }) {
  const { spendLower: lo, spendUpper: hi } = ad;
  const spend =
    lo === undefined && hi === undefined
      ? "spend n/a"
      : lo === hi // TV spend is exact (lower===upper)
        ? `$${(hi ?? lo)!.toLocaleString()}`
        : `$${(lo ?? 0).toLocaleString()}–$${(hi ?? 0).toLocaleString()}`;
  const isTv = ad.platform === "tv";
  const tvMeta = [
    ad.station,
    ad.dma,
    ad.spotCount ? `${ad.spotCount} spots` : null,
    ad.flightStart
      ? `${ad.flightStart}${ad.flightEnd ? `–${ad.flightEnd}` : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <PlatformBadge platform={ad.platform} />
          <span className="font-bold">{ad.pageOrCommittee}</span>
        </span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {spend}
        </span>
      </div>
      {ad.fundingEntity && ad.fundingEntity !== ad.pageOrCommittee && (
        <p className="text-xs text-muted-foreground">Paid for by {ad.fundingEntity}</p>
      )}
      {isTv && tvMeta && (
        <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {tvMeta}
        </p>
      )}
      {ad.creativeText && (
        <p className="mt-1 line-clamp-3 text-sm">{ad.creativeText}</p>
      )}
      {isTv && ad.fccDocUrl && (
        <a
          href={ad.fccDocUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block font-mono text-xs underline decoration-2 underline-offset-2"
        >
          View FCC order ↗
        </a>
      )}
      {ad.snapshotUrl && (
        <a
          href={ad.snapshotUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block font-mono text-xs underline decoration-2 underline-offset-2"
        >
          View ad on {ad.platform === "google" ? "Google" : "Meta"} ↗
        </a>
      )}
    </div>
  );
}

/** Per-row picker + stance + Confirm. Local state so rows are independent. */
function AttributionControls({
  ad,
  candidates,
  initialSlug,
  busy,
  onConfirm,
  children,
}: {
  ad: Doc<"ads">;
  candidates: Candidate[];
  initialSlug?: string;
  busy: boolean;
  onConfirm: (slug: string, stance: "support" | "oppose") => void;
  children?: ReactNode;
}) {
  const [slug, setSlug] = useState(initialSlug ?? "");
  const [stanceOverride, setStanceOverride] = useState<
    "support" | "oppose" | null
  >(null);
  const cand = candidates.find((c) => c.slug === slug);
  const stance = stanceOverride ?? defaultStance(cand?.name, ad);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <select
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        aria-label="Candidate"
        className="border-2 border-border bg-card px-2 py-1.5 font-mono text-sm"
      >
        <option value="">— pick candidate —</option>
        {candidates.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name} · {c.office}
          </option>
        ))}
      </select>
      <StanceToggle value={stance} onChange={setStanceOverride} />
      <Button disabled={busy || !slug} onClick={() => onConfirm(slug, stance)}>
        {busy ? "Saving…" : "Confirm"}
      </Button>
      {children}
    </div>
  );
}

function useBusyRunner() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  return { busyId, error, run };
}

const PLATFORM_OPTS = [
  ["all", "All"],
  ["tv", "TV"],
  ["meta", "Meta"],
  ["google", "Google"],
] as const;

// ---------- name-matched attribution queue ----------

export function AdReviewQueue() {
  const { isAuthenticated } = useConvexAuth();
  const data = useQuery(api.adminQueue.adQueue, isAuthenticated ? {} : "skip");
  const confirmMatch = useMutation(api.adminQueue.confirmAdMatch);
  const resolveTask = useMutation(api.adminQueue.resolveTask);
  const { busyId, error, run } = useBusyRunner();

  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<Platform>("all");
  const [stanceFilter, setStanceFilter] = useState<"all" | "oppose" | "support">("all");
  const [office, setOffice] = useState("all");

  const candidates: Candidate[] = data?.candidates ?? [];
  const nameOf = (slug?: string) => candidates.find((c) => c.slug === slug)?.name;
  const officeOf = (slug?: string) => candidates.find((c) => c.slug === slug)?.office;
  const offices = [...new Set(candidates.map((c) => c.office).filter(Boolean))].sort();

  const rows = (data?.rows ?? []).filter((row) => {
    if (platform !== "all" && row.ad.platform !== platform) return false;
    if (office !== "all" && officeOf(row.suggestedSlug) !== office) return false;
    if (stanceFilter !== "all" && defaultStance(nameOf(row.suggestedSlug), row.ad) !== stanceFilter)
      return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${row.ad.pageOrCommittee} ${row.ad.fundingEntity ?? ""} ${row.ad.creativeText ?? ""} ${nameOf(row.suggestedSlug) ?? ""}`
      .toLowerCase()
      .includes(q);
  });

  return (
    <div className="mt-6 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Ad attribution · name-matched
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
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search candidate, sponsor, text…"
              className="min-w-40 flex-1 border-2 border-border bg-card px-2 py-1.5 font-mono text-sm"
            />
            <Pills value={platform} options={PLATFORM_OPTS} onChange={setPlatform} />
            <Pills
              value={stanceFilter}
              options={[["all", "All"], ["oppose", "Attacks"], ["support", "Support"]] as const}
              onChange={setStanceFilter}
            />
            <select
              value={office}
              onChange={(e) => setOffice(e.target.value)}
              aria-label="Race"
              className="border-2 border-border bg-card px-2 py-1.5 font-mono text-xs font-bold"
            >
              <option value="all">All races</option>
              {offices.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {rows.length} shown · {data.openCount} open (biggest spenders first).
          </p>
          <ul className="mt-3 space-y-3">
            {rows.map(({ task, ad, suggestedSlug }) => (
              <li key={task._id} className="border-2 border-border bg-background p-3">
                <AdSummary ad={ad} />
                <AttributionControls
                  ad={ad}
                  candidates={candidates}
                  initialSlug={suggestedSlug}
                  busy={busyId === task._id}
                  onConfirm={(slug, stance) =>
                    run(task._id, () =>
                      confirmMatch({
                        taskId: task._id as Id<"review_tasks">,
                        candidateSlug: slug,
                        stance,
                      }),
                    )
                  }
                >
                  <Button
                    variant="outline"
                    disabled={busyId === task._id}
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
                </AttributionControls>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ---------- biggest unattributed ads (no candidate match) ----------

export function UnattributedAds() {
  const { isAuthenticated } = useConvexAuth();
  const data = useQuery(api.adminQueue.unattributedAds, isAuthenticated ? {} : "skip");
  const attributeAd = useMutation(api.adminQueue.attributeAd);
  const { busyId, error, run } = useBusyRunner();

  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<Platform>("all");

  const candidates: Candidate[] = data?.candidates ?? [];
  const rows = (data?.rows ?? []).filter((ad) => {
    if (platform !== "all" && ad.platform !== platform) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${ad.pageOrCommittee} ${ad.fundingEntity ?? ""} ${ad.creativeText ?? ""}`
      .toLowerCase()
      .includes(q);
  });

  return (
    <div className="mt-6 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Unattributed spenders (no candidate match)
        </p>
        {data && (
          <span className="border-2 border-border bg-card px-1.5 font-mono text-[10px] font-bold">
            {data.unattributedCount} total
          </span>
        )}
      </div>
      <ErrorLine message={error} />

      {data === undefined ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            The biggest ads the sync couldn&apos;t tie to a candidate — issue ads
            and PACs. If one is about a candidate, attribute it (e.g. an attack
            PAC → the candidate it targets). Top 60 by spend.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sponsor or text…"
              className="min-w-40 flex-1 border-2 border-border bg-card px-2 py-1.5 font-mono text-sm"
            />
            <Pills value={platform} options={PLATFORM_OPTS} onChange={setPlatform} />
          </div>
          <ul className="mt-3 space-y-3">
            {rows.map((ad) => (
              <li key={ad._id} className="border-2 border-border bg-background p-3">
                <AdSummary ad={ad} />
                <AttributionControls
                  ad={ad}
                  candidates={candidates}
                  busy={busyId === ad._id}
                  onConfirm={(slug, stance) =>
                    run(ad._id, () =>
                      attributeAd({
                        adId: ad._id as Id<"ads">,
                        candidateSlug: slug,
                        stance,
                      }),
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
