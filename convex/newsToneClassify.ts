"use node";
/**
 * MOO-forecast: news-tone LLM classifier. Runs in the Node runtime (Anthropic
 * SDK) — split out of convex/newsTone.ts because Convex does not allow a
 * "use node" file to also export queries/mutations. Mirrors the
 * generateObject pattern in convex/tvExtractAgent.ts.
 */
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { buildToneRubricPrompt } from "./newsTone";

const MODEL = "claude-sonnet-5"; // align with convex/tvExtractAgent.ts

const toneSchema = z.object({
  tone: z.enum(["positive", "neutral", "negative"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

/** Classify approved article_sources rows that have no tone yet. */
export const classifyPendingArticles = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 25 }) => {
    const pending = await ctx.runQuery(internal.newsTone.pendingToClassify, { limit });
    let done = 0;
    for (const a of pending) {
      try {
        const { object } = await generateObject({
          model: anthropic(MODEL),
          schema: toneSchema,
          prompt: buildToneRubricPrompt(a.headline, a.whyRelevant, a.candidateName),
        });
        // Low-confidence → treat as neutral (Global Constraint).
        const tone = object.confidence < 0.5 ? "neutral" : object.tone;
        await ctx.runMutation(internal.newsTone.setArticleTone, {
          id: a.id,
          tone,
          confidence: object.confidence,
          rationale: object.rationale,
        });
        done++;
      } catch (e) {
        // One bad classification must not abort the batch.
        console.error("newsTone classify failed", a.id, (e as Error).message);
      }
    }
    return { classified: done };
  },
});
