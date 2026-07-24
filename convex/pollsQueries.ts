/**
 * Storage and reads for published horse-race polls.
 *
 * Plain mutations/queries only. There is deliberately NO aggregate query here —
 * no average, no trend line, no "polling leader". See lib/polls.ts for why:
 * the site cites what a pollster published rather than computing a number no
 * pollster published, and this source could not be averaged even if that
 * posture changed.
 */
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireAdmin } from "./sponsors";

const pollRow = v.object({
  pollKey: v.string(),
  raceId: v.string(),
  pollster: v.string(),
  pollType: v.string(),
  matchup: v.optional(v.string()),
  conductedStart: v.string(),
  conductedEnd: v.string(),
  releasedOn: v.optional(v.string()),
  sampleSize: v.optional(v.string()),
  sampleType: v.optional(v.string()),
  marginOfError: v.optional(v.string()),
  scientific: v.boolean(),
  groups: v.array(
    v.object({
      label: v.union(v.string(), v.null()),
      rows: v.array(
        v.object({
          label: v.string(),
          value: v.string(),
          candidateSlug: v.union(v.string(), v.null()),
        }),
      ),
    }),
  ),
  notes: v.optional(v.string()),
  sources: v.array(v.object({ name: v.string(), url: v.string() })),
});

/**
 * Upsert one poll. Keyed on pollKey so re-running the import after the source
 * file gains a new Marquette release updates in place rather than duplicating —
 * a duplicated poll would read to a visitor as two independent polls agreeing.
 */
export const upsertPoll = mutation({
  args: { poll: pollRow },
  handler: async (ctx, { poll }) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("polls")
      .withIndex("by_pollKey", (q) => q.eq("pollKey", poll.pollKey))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...poll, ingestedAt: Date.now() });
      return { updated: true };
    }
    await ctx.db.insert("polls", { ...poll, ingestedAt: Date.now() });
    return { updated: false };
  },
});

/** Internal twin of upsertPoll for scripted/cron ingest paths. */
export const storePoll = internalMutation({
  args: { poll: pollRow },
  handler: async (ctx, { poll }) => {
    const existing = await ctx.db
      .query("polls")
      .withIndex("by_pollKey", (q) => q.eq("pollKey", poll.pollKey))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...poll, ingestedAt: Date.now() });
      return { updated: true };
    }
    await ctx.db.insert("polls", { ...poll, ingestedAt: Date.now() });
    return { updated: false };
  },
});

/** Remove a poll by its natural key (retractions, bad imports). */
export const deletePoll = mutation({
  args: { pollKey: v.string() },
  handler: async (ctx, { pollKey }) => {
    await requireAdmin(ctx);
    const row = await ctx.db
      .query("polls")
      .withIndex("by_pollKey", (q) => q.eq("pollKey", pollKey))
      .unique();
    if (!row) return { deleted: false };
    await ctx.db.delete(row._id);
    return { deleted: true };
  },
});

/**
 * Every poll for a race, newest field date first.
 *
 * Scientific polls come before straw polls regardless of date: recency is the
 * right ordering among comparable polls, but a convention straw poll should
 * never sit at the top of the section merely for being recent.
 */
export const forRace = query({
  args: { raceId: v.string() },
  handler: async (ctx, { raceId }) => {
    const rows = await ctx.db
      .query("polls")
      .withIndex("by_race", (q) => q.eq("raceId", raceId))
      .collect();
    return rows.sort((a, b) => {
      if (a.scientific !== b.scientific) return a.scientific ? -1 : 1;
      return b.conductedEnd.localeCompare(a.conductedEnd);
    });
  },
});
