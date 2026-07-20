import { v } from "convex/values";
import { internalMutation, MutationCtx } from "./_generated/server";
import { sourceLink } from "./schema";

/**
 * Idempotent seed mutations for docs/wisconsin_2026_primary_elections.json.
 * Natural keys: elections.slug, races.raceId, candidates.(raceId, slug), sources.url.
 * Run via scripts/seed.mjs → `npx convex run seed:...`.
 */

const candidateInput = v.object({
  slug: v.string(),
  name: v.string(),
  party: v.optional(v.string()),
  primaryParty: v.optional(v.string()),
  status: v.optional(v.string()),
  incumbent: v.optional(v.boolean()),
  background: v.optional(v.string()),
  currentOccupation: v.optional(v.string()),
  keyPriorities: v.optional(v.array(v.string())),
  notableEndorsements: v.optional(v.array(v.string())),
  notes: v.optional(v.string()),
  fecCandidateId: v.optional(v.string()),
  photoUrl: v.optional(v.string()),
  photoSource: v.optional(v.string()),
  socialMedia: v.optional(v.record(v.string(), v.string())),
  campaignFinanceInfo: v.optional(v.any()),
  sources: v.array(sourceLink),
});

async function upsertByIndex<T extends "elections" | "races" | "voting_info">(
  ctx: MutationCtx,
  table: T,
  existing: { _id: string } | null,
  doc: Record<string, unknown>,
) {
  if (existing) {
    await ctx.db.patch(existing._id as never, doc as never);
    return existing._id;
  }
  return await ctx.db.insert(table, doc as never);
}

export const upsertElection = internalMutation({
  args: {
    slug: v.string(),
    state: v.string(),
    cycle: v.string(),
    primaryDate: v.string(),
    generalDate: v.string(),
    springPrimaryDate: v.optional(v.string()),
    springGeneralDate: v.optional(v.string()),
    filingDeadline: v.optional(v.string()),
    primaryType: v.optional(v.string()),
    dataAsOf: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("elections")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    return await upsertByIndex(ctx, "elections", existing, args);
  },
});

export const upsertVotingInfo = internalMutation({
  args: {
    electionSlug: v.string(),
    primaryDate: v.string(),
    pollsOpen: v.optional(v.string()),
    pollsClose: v.optional(v.string()),
    timezone: v.optional(v.string()),
    voterRegistration: v.optional(v.any()),
    absenteeRequestDeadline: v.optional(v.any()),
    absenteeReturnDeadline: v.optional(v.any()),
    earlyVoting: v.optional(v.any()),
    voterIdRequired: v.optional(v.boolean()),
    photoIdRequired: v.optional(v.boolean()),
    officialVoterInfoUrl: v.string(),
    officialGuideUrl: v.optional(v.string()),
    sources: v.array(sourceLink),
  },
  handler: async (ctx, args) => {
    if (!args.officialVoterInfoUrl.startsWith("https://")) {
      throw new Error(
        "voting_info requires an official https source URL (publish gate)",
      );
    }
    const existing = await ctx.db
      .query("voting_info")
      .withIndex("by_election", (q) => q.eq("electionSlug", args.electionSlug))
      .unique();
    return await upsertByIndex(ctx, "voting_info", existing, {
      ...args,
      lastCheckedAt: Date.now(),
    });
  },
});

export const upsertRace = internalMutation({
  args: {
    race: v.object({
      raceId: v.string(),
      electionSlug: v.string(),
      office: v.string(),
      level: v.string(),
      primaryDate: v.optional(v.string()),
      generalDate: v.optional(v.string()),
      electionType: v.optional(v.string()),
      incumbent: v.optional(v.string()),
      seatHeldBy: v.optional(v.string()),
      officeDescription: v.optional(v.string()),
      districtDescription: v.optional(v.string()),
      notes: v.optional(v.string()),
      seatsUp: v.optional(v.number()),
      raceRating: v.optional(v.record(v.string(), v.string())),
      currentComposition: v.optional(v.any()),
      competitiveSeatsToWatch: v.optional(v.any()),
      districts: v.optional(v.any()),
      campaignFinanceInfo: v.optional(v.any()),
      sources: v.array(sourceLink),
      dataAsOf: v.string(),
    }),
    candidates: v.array(candidateInput),
  },
  handler: async (ctx, { race, candidates }) => {
    const existing = await ctx.db
      .query("races")
      .withIndex("by_race_id", (q) => q.eq("raceId", race.raceId))
      .unique();
    await upsertByIndex(ctx, "races", existing, race);

    for (const c of candidates) {
      const doc = { ...c, raceId: race.raceId, dataAsOf: race.dataAsOf };
      const existingCand = await ctx.db
        .query("candidates")
        .withIndex("by_slug", (q) =>
          q.eq("raceId", race.raceId).eq("slug", c.slug),
        )
        .unique();
      if (existingCand) {
        await ctx.db.patch(existingCand._id, doc);
      } else {
        await ctx.db.insert("candidates", doc);
      }
    }

    // register every source link in the registry, deduped by URL
    const links = [...race.sources, ...candidates.flatMap((c) => c.sources)];
    for (const link of links) {
      const existingSource = await ctx.db
        .query("sources")
        .withIndex("by_url", (q) => q.eq("url", link.url))
        .first();
      if (!existingSource) {
        await ctx.db.insert("sources", {
          url: link.url,
          name: link.name,
          kind: classifySource(link.url),
          firstSeenAt: Date.now(),
        });
      }
    }
    return { raceId: race.raceId, candidates: candidates.length };
  },
});

function classifySource(
  url: string,
): "official" | "campaign" | "reported" | "ad-library" | "reference" {
  const officialHosts = [
    "myvote.wi.gov",
    "elections.wi.gov",
    "campaignfinance.wi.gov",
    "fec.gov",
    "ethics.wi.gov",
  ];
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (officialHosts.some((h) => host === h || host.endsWith("." + h))) {
      return "official";
    }
    if (host.includes("ballotpedia") || host.includes("wikipedia")) {
      return "reference";
    }
    if (
      host.includes("wuwm") ||
      host.includes("pbswisconsin") ||
      host.includes("wisconsinwatch") ||
      host.includes("jsonline")
    ) {
      return "reported";
    }
    return "campaign"; // candidate/campaign sites dominate the remainder of the seed
  } catch {
    return "reference";
  }
}

/**
 * Register (or correct) a candidate's campaign homepage. 20 of 48 seeded
 * candidates have no campaign_website, so their site is neither a research
 * target nor mappable (MOO-326). Merges into socialMedia rather than replacing
 * it — the record also holds twitter_x / instagram / facebook handles.
 */
export const setCampaignWebsite = internalMutation({
  args: { slug: v.string(), url: v.string() },
  handler: async (ctx, args) => {
    const candidate = await ctx.db
      .query("candidates")
      .withIndex("by_slug_only", (q) => q.eq("slug", args.slug))
      .first();
    if (!candidate) throw new Error(`no candidate with slug "${args.slug}"`);

    const previous = candidate.socialMedia?.campaign_website;
    await ctx.db.patch(candidate._id, {
      socialMedia: { ...(candidate.socialMedia ?? {}), campaign_website: args.url },
    });
    return { slug: args.slug, previous: previous ?? null, current: args.url };
  },
});

/**
 * Set a candidate's header photo. photoSource is REQUIRED and is rendered as
 * a visible credit — CC BY images oblige attribution, and a voter guide should
 * show where every asset came from regardless.
 */
export const setPhoto = internalMutation({
  args: {
    slug: v.string(),
    photoUrl: v.string(),
    photoSource: v.string(),
  },
  handler: async (ctx, args) => {
    if (!/^https:\/\//.test(args.photoUrl)) {
      throw new Error("photoUrl must be https");
    }
    if (!args.photoSource.trim()) {
      throw new Error("photoSource is required (attribution)");
    }
    const candidate = await ctx.db
      .query("candidates")
      .withIndex("by_slug_only", (q) => q.eq("slug", args.slug))
      .first();
    if (!candidate) throw new Error(`no candidate with slug "${args.slug}"`);

    await ctx.db.patch(candidate._id, {
      photoUrl: args.photoUrl,
      photoSource: args.photoSource,
    });
    return { slug: args.slug, photoUrl: args.photoUrl, photoSource: args.photoSource };
  },
});

export const counts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const [elections, races, candidates, sources, votingInfo] =
      await Promise.all([
        ctx.db.query("elections").collect(),
        ctx.db.query("races").collect(),
        ctx.db.query("candidates").collect(),
        ctx.db.query("sources").collect(),
        ctx.db.query("voting_info").collect(),
      ]);
    return {
      elections: elections.length,
      races: races.length,
      candidates: candidates.length,
      sources: sources.length,
      voting_info: votingInfo.length,
    };
  },
});
