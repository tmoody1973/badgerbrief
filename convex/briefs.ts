import { v } from "convex/values";
import { start } from "@convex-dev/workflow";
import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { relevantRaces, type Districts } from "../src/lib/districts";
import type { BriefContext } from "./lib/briefContext";
import { ISSUE_SLUGS } from "./lib/extraction";
import { GENERAL_ELECTION_DATE, generalField, generalParty, generalPersonName, isOnGeneralBallot } from "./lib/ballot";

/**
 * Briefs written before the November ballot was loaded (Oct 12, 2026, midnight
 * Central) were composed for the August primary: their own text says "the
 * August 11 primary" and they lay out primary fields. They are not shown; the
 * voter generates a November one. The rows are kept, not deleted.
 */
export const NOVEMBER_BRIEFS_SINCE = Date.parse("2026-10-12T05:00:00Z");

const isNovemberBrief = (b: Doc<"voter_briefs">) => b.generatedAt >= NOVEMBER_BRIEFS_SINCE;

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
    return brief && isNovemberBrief(brief) ? withStatus(brief) : null;
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
    return briefs.filter(isNovemberBrief).map(withStatus).filter((b) => b.status === "ready");
  },
});

/** Kick off brief generation. Requires saved districts. Idempotent while one is running. */
export const generate = mutation({
  args: {},
  handler: async (ctx): Promise<Id<"voter_briefs">> => {
    // Off switch, like the chat's VOTER_HELP_DISABLED: each brief is up to
    // nine model calls. Pause: npx convex env set BRIEF_DISABLED 1 --prod
    if (process.env.BRIEF_DISABLED) throw new Error("New briefs are paused for now. The rest of the guide still works.");
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
    if (!prefs?.congressionalDistrict || !prefs.stateSenateDistrict || !prefs.stateAssemblyDistrict) {
      throw new Error("assembleContext: user has no districts");
    }
    const districts: Districts = {
      congressional: Number(prefs.congressionalDistrict),
      senate: Number(prefs.stateSenateDistrict),
      assembly: Number(prefs.stateAssemblyDistrict),
    };
    const allRaces = await ctx.db.query("races").collect();
    // Only contests on the November ballot. A race the state lists as not a
    // separate contest (Lieutenant Governor), or never loaded, is left out.
    const ballot = relevantRaces(districts, allRaces).filter((r) => r.general?.onBallot === true);
    const races: BriefContext["races"] = [];
    for (const race of ballot) {
      // The people on the November ballot, in the state's order. Primary
      // losers and withdrawn candidates are not handed to the compose model.
      const candidates = generalField(
        await ctx.db
          .query("candidates")
          .withIndex("by_race", (q) => q.eq("raceId", race.raceId))
          .collect(),
      );
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
          name: generalPersonName(c),
          party: generalParty(c),
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
    const election = await ctx.db
      .query("elections")
      .withIndex("by_slug", (q) => q.eq("slug", "wi-2026"))
      .unique();
    return {
      electionSlug: "wi-2026",
      districts,
      votingInfo: { electionDate: election?.generalDate ?? GENERAL_ELECTION_DATE, available: votingInfo !== null },
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

/** MOO-313 code evaluator: every entity ID a brief references must exist in
 * published tables (races/candidates) or the canonical issue vocabulary. */
export const checkEntityRefs = internalQuery({
  args: {
    raceIds: v.array(v.string()),
    candidateSlugs: v.array(v.string()),
    issueSlugs: v.array(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, { raceIds, candidateSlugs, issueSlugs }) => {
    const missing: string[] = [];
    for (const raceId of raceIds) {
      const race = await ctx.db
        .query("races")
        .withIndex("by_race_id", (q) => q.eq("raceId", raceId))
        .first();
      if (!race) missing.push(`raceId "${raceId}"`);
    }
    for (const slug of candidateSlugs) {
      const candidate = await ctx.db
        .query("candidates")
        .withIndex("by_slug_only", (q) => q.eq("slug", slug))
        .first();
      if (!candidate) missing.push(`candidateSlug "${slug}"`);
      else if (!isOnGeneralBallot(candidate)) missing.push(`candidateSlug "${slug}" (not on the ${GENERAL_ELECTION_DATE} ballot)`);
    }
    const issueSet = new Set<string>(ISSUE_SLUGS);
    for (const slug of issueSlugs) {
      if (!issueSet.has(slug)) missing.push(`issueSlug "${slug}"`);
    }
    return missing;
  },
});

export const finalize = internalMutation({
  args: { briefId: v.id("voter_briefs"), traceId: v.optional(v.string()), error: v.optional(v.string()) },
  handler: async (ctx, { briefId, traceId, error }) => {
    if (error) {
      await ctx.db.patch(briefId, { status: "failed", error });
      // MOO-313: terminal generation failures are an eval signal — surface on /admin.
      await ctx.db.insert("alerts", {
        kind: "brief_generation_failure",
        message: `voter brief failed after all attempts: ${error}`,
        refTable: "voter_briefs",
        refId: briefId,
        severity: "warning",
        resolved: false,
        createdAt: Date.now(),
      });
      return;
    }
    await ctx.db.patch(briefId, { status: "ready", traceId, error: undefined, generatedAt: Date.now() });
  },
});
