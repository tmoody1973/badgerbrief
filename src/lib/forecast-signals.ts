import { toShares, type Shares } from "./signals";
import { ACTIVE_DEM } from "./forecast";

const slugToLabel = ACTIVE_DEM; // { "francesca-hong": "Hong", ... }

function restrict(raw: Record<string, number>): Shares {
  // keep only active Dems, key by short label
  const byLabel: Record<string, number> = {};
  for (const [slug, label] of Object.entries(slugToLabel)) {
    if (raw[slug] != null) byLabel[label] = raw[slug];
  }
  return toShares(byLabel);
}

/** Poll standing (already per short-label from `aggregate`) → shares. */
export function pollShares(avg: Record<string, number>): Shares {
  return toShares(avg);
}

export function socialShares(
  social: Array<{ candidateSlug: string; followers?: number }> | undefined,
): Shares {
  const raw: Record<string, number> = {};
  for (const r of social ?? []) raw[r.candidateSlug] = (raw[r.candidateSlug] ?? 0) + (r.followers ?? 0);
  return restrict(raw);
}

export function adSpendShares(
  adMoney: { candidates: Array<{ candidateSlug: string; totalSpend: number }> } | undefined,
): Shares {
  const raw: Record<string, number> = {};
  for (const c of adMoney?.candidates ?? []) raw[c.candidateSlug] = c.totalSpend;
  return restrict(raw);
}

export function newsShares(
  tone: Array<{ candidateSlug: string; positive: number; negative: number }> | undefined,
): Shares {
  const raw: Record<string, number> = {};
  for (const r of tone ?? []) raw[r.candidateSlug] = Math.max(0, r.positive - r.negative);
  return restrict(raw);
}
