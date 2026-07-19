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

/** Candidates in contested races, with their last scout-proposal timestamp (any status) for rotation. */
export const listScoutCandidates = internalQuery({
  args: {},
  handler: async (ctx) => {
    const candidates = await ctx.db.query("candidates").collect();
    const targets = candidates.filter((c) => CONTESTED_RACE_IDS.includes(c.raceId));

    const out: { slug: string; name: string; raceId: string; lastProposedAt?: number }[] = [];
    for (const c of targets) {
      const rows = await ctx.db
        .query("article_sources")
        .withIndex("by_candidate", (q) => q.eq("candidateSlug", c.slug))
        .collect();
      const lastProposedAt =
        rows.length === 0 ? undefined : rows.reduce((max, r) => Math.max(max, r.proposedAt), 0);
      out.push({
        slug: c.slug,
        name: c.name,
        raceId: c.raceId,
        ...(lastProposedAt !== undefined ? { lastProposedAt } : {}),
      });
    }
    return out;
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
