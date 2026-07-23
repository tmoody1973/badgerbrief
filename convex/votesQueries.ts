/**
 * Storage for legislative roll calls. Plain mutations/queries only — the
 * fetching action lives in convex/votes.ts and is "use node", which a mutation
 * cannot import from (same split as scout.ts / scoutQueries.ts).
 */
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
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
