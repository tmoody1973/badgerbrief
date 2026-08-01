import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * One-off editorial data fixes, run from the CLI (`npx convex run`), never by a
 * client — hence internalMutation. Kept deliberately narrow: patches a single
 * candidate's status by its natural key (raceId, slug). Used for time-sensitive
 * ballot changes (a candidate withdrawing) that must reflect on the live site
 * before the next full re-seed.
 */
export const setCandidacyStatus = internalMutation({
  args: {
    raceId: v.string(),
    slug: v.string(),
    status: v.string(),
  },
  handler: async (ctx, { raceId, slug, status }) => {
    const c = await ctx.db
      .query("candidates")
      .withIndex("by_slug", (q) => q.eq("raceId", raceId).eq("slug", slug))
      .unique();
    if (!c) throw new Error(`candidate not found: ${raceId}/${slug}`);
    const before = c.status;
    await ctx.db.patch(c._id, { status });
    return { candidate: `${raceId}/${slug}`, from: before, to: status };
  },
});

/**
 * Correct a candidate's `background` blurb. Same narrow, CLI-only pattern as
 * setCandidacyStatus — for fixing a published factual error before the next
 * re-seed (e.g. an unsourced/false endorsement).
 */
export const setCandidateBackground = internalMutation({
  args: {
    raceId: v.string(),
    slug: v.string(),
    background: v.string(),
  },
  handler: async (ctx, { raceId, slug, background }) => {
    const c = await ctx.db
      .query("candidates")
      .withIndex("by_slug", (q) => q.eq("raceId", raceId).eq("slug", slug))
      .unique();
    if (!c) throw new Error(`candidate not found: ${raceId}/${slug}`);
    const before = c.background;
    await ctx.db.patch(c._id, { background });
    return { candidate: `${raceId}/${slug}`, from: before, to: background };
  },
});
