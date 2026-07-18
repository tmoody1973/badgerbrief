"use node";
/**
 * MOO-312 Task 3: Editorial QA Agent — re-fetches a draft's source, scores
 * claim support against it with Claude, and flags missing citations /
 * loaded wording. Writes only qaScores onto the review_tasks row (never
 * touches published tables — Global Constraints: agents never publish).
 */
import { v } from "convex/values";
import { action, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  isOpenInferenceSpan,
  OpenInferenceSimpleSpanProcessor,
} from "@arizeai/openinference-vercel";
import { SEMRESATTRS_PROJECT_NAME } from "@arizeai/openinference-semantic-conventions";
import { qaSchema, buildQaPrompt, QaScores } from "./lib/qa";
import { fetchFirecrawlMarkdown } from "./research";

const AGENT_NAME = "qa-agent";

// Lazy singleton so deploys succeed with Arize keys absent (env read at call
// time, never at import time). Returns null when telemetry is unconfigured.
// Copied from convex/research.ts (repo pattern — @convex-dev/agent doesn't
// forward experimental_telemetry, and plain generateObject has no telemetry
// hook of its own, so every agent action wires this manually).
let provider: NodeTracerProvider | null = null;
function ensureTelemetry(): NodeTracerProvider | null {
  if (provider) return provider;
  const spaceId = process.env.ARIZE_SPACE_ID;
  const apiKey = process.env.ARIZE_API_KEY;
  if (!spaceId || !apiKey) {
    console.warn("Arize telemetry disabled: ARIZE_SPACE_ID / ARIZE_API_KEY not set");
    return null;
  }
  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [SEMRESATTRS_PROJECT_NAME]: process.env.ARIZE_PROJECT_NAME ?? "badgerbrief",
      model_version: "m1",
    }),
    spanProcessors: [
      new OpenInferenceSimpleSpanProcessor({
        exporter: new OTLPTraceExporter({
          url: "https://otlp.arize.com/v1/traces",
          headers: { "arize-space-id": spaceId, "arize-api-key": apiKey },
        }),
        spanFilter: isOpenInferenceSpan,
        reparentOrphanedSpans: true,
      }),
    ],
  });
  provider.register();
  return provider;
}

const tracer = () => trace.getTracer("badgerbrief-agents");

async function requireAdmin(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("qa:run requires authentication");
  }
  // metadata.role comes from the Clerk "convex" JWT template custom claims —
  // same shape as convex/publish.ts requireAdmin.
  const role = (identity as { metadata?: { role?: string } }).metadata?.role;
  if (role !== "admin") {
    throw new Error("qa:run requires the admin role");
  }
}

/** Editorial QA: score one review task's draft against a fresh source fetch. */
export const runForTask = action({
  args: { reviewTaskId: v.id("review_tasks") },
  handler: async (ctx, { reviewTaskId }): Promise<QaScores> => {
    await requireAdmin(ctx);
    const telemetry = ensureTelemetry();

    const task: Doc<"review_tasks"> = await ctx.runQuery(internal.qaQueries.getTask, {
      reviewTaskId,
    });

    let kind: "position" | "quote";
    let sourceUrl: string | undefined;
    let draftJson: string;
    let priorPublishedJson: string | undefined;
    let diffVsPublished: string | undefined;

    if (task.kind === "position") {
      kind = "position";
      const draft: Doc<"candidate_positions_drafts"> = await ctx.runQuery(
        internal.qaQueries.getPositionDraft,
        { draftId: task.refId as Id<"candidate_positions_drafts"> },
      );
      sourceUrl = draft.sources[0]?.url;
      draftJson = JSON.stringify({
        issueSlug: draft.issueSlug,
        stance: draft.stance,
        summary: draft.summary,
        evidenceExcerpt: draft.evidenceExcerpt,
      });
      const prior: Doc<"candidate_positions_published"> | null = await ctx.runQuery(
        internal.qaQueries.getPriorPublished,
        { raceId: draft.raceId, candidateSlug: draft.candidateSlug, issueSlug: draft.issueSlug },
      );
      if (prior) {
        priorPublishedJson = JSON.stringify({ stance: prior.stance, summary: prior.summary });
        diffVsPublished = `prior summary: ${prior.summary}`;
      }
    } else if (task.kind === "quote") {
      kind = "quote";
      const draft: Doc<"quote_drafts"> = await ctx.runQuery(internal.qaQueries.getQuoteDraft, {
        draftId: task.refId as Id<"quote_drafts">,
      });
      sourceUrl = draft.sourceUrl;
      draftJson = JSON.stringify({ text: draft.text, context: draft.context });
    } else {
      throw new Error(`qa:run unsupported review task kind: ${task.kind}`);
    }

    let sourceText = "(source fetch failed)";
    if (sourceUrl) {
      const fetched = await fetchFirecrawlMarkdown(sourceUrl);
      if (fetched.ok) sourceText = fetched.markdown;
    }

    const prompt = buildQaPrompt({ kind, draftJson, sourceText, priorPublishedJson });
    const scoreOnce = () => generateObject({ model: anthropic("claude-opus-4-8"), schema: qaSchema, prompt });

    let scores: QaScores;
    if (telemetry) {
      const object = await tracer().startActiveSpan(`${AGENT_NAME}.run`, async (span) => {
        span.setAttribute("openinference.span.kind", "AGENT");
        span.setAttribute("agent.name", AGENT_NAME);
        span.setAttribute("input.value", JSON.stringify({ reviewTaskId, kind }));
        try {
          const result = await scoreOnce();
          // generateObject (plain `ai` call, not @convex-dev/agent) has no
          // built-in telemetry hook, so the LLM child span is manual — same
          // shape as convex/research.ts (adapted from helloAgent.ts).
          const usage = result.usage as
            | { inputTokens?: number; outputTokens?: number; totalTokens?: number }
            | undefined;
          const llmSpan = tracer().startSpan("claude.generateObject");
          llmSpan.setAttribute("openinference.span.kind", "LLM");
          llmSpan.setAttribute("llm.model_name", "claude-opus-4-8");
          llmSpan.setAttribute("input.value", prompt);
          llmSpan.setAttribute("output.value", JSON.stringify(result.object));
          if (usage?.inputTokens !== undefined)
            llmSpan.setAttribute("llm.token_count.prompt", usage.inputTokens);
          if (usage?.outputTokens !== undefined)
            llmSpan.setAttribute("llm.token_count.completion", usage.outputTokens);
          if (usage?.totalTokens !== undefined)
            llmSpan.setAttribute("llm.token_count.total", usage.totalTokens);
          llmSpan.end();
          span.setAttribute("output.value", JSON.stringify(result.object).slice(0, 4000));
          return result.object;
        } catch (err) {
          span.setAttribute("error", true);
          throw err;
        } finally {
          span.end();
        }
      });
      await telemetry.forceFlush();
      scores = object;
    } else {
      scores = (await scoreOnce()).object;
    }

    if (diffVsPublished) scores = { ...scores, diffVsPublished };

    await ctx.runMutation(internal.qaQueries.saveScores, {
      reviewTaskId,
      refTable: task.refTable,
      refId: task.refId,
      scores,
    });

    return scores;
  },
});
