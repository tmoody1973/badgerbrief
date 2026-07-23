import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { extractPublishedDate } from "./lib/publishedDate";

/** Articles we have not yet tried to verify a publication date for. */
export const unverifiedArticles = internalQuery({
  args: { limit: v.number(), force: v.optional(v.boolean()) },
  // Explicit return type: this file's action calls this query, and Convex
  // needs the annotation to break the same-file circular inference.
  handler: async (
    ctx,
    { limit, force },
  ): Promise<{ id: Id<"article_sources">; url: string }[]> => {
    const rows = await ctx.db.query("article_sources").collect();
    return rows
      .filter((r) => r.sourceKind !== "campaign_site")
      .filter((r) => (force ? true : r.publishedAtCheckedAt === undefined))
      .slice(0, limit)
      .map((r) => ({ id: r._id, url: r.url }));
  },
});

export const recordPublishedDate = internalMutation({
  args: {
    id: v.id("article_sources"),
    publishedAt: v.optional(v.string()),
    verified: v.boolean(),
  },
  handler: async (ctx, { id, publishedAt, verified }): Promise<null> => {
    await ctx.db.patch(id, {
      // A verified read replaces the LLM's guess. A miss clears the guess
      // rather than leaving an unverifiable date in place.
      publishedAt: verified ? publishedAt : undefined,
      publishedAtVerified: verified,
      publishedAtCheckedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Fetch each article and read its own publication metadata, so a displayed
 * date is something the publisher stated — not something a model guessed.
 * A fetch failure or a page with no date metadata is recorded as unverified,
 * and no date is shown for it.
 */
export const syncPublishedDates = internalAction({
  args: { limit: v.optional(v.number()), force: v.optional(v.boolean()) },
  handler: async (
    ctx,
    { limit, force },
  ): Promise<{ scanned: number; verified: number; noMetadata: number; fetchFailed: number }> => {
    const targets = await ctx.runQuery(internal.publishedDateSync.unverifiedArticles, {
      limit: limit ?? 60,
      force,
    });

    let verified = 0;
    let noMetadata = 0;
    let fetchFailed = 0;

    for (const t of targets) {
      let date: string | undefined;
      try {
        const res = await fetch(t.url, {
          redirect: "follow",
          signal: AbortSignal.timeout(15_000),
          headers: {
            // Identify honestly; many publishers block unlabelled scrapers.
            "User-Agent":
              "BadgerBriefBot/1.0 (+https://badgerbrief.org/news/about) nonpartisan Wisconsin voter guide",
            Accept: "text/html,application/xhtml+xml",
          },
        });
        if (!res.ok) {
          fetchFailed++;
          await ctx.runMutation(internal.publishedDateSync.recordPublishedDate, {
            id: t.id, verified: false,
          });
          continue;
        }
        date = extractPublishedDate(await res.text());
      } catch {
        fetchFailed++;
        await ctx.runMutation(internal.publishedDateSync.recordPublishedDate, {
          id: t.id, verified: false,
        });
        continue;
      }

      if (date) verified++;
      else noMetadata++;
      await ctx.runMutation(internal.publishedDateSync.recordPublishedDate, {
        id: t.id, publishedAt: date, verified: !!date,
      });
    }

    return { scanned: targets.length, verified, noMetadata, fetchFailed };
  },
});
