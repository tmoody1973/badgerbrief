import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

/** Signed-in user's saved address + districts (MOO-307). Utility-only personalization. */

export const saveDistricts = mutation({
  args: {
    address: v.string(),
    congressionalDistrict: v.string(),
    stateSenateDistrict: v.string(),
    stateAssemblyDistrict: v.string(),
    /** City of Milwaukee ward from the same lookup; omitted outside the city. */
    ward: v.optional(v.string()),
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
      // ward is set explicitly so a lookup outside the city clears an old one.
      await ctx.db.patch(existing._id, { ...args, ward: args.ward });
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

/** The signed-in voter's Election Day polling place, from their saved City of Milwaukee ward. */
export const myPollingPlace = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;
    const prefs = await ctx.db
      .query("user_preferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!prefs?.ward) return null;
    const ward = await ctx.db
      .query("mke_wards")
      .withIndex("by_ward", (q) => q.eq("ward", prefs.ward!))
      .unique();
    if (!ward) return null;
    const { ward: number, pollingPlace, address, mainEntrance, accessibleEntrance, mainParking, accessibleParking, syncedAt } = ward;
    return { ward: number, pollingPlace, address, mainEntrance, accessibleEntrance, mainParking, accessibleParking, syncedAt };
  },
});

/** One-off backfill input: saved addresses that have districts but no ward yet. */
export const addressesWithoutWard = internalQuery({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("user_preferences").collect())
      .filter((p) => p.address && p.congressionalDistrict && !p.ward)
      .map((p) => ({ id: p._id, address: p.address! })),
});

export const setWard = internalMutation({
  args: { id: v.id("user_preferences"), ward: v.string() },
  handler: async (ctx, { id, ward }) => {
    await ctx.db.patch(id, { ward });
  },
});
