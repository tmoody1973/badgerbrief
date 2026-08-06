/**
 * Shared segment math + category metadata for the finance breakdown UI.
 * One source of truth so the candidate mix bar and the race-table mini bars
 * cannot drift. Colors are Okabe-Ito (colorblind-safe) and deliberately NOT
 * red/blue partisan-coded — "party" covers both parties.
 */

export type BreakdownCategory = {
  key: string;
  amount: number;
  count: number;
  topDonors: { name: string; amount: number; location?: string }[];
};

export const CATEGORY_META: Record<string, { label: string; color: string }> = {
  individuals: { label: "Individuals", color: "#0072B2" },
  party: { label: "Party committees", color: "#E69F00" },
  union: { label: "Union PACs", color: "#009E73" },
  pac: { label: "PACs & committees", color: "#CC79A7" },
  business: { label: "Businesses", color: "#56B4E9" },
  other: { label: "Other", color: "#8B8B8B" },
};

const ORDER = ["individuals", "party", "union", "pac", "business", "other"];

export type Segment = BreakdownCategory & { label: string; color: string; pct: number };

/**
 * Order categories, compute integer percentages that sum to exactly 100
 * (largest-remainder rounding). Returns [] for absent/empty/zero input so
 * components can render nothing.
 */
export function computeSegments(categories?: BreakdownCategory[]): Segment[] {
  const cats = (categories ?? [])
    .filter((c) => c.amount > 0)
    .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  const total = cats.reduce((s, c) => s + c.amount, 0);
  if (total <= 0) return [];
  const raw = cats.map((c) => (100 * c.amount) / total);
  const floors = raw.map(Math.floor);
  let remainder = 100 - floors.reduce((s, f) => s + f, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  const pcts = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    pcts[i] += 1;
    remainder -= 1;
  }
  return cats.map((c, i) => ({
    ...c,
    label: CATEGORY_META[c.key]?.label ?? c.key,
    color: CATEGORY_META[c.key]?.color ?? "#8B8B8B",
    pct: pcts[i],
  }));
}
