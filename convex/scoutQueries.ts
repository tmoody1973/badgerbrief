/**
 * MOO-322 Task 2: internal queries/mutations for the article scout — split
 * from convex/scout.ts because Convex forbids queries/mutations in a
 * "use node" file (mirrors the research.ts / researchQueries.ts split).
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { canonicalOutletName } from "./lib/outlets";
import { canonicalArticleKey } from "./lib/articleUrl";

/** Bare hostname for the outlet's `domain` field; undefined if unparseable. */
const hostOf = (url: string): string | undefined => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
};

/** Races the scout actively hunts coverage for. */
export const CONTESTED_RACE_IDS = [
  "WI-GOV-2026",
  "WI-AG-2026",
  "WI-SOS-2026",
  "WI-TREAS-2026",
  "WI-US-HOUSE-D4-2026",
];

/**
 * Candidates to scout, with a rotation timestamp for last-touched-first
 * ordering. No args → the contested-race pool. Explicit `slugs` bypass the
 * pool filter entirely (spec: caller-picked candidates may be anywhere).
 *
 * `lastProposedAt` is max(last scout_attempts.attemptedAt, last
 * article_sources.proposedAt) — attempts record every candidate the scout
 * processed regardless of outcome, so a candidate that yields zero new URLs
 * still advances instead of being re-picked forever (MOO-322 final review).
 */
export const listScoutCandidates = internalQuery({
  args: { slugs: v.optional(v.array(v.string())) },
  handler: async (ctx, { slugs }) => {
    const candidates = await ctx.db.query("candidates").collect();
    const targets = slugs
      ? candidates.filter((c) => slugs.includes(c.slug))
      : candidates.filter((c) => CONTESTED_RACE_IDS.includes(c.raceId));

    const out: { slug: string; name: string; raceId: string; lastProposedAt?: number }[] = [];
    for (const c of targets) {
      const rows = await ctx.db
        .query("article_sources")
        .withIndex("by_candidate", (q) => q.eq("candidateSlug", c.slug))
        .collect();
      const maxProposedAt = rows.reduce((max, r) => Math.max(max, r.proposedAt), 0);

      const attempts = await ctx.db
        .query("scout_attempts")
        .withIndex("by_candidate", (q) => q.eq("candidateSlug", c.slug))
        .collect();
      const maxAttemptedAt = attempts.reduce((max, a) => Math.max(max, a.attemptedAt), 0);

      const lastProposedAt = Math.max(maxProposedAt, maxAttemptedAt);
      out.push({
        slug: c.slug,
        name: c.name,
        raceId: c.raceId,
        ...(lastProposedAt > 0 ? { lastProposedAt } : {}),
      });
    }
    return out;
  },
});

/** Lowercased `office` for each given raceId — race keywords for the hub
 * relevance gate (scoreRelevance in lib/outlets.ts). */
export const listRaceOffices = internalQuery({
  args: { raceIds: v.array(v.string()) },
  handler: async (ctx, { raceIds }) => {
    const races = await ctx.db.query("races").collect();
    const offices = races
      .filter((r) => raceIds.includes(r.raceId))
      .map((r) => r.office.toLowerCase());
    return [...new Set(offices)];
  },
});

/** Subset of `urls` already known — either an existing article_sources row (any status) or a candidate's campaign_website. */
export const knownSourceUrls = internalQuery({
  args: { urls: v.array(v.string()) },
  handler: async (ctx, { urls }) => {
    const known = new Set<string>();

    // Matched on the canonical key, not the raw url: jsonline.com serves the
    // same story under several slugs and section paths, and exact-string
    // matching let both onto /news as separate articles.
    for (const url of urls) {
      const key = canonicalArticleKey(url);
      const existing = await ctx.db
        .query("article_sources")
        .withIndex("by_urlKey", (q) => q.eq("urlKey", key))
        .first();
      if (existing) {
        known.add(url);
        continue;
      }
      // Rows written before urlKey existed still only match on the raw url.
      const legacy = await ctx.db
        .query("article_sources")
        .withIndex("by_url", (q) => q.eq("url", url))
        .first();
      if (legacy) known.add(url);
    }

    const candidates = await ctx.db.query("candidates").collect();
    const websites = new Set(
      candidates.map((c) => c.socialMedia?.campaign_website).filter((u): u is string => !!u),
    );
    for (const url of urls) {
      if (websites.has(url)) known.add(url);
    }

    return [...known];
  },
});

/** Record a scout attempt for rotation — called for every candidate the scout processed, any outcome. attemptedAt set server-side. */
export const recordAttempt = internalMutation({
  args: { candidateSlug: v.string() },
  handler: async (ctx, { candidateSlug }) => {
    await ctx.db.insert("scout_attempts", { candidateSlug, attemptedAt: Date.now() });
  },
});

/** Insert scout-found articles as status "proposed" — proposedAt set server-side, never trusted from the caller. */
export const insertProposed = internalMutation({
  args: {
    rows: v.array(
      v.object({
        candidateSlug: v.string(),
        raceId: v.string(),
        url: v.string(),
        outlet: v.string(),
        headline: v.string(),
        publishedAt: v.optional(v.string()),
        whyRelevant: v.string(),
        outletKey: v.optional(v.string()),
        relevanceScore: v.optional(v.number()),
        relevanceReason: v.optional(v.string()),
        hubStatus: v.optional(v.union(v.literal("auto"), v.literal("hidden"))),
      }),
    ),
    traceId: v.optional(v.string()),
  },
  handler: async (ctx, { rows, traceId }) => {
    const proposedAt = Date.now();
    for (const row of rows) {
      await ctx.db.insert("article_sources", {
        ...row,
        // Identity that survives a publisher rewriting the slug around a stable
        // asset id — see lib/articleUrl.ts for the two real /news duplicates.
        urlKey: canonicalArticleKey(row.url),
        status: "proposed",
        proposedAt,
        traceId,
      });
    }

    // Every distinct outletKey needs a row in `outlets` or the transparency
    // card has nothing to render. New keys land as "draft" — the enrichment
    // queue + admin Outlets tab both read drafts (spec §4 step 3).
    const keys = new Set(rows.map((r) => r.outletKey).filter((k): k is string => !!k));
    for (const key of keys) {
      const existing = await ctx.db
        .query("outlets")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (existing) continue;
      const row = rows.find((r) => r.outletKey === key)!;
      await ctx.db.insert("outlets", {
        key,
        // Canonical name, matching how `key` was derived — otherwise a row
        // keyed "tmj4 news" could be labelled with whatever variant the LLM
        // happened to write on the run that created it.
        displayName: canonicalOutletName(row.outlet, row.url),
        domain: hostOf(row.url),
        type: "other",
        reviewStatus: "draft",
        updatedAt: Date.now(),
      });
    }

    return rows.length;
  },
});

/**
 * Backfill `urlKey` and remove articles that are the same story twice.
 *
 * Two jsonline.com stories reached /news as duplicate rows because the
 * publisher rewrote the slug and section path around a stable asset id, and
 * dedup keyed on the raw url. This fills the canonical key for existing rows
 * and drops the later copy of any collision.
 *
 * Keeps the EARLIEST row: it is the one whose id may already be referenced by
 * a candidate or race page, and its outlet enrichment has had longer to land.
 * Paginated — a single mutation may not read+write more than 4096 documents.
 *
 * RUN IT TWICE. The twin lookup goes through the by_urlKey index, so it can
 * only see rows that already carry a key. On a first run over unkeyed data most
 * rows are keyed only after their twin has been examined, and the pass reports
 * `deleted: 0` — which reads like "no duplicates" rather than "not yet
 * comparable". The second pass, with every key present, is the one that
 * collapses them (observed: 291 keyed / 0 deleted, then 0 keyed / 7 deleted).
 */
export const backfillArticleUrlKeys = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), numItems: v.optional(v.number()) },
  handler: async (ctx, { cursor = null, numItems = 500 }) => {
    const page = await ctx.db.query("article_sources").paginate({ cursor, numItems });
    let keyed = 0;
    let deleted = 0;
    for (const row of page.page) {
      const key = canonicalArticleKey(row.url);
      if (row.urlKey !== key) {
        await ctx.db.patch(row._id, { urlKey: key });
        keyed++;
      }
      const twins = await ctx.db
        .query("article_sources")
        .withIndex("by_urlKey", (q) => q.eq("urlKey", key))
        .collect();
      for (const t of twins) {
        // Strictly later rows only, so the comparison can never delete both.
        if (t._id !== row._id && t._creationTime > row._creationTime) {
          await ctx.db.delete(t._id);
          deleted++;
        }
      }
    }
    return { keyed, deleted, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});
