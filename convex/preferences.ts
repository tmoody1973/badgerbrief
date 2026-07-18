import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** Signed-in user's saved address + districts (MOO-307). Utility-only personalization. */

export const saveDistricts = mutation({
  args: {
    address: v.string(),
    congressionalDistrict: v.string(),
    stateSenateDistrict: v.string(),
    stateAssemblyDistrict: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null; // signed-out: nothing to save, not an error
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;
    const existing = await ctx.db
      .query("user_preferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("user_preferences", {
      userId: user._id,
      ...args,
      savedRaceIds: [],
      savedIssues: [],
      detailLevel: "standard",
    });
  },
});

export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;
    return await ctx.db
      .query("user_preferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
  },
});

export const savePrefs = mutation({
  args: {
    savedRaceIds: v.array(v.string()),
    savedIssues: v.array(v.string()),
    detailLevel: v.union(v.literal("short"), v.literal("standard"), v.literal("deep")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;
    const existing = await ctx.db
      .query("user_preferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("user_preferences", { userId: user._id, ...args });
  },
});
