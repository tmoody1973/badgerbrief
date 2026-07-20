"use node";

/**
 * MOO-326: campaign-site mapper. Discovers each candidate's own-domain policy
 * subpages with Firecrawl /map and auto-registers them as extraction sources,
 * so the Research Agent reads more than the registered homepage.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { selectPolicySubpages } from "./lib/campaignMap";
import { fetchFirecrawlMap } from "./research";

/** Max own-site subpages registered per candidate (MOO-326 contract). */
const SUBPAGE_CAP = 10;
/** URLs requested from /map per site — enough to see a full campaign site. */
const MAP_LIMIT = 100;
/** Candidates mapped per run when no explicit slugs are given. */
const DEFAULT_LIMIT = 10;

export const run = internalAction({
  args: {
    candidateSlugs: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!process.env.FIRECRAWL_API_KEY) {
      throw new Error("FIRECRAWL_API_KEY is not configured");
    }

    const all = await ctx.runQuery(internal.researchQueries.listMapTargets, {});
    const selected = args.candidateSlugs
      ? all.filter((t) => args.candidateSlugs!.includes(t.slug))
      : all.slice(0, args.limit ?? DEFAULT_LIMIT);

    let mapped = 0;
    let registered = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const target of selected) {
      const result = await fetchFirecrawlMap(target.homepageUrl, MAP_LIMIT);
      if (!result.ok) {
        errors.push(`${target.slug}: ${result.error}`);
        continue;
      }
      mapped++;

      const urls = selectPolicySubpages({
        homepageUrl: target.homepageUrl,
        links: result.links,
        cap: SUBPAGE_CAP,
      });
      if (urls.length === 0) continue;

      const outcome = await ctx.runMutation(
        internal.researchQueries.registerCampaignSubpages,
        {
          candidateSlug: target.slug,
          raceId: target.raceId,
          candidateName: target.name,
          urls,
        },
      );
      registered += outcome.registered;
      skipped += outcome.skipped;
    }

    return { mapped, registered, skipped, errors };
  },
});
