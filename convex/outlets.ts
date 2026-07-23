import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireAdmin } from "./sponsors";

const outletFields = {
  displayName: v.string(),
  type: v.union(
    v.literal("nonprofit"), v.literal("public_media"), v.literal("corporate_daily"),
    v.literal("wire"), v.literal("trade"), v.literal("tv"), v.literal("national"), v.literal("other"),
  ),
  ownership: v.optional(v.string()),
  fundingNote: v.optional(v.string()),
  ownershipSourceUrl: v.optional(v.string()),
  domain: v.optional(v.string()),
};

export const upsertOutlet = internalMutation({
  args: { key: v.string(), ...outletFields,
    thirdPartyRatings: v.optional(v.array(v.object({
      provider: v.union(v.literal("AllSides"), v.literal("AdFontes"), v.literal("MBFC"), v.literal("NewsGuard")),
      biasBand: v.optional(v.string()), factuality: v.optional(v.string()), url: v.string(), fetchedAt: v.number(),
    }))) },
  handler: async (ctx, a) => {
    const existing = await ctx.db.query("outlets").withIndex("by_key", (q) => q.eq("key", a.key)).unique();
    const doc = {
      key: a.key, displayName: a.displayName,
      // A failed enrich yields "other"; never let that clobber a hand-set type.
      type: existing && a.type === "other" ? existing.type : a.type,
      ownership: a.ownership ?? existing?.ownership,
      fundingNote: a.fundingNote ?? existing?.fundingNote,
      ownershipSourceUrl: a.ownershipSourceUrl ?? existing?.ownershipSourceUrl,
      domain: a.domain ?? existing?.domain,
      thirdPartyRatings: a.thirdPartyRatings ?? existing?.thirdPartyRatings,
      reviewStatus: existing?.reviewStatus ?? ("draft" as const),
      enrichedAt: Date.now(), updatedAt: Date.now(),
    };
    if (existing) { await ctx.db.patch(existing._id, doc); return existing._id; }
    return ctx.db.insert("outlets", doc);
  },
});

export const outletByKey = internalQuery({
  args: { key: v.string() },
  handler: (ctx, { key }) => ctx.db.query("outlets").withIndex("by_key", (q) => q.eq("key", key)).unique(),
});

export const publicOutlet = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const o = await ctx.db.query("outlets").withIndex("by_key", (q) => q.eq("key", key)).unique();
    return o && o.reviewStatus === "approved" ? o : null;
  },
});

export const saveOutlet = mutation({
  args: { key: v.string(), ...outletFields },
  handler: async (ctx, { key, ...fields }) => {
    await requireAdmin(ctx);
    const o = await ctx.db.query("outlets").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!o) { await ctx.db.insert("outlets", { key, ...fields, reviewStatus: "draft", updatedAt: Date.now() }); return; }
    await ctx.db.patch(o._id, { ...fields, updatedAt: Date.now() });
  },
});

export const approveOutlet = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    await requireAdmin(ctx);
    const o = await ctx.db.query("outlets").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!o) throw new Error("no outlet to approve");
    await ctx.db.patch(o._id, { reviewStatus: "approved", updatedAt: Date.now() });
  },
});

export const listDraftOutlets = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return (await ctx.db.query("outlets").collect()).filter((o) => o.reviewStatus === "draft");
  },
});
