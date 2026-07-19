"use client";

import { type MouseEvent, useRef, useState } from "react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/retroui/Button";

/** MOO-327: one row per draft in the review queue — compact by default, full detail on expand. */

export type QueueRow =
  | { task: Doc<"review_tasks">; kind: "position"; draft: Doc<"candidate_positions_drafts"> }
  | { task: Doc<"review_tasks">; kind: "quote"; draft: Doc<"quote_drafts"> };

function useAudit(refTable: string | undefined, refId: string | undefined) {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(
    api.audit.forRecord,
    isAuthenticated && refTable && refId ? { refTable, refId } : "skip",
  );
}

function fmt(ts: number) {
  return new Date(ts).toLocaleString();
}

export function asMessage(err: unknown): string {
  // ConvexError data survives to prod clients; plain Error messages are
  // redacted to "Server Error" there (publish gates throw ConvexError).
  if (err instanceof ConvexError) return String(err.data);
  return err instanceof Error ? err.message : String(err);
}

export function ErrorLine({ message }: { message: string | null }) {
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

/** Position drafts use {summary, stance, issueSlug}; quote drafts use {text, context, date, outlet}. */
function draftFormFields(row: QueueRow): Record<string, string> {
  if (row.kind === "position") {
    return {
      summary: row.draft.summary,
      stance: row.draft.stance,
      issueSlug: row.draft.issueSlug,
    };
  }
  return {
    text: row.draft.text,
    context: row.draft.context ?? "",
    date: row.draft.date ?? "",
    outlet: row.draft.outlet ?? "",
  };
}

function qaSummary(row: QueueRow) {
  const qa = row.task.qaScores as { claimSupport: number } | undefined;
  return qa ? Math.round(qa.claimSupport * 100) : null;
}

function summaryLine(row: QueueRow) {
  if (row.kind === "position") {
    // MOO-324: drafts are per-source, so two rows can share an issue — the
    // source name is what tells them apart at a glance.
    const sourceName = row.draft.sources[0]?.name;
    return sourceName ? `${row.draft.issueSlug} · ${sourceName}` : row.draft.issueSlug;
  }
  const text = row.draft.text;
  return text.length > 100 ? `${text.slice(0, 100)}…` : text;
}

function QaPanel({ row }: { row: QueueRow }) {
  const qa = row.task.qaScores as
    | {
        claimSupport: number;
        unsupportedClaims: string[];
        missingCitations: string[];
        neutralRewrite?: string;
        notes: string;
        diffVsPublished?: string;
        scoredAt: number;
      }
    | undefined;

  if (!qa) {
    return (
      <p className="text-sm text-muted-foreground">No QA scores yet — run QA.</p>
    );
  }

  const chipClass =
    qa.claimSupport < 0.7
      ? "bg-warning text-foreground"
      : "bg-secondary text-secondary-foreground";

  return (
    <div className="space-y-2 text-sm">
      <div>
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Claim support
        </span>{" "}
        <span className={`inline-block border-2 border-border px-2 py-0.5 font-bold ${chipClass}`}>
          {Math.round(qa.claimSupport * 100)}%
        </span>
      </div>
      {qa.unsupportedClaims.length > 0 && (
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Unsupported claims
          </p>
          <ul className="list-disc pl-5">
            {qa.unsupportedClaims.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {qa.missingCitations.length > 0 && (
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Missing citations
          </p>
          <ul className="list-disc pl-5">
            {qa.missingCitations.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {qa.neutralRewrite && (
        <p className="border-2 border-border bg-warning p-2 font-bold">
          Suggested neutral rewrite: {qa.neutralRewrite}
        </p>
      )}
      {qa.diffVsPublished && (
        <p className="text-muted-foreground">{qa.diffVsPublished}</p>
      )}
      <p className="text-muted-foreground">{qa.notes}</p>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Scored {fmt(qa.scoredAt)}
      </p>
    </div>
  );
}

function AuditTrail({ refTable, refId }: { refTable: string; refId: string }) {
  const rows = useAudit(refTable, refId);
  if (!rows) return null;
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No audit entries yet.</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((entry) => (
        <li key={entry._id} className="border-b border-border/50 pb-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {fmt(entry.at)}
          </span>{" "}
          <span className="font-bold">{entry.action}</span> by {entry.actor}
          {entry.detail ? <span className="text-muted-foreground"> — {entry.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Stop a click inside <summary> from also toggling the <details> disclosure. */
function stopToggle(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
}

export function DraftRow({ row }: { row: QueueRow }) {
  const [form, setForm] = useState<Record<string, string>>(() => draftFormFields(row));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const runQa = useAction(api.qa.runForTask);
  const setReviewStatus = useMutation(api.publish.setDraftReviewStatus);
  const publishQuote = useMutation(api.publish.publishQuote);
  const publishPosition = useMutation(api.publish.publishPosition);
  const editPositionDraft = useMutation(api.adminQueue.editPositionDraft);
  const editQuoteDraft = useMutation(api.adminQueue.editQuoteDraft);
  const resolveTask = useMutation(api.adminQueue.resolveTask);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(asMessage(err));
      // Errors render in the expanded body — force it open so an inline
      // action from the collapsed row still surfaces its failure reason.
      if (detailsRef.current) detailsRef.current.open = true;
    } finally {
      setBusy(null);
    }
  };

  const publishDraft = () =>
    row.kind === "quote" ? publishQuote({ draftId: row.draft._id }) : publishPosition({ draftId: row.draft._id });

  const handleRunQa = () => run("qa", () => runQa({ reviewTaskId: row.task._id }));

  const handleApprove = () =>
    run("approve", () =>
      setReviewStatus({ kind: row.kind, draftId: row.draft._id, status: "approved" }),
    );

  const handleReject = () =>
    run("reject", async () => {
      await setReviewStatus({ kind: row.kind, draftId: row.draft._id, status: "rejected" });
      // Close the task so the queue drains; useQuery reactivity removes the row.
      await resolveTask({ taskId: row.task._id, outcome: "dismissed" });
    });

  const handlePublish = () =>
    run("publish", async () => {
      // publishQuote/publishPosition are idempotent per draft, so retrying
      // this whole button after a partial failure is safe.
      await publishDraft();
      try {
        await resolveTask({ taskId: row.task._id, outcome: "resolved" });
      } catch (err) {
        throw new Error(
          `Published, but the review task could not be marked resolved — retry Publish. (${asMessage(err)})`,
        );
      }
    });

  const handleApproveAndPublish = () =>
    run("approve-publish", async () => {
      await setReviewStatus({ kind: row.kind, draftId: row.draft._id, status: "approved" });
      await publishDraft();
      try {
        await resolveTask({ taskId: row.task._id, outcome: "resolved" });
      } catch (err) {
        throw new Error(
          `Published, but the review task could not be marked resolved — retry Publish. (${asMessage(err)})`,
        );
      }
    });

  const handleSaveEdits = () =>
    run("save", async () => {
      if (row.kind === "position") {
        await editPositionDraft({
          draftId: row.draft._id,
          summary: form.summary,
          stance: form.stance as typeof row.draft.stance,
          issueSlug: form.issueSlug,
        });
      } else {
        await editQuoteDraft({
          draftId: row.draft._id,
          text: form.text,
          context: form.context,
          date: form.date,
          outlet: form.outlet,
        });
      }
      // Acceptance criterion: edits re-run QA.
      await runQa({ reviewTaskId: row.task._id });
    });

  const evidence =
    row.kind === "position" ? row.draft.sources : [{ name: "Source", url: row.draft.sourceUrl ?? "" }];
  const qaScore = qaSummary(row);

  return (
    <details ref={detailsRef} className="group border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 list-none p-3 [&::-webkit-details-marker]:hidden">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-2 border-border px-1.5 py-0.5">
          {row.kind}
        </span>
        <span className="font-bold">{row.draft.candidateSlug}</span>
        <span className="text-sm text-muted-foreground">{summaryLine(row)}</span>
        {qaScore !== null && (
          <span
            className={`ml-auto border-2 border-border px-1.5 py-0.5 font-mono text-[10px] font-bold ${
              qaScore < 70 ? "bg-warning text-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            QA {qaScore}%
          </span>
        )}
        <span className="flex gap-2" onClick={stopToggle}>
          <Button
            variant="primary"
            disabled={busy !== null}
            onClick={handleApproveAndPublish}
          >
            {busy === "approve-publish" ? "Approving…" : "Approve & publish"}
          </Button>
          <Button variant="secondary" disabled={busy !== null} onClick={handleApprove}>
            {busy === "approve" ? "Approving…" : "Approve"}
          </Button>
          <Button variant="outline" disabled={busy !== null} onClick={handleReject}>
            {busy === "reject" ? "Rejecting…" : "Reject"}
          </Button>
        </span>
      </summary>

      <div className="border-t-2 border-border p-4">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          status: {row.draft.reviewStatus}
        </p>

        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Draft fields
            </p>
            {Object.entries(form).map(([key, value]) => (
              <label key={key} className="block text-sm">
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {key}
                </span>
                {key === "summary" || key === "text" || key === "context" ? (
                  <textarea
                    value={value}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="mt-1 block w-full border-2 border-border bg-background p-2"
                    rows={3}
                  />
                ) : (
                  <input
                    value={value}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="mt-1 block w-full border-2 border-border bg-background p-2"
                  />
                )}
              </label>
            ))}
          </div>

          <div className="space-y-2">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Source
            </p>
            <ul className="space-y-1 text-sm">
              {evidence.map((s, i) => (
                <li key={i}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
                    {s.name || s.url}
                  </a>
                </li>
              ))}
            </ul>
            {row.kind === "position" && row.draft.evidenceExcerpt && (
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Evidence excerpt
                </p>
                <blockquote className="mt-1 border-l-4 border-border bg-muted p-2 text-sm italic">
                  {row.draft.evidenceExcerpt}
                </blockquote>
              </div>
            )}
          </div>

          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              QA scores
            </p>
            <div className="mt-2">
              <QaPanel row={row} />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy !== null} onClick={handleRunQa}>
            {busy === "qa" ? "Running QA…" : "Run QA"}
          </Button>
          <Button variant="secondary" disabled={busy !== null} onClick={handleSaveEdits}>
            {busy === "save" ? "Saving…" : "Save edits"}
          </Button>
          {row.draft.reviewStatus === "approved" && (
            <Button variant="primary" disabled={busy !== null} onClick={handlePublish}>
              {busy === "publish" ? "Publishing…" : "Publish"}
            </Button>
          )}
        </div>

        <ErrorLine message={error} />

        <div className="mt-4 border-t-2 border-border pt-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Audit trail
          </p>
          <div className="mt-2">
            <AuditTrail refTable={row.task.refTable} refId={row.task.refId} />
          </div>
        </div>
      </div>
    </details>
  );
}
