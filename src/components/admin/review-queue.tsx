"use client";

import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/retroui/Button";
import { asMessage, DraftRow, ErrorLine, type QueueRow } from "./draft-row";

/**
 * MOO-312 Task 4 / MOO-327: admin review dashboard — triage queue, alerts.
 * Rows are collapsed by default (draft-row.tsx) so dozens of drafts triage
 * without scrolling back up after each action.
 */

// Admin-gated queries throw for unauthenticated callers, and the Convex client
// starts unauthenticated while Clerk exchanges the JWT — skip until authed.
function useQueue() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.adminQueue.list, isAuthenticated ? {} : "skip");
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-primary text-primary-foreground",
  warning: "bg-warning text-foreground",
  info: "bg-muted text-foreground",
};

function AlertsSection() {
  const { isAuthenticated } = useConvexAuth();
  const rows = useQuery(api.adminQueue.alerts, isAuthenticated ? {} : "skip");
  const resolveAlert = useMutation(api.adminQueue.resolveAlert);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleResolve = async (alertId: Id<"alerts">) => {
    setBusyId(alertId);
    setError(null);
    try {
      await resolveAlert({ alertId });
    } catch (err) {
      setError(asMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-6 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Alerts
      </p>
      <ErrorLine message={error} />
      {rows === undefined ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No open alerts.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((a) => (
            <li key={a._id} className="flex items-center justify-between gap-3 border-b border-border/50 pb-2 text-sm">
              <span>
                <span
                  className={`mr-2 inline-block border-2 border-border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${SEVERITY_STYLES[a.severity] ?? SEVERITY_STYLES.info}`}
                >
                  {a.severity}
                </span>
                {a.message}
              </span>
              <Button
                variant="outline"
                disabled={busyId === a._id}
                onClick={() => handleResolve(a._id)}
              >
                {busyId === a._id ? "Resolving…" : "Resolve"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Filter = "all" | "position" | "quote";

function FilterTab({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press flex items-center gap-1.5 border-2 border-border px-3 py-1.5 text-sm font-bold ${
        active ? "bg-primary text-primary-foreground" : "bg-background"
      }`}
    >
      {children}
      <span className="border-2 border-border bg-card px-1.5 font-mono text-[10px] text-card-foreground">
        {count}
      </span>
    </button>
  );
}

function countByKind(rows: QueueRow[] | undefined, kind: QueueRow["kind"]) {
  return rows?.filter((r) => r.kind === kind).length ?? 0;
}

export function ReviewQueue() {
  const rows = useQueue();
  const [filter, setFilter] = useState<Filter>("all");

  const positionCount = countByKind(rows, "position");
  const quoteCount = countByKind(rows, "quote");
  const totalCount = rows?.length ?? 0;
  const filtered = rows?.filter((r) => filter === "all" || r.kind === filter) ?? [];

  return (
    <div>
      <div className="border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b-2 border-border bg-card p-3">
          <div className="flex flex-wrap gap-2">
            <FilterTab active={filter === "all"} count={totalCount} onClick={() => setFilter("all")}>
              All
            </FilterTab>
            <FilterTab
              active={filter === "position"}
              count={positionCount}
              onClick={() => setFilter("position")}
            >
              Positions
            </FilterTab>
            <FilterTab active={filter === "quote"} count={quoteCount} onClick={() => setFilter("quote")}>
              Quotes
            </FilterTab>
          </div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {filtered.length} remaining
          </p>
        </div>

        <div className="p-3">
          {rows === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Queue is empty.</p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((row) => (
                <li key={row.task._id}>
                  <DraftRow row={row} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <AlertsSection />
    </div>
  );
}
