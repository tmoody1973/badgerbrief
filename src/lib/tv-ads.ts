import { normalizeSponsorKey } from "../../convex/lib/sponsors";

/**
 * Broadcast-TV orders grouped by sponsor for the race page: one row per
 * sponsor instead of one card per FCC order (the governor race had 66).
 */

export type TvOrder = {
  id: string;
  sponsor: string;
  candidateSlug?: string | null;
  stance?: "support" | "oppose";
  station?: string | null;
  dma?: string | null;
  spend?: number | null;
  spotCount?: number | null;
  flightStart?: string | null;
  flightEnd?: string | null;
  pdfUrl?: string | null;
};

export type TvSponsorGroup<O extends TvOrder> = {
  key: string;
  /** The name as the first (largest) order prints it. */
  sponsor: string;
  orders: O[];
  total: number;
  /** Set only when every order agrees; a mixed sponsor is not summarized. */
  stance?: "support" | "oppose";
  candidateSlug?: string;
  flightStart?: string;
  flightEnd?: string;
};

const same = <T,>(values: T[]): T | undefined => (values.every((v) => v === values[0]) ? values[0] : undefined);

export function groupTvAds<O extends TvOrder>(orders: readonly O[]): TvSponsorGroup<O>[] {
  const byKey = new Map<string, O[]>();
  for (const o of orders) {
    const key = normalizeSponsorKey(o.sponsor);
    byKey.set(key, [...(byKey.get(key) ?? []), o]);
  }
  return [...byKey.entries()]
    .map(([key, list]) => {
      const starts = list.flatMap((o) => (o.flightStart ? [o.flightStart] : [])).sort();
      const ends = list.flatMap((o) => { const e = o.flightEnd ?? o.flightStart; return e ? [e] : []; }).sort();
      return {
        key,
        sponsor: list[0].sponsor.replace(/[,\s]+$/, ""),
        orders: list,
        total: list.reduce((sum, o) => sum + (o.spend ?? 0), 0),
        stance: same(list.map((o) => o.stance)),
        candidateSlug: same(list.map((o) => o.candidateSlug ?? undefined)),
        flightStart: starts[0],
        flightEnd: ends.at(-1),
      };
    })
    .sort((a, b) => b.total - a.total);
}
