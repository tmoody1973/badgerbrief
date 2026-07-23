/**
 * MOO-322 Task 2: internal queries/mutations for the article scout — split
 * from convex/scout.ts because Convex forbids queries/mutations in a
 * "use node" file (mirrors the research.ts / researchQueries.ts split).
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

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

    for (const url of urls) {
      const existing = await ctx.db
        .query("article_sources")
        .withIndex("by_url", (q) => q.eq("url", url))
        .first();
      if (existing) known.add(url);
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
        status: "proposed",
        proposedAt,
        traceId,
      });
    }
    return rows.length;
  },
});
