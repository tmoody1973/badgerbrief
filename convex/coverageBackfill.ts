import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { canonicalOutletName, decorateCoverageRow } from "./lib/outlets";

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
        { outlet: row.outlet, headline: row.headline, url: row.url },
        decorateCtx,
      );
      if (d.hubStatus === "auto") hubAuto++;
      // Draft outlets must be named with the SAME canonical name the key was
      // derived from, or the row says "TMJ4" while its key says "tmj4 news".
      if (d.outletKey) keys.set(d.outletKey, canonicalOutletName(row.outlet, row.url));
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

/**
 * Re-score every decorated article against the CURRENT relevance gate.
 *
 * backfillCoverage deliberately only touches never-decorated rows, so a change
 * to the gate itself leaves the existing corpus frozen at whatever it scored
 * the day it arrived. When the gate learned to read the url slug, 111 of 325
 * tracked articles were still sitting at 0.3 and invisible on /news — real
 * coverage the new rule would admit.
 *
 * Two things are never overridden:
 *  - hubStatus "hidden", which is a human saying no. A rescore that
 *    un-hides an article an editor removed would silently republish it.
 *  - status "rejected" rows are left alone for the same reason; the hub query
 *    already excludes them, and rewriting their score only muddies the audit.
 */
export const rescoreCoverage = internalMutation({
  args: { dryRun: v.optional(v.boolean()), limit: v.optional(v.number()) },
  handler: async (ctx, { dryRun = true, limit }) => {
    const candidates = await ctx.db.query("candidates").collect();
    const races = await ctx.db.query("races").collect();
    const decorateCtx = {
      candidateNames: candidates.map((c) => c.name),
      raceKeywords: [...new Set(races.map((r) => r.office.toLowerCase()))],
    };

    const rows = (await ctx.db.query("article_sources").collect())
      .filter((r) => r.sourceKind !== "campaign_site")
      .filter((r) => r.hubStatus !== "hidden")
      .filter((r) => r.status !== "rejected")
      .slice(0, limit ?? 5000);

    let promoted = 0;
    let changed = 0;
    for (const row of rows) {
      const d = decorateCoverageRow(
        { outlet: row.outlet, headline: row.headline, url: row.url },
        decorateCtx,
      );
      if (d.relevanceScore === row.relevanceScore) continue;
      changed++;
      if (d.hubStatus === "auto" && row.hubStatus !== "auto") promoted++;
      if (!dryRun) {
        await ctx.db.patch(row._id, {
          relevanceScore: d.relevanceScore,
          relevanceReason: d.relevanceReason,
          ...(d.hubStatus ? { hubStatus: d.hubStatus } : {}),
        });
      }
    }
    return { scanned: rows.length, changed, promoted, dryRun };
  },
});
