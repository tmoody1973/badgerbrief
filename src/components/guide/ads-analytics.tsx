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

export function AdsAnalytics({ ads }: { ads: Doc<"ads">[] }) {
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
                className="block h-full rounded-r-[3px] bg-primary"
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
