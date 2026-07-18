"use client";

import { useState } from "react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/retroui/Button";

/** MOO-312 Task 4: admin review dashboard — queue, QA panel, gated publish, audit trail, alerts. */

type QueueRows = NonNullable<ReturnType<typeof useQueue>>;
type QueueRow = QueueRows[number];
type AuditRows = NonNullable<ReturnType<typeof useAudit>>;

// Admin-gated queries throw for unauthenticated callers, and the Convex client
// starts unauthenticated while Clerk exchanges the JWT — skip until authed.
function useQueue() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.adminQueue.list, isAuthenticated ? {} : "skip");
}
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

function AuditTrail({ rows }: { rows: AuditRows | undefined }) {
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

function TaskDetail({ row }: { row: QueueRow }) {
  const [form, setForm] = useState<Record<string, string>>(() => draftFormFields(row));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const runQa = useAction(api.qa.runForTask);
  const setReviewStatus = useMutation(api.publish.setDraftReviewStatus);
  const publishQuote = useMutation(api.publish.publishQuote);
  const publishPosition = useMutation(api.publish.publishPosition);
  const editPositionDraft = useMutation(api.adminQueue.editPositionDraft);
  const editQuoteDraft = useMutation(api.adminQueue.editQuoteDraft);
  const resolveTask = useMutation(api.adminQueue.resolveTask);
  const auditRows = useAudit(row.task.refTable, row.task.refId);

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
      if (row.kind === "quote") {
        await publishQuote({ draftId: row.draft._id });
      } else {
        await publishPosition({ draftId: row.draft._id });
      }
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

  return (
    <div className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {row.kind} · {row.draft.candidateSlug} · status: {row.draft.reviewStatus}
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
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {s.name || s.url}
                </a>
              </li>
            ))}
          </ul>
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
        <Button variant="primary" disabled={busy !== null} onClick={handleApprove}>
          {busy === "approve" ? "Approving…" : "Approve"}
        </Button>
        <Button variant="outline" disabled={busy !== null} onClick={handleReject}>
          {busy === "reject" ? "Rejecting…" : "Reject"}
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
          <AuditTrail rows={auditRows} />
        </div>
      </div>
    </div>
  );
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

export function ReviewQueue() {
  const rows = useQueue();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = rows?.find((r) => r.task._id === selectedId) ?? null;

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)]">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Queue ({rows?.length ?? 0})
          </p>
          {rows === undefined ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Queue is empty.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {rows.map((row) => (
                <li key={row.task._id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.task._id)}
                    className={`block w-full border-2 border-border p-2 text-left text-sm press ${
                      row.task._id === selectedId ? "bg-secondary" : "bg-background"
                    }`}
                  >
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {row.kind}
                    </span>
                    <br />
                    {row.draft.candidateSlug}
                    <br />
                    <span className="text-xs text-muted-foreground">
                      {fmt(row.draft.extractedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {selected ? (
            // key remounts TaskDetail on task change, so its edit-form state
            // starts fresh without an effect-driven reset.
            <TaskDetail key={selected.task._id} row={selected} />
          ) : (
            <div className="border-2 border-border bg-card p-4 text-sm text-muted-foreground shadow-[var(--shadow-brutal)]">
              Select a task from the queue to review it.
            </div>
          )}
        </div>
      </div>

      <AlertsSection />
    </div>
  );
}
