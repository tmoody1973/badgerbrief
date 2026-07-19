"use client";

import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/retroui/Button";

/** MOO-322 Task 4: /admin section for approving/rejecting scout-proposed article sources. */

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-2 border-2 border-border bg-warning p-2 text-sm font-bold"
    >
      {message}
    </p>
  );
}

function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Admin-gated queries throw for unauthenticated callers, and the Convex
// client starts unauthenticated while Clerk exchanges the JWT — skip until authed.
function useArticleSources() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.adminQueue.listArticleSources, isAuthenticated ? {} : "skip");
}

export function ArticleSources() {
  const rows = useArticleSources();
  const decide = useMutation(api.adminQueue.decideArticleSource);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleDecide = async (
    sourceId: Id<"article_sources">,
    decision: "approved" | "rejected",
  ) => {
    setBusyId(sourceId);
    setError(null);
    try {
      await decide({ sourceId, decision });
    } catch (err) {
      setError(asMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-6 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Article sources
      </p>
      <ErrorLine message={error} />
      {rows === undefined ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No proposed sources.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {rows.map((row) => (
            <li key={row._id} className="border-2 border-border bg-background p-3">
              <p className="text-sm">
                <span className="font-bold">{row.outlet}</span> —{" "}
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {row.headline}
                </a>
              </p>
              <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {row.candidateName}
                {row.publishedAt ? ` · ${row.publishedAt}` : ""}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{row.whyRelevant}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  disabled={busyId === row._id}
                  onClick={() => handleDecide(row._id, "approved")}
                >
                  {busyId === row._id ? "Working…" : "Approve"}
                </Button>
                <Button
                  variant="outline"
                  disabled={busyId === row._id}
                  onClick={() => handleDecide(row._id, "rejected")}
                >
                  {busyId === row._id ? "Working…" : "Reject"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
