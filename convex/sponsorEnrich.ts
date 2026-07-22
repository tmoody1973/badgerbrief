import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { normalizeSponsorKey } from "./lib/sponsors";
import { fetchOpenFecFacts } from "./lib/openfecEnrich";
import { fetchSponsorNarrative } from "./lib/firecrawlSponsor";
import { perplexityDescribe } from "./sponsors";

/** Full enrichment for one sponsor: OpenFEC exact facts (auto-published) +
 * Firecrawl narrative (draft), falling back to Perplexity when Firecrawl finds
 * no narrative. Resolves the committee by id or name search. */
export const enrichSponsor = action({
  args: { advertiser: v.string(), fecCommitteeId: v.optional(v.string()) },
  handler: async (ctx, { advertiser, fecCommitteeId }): Promise<{ key: string }> => {
    const key = normalizeSponsorKey(advertiser);
    let committeeId = fecCommitteeId;
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

    let narrativeDraft = narrative.narrative;
    let sources = [...(facts?.sources ?? []), ...narrative.sources];
    if (!narrativeDraft) {
      const fallback = await perplexityDescribe(advertiser);
      if (fallback.summary && !fallback.summary.startsWith("Unknown")) {
        narrativeDraft = fallback.summary;
        sources = [...sources, ...fallback.sources];
      }
    }

    await ctx.runMutation(internal.sponsors.upsertEnrichment, {
      key, displayName: advertiser,
      kind: facts?.kind, lean: facts?.lean, fecCommitteeId: committeeId,
      disclosesDonors: facts ? true : false,
      totalRaised: facts?.totalRaised, totalSpent: facts?.totalSpent,
      topDonors: facts?.topDonors, independentExpenditures: facts?.independentExpenditures,
      financialsAsOf: facts?.financialsAsOf,
      narrativeDraft, leadership: narrative.leadership,
      sources,
    });
    return { key };
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
      await ctx.runAction(api.sponsorEnrich.enrichSponsor, { advertiser: t.name });
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
