/**
 * Storage for legislative roll calls. Plain mutations/queries only — the
 * fetching action lives in convex/votes.ts and is "use node", which a mutation
 * cannot import from (same split as scout.ts / scoutQueries.ts).
 */
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireAdmin } from "./sponsors";

const positionValidator = v.union(
  v.literal("aye"),
  v.literal("nay"),
  v.literal("not_voting"),
);

const chamberValidator = v.union(v.literal("assembly"), v.literal("senate"));

export const storeRollCall = internalMutation({
  args: {
    rollCall: v.object({
      voteKey: v.string(),
      session: v.string(),
      chamber: chamberValidator,
      voteId: v.string(),
      billNumber: v.string(),
      billTitle: v.string(),
      voteType: v.string(),
      votedOn: v.string(),
      ayes: v.number(),
      nays: v.number(),
      notVoting: v.number(),
      vacantSeats: v.number(),
      sourceUrl: v.string(),
      votes: v.array(
        v.object({
          name: v.string(),
          party: v.optional(v.string()),
          position: positionValidator,
        }),
      ),
    }),
  },
  handler: async (ctx, { rollCall }): Promise<{ stored: boolean; matched: number }> => {
    const existing = await ctx.db
      .query("legislative_votes")
      .withIndex("by_voteKey", (q) => q.eq("voteKey", rollCall.voteKey))
      .unique();
    if (existing) return { stored: false, matched: 0 };

    await ctx.db.insert("legislative_votes", {
      voteKey: rollCall.voteKey,
      session: rollCall.session,
      chamber: rollCall.chamber,
      voteId: rollCall.voteId,
      billNumber: rollCall.billNumber,
      billTitle: rollCall.billTitle,
      voteType: rollCall.voteType,
      votedOn: rollCall.votedOn,
      ayes: rollCall.ayes,
      nays: rollCall.nays,
      notVoting: rollCall.notVoting,
      sourceUrl: rollCall.sourceUrl,
      ingestedAt: Date.now(),
    });

    // Only legislators we track, matched on an exact hand-entered name for the
    // right chamber and session. No fuzzy matching: two members can share a
    // surname on the same vote.
    const candidates = await ctx.db.query("candidates").collect();
    let matched = 0;
    for (const c of candidates) {
      const mapping = c.legislatorName;
      if (!mapping) continue;
      if (mapping.chamber !== rollCall.chamber) continue;
      if (!mapping.sessions.includes(rollCall.session)) continue;
      const row = rollCall.votes.find((x) => x.name === mapping.name);
      if (!row) continue;
      await ctx.db.insert("legislator_votes", {
        voteKey: rollCall.voteKey,
        candidateSlug: c.slug,
        position: row.position,
      });
      matched++;
    }
    return { stored: true, matched };
  },
});

export const ingestedKeys = internalQuery({
  args: { session: v.string(), chamber: chamberValidator },
  handler: async (ctx, { session, chamber }): Promise<string[]> => {
    const rows = await ctx.db
      .query("legislative_votes")
      .withIndex("by_session_chamber", (q) =>
        q.eq("session", session).eq("chamber", chamber),
      )
      .collect();
    return rows.map((r) => r.voteId).sort();
  },
});

/** Attach a hand-verified roll-call surname to a candidate. */
export const setLegislatorName = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    chamber: chamberValidator,
    sessions: v.array(v.string()),
  },
  handler: async (ctx, { slug, name, chamber, sessions }) => {
    await requireAdmin(ctx);
    const candidate = await ctx.db
      .query("candidates")
      .withIndex("by_slug_only", (q) => q.eq("slug", slug))
      .first();
    if (!candidate) throw new Error(`no candidate with slug "${slug}"`);
    await ctx.db.patch(candidate._id, { legislatorName: { name, chamber, sessions } });
    return { slug, name };
  },
});

/** Votes that decide a bill, surfaced ahead of procedural ones. */
const FINAL_VOTE_TYPES = ["PASSAGE", "CONCURRENCE", "ADOPTION"];
const isFinal = (voteType: string) =>
  FINAL_VOTE_TYPES.some((t) => voteType.toUpperCase().includes(t));

export const votingRecord = query({
  args: { candidateSlug: v.string(), query: v.optional(v.string()) },
  handler: async (ctx, { candidateSlug, query: search }) => {
    const positions = await ctx.db
      .query("legislator_votes")
      .withIndex("by_candidate", (q) => q.eq("candidateSlug", candidateSlug))
      .collect();
    if (positions.length === 0) return [];

    const rows = [];
    for (const p of positions) {
      const vote = await ctx.db
        .query("legislative_votes")
        .withIndex("by_voteKey", (q) => q.eq("voteKey", p.voteKey))
        .unique();
      if (!vote) continue;
      rows.push({ vote, position: p.position });
    }

    // Word-set match, not one contiguous substring: an agent-phrased query like
    // "child care center loan" is not a literal substring of the official title
    // "CHILD CARE CENTER RENOVATIONS LOAN PROGRAM" (the word "renovations" sits
    // between them), so requiring every word to appear (any order) instead of
    // one exact run of characters is what lets natural-language queries match.
    const needleWords = search?.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matched = needleWords?.length
      ? rows.filter((r) => {
          const haystack = `${r.vote.billTitle} ${r.vote.billNumber}`.toLowerCase();
          return needleWords.every((w) => haystack.includes(w));
        })
      : rows;

    // Count every recorded vote we hold on each bill, so an answer can disclose
    // that procedural votes exist rather than quietly showing one of several.
    const perBill = new Map<string, number>();
    for (const r of rows) {
      perBill.set(r.vote.billNumber, (perBill.get(r.vote.billNumber) ?? 0) + 1);
    }

    return matched
      .sort((a, b) => {
        // Final votes first, then most recent.
        const fa = isFinal(a.vote.voteType) ? 1 : 0;
        const fb = isFinal(b.vote.voteType) ? 1 : 0;
        return fb - fa || b.vote.votedOn.localeCompare(a.vote.votedOn);
      })
      .map((r) => ({
        billNumber: r.vote.billNumber,
        billTitle: r.vote.billTitle,
        voteType: r.vote.voteType,
        votedOn: r.vote.votedOn,
        chamber: r.vote.chamber,
        session: r.vote.session,
        position: r.position,
        ayes: r.vote.ayes,
        nays: r.vote.nays,
        sourceUrl: r.vote.sourceUrl,
        otherVotesOnBill: (perBill.get(r.vote.billNumber) ?? 1) - 1,
      }));
  },
});
