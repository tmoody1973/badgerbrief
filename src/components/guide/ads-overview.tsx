import Link from "next/link";
import { raceIdToSlug } from "@/lib/site";
import { StatTile } from "@/components/guide/stat-tile";
import type { getAdMoneyOverview } from "@/lib/data";

type Overview = Awaited<ReturnType<typeof getAdMoneyOverview>>;
type RaceCard = Overview["races"][number];

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

/** support-vs-attack mini bar for a race card. Lake = for, cardinal = against
 * (colorblind-safe, and the hue encodes the spending action, not a party). */
function ForAgainstBar({ supportShare, attackShare }: { supportShare: number; attackShare: number }) {
  return (
    <div>
      <div className="mt-2 flex h-2 w-full overflow-hidden border-2 border-border">
        <div className="bg-accent" style={{ width: `${Math.round(supportShare * 100)}%` }} />
        <div className="bg-primary" style={{ width: `${Math.round(attackShare * 100)}%` }} />
      </div>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {Math.round(supportShare * 100)}% for · {Math.round(attackShare * 100)}% against
      </p>
    </div>
  );
}

export function RaceMoneyCard({ race }: { race: RaceCard }) {
  const outsidePct = race.totalSpend ? Math.round((race.outsideSpend / race.totalSpend) * 100) : 0;
  return (
    <Link
      href={`/races/${raceIdToSlug(race.raceId)}#ad-money`}
      className="press block border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-lg leading-tight">{race.office}</h3>
        {outsidePct > 0 && (
          <span className="shrink-0 border-2 border-border bg-warning px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-foreground">
            {outsidePct}% outside
          </span>
        )}
      </div>
      <p className="mt-1 font-mono text-xl font-bold text-foreground">{usd(race.totalSpend)}</p>
      <ForAgainstBar supportShare={race.supportShare} attackShare={race.attackShare} />
      <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {race.adCount} ads · estimated
      </p>
    </Link>
  );
}

/** By-race overview: statewide headline + race cards. Personalized band handled by <YourRaces>. */
export function AdsOverview({ overview }: { overview: Overview }) {
  const { statewide, races } = overview;
  return (
    <section className="mt-8">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Total tracked ad spend" value={usd(statewide.totalSpend)} note="Estimated (range midpoints)." />
        <StatTile label="Outside money (estimated)" value={usd(statewide.outsideSpend)} note="Not a candidate's own committee." />
        <StatTile
          label="Most-attacked candidate"
          value={statewide.mostAttacked ? statewide.mostAttacked.name : "—"}
          note={statewide.mostAttacked ? `${statewide.mostAttacked.office} · ${usd(statewide.mostAttacked.attackSpend)} against` : undefined}
        />
      </div>
      <h2 className="font-display mt-8 text-2xl">Ad money, race by race</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Each race, ranked by tracked ad spend. The pill shows the estimated share from outside
        groups; the bar shows the split between supporting and attacking spend. Tap a race for the
        candidate breakdown.
      </p>
      {races.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {races.map((r) => (
            <RaceMoneyCard key={r.raceId} race={r} />
          ))}
        </div>
      ) : (
        <p className="mt-4 border-2 border-dashed border-border p-6 text-center text-muted-foreground">
          No races with tracked ads yet.
        </p>
      )}
    </section>
  );
}
