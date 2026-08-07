import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";

/** Public read-only donor queries (spec: 2026-08-07-donor-explorer). All
 * indexed-only — no table scans. */

// v1 is sunshine-only; revisit these guards when openfec rosters ship (donor
// identities must not merge across sources).

export const roster = query({
  args: {
    raceId: v.string(),
    candidateSlug: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { raceId, candidateSlug, paginationOpts }) => {
    const page = await ctx.db
      .query("donor_totals")
      .withIndex("by_candidate_total", (q) =>
        q.eq("raceId", raceId).eq("candidateSlug", candidateSlug),
      )
      .order("desc")
      .paginate(paginationOpts);
    return { ...page, page: page.page.filter((d) => d.source === "sunshine") };
  },
});

export const searchRoster = query({
  args: { raceId: v.string(), candidateSlug: v.string(), term: v.string() },
  handler: async (ctx, { raceId, candidateSlug, term }) => {
    if (term.trim().length < 2) return [];
    const rows = await ctx.db
      .query("donor_totals")
      .withSearchIndex("search_name", (q) =>
        q.search("donorName", term).eq("raceId", raceId).eq("candidateSlug", candidateSlug),
      )
      .take(20);
    return rows.filter((d) => d.source === "sunshine");
  },
});

export const profile = query({
  args: { donorKey: v.string() },
  handler: async (ctx, { donorKey }) => {
    const donors = (
      await ctx.db
        .query("donor_totals")
        .withIndex("by_donor", (q) => q.eq("donorKey", donorKey))
        .collect()
    ).filter((d) => d.source === "sunshine");
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
    const rows = await ctx.db
      .query("donor_totals")
      .withSearchIndex("search_name", (q) => q.search("donorName", term))
      .take(20);
    return rows.filter((d) => d.source === "sunshine");
  },
});

// Fixed prominence order for the /money hub; unknown raceIds append after.
const RACE_ORDER = ["WI-GOV-2026", "WI-AG-2026", "WI-LTGOV-2026", "WI-SOS-2026", "WI-TREAS-2026"];

/** Race-by-race money overview for /money. finance_totals is ~30 rows — the
 * one sanctioned full-table read in this module; all joins are indexed. */
export const raceMoney = query({
  args: {},
  handler: async (ctx) => {
    const totals = (await ctx.db.query("finance_totals").collect()).filter(
      (t) => t.source === "sunshine" && (t.receipts ?? 0) > 0,
    );
    const byRace = new Map<string, typeof totals>();
    for (const t of totals) {
      const arr = byRace.get(t.raceId) ?? [];
      arr.push(t);
      byRace.set(t.raceId, arr);
    }
    const races = [];
    for (const [raceId, rows] of byRace) {
      const race = await ctx.db
        .query("races")
        .withIndex("by_race_id", (q) => q.eq("raceId", raceId))
        .unique();
      const candidates = await ctx.db
        .query("candidates")
        .withIndex("by_race", (q) => q.eq("raceId", raceId))
        .collect();
      const breakdowns = await ctx.db
        .query("finance_breakdowns")
        .withIndex("by_candidate", (q) => q.eq("raceId", raceId))
        .collect();
      const nameBySlug = new Map(candidates.map((c) => [c.slug, c.name]));
      const bdBySlug = new Map(
        breakdowns.filter((b) => b.source === "sunshine").map((b) => [b.candidateSlug, b]),
      );
      races.push({
        raceId,
        office: race?.office ?? raceId,
        candidates: [...rows]
          .sort((a, b) => (b.receipts ?? 0) - (a.receipts ?? 0))
          .map((t) => ({
            slug: t.candidateSlug,
            name: nameBySlug.get(t.candidateSlug) ?? t.candidateSlug,
            receipts: t.receipts ?? 0,
            categories: bdBySlug.get(t.candidateSlug)?.categories ?? null,
            coverageEndDate: t.coverageEndDate,
          })),
      });
    }
    races.sort((a, b) => {
      const ia = RACE_ORDER.indexOf(a.raceId);
      const ib = RACE_ORDER.indexOf(b.raceId);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return races;
  },
});
