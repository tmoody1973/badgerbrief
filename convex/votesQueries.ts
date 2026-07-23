/**
 * Storage for legislative roll calls. Plain mutations/queries only — the
 * fetching action lives in convex/votes.ts and is "use node", which a mutation
 * cannot import from (same split as scout.ts / scoutQueries.ts).
 */
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { matchesQuery } from "./lib/votingRecord";
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
        session: rollCall.session,
      });
      matched++;
    }
    return { stored: true, matched };
  },
});

/**
 * One-time (idempotent) fill of legislator_votes.session for rows written
 * before the field existed. session is the first "-"-delimited part of voteKey.
 */
export const backfillLegislatorSession = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ updated: number }> => {
    const rows = await ctx.db.query("legislator_votes").collect();
    let updated = 0;
    for (const r of rows) {
      if (r.session) continue;
      await ctx.db.patch(r._id, { session: r.voteKey.split("-")[0] });
      updated++;
    }
    return { updated };
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

    const matched = search?.trim()
      ? rows.filter((r) => matchesQuery(r.vote.billTitle, r.vote.billNumber, search))
      : rows;

    // Count every recorded vote we hold on the SAME bill, so an answer can
    // disclose that procedural votes exist rather than quietly showing one of
    // several. Keyed by session+billNumber: Wisconsin bill numbers reset each
    // biennium, so "AB 388" in 2023 and "AB 388" in 2025 are different bills
    // and must never be counted against each other.
    const perBill = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.vote.session}-${r.vote.billNumber}`;
      perBill.set(key, (perBill.get(key) ?? 0) + 1);
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
        otherVotesOnBill: (perBill.get(`${r.vote.session}-${r.vote.billNumber}`) ?? 1) - 1,
      }));
  },
});
