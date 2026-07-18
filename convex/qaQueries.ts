/**
 * MOO-312 Task 3: internal queries/mutations for the Editorial QA Agent.
 * Split from convex/qa.ts because Convex forbids queries/mutations in a
 * "use node" file — only actions run in the Node runtime.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { logAudit } from "./audit";

export const getTask = internalQuery({
  args: { reviewTaskId: v.id("review_tasks") },
  handler: async (ctx, { reviewTaskId }) => {
    const task = await ctx.db.get(reviewTaskId);
    if (!task) throw new Error("review task not found");
    return task;
  },
});

export const getPositionDraft = internalQuery({
  args: { draftId: v.id("candidate_positions_drafts") },
  handler: async (ctx, { draftId }) => {
    const draft = await ctx.db.get(draftId);
    if (!draft) throw new Error("position draft not found");
    return draft;
  },
});

export const getQuoteDraft = internalQuery({
  args: { draftId: v.id("quote_drafts") },
  handler: async (ctx, { draftId }) => {
    const draft = await ctx.db.get(draftId);
    if (!draft) throw new Error("quote draft not found");
    return draft;
  },
});

/** Prior published version, for positions only — surfaced in the QA prompt. */
export const getPriorPublished = internalQuery({
  args: { raceId: v.string(), candidateSlug: v.string(), issueSlug: v.string() },
  handler: async (ctx, { raceId, candidateSlug, issueSlug }) => {
    return await ctx.db
      .query("candidate_positions_published")
      .withIndex("by_candidate_issue", (q) =>
        q.eq("raceId", raceId).eq("candidateSlug", candidateSlug).eq("issueSlug", issueSlug),
      )
      .unique();
  },
});

export const saveScores = internalMutation({
  args: {
    reviewTaskId: v.id("review_tasks"),
    refTable: v.string(),
    refId: v.string(),
    scores: v.any(),
  },
  handler: async (ctx, { reviewTaskId, refTable, refId, scores }) => {
    await ctx.db.patch(reviewTaskId, { qaScores: { ...scores, scoredAt: Date.now() } });
    await logAudit(ctx, { action: "qa:run", refTable, refId });
  },
});
