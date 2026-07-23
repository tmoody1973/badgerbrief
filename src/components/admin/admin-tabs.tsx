"use client";

import { useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { AdReviewQueue, UnattributedAds } from "./ad-review";
import { ReviewQueue } from "./review-queue";
import { ArticleSources } from "./article-sources";
import { OutletEditor } from "./outlet-editor";
import type { OutletType } from "../../../convex/lib/outlets";
import { sponsorKeyToSlug } from "@/lib/site";

type TabKey =
  | "attribution"
  | "unattributed"
  | "editorial"
  | "sources"
  | "narratives"
  | "outlets";

/**
 * Admin work is five independent queues that used to stack into one long scroll.
 * This shell shows one at a time with a live backlog count per tab, so a
 * reviewer jumps straight to the pile they care about (e.g. the TV orders).
 * Only the active section mounts.
 */
export function AdminTabs() {
  const { isAuthenticated } = useConvexAuth();
  const counts = useQuery(
    api.adminQueue.counts,
    isAuthenticated ? {} : "skip",
  );
  const pendingNarratives = useQuery(
    api.sponsors.pendingNarratives,
    isAuthenticated ? {} : "skip",
  );
  const draftOutlets = useQuery(
    api.outlets.listDraftOutlets,
    isAuthenticated ? {} : "skip",
  );
  const [tab, setTab] = useState<TabKey>("attribution");

  const tabs: { key: TabKey; label: string; count?: number; hint?: string }[] = [
    {
      key: "attribution",
      label: "Ad attribution",
      count: counts?.adMatch,
      hint: counts?.tv ? `${counts.tv} TV` : undefined,
    },
    { key: "unattributed", label: "Unattributed", count: counts?.unattributed },
    { key: "editorial", label: "Editorial", count: counts?.editorial },
    { key: "sources", label: "Sources", count: counts?.sources },
    { key: "narratives", label: "Narratives", count: pendingNarratives?.length },
    { key: "outlets", label: "Outlets", count: draftOutlets?.length },
  ];

  return (
    <div className="mt-4">
      <div
        className="sticky top-0 z-10 -mx-4 flex flex-wrap gap-2 border-b-2 border-border bg-card px-4 py-3"
        role="tablist"
        aria-label="Admin queues"
      >
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`press flex items-center gap-2 border-2 border-border px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-widest shadow-[var(--shadow-brutal)] ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-foreground"
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={`border-2 border-border px-1 text-[10px] ${
                    active ? "bg-card text-foreground" : "bg-background"
                  }`}
                >
                  {t.count}
                </span>
              )}
              {t.hint && (
                <span className="border-2 border-border bg-warning px-1 text-[10px] text-foreground">
                  {t.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2">
        {tab === "attribution" && <AdReviewQueue />}
        {tab === "unattributed" && <UnattributedAds />}
        {tab === "editorial" && <ReviewQueue />}
        {tab === "sources" && <ArticleSources />}
        {tab === "narratives" && <NarrativeQueue rows={pendingNarratives} />}
        {tab === "outlets" && <OutletQueue rows={draftOutlets} />}
      </div>
    </div>
  );
}

/** Draft outlets (transparency facts pending review) — each row is an
 * OutletEditor panel; approving is what makes the outlet's ownership/funding
 * facts public on /sponsors-style outlet pages and article bylines. */
function OutletQueue({
  rows,
}: {
  rows:
    | {
        key: string;
        displayName: string;
        type: OutletType;
        ownership?: string;
        fundingNote?: string;
        ownershipSourceUrl?: string;
        domain?: string;
        reviewStatus: "draft" | "approved";
      }[]
    | undefined;
}) {
  if (!rows) return null;
  if (rows.length === 0) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        No draft outlets pending review.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((o) => (
        <OutletEditor key={o.key} outlet={o} />
      ))}
    </div>
  );
}

/** Sponsors with a draft narrative awaiting approval — each links to its
 * public sponsor page, where the SponsorResolver panel (surfaced via the ad
 * attribution queues) does the actual editing/approving. */
function NarrativeQueue({
  rows,
}: {
  rows: { key: string; displayName: string }[] | undefined;
}) {
  if (!rows) return null;
  if (rows.length === 0) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        No narratives pending review.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.key}
          className="flex items-center justify-between border-2 border-border bg-card px-3 py-2 shadow-[var(--shadow-brutal)]"
        >
          <span className="font-mono text-sm font-bold">{r.displayName}</span>
          <Link
            href={`/sponsors/${sponsorKeyToSlug(r.key)}`}
            className="font-mono text-xs font-bold uppercase tracking-widest underline decoration-2 underline-offset-2"
          >
            Review →
          </Link>
        </li>
      ))}
    </ul>
  );
}
