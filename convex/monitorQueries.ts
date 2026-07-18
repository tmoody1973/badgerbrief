/**
 * MOO-312 Task 5: internal queries/mutations for the staleness + source-change
 * monitor. Split from convex/monitor.ts because Convex forbids queries/
 * mutations in a "use node" file — only actions run in the Node runtime.
 */
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const DEFAULT_MAX_AGE_DAYS = 14;

/**
 * Flags candidate_positions_published rows not reviewed within maxAgeDays.
 * Dedups against existing unresolved staleness alerts for the same refId so
 * re-running the sweep doesn't pile up duplicate alerts for the same row.
 */
export const stalenessSweep = internalMutation({
  args: { maxAgeDays: v.optional(v.number()) },
  handler: async (ctx, { maxAgeDays }) => {
    const cutoff = Date.now() - (maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) * 86_400_000;

    const alreadyAlerted = await ctx.db
      .query("alerts")
      .withIndex("by_resolved", (q) => q.eq("resolved", false))
      .filter((q) => q.eq(q.field("kind"), "staleness"))
      .collect();
    const alertedRefIds = new Set(alreadyAlerted.map((a) => a.refId));

    // ponytail: no index on lastReviewedAt — full collect + filter. Fine at
    // this table's scale (one row per candidate x issue); add a range index
    // if candidate_positions_published grows large enough for this to matter.
    const published = await ctx.db.query("candidate_positions_published").collect();

    let inserted = 0;
    for (const row of published) {
      if (row.lastReviewedAt >= cutoff) continue;
      if (alertedRefIds.has(row._id)) continue;

      const since = new Date(row.lastReviewedAt).toISOString().slice(0, 10);
      await ctx.db.insert("alerts", {
        kind: "staleness",
        severity: "warning",
        refTable: "candidate_positions_published",
        refId: row._id,
        message: `${row.candidateSlug}/${row.issueSlug} not reviewed since ${since}`,
        resolved: false,
        createdAt: Date.now(),
      });
      inserted++;
    }
    return inserted;
  },
});

/**
 * Inserts one alert row. Called by monitor.sourceChangeSweep — a "use node"
 * action that can't touch ctx.db directly.
 */
export const insertAlert = internalMutation({
  args: {
    kind: v.string(),
    message: v.string(),
    refTable: v.optional(v.string()),
    refId: v.optional(v.string()),
    severity: v.union(v.literal("info"), v.literal("warning"), v.literal("critical")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("alerts", { ...args, resolved: false, createdAt: Date.now() });
  },
});
