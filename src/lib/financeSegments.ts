/**
 * Shared segment math + category metadata for the finance breakdown UI.
 * One source of truth so the candidate mix bar and the race-table mini bars
 * cannot drift. Colors are Okabe-Ito (colorblind-safe) and deliberately NOT
 * red/blue partisan-coded — "party" covers both parties.
 */

export type Donor = { name: string; amount: number; location?: string };

export type BreakdownCategory = {
  key: string;
  amount: number;
  count: number;
  topDonors: Donor[];
};

export const CATEGORY_META: Record<string, { label: string; color: string; text: string }> = {
  individuals: { label: "Individuals", color: "#0072B2", text: "#FFFFFF" },
  party: { label: "Party committees", color: "#E69F00", text: "#1A1A1A" },
  union: { label: "Union PACs", color: "#009E73", text: "#FFFFFF" },
  pac: { label: "PACs & committees", color: "#CC79A7", text: "#FFFFFF" },
  business: { label: "Businesses", color: "#56B4E9", text: "#1A1A1A" },
  other: { label: "Other", color: "#8B8B8B", text: "#1A1A1A" },
};

const ORDER = ["individuals", "party", "union", "pac", "business", "other"];

export type Segment = BreakdownCategory & { label: string; color: string; text: string; pct: number };

const mergeTopDonors = (a: Donor[], b: Donor[]): Donor[] =>
  [...a, ...b].sort((x, y) => y.amount - x.amount).slice(0, 10);

/**
 * Order categories, compute integer percentages that sum to exactly 100
 * (largest-remainder rounding). Returns [] for absent/empty/zero input so
 * components can render nothing. Categories under 1% of total are folded
 * into "other" before percentages are assigned, so no slice silently
 * displays "0%" (drill-down into the merged donors is preserved).
 */
export function computeSegments(categories?: BreakdownCategory[]): Segment[] {
  const cats = (categories ?? []).filter((c) => c.amount > 0);
  const total = cats.reduce((s, c) => s + c.amount, 0);
  if (total <= 0) return [];

  const kept: BreakdownCategory[] = [];
  let other = cats.find((c) => c.key === "other");
  for (const c of cats) {
    if (c.key === "other") continue;
    if (c.amount / total < 0.01) {
      other = other
        ? {
            key: "other",
            amount: other.amount + c.amount,
            count: other.count + c.count,
            topDonors: mergeTopDonors(other.topDonors, c.topDonors),
          }
        : { key: "other", amount: c.amount, count: c.count, topDonors: c.topDonors };
    } else {
      kept.push(c);
    }
  }
  const merged = (other ? [...kept, other] : kept).sort(
    (a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key),
  );

  const raw = merged.map((c) => (100 * c.amount) / total);
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
  return merged.map((c, i) => ({
    ...c,
    label: CATEGORY_META[c.key]?.label ?? c.key,
    color: CATEGORY_META[c.key]?.color ?? "#8B8B8B",
    text: CATEGORY_META[c.key]?.text ?? "#1A1A1A",
    pct: pcts[i],
  }));
}
