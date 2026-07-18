"use node";
/**
 * MOO-304: hello-world agent proving the agent substrate — @convex-dev/agent
 * + AI SDK (Claude) + OpenTelemetry/OpenInference export to Arize.
 *
 * Governance (spec §3): agents get READ-ONLY tools. Publish mutations
 * (convex/publish.ts) are human-only and must never appear here.
 */
import { v } from "convex/values";
import { z } from "zod";
import { action } from "./_generated/server";
import { api, components } from "./_generated/api";
import { Agent, createThread, createTool, stepCountIs } from "@convex-dev/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  isOpenInferenceSpan,
  OpenInferenceSimpleSpanProcessor,
} from "@arizeai/openinference-vercel";
import { SEMRESATTRS_PROJECT_NAME } from "@arizeai/openinference-semantic-conventions";

const AGENT_NAME = "hello-agent";

// Lazy singleton so deploys succeed with Arize keys absent (env read at call
// time, never at import time). Returns null when telemetry is unconfigured.
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

/**
 * The one typed tool: read-only race lookup against published public data.
 * @convex-dev/agent does not forward experimental_telemetry to the AI SDK,
 * so the TOOL span is created manually (no-op when telemetry is off).
 */
const getRaceInfo = createTool({
  description:
    "Look up a Wisconsin 2026 race by id (e.g. WI-GOV-2026): returns candidates, published positions, and campaign finance totals. Read-only.",
  inputSchema: z.object({
    raceId: z.string().describe('Race id such as "WI-GOV-2026"'),
  }),
  execute: async (ctx, { raceId }): Promise<string> => {
    return await tracer().startActiveSpan("getRaceInfo", async (span) => {
      span.setAttribute("openinference.span.kind", "TOOL");
      span.setAttribute("tool.name", "getRaceInfo");
      if (ctx.threadId) span.setAttribute("session.id", ctx.threadId);
      span.setAttribute("input.value", JSON.stringify({ raceId }));
      try {
        const data = await ctx.runQuery(api.public.getRace, { raceId });
        const out = !data
          ? `No race found with id "${raceId}"`
          : JSON.stringify({
              race: data.race,
              candidates: data.candidates,
              financeTotals: data.finance,
            });
        span.setAttribute("output.value", out.slice(0, 4000));
        return out;
      } finally {
        span.end();
      }
    });
  },
});

const helloAgent = new Agent(components.agent, {
  name: AGENT_NAME,
  languageModel: anthropic("claude-opus-4-8"),
  instructions:
    "You are BadgerBrief's hello-world agent, a non-partisan Wisconsin voter-guide assistant. " +
    "Answer questions about the Aug 11, 2026 primary using the getRaceInfo tool for any factual claim " +
    "about candidates, races, or campaign finance. Never speculate; if the tool has no data, say so. " +
    "Keep answers to a few sentences.",
  tools: { getRaceInfo },
  stopWhen: stepCountIs(3),
});

export const ask = action({
  args: { prompt: v.string() },
  handler: async (ctx, { prompt }) => {
    const telemetry = ensureTelemetry();
    const identity = await ctx.auth.getUserIdentity();
    const threadId = await createThread(ctx, components.agent);

    const generate = async () => {
      return await helloAgent.generateText(ctx, { threadId }, { prompt });
    };

    let text: string;
    if (telemetry) {
      text = await tracer().startActiveSpan(`${AGENT_NAME}.run`, async (span) => {
        span.setAttribute("openinference.span.kind", "AGENT");
        span.setAttribute("agent.name", AGENT_NAME);
        span.setAttribute("session.id", threadId);
        if (identity) span.setAttribute("user.id", identity.tokenIdentifier);
        span.setAttribute("input.value", prompt);
        try {
          const result = await generate();
          // @convex-dev/agent doesn't forward experimental_telemetry, so record
          // the model call manually (usage is real; timing is span-approximate).
          const usage = result.usage as
            | { inputTokens?: number; outputTokens?: number; totalTokens?: number }
            | undefined;
          const llmSpan = tracer().startSpan("claude.generateText");
          llmSpan.setAttribute("openinference.span.kind", "LLM");
          llmSpan.setAttribute("llm.model_name", "claude-opus-4-8");
          llmSpan.setAttribute("session.id", threadId);
          llmSpan.setAttribute("input.value", prompt);
          llmSpan.setAttribute("output.value", result.text);
          if (usage?.inputTokens !== undefined)
            llmSpan.setAttribute("llm.token_count.prompt", usage.inputTokens);
          if (usage?.outputTokens !== undefined)
            llmSpan.setAttribute("llm.token_count.completion", usage.outputTokens);
          if (usage?.totalTokens !== undefined)
            llmSpan.setAttribute("llm.token_count.total", usage.totalTokens);
          llmSpan.end();
          span.setAttribute("output.value", result.text);
          return result.text;
        } finally {
          span.end();
        }
      });
      await telemetry.forceFlush();
    } else {
      text = (await generate()).text;
    }

    return { threadId, text };
  },
});
