/**
 * Poll-aggregation forecast helpers (WI-GOV Dem primary).
 *
 * Deliberately framed as DESCRIPTION, not prediction: aggregate public polls,
 * weight by recency + sample size, and always carry the uncertainty. Pure
 * functions so they're unit-testable and reusable server- or client-side.
 *
 * See docs / the /forecast page for the "not a prediction" framing.
 */

// Active Democratic field (Barnes + withdrawn removed). slug -> short label.
export const ACTIVE_DEM: Record<string, string> = {
  "francesca-hong": "Hong",
  "david-crowley": "Crowley",
  "joel-brennan": "Brennan",
  "kelda-roys": "Roys",
};
export const ELECTION_DAY = new Date("2026-08-11T00:00:00");

/** Messy poll value -> number. "38%" -> 38, "26-27%" -> 26.5, junk -> null. */
export function parsePct(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const nums = (value.replace(/%/g, "").match(/\d+\.?\d*/g) ?? [])
    .map(Number)
    .filter((n) => n >= 0 && n <= 100);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

/** Sample size, tolerating "~600 delegates" etc. */
export function sampleSize(raw: unknown): number {
  if (typeof raw === "number") return raw;
  const m = String(raw ?? "").match(/\d+/);
  return m ? Number(m[0]) : 300;
}

export type CleanPoll = { date: string; n: number; pollster: string; values: Record<string, number> };

/**
 * Turn raw Convex poll docs into clean primary-poll rows for the active field.
 * Keeps only polls that list >=2 active Democrats (drops general-election
 * matchups and single-candidate head-to-heads).
 */
export function parsePrimaryPolls(
  raw: Array<{
    conductedEnd?: string;
    sampleSize?: number | string;
    pollster?: string;
    source?: string;
    groups?: Array<{ rows?: Array<{ candidateSlug?: string | null; value?: unknown }> }>;
  }>,
): CleanPoll[] {
  const out: CleanPoll[] = [];
  for (const p of raw) {
    const values: Record<string, number> = {};
    for (const g of p.groups ?? []) {
      for (const r of g.rows ?? []) {
        const slug = r.candidateSlug ?? "";
        const name = ACTIVE_DEM[slug];
        const pct = parsePct(r.value);
        if (name && pct != null && values[name] == null) values[name] = pct;
      }
    }
    if (Object.keys(values).length >= 2) {
      out.push({
        date: p.conductedEnd ?? "",
        n: sampleSize(p.sampleSize),
        pollster: (p.pollster ?? p.source ?? "").slice(0, 40),
        values,
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

function daysToElection(date: string): number {
  return (ELECTION_DAY.getTime() - new Date(date + "T00:00:00").getTime()) / 86_400_000;
}

/** Recency (half-life) x sqrt(sample size). */
export function pollWeight(p: CleanPoll, halfLifeDays: number): number {
  return Math.pow(0.5, daysToElection(p.date) / halfLifeDays) * Math.sqrt(p.n);
}

/** Weighted average standing (as-polled) for the active field. */
export function aggregate(polls: CleanPoll[], halfLifeDays: number): Record<string, number> {
  const names = Object.values(ACTIVE_DEM);
  const totals: Record<string, number> = Object.fromEntries(names.map((n) => [n, 0]));
  let wsum = 0;
  for (const p of polls) {
    const w = pollWeight(p, halfLifeDays);
    wsum += w;
    for (const n of names) if (p.values[n] != null) totals[n] += w * p.values[n];
  }
  return Object.fromEntries(names.map((n) => [n, wsum ? totals[n] / wsum : 0]));
}

/** Blend the leftover (undecided + dropped-out) vote: 0 = proportional, 1 = even. */
export function project(avg: Record<string, number>, split: number): {
  projected: Record<string, number>;
  leftover: number;
} {
  const names = Object.keys(avg);
  const polled = names.reduce((s, n) => s + avg[n], 0);
  const leftover = 100 - polled;
  const t = split / 100;
  const projected = Object.fromEntries(
    names.map((n) => {
      const prop = polled ? (avg[n] / polled) * 100 : 0;
      const even = avg[n] + leftover / names.length;
      return [n, (1 - t) * prop + t * even];
    }),
  );
  return { projected, leftover };
}

// Box-Muller gaussian with a spare value.
function makeRng() {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };
}

/** Monte-Carlo win probability: run the race N times within the uncertainty. */
export function winProbability(
  avg: Record<string, number>,
  sd: number,
  n = 10_000,
): Record<string, number> {
  const names = Object.keys(avg);
  const wins: Record<string, number> = Object.fromEntries(names.map((x) => [x, 0]));
  const randn = makeRng();
  for (let i = 0; i < n; i++) {
    let best = -Infinity;
    let winner = names[0];
    for (const name of names) {
      const draw = avg[name] + randn() * sd;
      if (draw > best) {
        best = draw;
        winner = name;
      }
    }
    wins[winner]++;
  }
  return Object.fromEntries(names.map((name) => [name, (wins[name] / n) * 100]));
}
