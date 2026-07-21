// Pure, Convex-free aggregation of attributed political ads into per-candidate
// and per-race "money" summaries. Spend/impressions are platform-disclosed
// ranges → we use midpoints (labeled "estimated" in the UI). Own-vs-outside is
// a name heuristic mirroring defaultStance in src/components/admin/ad-review.tsx.

export type AdRow = {
  candidateSlug?: string;
  stance?: "support" | "oppose";
  pageOrCommittee: string;
  fundingEntity?: string;
  spendLower?: number;
  spendUpper?: number;
  impressionsLower?: number;
  impressionsUpper?: number;
};
export type CandidateLite = { slug: string; name: string };

export type CandidateAdMoney = {
  slug: string;
  name: string;
  supportSpend: number;
  attackSpend: number;
  impressions: number;
  ownSpend: number;
  outsideSpend: number;
  adCount: number;
  unclassifiedCount: number;
};
export type RaceAdMoney = {
  candidates: CandidateAdMoney[];
  totalSpend: number;
  outsideSpend: number;
  supportShare: number;
  attackShare: number;
  mostAttacked: string | null;
  adCount: number;
};

/** Range midpoint; one bound → that value; none → 0. */
export function mid(lower?: number, upper?: number): number {
  if (lower !== undefined && upper !== undefined) return (lower + upper) / 2;
  if (lower !== undefined) return lower;
  if (upper !== undefined) return upper;
  return 0;
}

/** Sponsor text contains the candidate's surname → treat as the candidate's own committee. */
export function isOwnCommittee(sponsor: string, candidateName: string): boolean {
  const surname = candidateName.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
  return surname !== "" && sponsor.toLowerCase().includes(surname);
}

export function rollupCandidate(ads: AdRow[], candidate: CandidateLite): CandidateAdMoney {
  const acc: CandidateAdMoney = {
    slug: candidate.slug,
    name: candidate.name,
    supportSpend: 0,
    attackSpend: 0,
    impressions: 0,
    ownSpend: 0,
    outsideSpend: 0,
    adCount: 0,
    unclassifiedCount: 0,
  };
  for (const ad of ads) {
    acc.adCount += 1;
    acc.impressions += mid(ad.impressionsLower, ad.impressionsUpper);
    const spend = mid(ad.spendLower, ad.spendUpper);
    if (ad.stance === "support") {
      acc.supportSpend += spend;
      const sponsor = `${ad.pageOrCommittee} ${ad.fundingEntity ?? ""}`;
      if (isOwnCommittee(sponsor, candidate.name)) acc.ownSpend += spend;
      else acc.outsideSpend += spend;
    } else if (ad.stance === "oppose") {
      acc.attackSpend += spend;
      acc.outsideSpend += spend;
    } else {
      acc.unclassifiedCount += 1;
    }
  }
  return acc;
}

export function rollupRace(ads: AdRow[], candidates: CandidateLite[]): RaceAdMoney {
  const byCandidate = new Map<string, AdRow[]>();
  for (const ad of ads) {
    if (!ad.candidateSlug) continue;
    const list = byCandidate.get(ad.candidateSlug) ?? [];
    list.push(ad);
    byCandidate.set(ad.candidateSlug, list);
  }
  const rolled = candidates
    .map((c) => rollupCandidate(byCandidate.get(c.slug) ?? [], c))
    .filter((c) => c.adCount > 0)
    .sort((a, b) => b.supportSpend + b.attackSpend - (a.supportSpend + a.attackSpend));

  const totalSupport = rolled.reduce((s, c) => s + c.supportSpend, 0);
  const totalAttack = rolled.reduce((s, c) => s + c.attackSpend, 0);
  const totalSpend = totalSupport + totalAttack;
  const outsideSpend = rolled.reduce((s, c) => s + c.outsideSpend, 0);
  const adCount = rolled.reduce((s, c) => s + c.adCount, 0);

  let mostAttacked: string | null = null;
  let maxAttack = 0;
  for (const c of rolled) {
    if (c.attackSpend > maxAttack) {
      maxAttack = c.attackSpend;
      mostAttacked = c.slug;
    }
  }

  return {
    candidates: rolled,
    totalSpend,
    outsideSpend,
    supportShare: totalSpend ? totalSupport / totalSpend : 0,
    attackShare: totalSpend ? totalAttack / totalSpend : 0,
    mostAttacked,
    adCount,
  };
}
