import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// Final-passage vote types (mirror of votesQueries.isFinal — kept in sync).
const FINAL_TYPES = ["PASSAGE", "CONCURRENCE", "ADOPTION"];
const isFinal = (voteType: string) => {
  const t = voteType.toUpperCase();
  return FINAL_TYPES.some((f) => t.includes(f)) || t.includes("ON PASSAGE");
};

export const setBillClassification = internalMutation({
  args: {
    session: v.string(),
    billNumber: v.string(),
    issueSlugs: v.array(v.string()),
    outcome: v.string(),
    confidence: v.number(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("needs_review")),
  },
  handler: async (ctx, { session, billNumber, issueSlugs, outcome, confidence, status }) => {
    const row = await ctx.db
      .query("bills")
      .withIndex("by_session_bill", (q) => q.eq("session", session).eq("billNumber", billNumber))
      .unique();
    if (!row) return { patched: false };
    await ctx.db.patch(row._id, {
      issueSlugs, outcome, classifyConfidence: confidence, classifyStatus: status, classifiedAt: Date.now(),
    });
    return { patched: true };
  },
});

export const pendingBillsForCandidates = internalQuery({
  args: { candidateSlugs: v.array(v.string()) },
  handler: async (ctx, { candidateSlugs }) => {
    // distinct (session, billNumber) from these candidates' SUBSTANTIVE votes
    const wanted = new Map<string, { session: string; billNumber: string }>();
    for (const slug of candidateSlugs) {
      const lv = await ctx.db.query("legislator_votes").withIndex("by_candidate", (q) => q.eq("candidateSlug", slug)).collect();
      for (const p of lv) {
        const vote = await ctx.db.query("legislative_votes").withIndex("by_voteKey", (q) => q.eq("voteKey", p.voteKey)).unique();
        if (!vote || !isFinal(vote.voteType)) continue;
        wanted.set(`${vote.session}-${vote.billNumber}`, { session: vote.session, billNumber: vote.billNumber });
      }
    }
    const out: Array<{ session: string; billNumber: string; billTitle: string; summary: string }> = [];
    for (const { session, billNumber } of wanted.values()) {
      const bill = await ctx.db.query("bills").withIndex("by_session_bill", (q) => q.eq("session", session).eq("billNumber", billNumber)).unique();
      if (!bill || bill.classifyStatus || bill.summary === null) continue; // already classified or no LRB text to anchor
      const anyVote = await ctx.db.query("legislative_votes").withIndex("by_bill", (q) => q.eq("billNumber", billNumber)).first();
      out.push({ session, billNumber, billTitle: anyVote?.billTitle ?? billNumber, summary: bill.summary });
    }
    return out;
  },
});
