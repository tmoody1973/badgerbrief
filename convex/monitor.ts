"use node";
/**
 * MOO-312 Task 5: source-change monitor — re-fetches each research target's
 * campaign site, hashes the content, and raises an alert when it differs
 * from the last known hash. "use node" modules may only export actions, so
 * the dedup-aware staleness sweep and the alert insert live in
 * convex/monitorQueries.ts.
 */
import { createHash } from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { fetchFirecrawlMarkdown } from "./research";

const DEFAULT_LIMIT = 5;

export const sourceChangeSweep = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    // Throw at call time (never import time) so `convex dev --once` pushes
    // cleanly before the key is provisioned.
    if (!process.env.FIRECRAWL_API_KEY) {
      throw new Error("FIRECRAWL_API_KEY not set");
    }

    const targets: { slug: string; name: string; raceId: string; url: string }[] =
      await ctx.runQuery(internal.researchQueries.listResearchTargets, {});

    const seenUrls = new Set<string>();
    const distinctTargets = targets.filter((t) => {
      if (seenUrls.has(t.url)) return false;
      seenUrls.add(t.url);
      return true;
    });
    const scoped = distinctTargets.slice(0, limit ?? DEFAULT_LIMIT);

    for (const target of scoped) {
      // Isolate per-url failures: one reliably-broken site must not abort
      // the sweep and starve the targets sliced behind it.
      try {
        const prevHash: string | null = await ctx.runQuery(
          internal.researchQueries.latestFetchHash,
          { url: target.url },
        );

        const fetched = await fetchFirecrawlMarkdown(target.url);
        if (!fetched.ok) {
          await ctx.runMutation(internal.researchQueries.recordFetch, {
            url: target.url,
            status: "error",
            httpStatus: fetched.httpStatus,
            error: fetched.error,
          });
          continue;
        }

        const hash = createHash("sha256").update(fetched.markdown).digest("hex");

        if (prevHash && hash !== prevHash) {
          await ctx.runMutation(internal.monitorQueries.insertAlert, {
            kind: "source_change",
            severity: "info",
            message: `content hash changed for ${target.url}`,
          });
        }

        // Baseline (no prior hash) or unchanged or changed — always record
        // the fetch so latestFetchHash reflects this run next time.
        await ctx.runMutation(internal.researchQueries.recordFetch, {
          url: target.url,
          status: "ok",
          httpStatus: fetched.httpStatus,
          contentHash: hash,
        });
      } catch (err) {
        console.error(
          `monitor: source-change sweep failed for ${target.url}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  },
});
