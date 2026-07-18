import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { logAudit } from "./audit";

/** MOO-312 Task 4: admin review dashboard queries/mutations. */

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("admin queue requires authentication");
  }
  // Same inline shape as convex/audit.ts / convex/publish.ts requireAdmin.
  const role = (identity as { metadata?: { role?: string } }).metadata?.role;
  if (role !== "admin") {
    throw new Error("admin queue requires the admin role");
  }
}

const stanceLabel = v.union(
  v.literal("support"),
  v.literal("oppose"),
  v.literal("mixed"),
  v.literal("evolving"),
  v.literal("unclear"),
);

type QueueRow =
  | { task: Doc<"review_tasks">; kind: "position"; draft: Doc<"candidate_positions_drafts"> }
  | { task: Doc<"review_tasks">; kind: "quote"; draft: Doc<"quote_drafts"> };

/** Open review tasks joined with their draft docs, newest first. */
export const list = query({
  args: {},
  handler: async (ctx): Promise<QueueRow[]> => {
    await requireAdmin(ctx);
    const tasks = await ctx.db
      .query("review_tasks")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();

    const rows: QueueRow[] = [];
    for (const task of tasks) {
      if (task.kind === "position") {
        const id = ctx.db.normalizeId("candidate_positions_drafts", task.refId);
        const draft = id ? await ctx.db.get(id) : null;
        if (draft) rows.push({ task, kind: "position", draft });
      } else if (task.kind === "quote") {
        const id = ctx.db.normalizeId("quote_drafts", task.refId);
        const draft = id ? await ctx.db.get(id) : null;
        if (draft) rows.push({ task, kind: "quote", draft });
      }
      // ad_match / other: no draft table to join yet — surfaced elsewhere.
    }
    return rows.sort((a, b) => b.task.createdAt - a.task.createdAt);
  },
});

/** Only the provided fields are changed; undefined means "leave alone". */
function changedFields<T extends Record<string, unknown>>(patch: T): Partial<T> {
  const changed: Partial<T> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (patch[key] !== undefined) changed[key] = patch[key];
  }
  return changed;
}

export const editPositionDraft = mutation({
  args: {
    draftId: v.id("candidate_positions_drafts"),
    summary: v.optional(v.string()),
    stance: v.optional(stanceLabel),
    issueSlug: v.optional(v.string()),
  },
  handler: async (ctx, { draftId, ...patch }) => {
    await requireAdmin(ctx);
    const draft = await ctx.db.get(draftId);
    if (!draft) throw new Error("position draft not found");
    const changed = changedFields(patch);
    await ctx.db.patch(draftId, { ...changed, reviewStatus: "pending" });
    await logAudit(ctx, {
      action: "edit",
      refTable: "candidate_positions_drafts",
      refId: draftId,
      detail: JSON.stringify(Object.keys(changed)),
    });
  },
});

export const editQuoteDraft = mutation({
  args: {
    draftId: v.id("quote_drafts"),
    text: v.optional(v.string()),
    context: v.optional(v.string()),
    date: v.optional(v.string()),
    outlet: v.optional(v.string()),
  },
  handler: async (ctx, { draftId, ...patch }) => {
    await requireAdmin(ctx);
    const draft = await ctx.db.get(draftId);
    if (!draft) throw new Error("quote draft not found");
    const changed = changedFields(patch);
    await ctx.db.patch(draftId, { ...changed, reviewStatus: "pending" });
    await logAudit(ctx, {
      action: "edit",
      refTable: "quote_drafts",
      refId: draftId,
      detail: JSON.stringify(Object.keys(changed)),
    });
  },
});

/** Close a review task so the queue drains (resolved after publish, dismissed after reject). */
export const resolveTask = mutation({
  args: {
    taskId: v.id("review_tasks"),
    outcome: v.union(v.literal("resolved"), v.literal("dismissed")),
  },
  handler: async (ctx, { taskId, outcome }) => {
    await requireAdmin(ctx);
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("review task not found");
    await ctx.db.patch(taskId, { status: outcome, resolvedAt: Date.now() });
    await logAudit(ctx, {
      action: `task:${outcome}`,
      refTable: "review_tasks",
      refId: taskId,
    });
  },
});

/** Open (unresolved) alerts, newest first. */
export const alerts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("alerts")
      .withIndex("by_resolved", (q) => q.eq("resolved", false))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const resolveAlert = mutation({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, { alertId }) => {
    await requireAdmin(ctx);
    const alert = await ctx.db.get(alertId);
    if (!alert) throw new Error("alert not found");
    await ctx.db.patch(alertId, { resolved: true });
    await logAudit(ctx, {
      action: "resolve",
      refTable: "alerts",
      refId: alertId,
      detail: alert.message,
    });
  },
});
