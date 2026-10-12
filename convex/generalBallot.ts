import { v, type Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { ballotSource } from "./schema";

/**
 * Apply a certified Nov 3, 2026 ballot list (scripts/apply-general-ballot.mjs).
 *
 * It writes ONLY the `general` block on existing rows, and inserts candidates
 * the state lists that we never stored. It never changes a slug, a stored
 * name or a status: page addresses and four months of positions, donations
 * and ads hang off those.
 *
 * Every race and candidate is looked up before anything is written, so an
 * unknown one throws with the database untouched. Re-running with the same
 * input gives the same data.
 */

const SOURCE_NAME = "Wisconsin Elections Commission — November 3, 2026 General Election candidates";

/** The general block for a candidate the state lists and we never stored. */
function newCandidateGeneral(
  input: { name: string; party?: string; ballotOrder: number },
  source: Infer<typeof ballotSource>,
) {
  return {
    onBallot: true,
    ballotName: input.name,
    ...(input.party !== undefined ? { party: input.party } : {}),
    ballotOrder: input.ballotOrder,
    source,
  };
}

export const applyGeneralBallot = internalMutation({
  args: {
    source: ballotSource,
    dataAsOf: v.string(),
    races: v.array(
      v.object({ raceId: v.string(), onBallot: v.boolean(), note: v.optional(v.string()) }),
    ),
    candidates: v.array(
      v.object({
        raceId: v.string(),
        slug: v.string(),
        onBallot: v.boolean(),
        ballotName: v.optional(v.string()),
        party: v.optional(v.string()),
        ballotOrder: v.optional(v.number()),
        runningMate: v.optional(v.string()),
      }),
    ),
    newCandidates: v.array(
      v.object({
        raceId: v.string(),
        slug: v.string(),
        name: v.string(),
        party: v.optional(v.string()),
        ballotOrder: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const findRace = (raceId: string) =>
      ctx.db
        .query("races")
        .withIndex("by_race_id", (q) => q.eq("raceId", raceId))
        .unique();
    const findCandidate = (raceId: string, slug: string) =>
      ctx.db
        .query("candidates")
        .withIndex("by_slug", (q) => q.eq("raceId", raceId).eq("slug", slug))
        .unique();

    // Look everything up BEFORE writing anything, so one wrong race or
    // candidate fails the whole call with the database untouched.
    const racePatches: { id: Id<"races">; input: (typeof args.races)[number] }[] = [];
    for (const input of args.races) {
      const race = await findRace(input.raceId);
      if (!race) throw new Error(`no race ${input.raceId}`);
      racePatches.push({ id: race._id, input });
    }
    const candidatePatches: { id: Id<"candidates">; input: (typeof args.candidates)[number] }[] = [];
    for (const input of args.candidates) {
      const candidate = await findCandidate(input.raceId, input.slug);
      if (!candidate) throw new Error(`no candidate ${input.raceId}/${input.slug}`);
      candidatePatches.push({ id: candidate._id, input });
    }
    const additions: { existingId: Id<"candidates"> | null; input: (typeof args.newCandidates)[number] }[] = [];
    for (const input of args.newCandidates) {
      if (!(await findRace(input.raceId))) throw new Error(`no race ${input.raceId}`);
      const existing = await findCandidate(input.raceId, input.slug);
      additions.push({ existingId: existing?._id ?? null, input });
    }

    for (const { id, input } of racePatches) {
      const { raceId: _raceId, ...general } = input;
      await ctx.db.patch("races", id, { general: { ...general, source: args.source } });
    }
    for (const { id, input } of candidatePatches) {
      const { raceId: _raceId, slug: _slug, ...general } = input;
      await ctx.db.patch("candidates", id, { general: { ...general, source: args.source } });
    }
    let candidatesInserted = 0;
    for (const { existingId, input } of additions) {
      const general = newCandidateGeneral(input, args.source);
      if (existingId) {
        await ctx.db.patch("candidates", existingId, { general });
        continue;
      }
      await ctx.db.insert("candidates", {
        slug: input.slug,
        raceId: input.raceId,
        name: input.name,
        ...(input.party !== undefined ? { party: input.party } : {}),
        status: "Active",
        sources: [{ name: SOURCE_NAME, url: args.source.url }],
        dataAsOf: args.dataAsOf,
        general,
      });
      candidatesInserted += 1;
    }

    return {
      racesPatched: racePatches.length,
      candidatesPatched: candidatePatches.length + additions.length - candidatesInserted,
      candidatesInserted,
    };
  },
});

/** Read back who is on the November ballot, to check an apply against its file. */
export const onBallotSlugs = internalQuery({
  args: {},
  handler: async (ctx) => {
    // ceiling: 5,000 candidates. The table holds about 340; the project's
    // Convex rules ask for bounded reads. Paginate if it ever nears the cap.
    const all = await ctx.db.query("candidates").take(5000);
    return all
      .filter((c) => c.general?.onBallot === true)
      .map((c) => ({ raceId: c.raceId, slug: c.slug }));
  },
});
