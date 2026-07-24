/**
 * Storage + lookup for the per-bill LRB analysis cache. Plain functions only —
 * the fetching action lives in convex/bills.ts ("use node").
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const CHAMBERS = ["assembly", "senate"] as const;

/**
 * Delete every bills row whose summary is null so the enrich action re-fetches
 * it. A null can mean "the bill genuinely has no analysis" OR "we failed to
 * parse the analysis" (e.g. a page-format the parser didn't yet handle), and
 * the two are indistinguishable without re-fetching — so after a parser fix,
 * clear the nulls and re-run enrich: genuinely-empty bills re-store null,
 * newly-parseable ones get their sentence. Paginated for the 4096-doc limit;
 * the caller drives the cursor until isDone.
 */
export const clearNullSummaryBills = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    numItems: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { cursor = null, numItems = 1000 },
  ): Promise<{ deleted: number; continueCursor: string; isDone: boolean }> => {
    const page = await ctx.db.query("bills").paginate({ cursor, numItems });
    let deleted = 0;
    for (const b of page.page) {
      if (b.summary === null) {
        await ctx.db.delete(b._id);
        deleted++;
      }
    }
    return { deleted, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** Upsert one bill's analysis by (session, billNumber). */
export const storeBill = internalMutation({
  args: {
    session: v.string(),
    billNumber: v.string(),
    billUrl: v.string(),
    summary: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { session, billNumber, billUrl, summary }): Promise<{ stored: "inserted" | "updated" }> => {
    const existing = await ctx.db
      .query("bills")
      .withIndex("by_session_bill", (q) => q.eq("session", session).eq("billNumber", billNumber))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { billUrl, summary, fetchedAt: Date.now() });
      return { stored: "updated" };
    }
    await ctx.db.insert("bills", { session, billNumber, billUrl, summary, fetchedAt: Date.now() });
    return { stored: "inserted" };
  },
});

/**
 * Distinct billNumbers voted on in this session that have no bills row yet.
 * Reads per session (both chambers) via by_session_chamber so a single
 * execution stays well under the 4096-document limit even as the corpus grows.
 */
export const unenrichedBillsForSession = internalQuery({
  args: { session: v.string() },
  handler: async (ctx, { session }): Promise<string[]> => {
    const billNumbers = new Set<string>();
    for (const chamber of CHAMBERS) {
      const rows = await ctx.db
        .query("legislative_votes")
        .withIndex("by_session_chamber", (q) => q.eq("session", session).eq("chamber", chamber))
        .collect();
      for (const r of rows) billNumbers.add(r.billNumber);
    }
    const out: string[] = [];
    for (const billNumber of billNumbers) {
      const existing = await ctx.db
        .query("bills")
        .withIndex("by_session_bill", (q) => q.eq("session", session).eq("billNumber", billNumber))
        .unique();
      if (!existing) out.push(billNumber);
    }
    return out;
  },
});

/**
 * Distinct sessions that have any roll call, so the enrich action covers every
 * ingested session automatically — it can never fall behind a new vote backfill
 * the way a hand-maintained session list would.
 *
 * ponytail: collects the whole legislative_votes table to dedup sessions — fine
 * at a few thousand rows. If it ever nears the 4096-document query limit, switch
 * to a distinct-session set maintained at ingest time.
 */
export const sessionsWithVotes = internalQuery({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const rows = await ctx.db.query("legislative_votes").collect();
    return [...new Set(rows.map((r) => r.session))].sort((a, b) => b.localeCompare(a));
  },
});
