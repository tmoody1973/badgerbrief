"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/retroui/Button";

/**
 * Reader corrections and questions.
 *
 * Corrections sort above everything else regardless of age — one is a possible
 * published error about a named candidate, the other can wait. The source link
 * is rendered as the primary action because verifying a correction means
 * opening the record, not reading the report again.
 *
 * Submissions are unauthenticated and therefore untrusted: nothing here is
 * shown publicly, and "resolved" means a human checked it against the source.
 */
type Row = {
  _id: Id<"feedback">;
  kind: "correction" | "question" | "other";
  message: string;
  pageUrl?: string;
  sourceUrl?: string;
  contact?: string;
  status: "new" | "reviewed" | "resolved";
  submittedAt: number;
};

const KIND_LABEL: Record<Row["kind"], string> = {
  correction: "Correction",
  question: "Question",
  other: "Other",
};

const meta = "font-mono text-[11px] uppercase tracking-[0.1em]";

function FeedbackRow({ row }: { row: Row }) {
  const setStatus = useMutation(api.feedback.setStatus);
  const [busy, setBusy] = useState(false);
  const when = new Date(row.submittedAt).toISOString().slice(0, 16).replace("T", " ");

  const move = async (status: Row["status"]) => {
    setBusy(true);
    try {
      await setStatus({ id: row._id, status });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="border-2 border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`${meta} border-2 border-border px-2 py-0.5 font-bold ${
            row.kind === "correction" ? "bg-warning" : "bg-secondary"
          }`}
        >
          {KIND_LABEL[row.kind]}
        </span>
        <span className={`${meta} text-muted-foreground`}>{when} UTC</span>
        {row.status !== "new" && (
          <span className={`${meta} text-muted-foreground`}>· {row.status}</span>
        )}
      </div>

      <p className="mt-2 max-w-[70ch] whitespace-pre-wrap text-sm">{row.message}</p>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {row.sourceUrl && (
          // The whole point of a correction: open the record and compare.
          <a
            href={row.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${meta} font-bold underline decoration-2 underline-offset-2`}
          >
            Check the source →
          </a>
        )}
        {row.pageUrl && (
          <a
            href={row.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${meta} underline decoration-2 underline-offset-2`}
          >
            Page they were on →
          </a>
        )}
        {row.contact && (
          <span className={`${meta} text-muted-foreground`}>reply to: {row.contact}</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {row.status !== "reviewed" && (
          <Button disabled={busy} onClick={() => move("reviewed")}>
            Mark reviewed
          </Button>
        )}
        {row.status !== "resolved" && (
          <Button disabled={busy} onClick={() => move("resolved")}>
            Resolve
          </Button>
        )}
        {row.status !== "new" && (
          <Button variant="outline" disabled={busy} onClick={() => move("new")}>
            Reopen
          </Button>
        )}
      </div>
    </li>
  );
}

export function FeedbackQueue() {
  const rows = useQuery(api.feedback.list, {}) as Row[] | undefined;
  const [showResolved, setShowResolved] = useState(false);

  if (rows === undefined) {
    return <p className={`${meta} text-muted-foreground`}>Loading…</p>;
  }

  const open = rows.filter((r) => r.status !== "resolved");
  const resolved = rows.filter((r) => r.status === "resolved");
  const shown = showResolved ? resolved : open;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="max-w-[62ch] text-sm text-muted-foreground">
          Reader reports. Corrections are listed first — each one is a possible
          published error about a named candidate, which no automated check can
          catch. Verify against the linked source before resolving.
        </p>
      </div>

      <div className="mt-3 flex gap-2">
        <Button variant={showResolved ? "outline" : "primary"} onClick={() => setShowResolved(false)}>
          Open ({open.length})
        </Button>
        <Button variant={showResolved ? "primary" : "outline"} onClick={() => setShowResolved(true)}>
          Resolved ({resolved.length})
        </Button>
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {showResolved ? "Nothing resolved yet." : "No open reports."}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map((r) => (
            <FeedbackRow key={r._id} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
