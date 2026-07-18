import { v } from "convex/values";
import { start } from "@convex-dev/workflow";
import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { relevantRaces, type Districts } from "../src/lib/districts";
import type { BriefContext } from "./lib/briefContext";

const STALE_GENERATING_MS = 10 * 60_000; // ponytail: crashed-workflow escape hatch; onComplete handler if it ever matters

async function currentUser(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

const withStatus = (b: Doc<"voter_briefs">) => ({ ...b, status: b.status ?? ("ready" as const) });

/** Newest brief for the signed-in user (any status) — the /brief page's main subscription. */
export const getLatest = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    const brief = await ctx.db
      .query("voter_briefs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
    return brief ? withStatus(brief) : null;
  },
});

/** Ready briefs, newest first — the saved-briefs history list. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return [];
    const briefs = await ctx.db
      .query("voter_briefs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    return briefs.map(withStatus).filter((b) => b.status === "ready");
  },
});

/** Kick off brief generation. Requires saved districts. Idempotent while one is running. */
export const generate = mutation({
  args: {},
  handler: async (ctx): Promise<Id<"voter_briefs">> => {
    const user = await currentUser(ctx);
    if (!user) throw new Error("Sign in to generate a brief.");
    const prefs = await ctx.db
      .query("user_preferences")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!prefs?.congressionalDistrict || !prefs.stateSenateDistrict || !prefs.stateAssemblyDistrict) {
      throw new Error("Set your address first — a brief needs your districts.");
    }
    const latest = await ctx.db
      .query("voter_briefs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
    if (latest?.status === "generating" && Date.now() - latest.generatedAt < STALE_GENERATING_MS) {
      return latest._id;
    }
    const briefId = await ctx.db.insert("voter_briefs", {
      userId: user._id,
      electionSlug: "wi-2026",
      openuiSource: "",
      generatedAt: Date.now(),
      status: "generating",
      attempt: 1,
    });
    await start(ctx, internal.briefWorkflow.generateBriefWorkflow, { briefId, userId: user._id });
    return briefId;
  },
});

/** Deterministic prefetch: everything the compose LLM may reference, IDs + availability only. */
export const assembleContext = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<BriefContext> => {
    const prefs = await ctx.db
      .query("user_preferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!prefs?.congressionalDistrict) throw new Error("assembleContext: user has no districts");
    const districts: Districts = {
      congressional: Number(prefs.congressionalDistrict),
      senate: Number(prefs.stateSenateDistrict),
      assembly: Number(prefs.stateAssemblyDistrict),
    };
    const allRaces = await ctx.db.query("races").collect();
    const ballot = relevantRaces(districts, allRaces);
    const races: BriefContext["races"] = [];
    for (const race of ballot) {
      const candidates = await ctx.db
        .query("candidates")
        .withIndex("by_race", (q) => q.eq("raceId", race.raceId))
        .collect();
      const enriched = [];
      for (const c of candidates) {
        const [positions, quotes, finance] = await Promise.all([
          ctx.db
            .query("candidate_positions_published")
            .withIndex("by_candidate_issue", (q) => q.eq("raceId", race.raceId).eq("candidateSlug", c.slug))
            .collect(),
          ctx.db
            .query("quote_published")
            .withIndex("by_candidate", (q) => q.eq("raceId", race.raceId).eq("candidateSlug", c.slug))
            .collect(),
          ctx.db
            .query("finance_totals")
            .withIndex("by_candidate", (q) => q.eq("raceId", race.raceId).eq("candidateSlug", c.slug))
            .collect(),
        ]);
        enriched.push({
          slug: c.slug,
          name: c.name,
          party: c.party ?? c.primaryParty,
          publishedIssueSlugs: [...new Set(positions.map((p) => p.issueSlug))],
          quoteCount: quotes.length,
          hasFinance: finance.length > 0,
        });
      }
      races.push({ raceId: race.raceId, office: race.office, level: race.level, candidates: enriched });
    }
    const votingInfo = await ctx.db
      .query("voting_info")
      .withIndex("by_election", (q) => q.eq("electionSlug", "wi-2026"))
      .unique();
    return {
      electionSlug: "wi-2026",
      districts,
      votingInfo: { primaryDate: votingInfo?.primaryDate ?? "2026-08-11", available: votingInfo !== null },
      races,
      preferences: {
        savedRaceIds: prefs.savedRaceIds,
        savedIssues: prefs.savedIssues,
        detailLevel: prefs.detailLevel,
      },
    };
  },
});

export const beginAttempt = internalMutation({
  args: { briefId: v.id("voter_briefs"), attempt: v.number() },
  handler: async (ctx, { briefId, attempt }) => {
    await ctx.db.patch(briefId, { openuiSource: "", attempt, status: "generating" });
  },
});

/** Streaming flush: full accumulated source each time (idempotent, no ordering hazard). */
export const setSource = internalMutation({
  args: { briefId: v.id("voter_briefs"), source: v.string() },
  handler: async (ctx, { briefId, source }) => {
    await ctx.db.patch(briefId, { openuiSource: source });
  },
});

export const finalize = internalMutation({
  args: { briefId: v.id("voter_briefs"), traceId: v.optional(v.string()), error: v.optional(v.string()) },
  handler: async (ctx, { briefId, traceId, error }) => {
    if (error) {
      await ctx.db.patch(briefId, { status: "failed", error });
      return;
    }
    await ctx.db.patch(briefId, { status: "ready", traceId, error: undefined, generatedAt: Date.now() });
  },
});
