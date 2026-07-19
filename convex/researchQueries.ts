/**
 * MOO-312 Task 2: internal queries/mutations for the Research Agent.
 * Split from convex/research.ts because Convex forbids queries/mutations in
 * a "use node" file — only actions run in the Node runtime.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { Extraction } from "./lib/extraction";

/**
 * Piece 1: campaign-site targets (as before) PLUS one target per approved
 * article_sources row (MOO-322 Task 3). Proposed/rejected rows never become
 * targets — only an admin decision promotes an article into the pipeline.
 */
export const listResearchTargets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const candidates = await ctx.db.query("candidates").collect();
    const nameBySlug = new Map(candidates.map((c) => [c.slug, c.name]));

    const targets: {
      slug: string;
      name: string;
      raceId: string;
      url: string;
      sourceKind: "campaign_site" | "article";
      outlet?: string;
    }[] = [];

    for (const c of candidates) {
      const url = c.socialMedia?.campaign_website;
      if (url) targets.push({ slug: c.slug, name: c.name, raceId: c.raceId, url, sourceKind: "campaign_site" });
    }

    const approvedArticles = await ctx.db
      .query("article_sources")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();
    for (const a of approvedArticles) {
      const name = nameBySlug.get(a.candidateSlug);
      if (!name) continue; // orphaned row (candidate removed) — skip rather than emit a bad target
      targets.push({
        slug: a.candidateSlug,
        name,
        raceId: a.raceId,
        url: a.url,
        sourceKind: "article",
        outlet: a.outlet,
      });
    }

    return targets;
  },
});

/** Piece 2: most recent successful fetch's content hash for a URL, or null. */
export const latestFetchHash = internalQuery({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    const rows = await ctx.db
      .query("source_fetch_logs")
      .withIndex("by_url", (q) => q.eq("url", url))
      .filter((q) => q.eq(q.field("status"), "ok"))
      .collect();
    if (rows.length === 0) return null;
    const latest = rows.reduce((a, b) => (b.fetchedAt > a.fetchedAt ? b : a));
    return latest.contentHash ?? null;
  },
});

/**
 * Piece 2b: last-fetch timestamp per URL, any status — used to rotate research
 * targets least-recently-fetched-first so candidates past DEFAULT_LIMIT
 * aren't starved forever by a stable slice. Never-fetched URLs are simply
 * absent from the returned map (caller treats that as "oldest").
 */
export const latestFetchTimestamps = internalQuery({
  args: { urls: v.array(v.string()) },
  handler: async (ctx, { urls }) => {
    const result: Record<string, number> = {};
    for (const url of urls) {
      const rows = await ctx.db
        .query("source_fetch_logs")
        .withIndex("by_url", (q) => q.eq("url", url))
        .collect();
      if (rows.length > 0) {
        result[url] = rows.reduce((max, row) => Math.max(max, row.fetchedAt), 0);
      }
    }
    return result;
  },
});

/** Piece 3: log every fetch attempt (success or failure). */
export const recordFetch = internalMutation({
  args: {
    url: v.string(),
    status: v.union(v.literal("ok"), v.literal("error")),
    httpStatus: v.optional(v.number()),
    contentHash: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("source_fetch_logs", { ...args, fetchedAt: Date.now() });
  },
});

/**
 * Piece 4: turn one candidate's extraction into pending drafts + open review
 * tasks. `sourceName` is the candidate's display name — used as the quote
 * speaker always (quotes are BY the candidate, regardless of source kind).
 * `sourceLabel` (MOO-322), when given, becomes the position citation's
 * `sources[].name` instead — e.g. the outlet name for an article source.
 * Campaign sites omit it, so the citation still falls back to sourceName.
 */
export const saveExtraction = internalMutation({
  args: {
    candidateSlug: v.string(),
    raceId: v.string(),
    sourceUrl: v.string(),
    sourceName: v.string(),
    sourceLabel: v.optional(v.string()),
    extraction: v.any(),
    traceId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { candidateSlug, raceId, sourceUrl, sourceName, sourceLabel, extraction, traceId },
  ) => {
    const parsed = extraction as Extraction;

    for (const position of parsed.positions) {
      // MOO-324: pending drafts are per-source. Re-extracting the SAME source
      // updates its own draft; a different source for the same (candidate,
      // issue) gets its own row so no citation/stance is silently overwritten.
      // publishPosition upserts published rows by (race, candidate, issue), so
      // approving either draft supersedes cleanly.
      const pendingForIssue = await ctx.db
        .query("candidate_positions_drafts")
        .withIndex("by_candidate_issue", (q) =>
          q
            .eq("raceId", raceId)
            .eq("candidateSlug", candidateSlug)
            .eq("issueSlug", position.issueSlug),
        )
        .filter((q) => q.eq(q.field("reviewStatus"), "pending"))
        .collect();
      const existing = pendingForIssue.find((d) =>
        d.sources.some((s) => s.url === sourceUrl),
      );

      const sources = [{ name: sourceLabel ?? sourceName, url: sourceUrl }];
      let draftId: Id<"candidate_positions_drafts">;
      if (existing) {
        await ctx.db.patch(existing._id, {
          stance: position.stance,
          summary: position.summary,
          confidence: position.confidence,
          sources,
          evidenceExcerpt: position.evidenceExcerpt,
          extractedAt: Date.now(),
          traceId,
        });
        draftId = existing._id;
      } else {
        draftId = await ctx.db.insert("candidate_positions_drafts", {
          candidateSlug,
          raceId,
          issueSlug: position.issueSlug,
          stance: position.stance,
          summary: position.summary,
          confidence: position.confidence,
          sources,
          evidenceExcerpt: position.evidenceExcerpt,
          reviewStatus: "pending",
          extractedAt: Date.now(),
          traceId,
        });
      }

      const openTask = await ctx.db
        .query("review_tasks")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .filter((q) => q.eq(q.field("refId"), draftId))
        .first();
      if (!openTask) {
        await ctx.db.insert("review_tasks", {
          kind: "position",
          refTable: "candidate_positions_drafts",
          refId: draftId,
          status: "open",
          createdAt: Date.now(),
        });
      }
    }

    let quotesInserted = 0;
    for (const quote of parsed.quotes) {
      const duplicate = await ctx.db
        .query("quote_drafts")
        .withIndex("by_candidate", (q) => q.eq("raceId", raceId).eq("candidateSlug", candidateSlug))
        .filter((q) => q.eq(q.field("text"), quote.text))
        .first();
      if (duplicate) continue;

      const draftId = await ctx.db.insert("quote_drafts", {
        candidateSlug,
        raceId,
        speaker: sourceName,
        text: quote.text,
        context: quote.context,
        date: quote.date,
        outlet: sourceLabel, // article quotes credit the outlet (undefined for campaign sites)
        sourceUrl,
        reviewStatus: "pending",
        extractedAt: Date.now(),
        traceId,
      });
      quotesInserted++;

      await ctx.db.insert("review_tasks", {
        kind: "quote",
        refTable: "quote_drafts",
        refId: draftId,
        status: "open",
        createdAt: Date.now(),
      });
    }

    return { positions: parsed.positions.length, quotes: quotesInserted };
  },
});
