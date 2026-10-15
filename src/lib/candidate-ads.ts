import { groupTvAds } from "./tv-ads";

type Ad = {
  _id: string;
  pageOrCommittee: string;
  stance?: "support" | "oppose";
  spendLower?: number;
  spendUpper?: number;
};

export type CandidateAdGroup<A extends Ad> = {
  key: string;
  sponsor: string;
  ads: A[];
  /** Set only when every ad agrees. */
  stance?: "support" | "oppose";
  /** Sums of Meta's disclosed ranges; undefined when no ad disclosed one. */
  spendLower?: number;
  spendUpper?: number;
};

const sum = (values: (number | undefined)[]): number | undefined =>
  values.some((v) => v !== undefined) ? values.reduce<number>((s, v) => s + (v ?? 0), 0) : undefined;

/** A candidate's ads, one row per sponsor, as the race page groups TV orders. */
export function groupCandidateAds<A extends Ad>(ads: readonly A[]): CandidateAdGroup<A>[] {
  const orders = ads.map((ad) => ({ ad, id: ad._id, sponsor: ad.pageOrCommittee, stance: ad.stance, spend: ad.spendUpper ?? ad.spendLower }));
  return groupTvAds(orders).map((g) => ({
    key: g.key,
    sponsor: g.sponsor,
    ads: g.orders.map((o) => o.ad),
    stance: g.stance,
    spendLower: sum(g.orders.map((o) => o.ad.spendLower)),
    spendUpper: sum(g.orders.map((o) => o.ad.spendUpper)),
  }));
}
