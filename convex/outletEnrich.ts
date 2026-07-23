import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { normalizeOutletKey, parseOutletTransparency } from "./lib/outlets";
import { fetchOutletFacts } from "./lib/firecrawlOutlet";
import { requireAdmin } from "./sponsors";

/** Draft an outlet's transparency from public sources (Firecrawl), then
 * upsert as a draft for human review. Same shape as sponsor enrichment.
 *
 * INTERNAL: spends paid Firecrawl calls and writes a public `outlets` row,
 * so it must never be reachable unauthenticated. Caller is the admin-gated
 * `enrichOutlet` action. */
export const enrichOutletCore = internalAction({
  args: { name: v.string(), url: v.optional(v.string()) },
  handler: async (ctx, { name, url }): Promise<{ key: string }> => {
    const key = normalizeOutletKey(name);
    const raw = await fetchOutletFacts(name, url);
    const parsed = parseOutletTransparency(raw);
    await ctx.runMutation(internal.outlets.upsertOutlet, { key, displayName: name, ...parsed });
    return { key };
  },
});

/** Public entry point for the admin resolver UI — admin-gated, then
 * delegates to the internal core. */
export const enrichOutlet = action({
  args: { name: v.string(), url: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ key: string }> => {
    await requireAdmin(ctx);
    return ctx.runAction(internal.outletEnrich.enrichOutletCore, args);
  },
});
