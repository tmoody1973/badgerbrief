import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// Final-passage check, kept in step with votesQueries.FINAL_VOTE_TYPES (mirrored
// rather than imported to avoid the api-circularity TS quirk documented there).
// Federal-aware now that the `bills` cache also holds US-House CRS summaries: a
// federal final vote ("...Suspend the Rules and Pass") has no "PASSAGE"
// substring, so the WI-only list would have wrongly excluded it from the queue.
const FINAL_TYPES = [
  // Wisconsin
  "PASSAGE", "CONCURRENCE", "ADOPTION",
  // U.S. House
  "AND PASS", "TO CONCUR", "AND AGREE", "AGREEING TO THE RESOLUTION",
];
const isFinal = (voteType: string) => {
  const t = voteType.toUpperCase();
  return FINAL_TYPES.some((f) => t.includes(f));
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

/**
 * Bulk-approve every `pending` classification (the human reviewer scanned them
 * and accepted them as a batch). Only touches `pending` — `needs_review` and
 * `rejected` are left alone. Optionally pass `billNumbers` (session|billNumber)
 * to approve only a subset.
 */
export const approvePending = internalMutation({
  args: { only: v.optional(v.array(v.string())) },
  handler: async (ctx, { only }) => {
    const set = only ? new Set(only) : null;
    const rows = await ctx.db.query("bills").collect();
    let approved = 0;
    for (const b of rows) {
      if (b.classifyStatus !== "pending") continue;
      if (set && !set.has(`${b.session}|${b.billNumber}`)) continue;
      await ctx.db.patch(b._id, { classifyStatus: "approved", classifiedAt: Date.now() });
      approved++;
    }
    return { approved };
  },
});

export const ISSUE_SLUGS = [
  "healthcare", "education", "public-safety", "taxes-budget", "abortion", "housing",
  "immigration", "environment-energy", "economy-jobs", "elections-democracy", "agriculture",
] as const;

// Jurisdiction-neutral: the same wording classifies a Wisconsin bill (LRB
// summary) or a US-House bill (CRS summary). Naming a specific state would
// mislead the model on the federal branch, and the issue taxonomy is shared.
export function buildBillClassifyPrompt(title: string, summary: string): string {
  return [
    `Classify a legislative bill into the voter issues it touches, and describe what a YES vote does.`,
    `Pick 1-2 issues from EXACTLY this list: ${ISSUE_SLUGS.join(", ")}.`,
    `Write "outcome": a neutral, factual phrase (≤ 12 words) completing "a YES vote would ___", taken from what the bill does.`,
    `Rules:`,
    `- Describe the BILL only. Do NOT judge it, and do NOT describe any legislator.`,
    `- Neutral wording — no "reform", "crack down", "protect", "attack" or other loaded verbs.`,
    `- If it fits no issue on the list, return an empty issueSlugs array.`,
    ``,
    `Bill: ${title}`,
    `Nonpartisan summary: ${summary}`,
  ].join("\n");
}
