import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";

export const briefWorkflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 250, base: 2 },
    retryActionsByDefault: true, // transient LLM/network failures — separate from parse retries
    maxParallelism: 5,
  },
});

const MAX_COMPOSE_ATTEMPTS = 3; // spec decision (c): parse-failure retries with error feedback

export const generateBriefWorkflow = briefWorkflow.define({
  args: { briefId: v.id("voter_briefs"), userId: v.id("users") },
  handler: async (step, { briefId, userId }): Promise<void> => {
    let priorFailure: string | undefined;
    for (let attempt = 1; attempt <= MAX_COMPOSE_ATTEMPTS; attempt++) {
      await step.runMutation(internal.briefs.beginAttempt, { briefId, attempt });
      const result: { ok: boolean; failureSummary?: string; traceId?: string } =
        await step.runAction(
          internal.briefAgent.composeAttempt,
          { briefId, userId, attempt, priorFailure },
          { retry: true },
        );
      if (result.ok) {
        await step.runMutation(internal.briefs.finalize, { briefId, traceId: result.traceId });
        return;
      }
      priorFailure = result.failureSummary;
    }
    await step.runMutation(internal.briefs.finalize, {
      briefId,
      error: "We couldn't produce a valid brief after 3 attempts. Try again.",
    });
  },
});
