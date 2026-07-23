import { v } from "convex/values";
import { mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const id = await ctx.auth.getUserIdentity();
  if ((id?.metadata as { role?: string } | undefined)?.role !== "admin") throw new Error("admin only");
}

async function withOutlet(ctx: QueryCtx, article: any) {
  const outlet = article.outletKey
    ? await ctx.db.query("outlets").withIndex("by_key", (q) => q.eq("key", article.outletKey)).unique()
    : null;
  return { article, status: article.status, outlet: outlet && outlet.reviewStatus === "approved" ? outlet : null };
}

export const hubArticles = query({
  args: { limit: v.optional(v.number()), raceId: v.optional(v.string()) },
  handler: async (ctx, { limit, raceId }) => {
    const rows = await ctx.db.query("article_sources").withIndex("by_hubStatus", (q) => q.eq("hubStatus", "auto")).collect();
    const filtered = (raceId ? rows.filter((r) => r.raceId === raceId) : rows)
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
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

export const setHubStatus = mutation({
  args: { articleId: v.id("article_sources"), hubStatus: v.union(v.literal("auto"), v.literal("hidden")) },
  handler: async (ctx, { articleId, hubStatus }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(articleId, { hubStatus });
  },
});
