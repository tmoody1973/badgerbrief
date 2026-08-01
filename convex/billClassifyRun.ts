"use node";
/**
 * MOO voting-record-by-issue: bill→issue LLM classifier. Runs in the Node
 * runtime (Anthropic SDK) — split out of convex/billClassify.ts because
 * Convex does not allow a "use node" file to also export queries/mutations.
 * Mirrors the generateObject pattern in convex/newsToneClassify.ts.
 */
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { buildBillClassifyPrompt, ISSUE_SLUGS } from "./billClassify";

const MODEL = "claude-sonnet-5"; // align with convex/tvExtractAgent.ts

const schema = z.object({
  issueSlugs: z.array(z.enum(ISSUE_SLUGS)).max(2),
  outcome: z.string(),
  confidence: z.number().min(0).max(1),
});

/** Classify unclassified bills these candidates cast substantive votes on. */
export const classifyPendingBills = internalAction({
  args: { candidateSlugs: v.array(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { candidateSlugs, limit = 40 }) => {
    const pending = (
      await ctx.runQuery(internal.billClassify.pendingBillsForCandidates, { candidateSlugs })
    ).slice(0, limit);
    let done = 0;
    for (const b of pending) {
      try {
        const { object } = await generateObject({
          model: anthropic(MODEL),
          schema,
          prompt: buildBillClassifyPrompt(b.billTitle, b.summary),
        });
        // Neutral default: low confidence OR no issue → needs_review, never public.
        const status = object.confidence < 0.6 || object.issueSlugs.length === 0 ? "needs_review" : "pending";
        await ctx.runMutation(internal.billClassify.setBillClassification, {
          session: b.session,
          billNumber: b.billNumber,
          issueSlugs: object.issueSlugs,
          outcome: object.outcome,
          confidence: object.confidence,
          status,
        });
        done++;
      } catch (e) {
        // One bad classification must not abort the batch.
        console.error("bill classify failed", b.session, b.billNumber, (e as Error).message);
      }
    }
    return { classified: done };
  },
});
