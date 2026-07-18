import { v } from "convex/values";
import { query } from "./_generated/server";

/** Read-only queries for the public guide. Published/seeded data only. */

export const getElection = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("elections")
      .withIndex("by_slug", (q) => q.eq("slug", "wi-2026"))
      .unique();
  },
});

export const listRaces = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("races").collect();
  },
});

export const getRace = query({
  args: { raceId: v.string() },
  handler: async (ctx, { raceId }) => {
    const race = await ctx.db
      .query("races")
      .withIndex("by_race_id", (q) => q.eq("raceId", raceId))
      .unique();
    if (!race) return null;
    const candidates = await ctx.db
      .query("candidates")
      .withIndex("by_race", (q) => q.eq("raceId", raceId))
      .collect();
    const [positions, finance] = await Promise.all([
      ctx.db
        .query("candidate_positions_published")
        .withIndex("by_candidate_issue", (q) => q.eq("raceId", raceId))
        .collect(),
      ctx.db
        .query("finance_totals")
        .withIndex("by_candidate", (q) => q.eq("raceId", raceId))
        .collect(),
    ]);
    return { race, candidates, positions, finance };
  },
});

export const getCandidateBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const candidate = await ctx.db
      .query("candidates")
      .withIndex("by_slug_only", (q) => q.eq("slug", slug))
      .first(); // ponytail: slugs unique across the 47 seeded candidates; revisit if a collision ever appears
    if (!candidate) return null;
    const race = await ctx.db
      .query("races")
      .withIndex("by_race_id", (q) => q.eq("raceId", candidate.raceId))
      .unique();
    const [positions, quotes, finance, contributions] = await Promise.all([
      ctx.db
        .query("candidate_positions_published")
        .withIndex("by_candidate_issue", (q) =>
          q.eq("raceId", candidate.raceId).eq("candidateSlug", slug),
        )
        .collect(),
      ctx.db
        .query("quote_published")
        .withIndex("by_candidate", (q) =>
          q.eq("raceId", candidate.raceId).eq("candidateSlug", slug),
        )
        .collect(),
      ctx.db
        .query("finance_totals")
        .withIndex("by_candidate", (q) =>
          q.eq("raceId", candidate.raceId).eq("candidateSlug", slug),
        )
        .collect(),
      ctx.db
        .query("contributions")
        .withIndex("by_candidate", (q) =>
          q.eq("raceId", candidate.raceId).eq("candidateSlug", slug),
        )
        .collect(),
    ]);
    // Second-hop tracing (MOO-320): funding breakdowns for committee donors
    // on this page, keyed by exact contributor name. Bounded by donor count.
    const orgNames = [
      ...new Set(
        contributions
          .filter((c) => c.contributorType && c.contributorType !== "Individual")
          .map((c) => c.contributorName),
      ),
    ];
    const committeeFunding = (
      await Promise.all(
        orgNames.map((name) =>
          ctx.db
            .query("committee_funding")
            .withIndex("by_committee", (q) => q.eq("committeeName", name))
            .unique(),
        ),
      )
    ).filter((f) => f !== null);
    return {
      candidate,
      race,
      positions,
      quotes,
      finance,
      contributions,
      committeeFunding,
    };
  },
});

export const listCandidateSlugs = query({
  args: {},
  handler: async (ctx) => {
    const candidates = await ctx.db.query("candidates").collect();
    return candidates.map((c) => c.slug);
  },
});

export const getVotingInfo = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("voting_info")
      .withIndex("by_election", (q) => q.eq("electionSlug", "wi-2026"))
      .unique();
  },
});
