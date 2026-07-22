import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { normalizeSponsorKey } from "./lib/sponsors";
import { fetchOpenFecFacts, isFecMatchImplausible } from "./lib/openfecEnrich";
import { fetchSponsorNarrative } from "./lib/firecrawlSponsor";
import { perplexityDescribe, requireAdmin } from "./sponsors";

/** Full enrichment for one sponsor: OpenFEC exact facts (auto-published) +
 * Firecrawl narrative (draft), falling back to Perplexity when Firecrawl finds
 * no narrative. Resolves the committee by id or name search.
 *
 * INTERNAL: spends paid Firecrawl/Perplexity and writes a public `sponsors`
 * row, so it must never be reachable unauthenticated. Callers are the
 * admin-gated `enrichSponsor` action and the `enrichOutsideGroups` cron. */
export const enrichSponsorCore = internalAction({
  args: { advertiser: v.string(), fecCommitteeId: v.optional(v.string()) },
  handler: async (ctx, { advertiser, fecCommitteeId }): Promise<{ key: string }> => {
    const key = normalizeSponsorKey(advertiser);
    let committeeId = fecCommitteeId;
    if (!committeeId) {
      // Reseed from the prior stored committee so a transient name-search miss
      // this run doesn't drop a committee we already resolved.
      const existing = await ctx.runQuery(internal.sponsors.sponsorRowByKey, { key });
      committeeId = existing?.fecCommitteeId;
    }
    if (!committeeId) {
      const matches: { fecCommitteeId: string }[] = await ctx.runAction(
        internal.sponsorEnrich.searchCommittees,
        { name: advertiser },
      );
      committeeId = matches[0]?.fecCommitteeId;
    }
    const [facts, narrative] = await Promise.all([
      committeeId ? fetchOpenFecFacts(committeeId) : Promise.resolve(null),
      fetchSponsorNarrative(advertiser),
    ]);

    // Decoy-match guard (auto/name-search matches only — a reviewer-supplied
    // fecCommitteeId is trusted): if tracked ad spend dwarfs the matched
    // committee's receipts, it is implausibly small to be this sponsor. Hold
    // the FEC facts rather than publish a decoy's numbers, and flag for review.
    const explicit = !!fecCommitteeId;
    let factsToUse = facts;
    let factsFlag: string | undefined;
    if (facts && !explicit) {
      const trackedAdSpend: number = await ctx.runQuery(
        internal.sponsors.trackedSpendForKey,
        { key },
      );
      // Judge against the committee's largest cycle, not just the current one:
      // a real committee can be quiet this cycle and still be the true sponsor.
      const scale = facts.peakReceipts ?? facts.totalRaised;
      if (isFecMatchImplausible(trackedAdSpend, scale)) {
        const recv =
          scale !== undefined ? ` (~$${Math.round(scale).toLocaleString()})` : "";
        factsFlag = `Held auto FEC match ${committeeId}: tracked ad spend (~$${Math.round(trackedAdSpend).toLocaleString()}) far exceeds its receipts${recv} — likely a decoy committee. Verify the correct committee, or treat as dark money.`;
        factsToUse = null;
        committeeId = undefined; // don't store the decoy committee id
      }
    }

    let narrativeDraft = narrative.narrative;
    let sources = [...(factsToUse?.sources ?? []), ...narrative.sources];
    if (!narrativeDraft) {
      const fallback = await perplexityDescribe(advertiser);
      if (fallback.summary && !fallback.summary.startsWith("Unknown")) {
        narrativeDraft = fallback.summary;
        sources = [...sources, ...fallback.sources];
      }
    }

    await ctx.runMutation(internal.sponsors.upsertEnrichment, {
      key, displayName: advertiser,
      kind: factsToUse?.kind, lean: factsToUse?.lean, fecCommitteeId: committeeId,
      // A committee this run implies donor disclosure; a miss (or a held decoy)
      // stays `undefined` so upsertEnrichment preserves a prior value.
      disclosesDonors: committeeId ? true : undefined,
      totalRaised: factsToUse?.totalRaised, totalSpent: factsToUse?.totalSpent,
      topDonors: factsToUse?.topDonors, independentExpenditures: factsToUse?.independentExpenditures,
      financialsAsOf: factsToUse?.financialsAsOf,
      factsFlag,
      narrativeDraft, leadership: narrative.leadership,
      sources,
    });
    return { key };
  },
});

/** Public entry point for the admin resolver UI — admin-gated, then delegates
 * to the internal core. */
export const enrichSponsor = action({
  args: { advertiser: v.string(), fecCommitteeId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ key: string }> => {
    await requireAdmin(ctx);
    return await ctx.runAction(internal.sponsorEnrich.enrichSponsorCore, args);
  },
});

/** Monthly batch enrichment: works the highest-spend, stalest sponsors first
 * (queue built by sponsors.sponsorsToEnrich). Driven by the cron in crons.ts. */
export const enrichOutsideGroups = internalAction({
  args: { limit: v.optional(v.number()), staleDays: v.optional(v.number()) },
  handler: async (ctx, { limit = 25, staleDays = 30 }): Promise<{ enriched: number }> => {
    const targets: { name: string; key: string }[] = await ctx.runQuery(
      internal.sponsors.sponsorsToEnrich,
      { limit, staleDays },
    );
    for (const t of targets) {
      await ctx.runAction(internal.sponsorEnrich.enrichSponsorCore, { advertiser: t.name });
    }
    return { enriched: targets.length };
  },
});

/** Committee-id resolver for enrichSponsor — internal only; the reviewer-facing
 * search (with kind/lean/name) is sponsors.ts's searchFecCommittees. */
export const searchCommittees = internalAction({
  args: { name: v.string() },
  handler: async (_ctx, { name }) => {
    const apiKey = process.env.OPENFEC_API_KEY ?? "DEMO_KEY";
    const res = await fetch(
      `https://api.open.fec.gov/v1/committees/?q=${encodeURIComponent(name)}&api_key=${apiKey}&per_page=5&sort=-receipts`,
    );
    if (!res.ok) return [] as { fecCommitteeId: string }[];
    const data = (await res.json()) as { results?: { committee_id: string }[] };
    return (data.results ?? []).map((c) => ({ fecCommitteeId: c.committee_id }));
  },
});
