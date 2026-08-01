/**
 * Multi-signal blend math for the /forecast class. Everything is done in
 * SHARE space (each candidate's fraction of the field, 0..1) so signals in
 * different units — poll %, followers, dollars, story counts — are never
 * added raw. The blend output is a RELATIVE index used only for ordering and
 * bar length; it is never shown to the reader as a number.
 */
export type Shares = Record<string, number>;
export type SignalKey = "polls" | "social" | "adspend" | "news";

/** Normalize any raw signal to share-of-field. Negatives floor to 0; empty/all-zero → zeros. */
export function toShares(values: Record<string, number>): Shares {
  const pos = (v: number) => (v > 0 ? v : 0);
  const total = Object.values(values).reduce((s, v) => s + pos(v), 0);
  if (total <= 0) return Object.fromEntries(Object.keys(values).map((k) => [k, 0]));
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, pos(v) / total]));
}

/** Weighted average of per-signal shares. Only signals with data AND positive weight participate; their weights renormalize to sum 1. */
export function blend(
  shares: Partial<Record<SignalKey, Shares>>,
  weights: Partial<Record<SignalKey, number>>,
): Shares {
  const active = (Object.keys(shares) as SignalKey[]).filter(
    (k) => shares[k] && Object.keys(shares[k]!).length > 0 && (weights[k] ?? 0) > 0,
  );
  const wsum = active.reduce((s, k) => s + (weights[k] ?? 0), 0);
  if (wsum <= 0) return {};
  const slugs = new Set<string>();
  for (const k of active) for (const slug of Object.keys(shares[k]!)) slugs.add(slug);
  const out: Shares = {};
  for (const slug of slugs) {
    out[slug] = active.reduce((acc, k) => acc + (weights[k]! / wsum) * (shares[k]![slug] ?? 0), 0);
  }
  return out;
}

/** Leaderboard order (highest first) for the re-order display. */
export function rank(blended: Shares): Array<{ slug: string; value: number }> {
  return Object.entries(blended)
    .map(([slug, value]) => ({ slug, value }))
    .sort((a, b) => b.value - a.value);
}

export type TurnoutScenario = "broad" | "hardcore";

/**
 * ILLUSTRATIVE, hand-set turnout propensity for a "hardcore" (small, older,
 * high-info August-primary) electorate. >1 = relatively favored when the
 * electorate shrinks to its most reliable voters; <1 = relatively favored by a
 * broad, younger, online-heavy electorate. These are a teaching device, NOT a
 * measured model (we have no turnout crosstabs) — surfaced as such in the UI.
 * This is a calibration knob: tune the numbers as judgment improves.
 */
export const TURNOUT_PROFILE: Record<string, number> = {
  "francesca-hong": 0.85, // strength skews young/online → fades in a hardcore electorate
  "david-crowley": 1.0,
  "joel-brennan": 1.1, // establishment/older-leaning → relatively favored
  "kelda-roys": 1.05,
};

/** Tilt shares by a turnout profile, then renormalize back to share-of-field. */
export function applyTurnoutTilt(
  shares: Shares,
  scenario: TurnoutScenario,
  profile: Record<string, number> = TURNOUT_PROFILE,
): Shares {
  if (scenario === "broad") return shares;
  const tilted = Object.fromEntries(
    Object.entries(shares).map(([slug, v]) => [slug, v * (profile[slug] ?? 1)]),
  );
  return toShares(tilted);
}
