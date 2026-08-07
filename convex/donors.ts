import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";

/** Public read-only donor queries (spec: 2026-08-07-donor-explorer). All
 * indexed-only — no table scans. */

export const roster = query({
  args: {
    raceId: v.string(),
    candidateSlug: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { raceId, candidateSlug, paginationOpts }) =>
    await ctx.db
      .query("donor_totals")
      .withIndex("by_candidate_total", (q) =>
        q.eq("raceId", raceId).eq("candidateSlug", candidateSlug),
      )
      .order("desc")
      .paginate(paginationOpts),
});

export const searchRoster = query({
  args: { raceId: v.string(), candidateSlug: v.string(), term: v.string() },
  handler: async (ctx, { raceId, candidateSlug, term }) => {
    if (term.trim().length < 2) return [];
    return await ctx.db
      .query("donor_totals")
      .withSearchIndex("search_name", (q) =>
        q.search("donorName", term).eq("raceId", raceId).eq("candidateSlug", candidateSlug),
      )
      .take(20);
  },
});

export const profile = query({
  args: { donorKey: v.string() },
  handler: async (ctx, { donorKey }) => {
    const donors = await ctx.db
      .query("donor_totals")
      .withIndex("by_donor", (q) => q.eq("donorKey", donorKey))
      .collect();
    if (donors.length === 0) return null;
    donors.sort((a, b) => b.total - a.total);
    return {
      donors,
      grandTotal: Math.round(donors.reduce((s, d) => s + d.total, 0) * 100) / 100,
    };
  },
});

export const searchDonors = query({
  args: { term: v.string() },
  handler: async (ctx, { term }) => {
    if (term.trim().length < 2) return [];
    return await ctx.db
      .query("donor_totals")
      .withSearchIndex("search_name", (q) => q.search("donorName", term))
      .take(20);
  },
});
