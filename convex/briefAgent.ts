"use node";
/**
 * MOO-311 Brief Agent compose step. One streamText call over the prefetched
 * context — no tools, no publish mutations; the LLM only arranges entity IDs
 * it was handed (spec §3/§7 governance). Telemetry mirrors helloAgent.ts:
 * @convex-dev/agent-era caveat still applies — the AI SDK call is recorded
 * with manual AGENT/LLM spans.
 */
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { streamText } from "ai";
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
import contract from "./lib/briefContract.json";
import { buildBriefUserMessage, buildCorrectiveMessage, type BriefContext } from "./lib/briefContext";
import { validateBriefSource } from "./lib/briefValidate";

const AGENT_NAME = "brief-agent";
const MODEL = "claude-opus-4-8";
const FLUSH_MS = 250;

// Lazy singleton, env read at call time (copy of helloAgent.ts pattern).
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

export const composeAttempt = internalAction({
  args: {
    briefId: v.id("voter_briefs"),
    userId: v.id("users"),
    attempt: v.number(),
    priorFailure: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    failureSummary: v.optional(v.string()),
    traceId: v.optional(v.string()),
  }),
  handler: async (ctx, { briefId, userId, attempt, priorFailure }) => {
    const telemetry = ensureTelemetry();
    const context: BriefContext = await ctx.runQuery(internal.briefs.assembleContext, { userId });
    const messages: Array<{ role: "user"; content: string }> = [
      { role: "user", content: buildBriefUserMessage(context) },
    ];
    if (priorFailure) messages.push({ role: "user", content: buildCorrectiveMessage(priorFailure) });

    const run = async (): Promise<{ ok: boolean; failureSummary?: string; text: string }> => {
      const result = streamText({
        model: anthropic(MODEL),
        system: contract.prompt,
        messages,
      });
      let acc = "";
      let lastFlush = 0;
      for await (const delta of result.textStream) {
        acc += delta;
        const now = Date.now();
        if (now - lastFlush >= FLUSH_MS) {
          lastFlush = now;
          await ctx.runMutation(internal.briefs.setSource, { briefId, source: acc });
        }
      }
      await ctx.runMutation(internal.briefs.setSource, { briefId, source: acc });
      const usage = await result.usage;
      const verdict = validateBriefSource(acc, contract.schema);
      // manual LLM span (agent-substrate caveat: nothing forwards telemetry for us)
      if (telemetry) {
        const llmSpan = tracer().startSpan("claude.streamText");
        llmSpan.setAttribute("openinference.span.kind", "LLM");
        llmSpan.setAttribute("llm.model_name", MODEL);
        llmSpan.setAttribute("input.value", messages[messages.length - 1].content.slice(0, 4000));
        llmSpan.setAttribute("output.value", acc.slice(0, 4000));
        if (usage?.inputTokens !== undefined) llmSpan.setAttribute("llm.token_count.prompt", usage.inputTokens);
        if (usage?.outputTokens !== undefined) llmSpan.setAttribute("llm.token_count.completion", usage.outputTokens);
        llmSpan.end();
      }
      return verdict.ok ? { ok: true, text: acc } : { ok: false, failureSummary: verdict.summary, text: acc };
    };

    if (!telemetry) {
      const out = await run();
      return { ok: out.ok, failureSummary: out.failureSummary, traceId: undefined };
    }
    const out = await tracer().startActiveSpan(`${AGENT_NAME}.compose`, async (span) => {
      span.setAttribute("openinference.span.kind", "AGENT");
      span.setAttribute("agent.name", AGENT_NAME);
      span.setAttribute("session.id", String(briefId));
      span.setAttribute("brief.attempt", attempt);
      span.setAttribute("input.value", `districts=${JSON.stringify(context.districts)} detail=${context.preferences.detailLevel}`);
      try {
        const r = await run();
        span.setAttribute("output.value", r.ok ? "ok" : `parse_failed: ${r.failureSummary ?? ""}`.slice(0, 2000));
        return { ...r, traceId: span.spanContext().traceId };
      } finally {
        span.end();
      }
    });
    await telemetry.forceFlush();
    return { ok: out.ok, failureSummary: out.failureSummary, traceId: out.traceId };
  },
});
