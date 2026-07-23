import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { decorateCoverageRow } from "./lib/outlets";

/**
 * One-off backfill: `outletKey` / `relevanceScore` / `hubStatus` are new fields,
 * so every article_sources row discovered BEFORE this feature is invisible to
 * the /news hub. This stamps the existing corpus with the same decoration the
 * scout now applies, and creates the matching draft `outlets` rows so the
 * transparency queue has something to curate.
 *
 * dryRun defaults to TRUE (same safety posture as purgeOffCycleAds) — call it
 * once to see the counts, then again with {dryRun:false} to write.
 */
export const backfillCoverage = internalMutation({
  args: { dryRun: v.optional(v.boolean()), limit: v.optional(v.number()) },
  handler: async (ctx, { dryRun = true, limit }) => {
    const candidates = await ctx.db.query("candidates").collect();
    const races = await ctx.db.query("races").collect();
    const decorateCtx = {
      candidateNames: candidates.map((c) => c.name),
      raceKeywords: [...new Set(races.map((r) => r.office.toLowerCase()))],
    };

    // Only rows never decorated — re-running is a no-op on already-stamped rows.
    const pending = (await ctx.db.query("article_sources").collect())
      .filter((r) => r.outletKey === undefined)
      // A candidate's own campaign site is not news and its campaign is not a
      // media outlet — never decorate it or mint an `outlets` row for it.
      .filter((r) => r.sourceKind !== "campaign_site")
      .slice(0, limit ?? 5000);

    let hubAuto = 0;
    const keys = new Map<string, string>(); // outletKey -> displayName
    for (const row of pending) {
      const d = decorateCoverageRow(
        { outlet: row.outlet, headline: row.headline },
        decorateCtx,
      );
      if (d.hubStatus === "auto") hubAuto++;
      if (d.outletKey) keys.set(d.outletKey, row.outlet);
      if (!dryRun) await ctx.db.patch(row._id, d);
    }

    // Draft outlets for every distinct key (mirrors scoutQueries.insertProposed).
    let outletsCreated = 0;
    for (const [key, displayName] of keys) {
      const existing = await ctx.db
        .query("outlets")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (existing) continue;
      outletsCreated++;
      if (!dryRun) {
        await ctx.db.insert("outlets", {
          key,
          displayName,
          type: "other",
          reviewStatus: "draft",
          updatedAt: Date.now(),
        });
      }
    }

    return {
      dryRun,
      scanned: pending.length,
      wouldSetHubAuto: hubAuto,
      distinctOutlets: keys.size,
      outletsCreated,
    };
  },
});

/**
 * Repair pass for rows written before campaign sites were excluded: clears
 * `hubStatus`/`outletKey` on campaign_site articles and deletes any `outlets`
 * row that no real news article references. dryRun defaults to TRUE.
 */
export const cleanupCampaignSiteOutlets = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun = true }) => {
    const all = await ctx.db.query("article_sources").collect();

    // 1. Un-decorate campaign-site rows so they leave the hub entirely.
    const campaignRows = all.filter(
      (r) => r.sourceKind === "campaign_site" && r.outletKey !== undefined,
    );
    if (!dryRun) {
      for (const r of campaignRows) {
        await ctx.db.patch(r._id, { hubStatus: undefined, outletKey: undefined });
      }
    }

    // 2. Drop outlets no genuine (non-campaign) article points at.
    const realKeys = new Set(
      all
        .filter((r) => r.sourceKind !== "campaign_site" && r.outletKey)
        .map((r) => r.outletKey as string),
    );
    const outlets = await ctx.db.query("outlets").collect();
    const orphans = outlets.filter((o) => !realKeys.has(o.key));
    if (!dryRun) for (const o of orphans) await ctx.db.delete(o._id);

    return {
      dryRun,
      campaignRowsCleared: campaignRows.length,
      outletsDeleted: orphans.length,
      outletsKept: outlets.length - orphans.length,
    };
  },
});
