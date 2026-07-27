"use client";

import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/retroui/Button";
import { asMessage, ErrorLine } from "./draft-row";

/**
 * MOO-412 follow-up: cluster view for the position review queue. Groups
 * duplicate extraction attempts (same race+candidate+issue) so a reviewer
 * approves the best draft and rejects the rest in one action instead of
 * triaging each duplicate individually in the flat queue.
 */

type Cluster = FunctionReturnType<typeof api.adminQueue.positionClusters>["clusters"][number];

function useClusters() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.adminQueue.positionClusters, isAuthenticated ? {} : "skip");
}

type ClusterFilter = "all" | "new" | "low";

function isLowConfidence(cluster: Cluster) {
  const keep = cluster.drafts.find((d) => d.isKeep);
  return (keep?.confidence ?? 1) < 0.5;
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press border-2 border-border px-3 py-1.5 text-sm font-bold ${
        active ? "bg-primary text-primary-foreground" : "bg-background"
      }`}
    >
      {children}
    </button>
  );
}

function ClusterCard({ cluster }: { cluster: Cluster }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const setReviewStatus = useMutation(api.publish.setDraftReviewStatus);
  const publishPosition = useMutation(api.publish.publishPosition);
  const bulkRejectPositions = useMutation(api.publish.bulkRejectPositions);

  const keep = cluster.drafts.find((d) => d.isKeep) ?? cluster.drafts[0];
  const dups = cluster.drafts.filter((d) => d.draftId !== keep.draftId);
  const lowConfidence = keep.confidence < 0.5;

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(asMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleApproveAndPublish = () =>
    run("approve-publish", async () => {
      await setReviewStatus({ kind: "position", draftId: keep.draftId, status: "approved" });
      await publishPosition({ draftId: keep.draftId });
    });

  const handleRejectDuplicates = () =>
    run("reject-dups", () =>
      bulkRejectPositions({
        items: dups.map((d) => ({ draftId: d.draftId, taskId: d.taskId })),
      }),
    );

  return (
    <li className="border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{cluster.candidateName}</span>
        <span className="text-sm text-muted-foreground">{cluster.office}</span>
        <span className="text-sm text-muted-foreground">· {cluster.issueSlug}</span>
        {cluster.isNew && (
          <span className="border-2 border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-secondary-foreground">
            NEW
          </span>
        )}
        {lowConfidence && (
          <span className="border-2 border-border bg-warning px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-foreground">
            LOW
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {cluster.drafts.length} draft{cluster.drafts.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-3 border-2 border-primary bg-background p-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-bold uppercase">{keep.stance}</span>
          <span className="text-muted-foreground">{Math.round(keep.confidence * 100)}% confidence</span>
          <a href={keep.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
            {keep.sourceName || keep.sourceUrl}
          </a>
        </div>
        <p className="mt-1 text-sm">{keep.summary}</p>
        <Button
          className="mt-2"
          variant="primary"
          disabled={busy !== null}
          onClick={handleApproveAndPublish}
        >
          {busy === "approve-publish" ? "Approving…" : "Approve & publish"}
        </Button>
      </div>

      {dups.length > 0 && (
        <div className="mt-3 space-y-2 opacity-60">
          {dups.map((d) => (
            <div key={d.draftId} className="border-b border-border/50 pb-2 text-sm">
              <span className="text-muted-foreground">{d.sourceName || d.sourceUrl}</span>{" "}
              <span className="text-muted-foreground">· {Math.round(d.confidence * 100)}%</span>
              <p>{d.summary}</p>
            </div>
          ))}
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={handleRejectDuplicates}
          >
            {busy === "reject-dups"
              ? "Rejecting…"
              : `Reject ${dups.length} duplicate${dups.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}

      <ErrorLine message={error} />
    </li>
  );
}

export function PositionClusters() {
  const data = useClusters();
  const [filter, setFilter] = useState<ClusterFilter>("all");

  const clusters = data?.clusters ?? [];
  const filtered = clusters.filter((c) => {
    if (filter === "new") return c.isNew;
    if (filter === "low") return isLowConfidence(c);
    return true;
  });

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </FilterChip>
        <FilterChip active={filter === "new"} onClick={() => setFilter("new")}>
          New coverage
        </FilterChip>
        <FilterChip active={filter === "low"} onClick={() => setFilter("low")}>
          Low confidence
        </FilterChip>
      </div>

      <div className="mt-3">
        {data === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending position clusters.</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((cluster) => (
              <ClusterCard key={`${cluster.raceId}|${cluster.candidateSlug}|${cluster.issueSlug}`} cluster={cluster} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
