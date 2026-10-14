import { v } from "convex/values";
import { logAudit } from "./audit";
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

/**
 * Point a published quote at the page it appears on now. Campaign sites move
 * pages (crowleyforwi.com/issues began redirecting in October 2026), and a
 * published quote has no other edit path: re-publishing its draft returns the
 * existing row unchanged. Check the quote's exact words are on the new page
 * before running this; the old address goes to the audit log.
 */
export const setQuoteSourceUrl = internalMutation({
  args: {
    quoteId: v.id("quote_published"),
    sourceUrl: v.string(),
  },
  handler: async (ctx, { quoteId, sourceUrl }) => {
    const parsed = URL.canParse(sourceUrl) ? new URL(sourceUrl) : null;
    if (!parsed || !["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
      throw new Error(`sourceUrl must be a full http(s) address, got "${sourceUrl}"`);
    }
    const quote = await ctx.db.get(quoteId);
    if (!quote) throw new Error(`published quote not found: ${quoteId}`);
    const before = quote.sourceUrl;
    await ctx.db.patch(quoteId, { sourceUrl });
    await logAudit(ctx, { action: "edit", refTable: "quote_published", refId: quoteId, detail: `sourceUrl: ${before} -> ${sourceUrl}` });
    return { from: before, to: sourceUrl };
  },
});

/**
 * Set FEC candidate IDs, which the daily FEC sync (finance.syncOpenFec) needs
 * to find a U.S. House candidate. In October 2026, 10 on-ballot House
 * candidates had none, and Bryan Steil's stored ID (H8WI01088) did not exist at
 * the FEC, so all 11 showed no money. Look each ID up at api.open.fec.gov
 * (state, district, cycle, name, party) before running. Every entry is checked
 * before anything is written; a bad one changes nothing.
 */
export const setFecCandidateIds = internalMutation({
  args: {
    ids: v.array(v.object({ raceId: v.string(), slug: v.string(), fecCandidateId: v.string() })),
  },
  handler: async (ctx, { ids }) => {
    const found = [];
    for (const { raceId, slug, fecCandidateId } of ids) {
      // A House candidate ID: "H", election-year digit, state, five digits.
      if (!/^H\d[A-Z]{2}\d{5}$/.test(fecCandidateId)) throw new Error(`not an FEC House candidate ID: "${fecCandidateId}"`);
      const c = await ctx.db
        .query("candidates")
        .withIndex("by_slug", (q) => q.eq("raceId", raceId).eq("slug", slug))
        .unique();
      if (!c) throw new Error(`candidate not found: ${raceId}/${slug}`);
      found.push({ c, fecCandidateId });
    }
    const changed = [];
    for (const { c, fecCandidateId } of found) {
      await ctx.db.patch(c._id, { fecCandidateId });
      changed.push({ candidate: `${c.raceId}/${c.slug}`, from: c.fecCandidateId, to: fecCandidateId });
    }
    return changed;
  },
});
