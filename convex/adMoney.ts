import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { rollupRace, type AdRow, type CandidateLite, type RaceAdMoney } from "./lib/adMoney";

const toAdRow = (a: Doc<"ads">): AdRow => ({
  candidateSlug: a.candidateSlug,
  stance: a.stance,
  pageOrCommittee: a.pageOrCommittee,
  fundingEntity: a.fundingEntity,
  spendLower: a.spendLower,
  spendUpper: a.spendUpper,
  impressionsLower: a.impressionsLower,
  impressionsUpper: a.impressionsUpper,
});
const toLite = (c: Doc<"candidates">): CandidateLite => ({ slug: c.slug, name: c.name });

/** Per-race ad-money rollup for the race page. Empty shape when nothing is tracked. */
export const adMoneyForRace = query({
  args: { raceId: v.string() },
  handler: async (ctx, { raceId }): Promise<RaceAdMoney> => {
    const candidates = await ctx.db
      .query("candidates")
      .withIndex("by_race", (q) => q.eq("raceId", raceId))
      .collect();
    const ads = await ctx.db
      .query("ads")
      .withIndex("by_candidate", (q) => q.eq("raceId", raceId))
      .take(2000);
    return rollupRace(ads.map(toAdRow), candidates.map(toLite));
  },
});

export type RaceOverview = {
  raceId: string;
  office: string;
  level: string;
  totalSpend: number;
  outsideSpend: number;
  supportShare: number;
  attackShare: number;
  adCount: number;
  mostAttacked: string | null;
};

/** Statewide by-race overview for /ads: race summaries + statewide headline stats. */
export const adMoneyOverview = query({
  args: {},
  handler: async (ctx) => {
    const [ads, races, candidates] = await Promise.all([
      // ponytail: .collect() reads all ads (bounded by Convex's ~16k-doc/8MB query limit); paginate if a cycle ever approaches that.
      ctx.db.query("ads").collect(),
      ctx.db.query("races").collect(),
      ctx.db.query("candidates").collect(),
    ]);
    const candidatesByRace = new Map<string, Doc<"candidates">[]>();
    for (const c of candidates) {
      const list = candidatesByRace.get(c.raceId) ?? [];
      list.push(c);
      candidatesByRace.set(c.raceId, list);
    }
    const adsByRace = new Map<string, AdRow[]>();
    for (const a of ads) {
      if (!a.candidateSlug || !a.raceId) continue;
      const list = adsByRace.get(a.raceId) ?? [];
      list.push(toAdRow(a));
      adsByRace.set(a.raceId, list);
    }

    const raceOverviews: RaceOverview[] = [];
    let statewideOutside = 0;
    let statewideTotal = 0;
    let mostAttacked: { slug: string; name: string; office: string; attackSpend: number } | null = null;

    for (const race of races) {
      const raceAds = adsByRace.get(race.raceId);
      if (!raceAds || raceAds.length === 0) continue;
      const roll = rollupRace(raceAds, (candidatesByRace.get(race.raceId) ?? []).map(toLite));
      if (roll.adCount === 0) continue;
      statewideTotal += roll.totalSpend;
      statewideOutside += roll.outsideSpend;
      raceOverviews.push({
        raceId: race.raceId,
        office: race.office,
        level: race.level,
        totalSpend: roll.totalSpend,
        outsideSpend: roll.outsideSpend,
        supportShare: roll.supportShare,
        attackShare: roll.attackShare,
        adCount: roll.adCount,
        mostAttacked: roll.mostAttacked,
      });
      for (const c of roll.candidates) {
        if (c.attackSpend > (mostAttacked?.attackSpend ?? 0)) {
          mostAttacked = { slug: c.slug, name: c.name, office: race.office, attackSpend: c.attackSpend };
        }
      }
    }

    raceOverviews.sort((a, b) => b.totalSpend - a.totalSpend);
    return {
      races: raceOverviews,
      statewide: { totalSpend: statewideTotal, outsideSpend: statewideOutside, mostAttacked },
    };
  },
});
