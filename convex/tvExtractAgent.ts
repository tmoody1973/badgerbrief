"use node";
/**
 * MOO-318 Task 4: Broadcast-TV order extraction. Takes an FCC political-file
 * order PDF (base64) and returns structured `TvAdExtraction` via Sonnet, wrapped
 * in an Arize span. Orders are machine-readable WideOrbit text PDFs, so Sonnet
 * extracts them reliably + cheaply; the per-field confidence + human review gate
 * (Task 5) catch edge cases. Never publishes — extraction only.
 */
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  isOpenInferenceSpan,
  OpenInferenceSimpleSpanProcessor,
} from "@arizeai/openinference-vercel";
import { SEMRESATTRS_PROJECT_NAME } from "@arizeai/openinference-semantic-conventions";
import type { TvAdExtraction } from "./lib/tvExtract";

const AGENT_NAME = "tv-extract-agent";
const MODEL = "claude-sonnet-5";

// Lazy telemetry singleton — same repo pattern as convex/qa.ts / research.ts
// (env read at call time so deploys succeed with Arize keys absent).
let provider: NodeTracerProvider | null = null;
function ensureTelemetry(): NodeTracerProvider | null {
  if (provider) return provider;
  const spaceId = process.env.ARIZE_SPACE_ID;
  const apiKey = process.env.ARIZE_API_KEY;
  if (!spaceId || !apiKey) {
    console.warn(
      "Arize telemetry disabled: ARIZE_SPACE_ID / ARIZE_API_KEY not set",
    );
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

// Every optional field is modeled as required-but-nullable: Anthropic's
// constrained-decoding grammar handles `value | null` far more cheaply than
// "key may be absent", which multiplied object-grammar states into a
// "Schema is too complex" error. Nulls are normalized to undefined on return.
const extractionSchema = z.object({
  advertiser: z.string().describe("Advertiser exactly as printed on the order"),
  party: z.string().nullable().describe('Party letter if stated, e.g. "D", "R"'),
  office: z.string().nullable().describe('Office sought, e.g. "Governor"'),
  candidateName: z.string().nullable(),
  station: z.string().describe('Station call sign, e.g. "WISN-TV"'),
  dma: z.string().nullable().describe('Market, e.g. "Milwaukee"'),
  flightStart: z.string().nullable().describe("Flight start, YYYY-MM-DD"),
  flightEnd: z.string().nullable().describe("Flight end, YYYY-MM-DD"),
  spotCount: z.number().nullable().describe("Total number of spots"),
  grossSpend: z.number().nullable().describe("Gross dollar total (exact)"),
  netSpend: z.number().nullable().describe("Net dollar total if stated"),
  agency: z.string().nullable(),
  orderRef: z.string().nullable().describe("Station contract / order number"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Overall 0..1 confidence in this extraction"),
});

const PROMPT = `You are extracting a U.S. broadcast-TV political advertising order from an FCC public-inspection-file PDF (typically WideOrbit-generated).

Extract these fields, transcribing ONLY what the order states — leave anything not present as null. Do not infer or estimate.
- advertiser: the buyer/committee exactly as printed (e.g. "Barnes/D/Governor")
- party, office, candidateName: only if explicit or unambiguous from the advertiser line
- station: the call sign
- dma: the market/DMA if shown
- flightStart / flightEnd: the overall flight window as YYYY-MM-DD
- spotCount: total spots ordered
- grossSpend: the GROSS total in dollars (a number, no $ or commas)
- netSpend: the NET total if separately stated
- agency, orderRef: if present
- confidence: an object mapping each field you filled to a 0..1 confidence.

CRITICAL: every field must come from the order text INSIDE the PDF. A document
name may be provided as a locating hint — NEVER copy values (advertiser, dates,
amounts) from that name. If the PDF has no readable order content (e.g. only a
portfolio/cover splash page such as "open this PDF portfolio in Acrobat"), return
advertiser as an empty string, grossSpend null, and confidence 0.

Return strictly the requested structure.`;

/** Extract one FCC TV order PDF (base64) into structured fields via Sonnet. */
export const extractTvAd = internalAction({
  args: {
    pdfBase64: v.string(),
    hintName: v.optional(v.string()),
    year: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { pdfBase64, hintName, year },
  ): Promise<TvAdExtraction> => {
    const telemetry = ensureTelemetry();
    // Anchor flight-date years: the doc lives in the station's {year} political
    // file, so dates fall in {year} unless the PDF explicitly shows otherwise.
    const hints = [
      hintName ? `Doc name hint: ${hintName}` : "",
      year
        ? `This order was filed in the ${year} political file — flight dates are in ${year} unless the document explicitly states another year.`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    const runOnce = () =>
      generateObject({
        model: anthropic(MODEL),
        schema: extractionSchema,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: hints ? `${PROMPT}\n\n${hints}` : PROMPT,
              },
              {
                type: "file",
                data: Buffer.from(pdfBase64, "base64"),
                mediaType: "application/pdf",
              },
            ],
          },
        ],
      });

    if (!telemetry) return normalize((await runOnce()).object);

    const object = await tracer().startActiveSpan(
      `${AGENT_NAME}.extract`,
      async (span) => {
        span.setAttribute("openinference.span.kind", "AGENT");
        span.setAttribute("agent.name", AGENT_NAME);
        span.setAttribute("input.value", JSON.stringify({ hintName }));
        try {
          const result = await runOnce();
          const usage = result.usage as
            | { inputTokens?: number; outputTokens?: number; totalTokens?: number }
            | undefined;
          const llmSpan = tracer().startSpan("claude.tvExtract");
          llmSpan.setAttribute("openinference.span.kind", "LLM");
          llmSpan.setAttribute("llm.model_name", MODEL);
          llmSpan.setAttribute("input.value", PROMPT);
          llmSpan.setAttribute("output.value", JSON.stringify(result.object));
          if (usage?.inputTokens !== undefined)
            llmSpan.setAttribute("llm.token_count.prompt", usage.inputTokens);
          if (usage?.outputTokens !== undefined)
            llmSpan.setAttribute("llm.token_count.completion", usage.outputTokens);
          if (usage?.totalTokens !== undefined)
            llmSpan.setAttribute("llm.token_count.total", usage.totalTokens);
          llmSpan.end();
          span.setAttribute(
            "output.value",
            JSON.stringify(result.object).slice(0, 4000),
          );
          return result.object;
        } catch (err) {
          span.setAttribute("error", true);
          throw err;
        } finally {
          span.end();
        }
      },
    );
    await telemetry.forceFlush();
    return normalize(object);
  },
});

/** Map nullable LLM output → TvAdExtraction (null→undefined; overall
 * confidence → the Record<string,number> the pure lib expects). */
function normalize(o: z.infer<typeof extractionSchema>): TvAdExtraction {
  const u = <T>(x: T | null): T | undefined => (x === null ? undefined : x);
  return {
    advertiser: o.advertiser,
    party: u(o.party),
    office: u(o.office),
    candidateName: u(o.candidateName),
    station: o.station,
    dma: u(o.dma),
    flightStart: u(o.flightStart),
    flightEnd: u(o.flightEnd),
    spotCount: u(o.spotCount),
    grossSpend: u(o.grossSpend),
    netSpend: u(o.netSpend),
    agency: u(o.agency),
    orderRef: u(o.orderRef),
    confidence: { overall: o.confidence },
  };
}
