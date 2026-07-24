import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireAdmin } from "./sponsors";
import { cleanPublishedAt } from "./lib/outlets";

async function loadOutlet(ctx: QueryCtx, article: Doc<"article_sources">) {
  const key = article.outletKey;
  const outlet = key
    ? await ctx.db.query("outlets").withIndex("by_key", (q) => q.eq("key", key)).unique()
    : null;
  return outlet && outlet.reviewStatus === "approved" ? outlet : null;
}

/** Only a date read from the article's OWN publication metadata is displayed.
 * The scout's LLM guess is never shown, and cleanPublishedAt stays as a
 * belt-and-braces sanity gate. */
const displayDate = (article: Doc<"article_sources">) =>
  article.publishedAtVerified ? cleanPublishedAt(article.publishedAt) : undefined;

/** Admin shape: the whole row, including the triage fields a reviewer needs. */
async function withOutlet(ctx: QueryCtx, article: Doc<"article_sources">) {
  return {
    article: { ...article, publishedAt: displayDate(article) },
    outlet: await loadOutlet(ctx, article),
  };
}

/**
 * Public shape: ONLY the fields something on the page actually renders.
 *
 * Spreading the whole document shipped the editorial machinery to every
 * visitor. /news was 855KB of HTML, 35% of it the RSC payload, carrying
 * `whyRelevant` and `relevanceReason` 145 times each and outlet funding
 * metadata 47 times — none of it rendered anywhere. That is dead weight on the
 * largest-contentful paint of the page voters are most likely to open on a
 * phone.
 *
 * It is also a disclosure question, not only a performance one: relevance
 * scores and the scout's private reasoning about why an article was kept are
 * internal editorial notes, and shipping them in the page source publishes
 * them whether or not anything draws them.
 */
async function withOutletPublic(ctx: QueryCtx, article: Doc<"article_sources">) {
  const outlet = await loadOutlet(ctx, article);
  return {
    article: {
      _id: article._id, // React key on the feed
      headline: article.headline,
      url: article.url,
      outlet: article.outlet,
      imageUrl: article.imageUrl,
      raceId: article.raceId,
      publishedAt: displayDate(article),
    },
    // The transparency card and stamp read exactly these.
    outlet: outlet
      ? {
          key: outlet.key,
          displayName: outlet.displayName,
          type: outlet.type,
          ownership: outlet.ownership,
          fundingNote: outlet.fundingNote,
          ownershipSourceUrl: outlet.ownershipSourceUrl,
          // thirdPartyRatings omitted on purpose — v1 never renders it, so
          // sending it would publish bias ratings the site chose not to show.
        }
      : null,
  };
}

/** Sort key: `publishedAt` is LLM-extracted and often dirty. Only a VERIFIABLE
 * date sorts; anything unparseable or in the future falls back to when we found
 * the article, so a hallucinated future date can't hijack the top of the feed. */
const when = (r: Doc<"article_sources">) => {
  const clean = r.publishedAtVerified ? cleanPublishedAt(r.publishedAt) : undefined;
  return clean ? Date.parse(clean) : r.proposedAt;
};

/** Articles with a verified publication date lead the feed, newest first;
 * undated ones follow (ordered by when we found them). Ranking undated rows on
 * `proposedAt` alone floated every one of them above genuinely recent dated
 * coverage — the whole top of /news carried no date at all. They are still
 * shown, just not ahead of coverage we can actually date. */
const dated = (r: Doc<"article_sources">) =>
  r.publishedAtVerified && cleanPublishedAt(r.publishedAt) ? 1 : 0;

const byRecency = (a: Doc<"article_sources">, b: Doc<"article_sources">) =>
  dated(b) - dated(a) || when(b) - when(a);

export const hubArticles = query({
  args: { limit: v.optional(v.number()), raceId: v.optional(v.string()) },
  handler: async (ctx, { limit, raceId }) => {
    const rows = (await ctx.db.query("article_sources").withIndex("by_hubStatus", (q) => q.eq("hubStatus", "auto")).collect())
      // A candidate's own campaign site is not news — the entity queries below
      // exclude it, and the hub must too, or a campaign page appears as
      // "coverage" with its campaign framed as a rated outlet.
      .filter((r) => r.sourceKind !== "campaign_site")
      // An editor's rejection has to actually remove the article. hubStatus and
      // status are separate axes — hubStatus "auto" is the relevance gate's
      // verdict, status is the human's — and filtering on hubStatus alone left
      // four REJECTED articles published on /news, including coverage of a
      // candidate who had withdrawn. A rejection that leaves the story visible
      // is worse than no review at all, because the queue reads as handled.
      .filter((r) => r.status !== "rejected");
    const filtered = (raceId ? rows.filter((r) => r.raceId === raceId) : rows)
      .sort(byRecency)
      .slice(0, limit ?? 60);
    return Promise.all(filtered.map((a) => withOutletPublic(ctx, a)));
  },
});

export const inTheNewsForCandidate = query({
  args: { candidateSlug: v.string() },
  handler: async (ctx, { candidateSlug }) => {
    const rows = (await ctx.db.query("article_sources").withIndex("by_candidate", (q) => q.eq("candidateSlug", candidateSlug)).collect())
      .filter((r) => r.status === "approved" && r.sourceKind !== "campaign_site");
    return Promise.all(rows.map((a) => withOutletPublic(ctx, a)));
  },
});

export const inTheNewsForRace = query({
  args: { raceId: v.string() },
  handler: async (ctx, { raceId }) => {
    const rows = (await ctx.db.query("article_sources").withIndex("by_race", (q) => q.eq("raceId", raceId)).collect())
      .filter((r) => r.status === "approved" && r.sourceKind !== "campaign_site");
    return Promise.all(rows.map((a) => withOutletPublic(ctx, a)));
  },
});

/** Admin moderation view: every row currently on-hub ("auto") or previously
 * hidden ("hidden") — i.e. the whole moderatable set, unlike the public
 * `hubArticles` which only ever shows "auto". Two indexed lookups, no
 * full-table `.collect()`. */
export const hubModerationList = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await requireAdmin(ctx);
    const auto = await ctx.db.query("article_sources").withIndex("by_hubStatus", (q) => q.eq("hubStatus", "auto")).collect();
    const hidden = await ctx.db.query("article_sources").withIndex("by_hubStatus", (q) => q.eq("hubStatus", "hidden")).collect();
    const rows = [...auto, ...hidden]
      .filter((r) => r.sourceKind !== "campaign_site") // same rule as the hub
      .sort(byRecency)
      .slice(0, limit ?? 100);
    return Promise.all(rows.map((a) => withOutlet(ctx, a)));
  },
});

export const setHubStatus = mutation({
  args: { articleId: v.id("article_sources"), hubStatus: v.union(v.literal("auto"), v.literal("hidden")) },
  handler: async (ctx, { articleId, hubStatus }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(articleId, { hubStatus });
  },
});
