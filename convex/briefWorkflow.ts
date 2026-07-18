// Placeholder — Task 4 replaces this handler with the real 3-attempt compose loop.
import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";

export const briefWorkflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 250, base: 2 },
    retryActionsByDefault: true,
    maxParallelism: 1,
  },
});

export const generateBriefWorkflow = briefWorkflow.define({
  args: { briefId: v.id("voter_briefs"), userId: v.id("users") },
  handler: async (step, { briefId }): Promise<void> => {
    await step.runMutation(internal.briefs.finalize, { briefId, error: "Brief Agent not wired yet (MOO-311 Task 4)." });
  },
});
