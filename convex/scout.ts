"use node";
/**
 * MOO-322 Task 2: Article Scout — searches the last week of news (context.dev
 * web search) for each contested-race candidate across an allowlisted set of
 * outlets, and
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
import { ALLOWED_DOMAINS, articlesFromSearch, isAllowedUrl, scoutQuery, sortByRotation, withPageDetails } from "./lib/scoutParse";
import { decorateCoverageRow } from "./lib/outlets";
import { isFullSweep } from "./lib/scoutHealth";

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

/**
 * Convex stops an action at 10 minutes, and a stopped run never reaches
 * reportHealth, so an overrun would be silent. The sweep stops starting new
 * candidates after 8 minutes; rotation puts the skipped ones first tomorrow.
 * Reads are capped per candidate for the same reason (the first run after
 * the October outage had up to 10 new articles each).
 */
const SWEEP_BUDGET_MS = 8 * 60_000;
const MAX_READS_PER_CANDIDATE = 5;

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

/**
 * One context.dev web search for one candidate. Until October 2026 this was a
 * Perplexity call; its key went dead around Sep 28 and /news stopped updating
 * for 16 days. The search returns the outlets' own headlines and snippets, so
 * nothing in a proposed row is written by a model.
 */
async function searchNews(body: unknown): Promise<unknown> {
  const res = await fetch("https://api.context.dev/v1/web/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CONTEXT_DEV_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error_code?: string } | null)?.error_code;
    throw new Error(`news search failed (http ${res.status}${detail ? " " + detail : ""})`);
  }
  return res.json();
}

const META = (property: string) => ({ selector: `meta[property="${property}"]`, type: "item", output: "@content" });

/**
 * Read one article page's share title and image through context.dev (1
 * credit). A plain fetch is blocked by the Journal Sentinel (402) and
 * WisPolitics (403); this is not. Any failure returns {} and the article keeps
 * what the search gave it.
 */
async function readPage(url: string): Promise<{ title?: string; image?: string }> {
  try {
    const res = await fetch("https://api.context.dev/v1/web/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CONTEXT_DEV_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: { parse: true }, parseParams: { rules: { title: META("og:title"), image: META("og:image") } } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return {};
    const data = ((await res.json()) as { parsed?: { data?: { title?: unknown; image?: unknown } } }).parsed?.data;
    return {
      ...(typeof data?.title === "string" ? { title: data.title } : {}),
      ...(typeof data?.image === "string" ? { image: data.image } : {}),
    };
  } catch {
    return {};
  }
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

/** The daily sweep: pick candidates, search the news, filter, propose. */
export const run = internalAction({
  args: {
    candidateSlugs: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { candidateSlugs, limit }): Promise<CandidateSummary[]> => {
    // Throw at call time (never import time) so `convex dev --once` pushes
    // cleanly before the key is provisioned.
    if (!process.env.CONTEXT_DEV_API_KEY) {
      await reportHealth(ctx, [], "CONTEXT_DEV_API_KEY not set");
      throw new Error("CONTEXT_DEV_API_KEY not set");
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

    const deadline = Date.now() + SWEEP_BUDGET_MS;
    for (const target of targets) {
      if (Date.now() > deadline) {
        console.warn(`article-scout: stopped before ${target.slug}; time budget spent`);
        break;
      }
      try {
        const body = {
          query: scoutQuery(target),
          numResults: 10,
          includeDomains: ALLOWED_DOMAINS,
          // Without a date window the search ranks by relevance and skews old.
          // The window is loose (a few older pages slip through); the nightly
          // date check reads each article's real date before it sorts on /news.
          freshness: "last_week",
          country: "us",
        };

        let response: unknown;
        let traceId: string | undefined;

        // Isolate this candidate's failures per-candidate (like research.ts):
        // one bad search must not abort the whole sweep.
        if (telemetry) {
          const spanResult = await tracer().startActiveSpan(`${AGENT_NAME}.run`, async (span) => {
            span.setAttribute("openinference.span.kind", "AGENT");
            span.setAttribute("agent.name", AGENT_NAME);
            span.setAttribute(
              "input.value",
              JSON.stringify({ candidate: target.slug, raceId: target.raceId }),
            );
            try {
              const searchSpan = tracer().startSpan("contextdev.web.search");
              searchSpan.setAttribute("openinference.span.kind", "RETRIEVER");
              searchSpan.setAttribute("input.value", JSON.stringify(body));
              const result = await searchNews(body);
              const text = JSON.stringify(result).slice(0, 4000);
              searchSpan.setAttribute("output.value", text);
              searchSpan.end();
              span.setAttribute("output.value", text);
              return { response: result, traceId: span.spanContext().traceId };
            } catch (err) {
              span.setAttribute("error", true);
              throw err;
            } finally {
              span.end();
            }
          });
          await telemetry.forceFlush();
          response = spanResult.response;
          traceId = spanResult.traceId;
        } else {
          response = await searchNews(body);
        }

        const parsed = articlesFromSearch(response);
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
        const unseen = allowed.filter((a) => !knownSet.has(a.url));
        // Only articles we are about to save are read, so the cost is one
        // credit per new article, not per search result. One at a time: read
        // in parallel, 5 of 6 came back 429 RATE_LIMITED (tested 2026-10-14).
        const read = [];
        for (const a of unseen.slice(0, MAX_READS_PER_CANDIDATE)) read.push(withPageDetails(a, await readPage(a.url)));
        const fresh = read.filter((a) => a !== null);
        const pressReleases = read.length - fresh.length;
        const unread = fresh.filter((a) => a.unread).length;
        if (unread) console.warn(`article-scout: ${unread} article page(s) unread for ${target.slug}; held for review`);

        if (fresh.length === 0) {
          summaries.push({ slug: target.slug, status: "empty", proposed: 0, dropped: dropped + pressReleases });
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
          ...(a.imageUrl ? { imageUrl: a.imageUrl } : {}),
          ...decorateCoverageRow(
            { outlet: a.outlet, headline: a.headline, url: a.url },
            { candidateNames, raceKeywords },
          ),
          // An unread page may carry a cut-off headline or a press release
          // the search title hides: it waits in the review queue, off /news.
          ...(a.unread ? { hubStatus: undefined } : {}),
        }));

        const inserted: number = await ctx.runMutation(internal.scoutQueries.insertProposed, {
          rows,
          traceId,
        });

        summaries.push({ slug: target.slug, status: "proposed", proposed: inserted, dropped: dropped + pressReleases });
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

    if (isFullSweep({ candidateSlugs, limit })) await reportHealth(ctx, summaries);
    return summaries;
  },
});

/**
 * One-time: give /news stories that have no picture the one their own outlet
 * chose, read through context.dev (1 credit each). Most are Journal Sentinel
 * and WisPolitics stories from before October 2026, when only our plain fetch
 * looked for images and both outlets block it. Stops before Convex's time
 * limit; run again until `remaining` is 0.
 */
export const backfillImages = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<{ scanned: number; found: number; remaining: number }> => {
    if (!process.env.CONTEXT_DEV_API_KEY) throw new Error("CONTEXT_DEV_API_KEY not set");
    const targets = await ctx.runQuery(internal.newsCleanup.storiesWithoutImage, { limit: limit ?? 60 });
    const deadline = Date.now() + SWEEP_BUDGET_MS;
    let scanned = 0;
    let found = 0;
    for (const t of targets) {
      if (Date.now() > deadline) break;
      scanned++;
      const { image } = await readPage(t.url);
      if (!image || !/^https?:\/\//.test(image)) continue;
      await ctx.runMutation(internal.newsCleanup.setImage, { id: t.id, imageUrl: image });
      found++;
    }
    const left = await ctx.runQuery(internal.newsCleanup.storiesWithoutImage, { limit: 10_000 });
    return { scanned, found, remaining: left.length };
  },
});
