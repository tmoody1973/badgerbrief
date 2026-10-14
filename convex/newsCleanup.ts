/**
 * One-off fixes to stories already on /news, run from the CLI. Kept out of
 * scoutQueries.ts because the daily scout never calls them.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { isOpinion } from "./lib/scoutParse";

/** Take opinion pieces off /news. Hidden, not deleted: they stay in admin. */
export const hideOpinionFromHub = internalMutation({
  args: {},
  handler: async (ctx) => {
    const onHub = await ctx.db.query("article_sources").withIndex("by_hubStatus", (q) => q.eq("hubStatus", "auto")).collect();
    let hidden = 0;
    for (const row of onHub) {
      if (!isOpinion(row.url, row.headline)) continue;
      await ctx.db.patch(row._id, { hubStatus: "hidden" });
      hidden++;
    }
    return { hidden };
  },
});

/** Stories on /news with no picture, for the image backfill. */
export const storiesWithoutImage = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }): Promise<{ id: Id<"article_sources">; url: string }[]> => {
    const onHub = await ctx.db.query("article_sources").withIndex("by_hubStatus", (q) => q.eq("hubStatus", "auto")).collect();
    return onHub
      .filter((r) => !r.imageUrl && r.status !== "rejected" && r.sourceKind !== "campaign_site")
      .slice(0, limit)
      .map((r) => ({ id: r._id, url: r.url }));
  },
});

export const setImage = internalMutation({
  args: { id: v.id("article_sources"), imageUrl: v.string() },
  handler: async (ctx, { id, imageUrl }) => {
    await ctx.db.patch(id, { imageUrl });
  },
});
