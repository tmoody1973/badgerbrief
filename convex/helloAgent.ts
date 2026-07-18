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

/** The one typed tool: read-only race lookup against published public data. */
const getRaceInfo = createTool({
  description:
    "Look up a Wisconsin 2026 race by id (e.g. WI-GOV-2026): returns candidates, published positions, and campaign finance totals. Read-only.",
  inputSchema: z.object({
    raceId: z.string().describe('Race id such as "WI-GOV-2026"'),
  }),
  execute: async (ctx, { raceId }): Promise<string> => {
    const data = await ctx.runQuery(api.public.getRace, { raceId });
    if (!data) return `No race found with id "${raceId}"`;
    return JSON.stringify({
      race: data.race,
      candidates: data.candidates,
      financeTotals: data.finance,
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
      const result = await helloAgent.generateText(
        ctx,
        { threadId },
        {
          prompt,
          experimental_telemetry: {
            isEnabled: telemetry !== null,
            functionId: AGENT_NAME,
            metadata: {
              "agent.name": AGENT_NAME,
              "session.id": threadId,
              ...(identity ? { "user.id": identity.tokenIdentifier } : {}),
            },
          },
        },
      );
      return result.text;
    };

    let text: string;
    if (telemetry) {
      const tracer = trace.getTracer("badgerbrief-agents");
      text = await tracer.startActiveSpan(`${AGENT_NAME}.run`, async (span) => {
        span.setAttribute("openinference.span.kind", "AGENT");
        span.setAttribute("agent.name", AGENT_NAME);
        span.setAttribute("session.id", threadId);
        if (identity) span.setAttribute("user.id", identity.tokenIdentifier);
        span.setAttribute("input.value", prompt);
        try {
          const out = await generate();
          span.setAttribute("output.value", out);
          return out;
        } finally {
          span.end();
        }
      });
      await telemetry.forceFlush();
    } else {
      text = await generate();
    }

    return { threadId, text };
  },
});
