import type { Doc } from "../../../convex/_generated/dataModel";

/**
 * Server-rendered ad-spend analytics for /ads — the journalist/citizen view.
 * All figures are approximate because Meta discloses spend and impressions as
 * ranges; we use range midpoints. Single-series magnitude → horizontal bars in
 * one hue with direct value labels (identity never rides on color alone).
 */

type Agg = {
  sponsor: string;
  spend: number; // midpoint total, USD
  impressions: number; // midpoint total
  ads: number;
};

function mid(lower?: number, upper?: number): number {
  if (lower !== undefined && upper !== undefined) return (lower + upper) / 2;
  return lower ?? upper ?? 0;
}

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${Math.round(n)}`;
}

function aggregateBySponsor(ads: Doc<"ads">[]): Agg[] {
  const by = new Map<string, Agg>();
  for (const ad of ads) {
    const key = ad.pageOrCommittee;
    const cur = by.get(key) ?? { sponsor: key, spend: 0, impressions: 0, ads: 0 };
    cur.spend += mid(ad.spendLower, ad.spendUpper);
    cur.impressions += mid(ad.impressionsLower, ad.impressionsUpper);
    cur.ads += 1;
    by.set(key, cur);
  }
  return [...by.values()];
}

export function AdsAnalytics({
  ads,
  candidateNames,
}: {
  ads: Doc<"ads">[];
  candidateNames: Record<string, string>;
}) {
  const totalSpendLow = ads.reduce((s, a) => s + (a.spendLower ?? 0), 0);
  const totalSpendHigh = ads.reduce((s, a) => s + (a.spendUpper ?? 0), 0);
  const sponsors = aggregateBySponsor(ads);
  const activeCount = ads.filter((a) => a.status === "active").length;

  const topSpenders = [...sponsors].sort((a, b) => b.spend - a.spend).slice(0, 8);

  // "Who maximized their buy" — reach per dollar. Floor the spend so a $50 ad
  // with a lucky impression doesn't top the chart.
  const efficient = sponsors
    .filter((s) => s.spend >= 1000 && s.impressions > 0)
    .map((s) => ({ ...s, perDollar: s.impressions / s.spend }))
    .sort((a, b) => b.perDollar - a.perDollar)
    .slice(0, 8);

  return (
    <section className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total spend" value={`${usd(totalSpendLow)}–${usd(totalSpendHigh)}`} />
        <StatTile label="Tracked ads" value={ads.length.toLocaleString()} />
        <StatTile label="Sponsors" value={sponsors.length.toLocaleString()} />
        <StatTile label="Running now" value={activeCount.toLocaleString()} />
      </div>

      <ForAgainstChart ads={ads} names={candidateNames} />

      <BarList
        title="Top spenders"
        note="Estimated spend (range midpoints), by sponsor."
        rows={topSpenders.map((s) => ({
          label: s.sponsor,
          value: s.spend,
          display: usd(s.spend),
        }))}
      />

      <BarList
        title="Most reach per dollar"
        note="Impressions per $1 spent — who's stretching their ad budget furthest (min $1k spend)."
        rows={efficient.map((s) => ({
          label: s.sponsor,
          value: s.perDollar,
          display: `${compact(s.perDollar)}/$1`,
        }))}
      />

      <p className="font-mono text-[11px] text-muted-foreground">
        Figures are estimates — Meta reports spend and impressions as ranges, so
        we use midpoints. Reach-per-dollar reflects targeting and competition,
        not just ad-buying skill.
      </p>
    </section>
  );
}

/** Diverging for-vs-against spend per candidate — attacks grow left (cardinal),
 * support grows right (lake) from a shared center. The hue encodes the *action*
 * (attack vs support), identically for every candidate, so no person or party is
 * ever colored — polarity is also encoded by side, with a legend and per-side
 * value labels. Cardinal/lake (not red/green) keeps it colorblind-safe. */
function ForAgainstChart({
  ads,
  names,
}: {
  ads: Doc<"ads">[];
  names: Record<string, string>;
}) {
  const by = new Map<string, { support: number; oppose: number }>();
  for (const ad of ads) {
    if (!ad.candidateSlug || !ad.stance) continue;
    const cur = by.get(ad.candidateSlug) ?? { support: 0, oppose: 0 };
    const m = mid(ad.spendLower, ad.spendUpper);
    if (ad.stance === "support") cur.support += m;
    else cur.oppose += m;
    by.set(ad.candidateSlug, cur);
  }
  const rows = [...by.entries()]
    .map(([slug, v]) => ({
      slug,
      name: names[slug] ?? slug,
      ...v,
      total: v.support + v.oppose,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  return (
    <div>
      <h2 className="font-display text-xl">Spending for &amp; against each candidate</h2>
      {rows.length === 0 ? (
        <p className="mt-2 border-2 border-dashed border-border p-4 text-sm text-muted-foreground">
          No attributed ads yet. As editors confirm ad→candidate matches in the
          review queue and mark each as supporting or attacking, this fills in.
        </p>
      ) : (
        <>
          <div className="mt-1 flex items-center gap-4 font-mono text-xs">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 border-2 border-border bg-accent" />
              Supports
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 border-2 border-border bg-primary" />
              Attacks
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {rows.map((r) => {
              const max = Math.max(
                ...rows.flatMap((x) => [x.support, x.oppose]),
                1,
              );
              return (
                <li key={r.slug} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 truncate text-sm sm:w-44" title={r.name}>
                    {r.name}
                  </span>
                  <span className="hidden w-14 shrink-0 text-right font-mono text-[11px] text-muted-foreground sm:inline">
                    {r.oppose > 0 ? usd(r.oppose) : ""}
                  </span>
                  <span className="flex flex-1 items-center">
                    <span className="flex w-1/2 justify-end">
                      <span
                        className="block h-4 bg-primary"
                        style={{ width: `${(r.oppose / max) * 100}%` }}
                      />
                    </span>
                    <span className="h-4 w-px bg-border" />
                    <span className="flex w-1/2 justify-start">
                      <span
                        className="block h-4 bg-accent"
                        style={{ width: `${(r.support / max) * 100}%` }}
                      />
                    </span>
                  </span>
                  <span className="hidden w-14 shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">
                    {r.support > 0 ? usd(r.support) : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)]">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="font-display mt-1 text-xl leading-none">{value}</p>
    </div>
  );
}

function BarList({
  title,
  note,
  rows,
}: {
  title: string;
  note: string;
  rows: { label: string; value: number; display: string }[];
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div>
      <h2 className="font-display text-xl">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{note}</p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3">
            <span className="w-36 shrink-0 truncate text-sm sm:w-52" title={r.label}>
              {r.label}
            </span>
            <span className="h-5 flex-1 border-2 border-border bg-card">
              <span
                className="block h-full bg-accent"
                style={{ width: `${Math.max((r.value / max) * 100, 2)}%` }}
              />
            </span>
            <span className="w-20 shrink-0 text-right font-mono text-xs font-bold">
              {r.display}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
