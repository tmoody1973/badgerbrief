import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireAdmin } from "./sponsors";

async function withOutlet(ctx: QueryCtx, article: Doc<"article_sources">) {
  const key = article.outletKey;
  const outlet = key
    ? await ctx.db.query("outlets").withIndex("by_key", (q) => q.eq("key", key)).unique()
    : null;
  return { article, outlet: outlet && outlet.reviewStatus === "approved" ? outlet : null };
}

/** Sort key: `publishedAt` is an optional free-text date. Undated (or
 * unparseable) rows fall back to `proposedAt` so they stay in the recency
 * window instead of sinking below every dated row and getting sliced off. */
const when = (r: Doc<"article_sources">) =>
  (r.publishedAt ? Date.parse(r.publishedAt) || r.proposedAt : r.proposedAt);

const byRecency = (a: Doc<"article_sources">, b: Doc<"article_sources">) => when(b) - when(a);

export const hubArticles = query({
  args: { limit: v.optional(v.number()), raceId: v.optional(v.string()) },
  handler: async (ctx, { limit, raceId }) => {
    const rows = await ctx.db.query("article_sources").withIndex("by_hubStatus", (q) => q.eq("hubStatus", "auto")).collect();
    const filtered = (raceId ? rows.filter((r) => r.raceId === raceId) : rows)
      .sort(byRecency)
      .slice(0, limit ?? 60);
    return Promise.all(filtered.map((a) => withOutlet(ctx, a)));
  },
});

export const inTheNewsForCandidate = query({
  args: { candidateSlug: v.string() },
  handler: async (ctx, { candidateSlug }) => {
    const rows = (await ctx.db.query("article_sources").withIndex("by_candidate", (q) => q.eq("candidateSlug", candidateSlug)).collect())
      .filter((r) => r.status === "approved" && r.sourceKind !== "campaign_site");
    return Promise.all(rows.map((a) => withOutlet(ctx, a)));
  },
});

export const inTheNewsForRace = query({
  args: { raceId: v.string() },
  handler: async (ctx, { raceId }) => {
    const rows = (await ctx.db.query("article_sources").withIndex("by_race", (q) => q.eq("raceId", raceId)).collect())
      .filter((r) => r.status === "approved" && r.sourceKind !== "campaign_site");
    return Promise.all(rows.map((a) => withOutlet(ctx, a)));
  },
});

/** Admin moderation view: every row currently on-hub ("auto") or previously
 * hidden ("hidden") — i.e. the whole moderatable set, unlike the public
 * `hubArticles` which only ever shows "auto". Two indexed lookups, no
 * full-table `.collect()`. */
export const hubModerationList = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await requireAdmin(ctx);
    const auto = await ctx.db.query("article_sources").withIndex("by_hubStatus", (q) => q.eq("hubStatus", "auto")).collect();
    const hidden = await ctx.db.query("article_sources").withIndex("by_hubStatus", (q) => q.eq("hubStatus", "hidden")).collect();
    const rows = [...auto, ...hidden].sort(byRecency).slice(0, limit ?? 100);
    return Promise.all(rows.map((a) => withOutlet(ctx, a)));
  },
});

export const setHubStatus = mutation({
  args: { articleId: v.id("article_sources"), hubStatus: v.union(v.literal("auto"), v.literal("hidden")) },
  handler: async (ctx, { articleId, hubStatus }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(articleId, { hubStatus });
  },
});
