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
    const wanted = new Map<string, { session: string; billNumber: string; billTitle: string }>();
    for (const slug of candidateSlugs) {
      const lv = await ctx.db.query("legislator_votes").withIndex("by_candidate", (q) => q.eq("candidateSlug", slug)).collect();
      for (const p of lv) {
        const vote = await ctx.db.query("legislative_votes").withIndex("by_voteKey", (q) => q.eq("voteKey", p.voteKey)).unique();
        if (!vote || !isFinal(vote.voteType)) continue;
        wanted.set(`${vote.session}-${vote.billNumber}`, { session: vote.session, billNumber: vote.billNumber, billTitle: vote.billTitle });
      }
    }
    const out: Array<{ session: string; billNumber: string; billTitle: string; summary: string }> = [];
    for (const { session, billNumber, billTitle } of wanted.values()) {
      const bill = await ctx.db.query("bills").withIndex("by_session_bill", (q) => q.eq("session", session).eq("billNumber", billNumber)).unique();
      if (!bill || bill.classifyStatus || bill.summary === null) continue; // already classified or no LRB text to anchor
      out.push({ session, billNumber, billTitle: billTitle || billNumber, summary: bill.summary });
    }
    return out;
  },
});

export const listForReview = internalQuery({
  args: { statuses: v.optional(v.array(v.string())) },
  handler: async (ctx, { statuses }) => {
    const wanted = new Set(statuses ?? ["pending", "needs_review"]);
    const rows = await ctx.db.query("bills").collect();
    return rows
      .filter((b) => b.classifyStatus && wanted.has(b.classifyStatus))
      .sort((a, b) => a.classifyStatus!.localeCompare(b.classifyStatus!) || a.billNumber.localeCompare(b.billNumber))
      .map((b) => ({
        session: b.session,
        billNumber: b.billNumber,
        billUrl: b.billUrl,
        summary: b.summary,
        issueSlugs: b.issueSlugs,
        outcome: b.outcome,
        classifyConfidence: b.classifyConfidence,
        classifyStatus: b.classifyStatus,
      }));
  },
});

export const ISSUE_SLUGS = [
  "healthcare", "education", "public-safety", "taxes-budget", "abortion", "housing",
  "immigration", "environment-energy", "economy-jobs", "elections-democracy", "agriculture",
] as const;

export function buildBillClassifyPrompt(title: string, lrbSummary: string): string {
  return [
    `Classify a Wisconsin bill into the voter issues it touches, and describe what a YES vote does.`,
    `Pick 1-2 issues from EXACTLY this list: ${ISSUE_SLUGS.join(", ")}.`,
    `Write "outcome": a neutral, factual phrase (≤ 12 words) completing "a YES vote would ___", taken from what the bill does.`,
    `Rules:`,
    `- Describe the BILL only. Do NOT judge it, and do NOT describe any legislator.`,
    `- Neutral wording — no "reform", "crack down", "protect", "attack" or other loaded verbs.`,
    `- If it fits no issue on the list, return an empty issueSlugs array.`,
    ``,
    `Bill: ${title}`,
    `Nonpartisan LRB summary: ${lrbSummary}`,
  ].join("\n");
}
