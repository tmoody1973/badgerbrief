/**
 * MOO-304: durable-workflow retry demo. A step fails deterministically on its
 * first attempt; the workpool retry policy re-runs it and the workflow
 * completes. Deliberately LLM-free so it's verifiable without API keys.
 */
import {
  WorkflowManager,
  start,
  getStatus,
  vWorkflowId,
  type WorkflowId,
} from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";

export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 250, base: 2 },
    retryActionsByDefault: true,
    maxParallelism: 2,
  },
});

export const bumpAttempt = internalMutation({
  args: { key: v.string() },
  returns: v.number(),
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("demo_counters")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!row) {
      await ctx.db.insert("demo_counters", { key, count: 1 });
      return 1;
    }
    await ctx.db.patch("demo_counters", row._id, { count: row.count + 1 });
    return row.count + 1;
  },
});

export const flakyStep = internalAction({
  args: { key: v.string() },
  returns: v.string(),
  handler: async (ctx, { key }) => {
    const attempt: number = await ctx.runMutation(
      internal.demoWorkflow.bumpAttempt,
      { key },
    );
    if (attempt === 1) {
      throw new Error(
        `Injected transient failure on attempt ${attempt} (key=${key}) — retry policy should recover`,
      );
    }
    return `flakyStep succeeded on attempt ${attempt} (key=${key})`;
  },
});

export const retryDemo = workflow.define({
  args: { key: v.string() },
  handler: async (step, { key }): Promise<string> => {
    return await step.runAction(
      internal.demoWorkflow.flakyStep,
      { key },
      { retry: true },
    );
  },
});

export const kickoffRetryDemo = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<WorkflowId> => {
    return await start(ctx, internal.demoWorkflow.retryDemo, { key });
  },
});

export const retryDemoStatus = internalQuery({
  args: { workflowId: vWorkflowId },
  handler: async (ctx, { workflowId }) => {
    return await getStatus(ctx, components.workflow, workflowId);
  },
});
