"use node";
/**
 * MOO-322 Task 2: Article Scout — asks Perplexity for recent news coverage
 * of each contested-race candidate from an allowlisted set of outlets, and
 * proposes new article_sources rows for human review. Writes ONLY to
 * article_sources via convex/scoutQueries.ts, always status "proposed" —
 * never auto-publishes (Global Constraints: agents never publish).
 */
import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  isOpenInferenceSpan,
  OpenInferenceSimpleSpanProcessor,
} from "@arizeai/openinference-vercel";
import { SEMRESATTRS_PROJECT_NAME } from "@arizeai/openinference-semantic-conventions";
import { ALLOWED_DOMAINS, WI_OUTLETS, isAllowedUrl, parseScoutResponse, scoutPrompt, sortByRotation } from "./lib/scoutParse";
import { decorateCoverageRow } from "./lib/outlets";

const AGENT_NAME = "article-scout";
/**
 * Candidates scouted per run.
 *
 * This was 3, against a contested pool of 30 — a TEN DAY rotation. The daily
 * cron therefore looked for coverage of any given candidate about once every
 * ten days, which is why /news could sit at a story three days old while the
 * biggest event of the cycle went unfound: the July 22 Marquette poll wave was
 * about Hong, Barnes and Tiffany, and none of them were in the slice that ran.
 * A feed that reports on a tenth of the field each day does not look stale
 * because ingestion is broken; it looks stale because nobody searched.
 *
 * 40 covers the whole pool every run: about 32 on-ballot candidates for the
 * statewide executive offices and the U.S. House. Rotation still orders the
 * pool (least-recently-touched first), so it degrades sensibly if the pool
 * grows past the limit.
 */
const DEFAULT_LIMIT = 40;

// Lazy singleton so deploys succeed with Arize keys absent (env read at call
// time, never at import time). Returns null when telemetry is unconfigured.
// FIFTH copy of this block (helloAgent.ts, research.ts, qa.ts, briefAgent.ts,
// now scout.ts) — @convex-dev/agent doesn't forward experimental_telemetry,
// and a plain fetch call has no telemetry hook of its own, so every agent
// action wires this manually. Extracting a shared lib is recorded debt — do
// NOT do it in this task.
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

// Derived from WI_OUTLETS so the prompt can never drift from the domain filter.
// It used to name four outlets in prose; when the allowlist widened, a stale
// hardcoded sentence would have told the model to ignore every new newsroom.
const SCOUT_SYSTEM =
  "You find news articles for a non-partisan Wisconsin voter guide. Return ONLY articles from these outlets: " +
  Object.entries(WI_OUTLETS).map(([domain, name]) => `${name} (${domain})`).join(", ") +
  ". Each article must substantively cover the named candidate. You return article METADATA only — never summarize positions or facts.";

const SCOUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    articles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          url: { type: "string" },
          outlet: { type: "string" },
          headline: { type: "string" },
          publishedAt: { type: "string" },
          whyRelevant: { type: "string" },
        },
        required: ["url", "outlet", "headline", "whyRelevant"],
      },
    },
  },
  required: ["articles"],
};

type ScoutCandidate = { slug: string; name: string; raceId: string; office: string; lastProposedAt?: number };

/** Pure per-row enrichment: outlet key + hub-relevance gate. Exported for
 * testing without the network — called for each article before insert. */
// decorateCoverageRow lives in ./lib/outlets (imported above) so plain mutations
// — e.g. coverageBackfill — can use it too: a mutation cannot import from this
// "use node" module.

type CandidateSummary = {
  slug: string;
  status: "proposed" | "empty" | "error";
  proposed?: number;
  dropped?: number;
  error?: string;
};

/** Raw Perplexity chat-completions call for one candidate's message content. */
async function fetchScoutContent(body: unknown): Promise<string> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`perplexity request failed (http ${res.status})`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("perplexity response missing message content");
  }
  return content;
}

/** Record the run's health; email the editor once when a new alert opens. */
async function reportHealth(
  ctx: Pick<ActionCtx, "runMutation" | "runAction">,
  summaries: CandidateSummary[],
  fatal?: string,
) {
  const failed = summaries.filter((s) => s.status === "error");
  const opened: string | null = await ctx.runMutation(internal.scoutQueries.recordRunHealth, {
    attempted: fatal ? 1 : summaries.length,
    errors: fatal ? 1 : failed.length,
    proposed: summaries.reduce((n, s) => n + (s.proposed ?? 0), 0),
    sampleError: fatal ?? failed[0]?.error,
  });
  if (opened) await ctx.runAction(internal.feedback.notify, { kind: "data_gap", message: opened });
}

/** The daily sweep: pick candidates, ask Perplexity, filter, propose. */
export const run = internalAction({
  args: {
    candidateSlugs: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { candidateSlugs, limit }): Promise<CandidateSummary[]> => {
    // Throw at call time (never import time) so `convex dev --once` pushes
    // cleanly before the key is provisioned.
    if (!process.env.PERPLEXITY_API_KEY) {
      await reportHealth(ctx, [], "PERPLEXITY_API_KEY not set");
      throw new Error("PERPLEXITY_API_KEY not set");
    }

    const telemetry = ensureTelemetry();

    // Explicit slugs bypass BOTH the contested-race pool filter (resolved
    // against all candidates in the query) and rotation — caller picked them.
    const pool: ScoutCandidate[] = await ctx.runQuery(
      internal.scoutQueries.listScoutCandidates,
      candidateSlugs ? { slugs: candidateSlugs } : {},
    );
    // No-args path rotates least-recently-proposed-first so candidates past
    // DEFAULT_LIMIT aren't starved forever by a fixed slice; never-proposed
    // sort first.
    const targets = (candidateSlugs ? pool : sortByRotation(pool)).slice(
      0,
      limit ?? DEFAULT_LIMIT,
    );

    // Hub-relevance gate context (lib/outlets.ts scoreRelevance): candidate
    // names come from the pool already queried above for rotation; race
    // keywords need one small races lookup (nothing else in `run` touches
    // that table yet).
    const candidateNames = pool.map((c) => c.name);
    const raceKeywords: string[] = await ctx.runQuery(internal.scoutQueries.listRaceOffices, {
      raceIds: [...new Set(pool.map((c) => c.raceId))],
    });

    const summaries: CandidateSummary[] = [];

    for (const target of targets) {
      try {
        const body = {
          model: "sonar",
          messages: [
            { role: "system", content: SCOUT_SYSTEM },
            {
              role: "user",
              // "Last 90 days preferred" was the reason /news read as stale.
              // A three-month window with no ordering returns whatever is best
              // indexed, which skews old; and because already-known urls are
              // dropped as duplicates, each run surfaced yet another OLDER
              // unseen article instead of today's. The feed filled with June
              // while the July 22 Marquette poll wave went unfound.
              //
              // The window is now days, ordered newest-first, with today's date
              // stated so the model has an anchor rather than inferring "recent"
              // from its own training cutoff.
              content: scoutPrompt(target, new Date().toISOString().slice(0, 10)),
            },
          ],
          search_domain_filter: ALLOWED_DOMAINS,
          // The provider-side recency filter, which the prompt alone cannot
          // enforce — without it the search itself still ranks by relevance
          // over freshness and the model can only pick from what it is given.
          search_recency_filter: "week",
          response_format: { type: "json_schema", json_schema: { schema: SCOUT_JSON_SCHEMA } },
        };

        let content: string;
        let traceId: string | undefined;

        // Isolate this candidate's failures per-candidate (like research.ts):
        // one bad Perplexity call must not abort the whole sweep.
        if (telemetry) {
          const spanResult = await tracer().startActiveSpan(`${AGENT_NAME}.run`, async (span) => {
            span.setAttribute("openinference.span.kind", "AGENT");
            span.setAttribute("agent.name", AGENT_NAME);
            span.setAttribute(
              "input.value",
              JSON.stringify({ candidate: target.slug, raceId: target.raceId }),
            );
            try {
              const llmSpan = tracer().startSpan("perplexity.chat.completions");
              llmSpan.setAttribute("openinference.span.kind", "LLM");
              llmSpan.setAttribute("llm.model_name", "sonar");
              llmSpan.setAttribute("input.value", JSON.stringify(body));
              const result = await fetchScoutContent(body);
              llmSpan.setAttribute("output.value", result.slice(0, 4000));
              llmSpan.end();
              span.setAttribute("output.value", result.slice(0, 4000));
              return { content: result, traceId: span.spanContext().traceId };
            } catch (err) {
              span.setAttribute("error", true);
              throw err;
            } finally {
              span.end();
            }
          });
          await telemetry.forceFlush();
          content = spanResult.content;
          traceId = spanResult.traceId;
        } else {
          content = await fetchScoutContent(body);
        }

        const parsed = parseScoutResponse(content);
        if ("error" in parsed) {
          summaries.push({ slug: target.slug, status: "error", error: parsed.error });
          continue;
        }

        const allowed = parsed.articles.filter((a) => isAllowedUrl(a.url));
        const dropped = parsed.articles.length - allowed.length;

        const known: string[] = await ctx.runQuery(internal.scoutQueries.knownSourceUrls, {
          urls: allowed.map((a) => a.url),
        });
        const knownSet = new Set(known);
        const fresh = allowed.filter((a) => !knownSet.has(a.url));

        if (fresh.length === 0) {
          summaries.push({ slug: target.slug, status: "empty", proposed: 0, dropped });
          continue;
        }

        const rows = fresh.map((a) => ({
          candidateSlug: target.slug,
          raceId: target.raceId,
          url: a.url,
          outlet: a.outlet,
          headline: a.headline,
          publishedAt: a.publishedAt,
          whyRelevant: a.whyRelevant,
          ...decorateCoverageRow(
            { outlet: a.outlet, headline: a.headline, url: a.url },
            { candidateNames, raceKeywords },
          ),
        }));

        const inserted: number = await ctx.runMutation(internal.scoutQueries.insertProposed, {
          rows,
          traceId,
        });

        summaries.push({ slug: target.slug, status: "proposed", proposed: inserted, dropped });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`article-scout: failed for ${target.slug}: ${message}`);
        summaries.push({ slug: target.slug, status: "error", error: message });
      } finally {
        // Record the attempt regardless of outcome so rotation (lastProposedAt
        // in listScoutCandidates) advances even on a zero-insert "empty" run —
        // otherwise the same least-recently-proposed candidates get re-picked
        // forever once the contested pool's URLs are all already known.
        await ctx.runMutation(internal.scoutQueries.recordAttempt, {
          candidateSlug: target.slug,
        });
      }
    }

    await reportHealth(ctx, summaries);
    return summaries;
  },
});
