"use node";
/**
 * MOO-312 Task 2: Research Agent — fetches each candidate's campaign site via
 * Firecrawl, content-hash short-circuits unchanged pages, and extracts
 * position/quote drafts with Claude. Writes ONLY to *_drafts,
 * source_fetch_logs, and review_tasks (via convex/researchQueries.ts) —
 * never to published tables (Global Constraints: agents never publish).
 */
import { createHash } from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
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
import { extractionSchema, buildExtractionPrompt, Extraction } from "./lib/extraction";

const AGENT_NAME = "research-agent";
const DEFAULT_LIMIT = 3;

// Lazy singleton so deploys succeed with Arize keys absent (env read at call
// time, never at import time). Returns null when telemetry is unconfigured.
// Copied from convex/helloAgent.ts (repo pattern — @convex-dev/agent doesn't
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

export type FetchResult =
  | { ok: true; markdown: string; httpStatus: number }
  | { ok: false; httpStatus?: number; error: string };

/**
 * Firecrawl v2 scrape — plain fetch, no SDK (Global Constraints).
 * Exported for reuse by convex/qa.ts (also "use node"; plain fn export/import
 * between two "use node" modules is fine — only queries/mutations can't live here).
 */
export async function fetchFirecrawlMarkdown(url: string): Promise<FetchResult> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["markdown"] }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json()) as {
      success?: boolean;
      data?: { markdown?: string; metadata?: { statusCode?: number } };
      error?: string;
    };
    const httpStatus = body.data?.metadata?.statusCode ?? res.status;
    if (!res.ok || !body.success || !body.data?.markdown) {
      return {
        ok: false,
        httpStatus,
        error: body.error ?? `firecrawl request failed (http ${res.status})`,
      };
    }
    return { ok: true, markdown: body.data.markdown, httpStatus };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

type CandidateSummary = {
  slug: string;
  status: "extracted" | "unchanged" | "fetch-error" | "extraction_error";
  positions?: number;
  quotes?: number;
  error?: string;
};

/** Piece 5: the daily sweep — fetch, hash-gate, extract, save. */
export const run = internalAction({
  args: {
    candidateSlugs: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { candidateSlugs, limit, force }): Promise<CandidateSummary[]> => {
    // Throw at call time (never import time) so `convex dev --once` pushes
    // cleanly before the key is provisioned.
    if (!process.env.FIRECRAWL_API_KEY) {
      throw new Error("FIRECRAWL_API_KEY not set");
    }

    const telemetry = ensureTelemetry();

    const allTargets: { slug: string; name: string; raceId: string; url: string }[] =
      await ctx.runQuery(internal.researchQueries.listResearchTargets, {});
    const scoped = candidateSlugs
      ? allTargets.filter((t) => candidateSlugs.includes(t.slug))
      : allTargets;
    const targets = scoped.slice(0, limit ?? DEFAULT_LIMIT);

    const summaries: CandidateSummary[] = [];

    for (const target of targets) {
      const prevHash: string | null = await ctx.runQuery(
        internal.researchQueries.latestFetchHash,
        { url: target.url },
      );

      const fetched = await fetchFirecrawlMarkdown(target.url);
      if (!fetched.ok) {
        await ctx.runMutation(internal.researchQueries.recordFetch, {
          url: target.url,
          status: "error",
          httpStatus: fetched.httpStatus,
          error: fetched.error,
        });
        summaries.push({ slug: target.slug, status: "fetch-error", error: fetched.error });
        continue;
      }

      const hash = createHash("sha256").update(fetched.markdown).digest("hex");
      await ctx.runMutation(internal.researchQueries.recordFetch, {
        url: target.url,
        status: "ok",
        httpStatus: fetched.httpStatus,
        contentHash: hash,
      });

      if (hash === prevHash && !force) {
        console.log(`research-agent: content unchanged for ${target.slug}, skipping LLM`);
        summaries.push({ slug: target.slug, status: "unchanged" });
        continue;
      }

      // Isolate extraction/save failures per candidate: one reliably-broken
      // page must not abort the run and starve the targets sliced behind it.
      try {
        const prompt = buildExtractionPrompt(target.name, target.url, fetched.markdown);
        const extractOnce = () =>
          generateObject({
            model: anthropic("claude-opus-4-8"),
            schema: extractionSchema,
            prompt,
          });

        let extraction: Extraction;
        let traceId: string | undefined;

        if (telemetry) {
          const spanResult = await tracer().startActiveSpan(
            `${AGENT_NAME}.run`,
            async (span) => {
              span.setAttribute("openinference.span.kind", "AGENT");
              span.setAttribute("agent.name", AGENT_NAME);
              span.setAttribute(
                "input.value",
                JSON.stringify({ candidate: target.slug, url: target.url }),
              );
              try {
                const result = await extractOnce();
                // generateObject (plain `ai` call, not @convex-dev/agent) has no
                // built-in telemetry hook, so the LLM child span is manual —
                // same shape as helloAgent.ts lines 128-146, adapted for
                // structured output (output.value = JSON of the object).
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
                return { object: result.object, traceId: span.spanContext().traceId };
              } catch (err) {
                span.setAttribute("error", true);
                throw err;
              } finally {
                span.end();
              }
            },
          );
          await telemetry.forceFlush();
          extraction = spanResult.object;
          traceId = spanResult.traceId;
        } else {
          extraction = (await extractOnce()).object;
        }

        const counts: { positions: number; quotes: number } = await ctx.runMutation(
          internal.researchQueries.saveExtraction,
          {
            candidateSlug: target.slug,
            raceId: target.raceId,
            sourceUrl: target.url,
            sourceName: target.name,
            extraction,
            traceId,
          },
        );

        summaries.push({ slug: target.slug, status: "extracted", ...counts });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`research-agent: extraction failed for ${target.slug}: ${message}`);
        summaries.push({ slug: target.slug, status: "extraction_error", error: message });
        continue;
      }
    }

    return summaries;
  },
});
