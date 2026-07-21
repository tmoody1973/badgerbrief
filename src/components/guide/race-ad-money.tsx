import type { CandidateAdMoney, RaceAdMoney } from "../../../convex/lib/adMoney";

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

function SplitBar({ own, outside }: { own: number; outside: number }) {
  const total = own + outside;
  const ownPct = total ? Math.round((own / total) * 100) : 0;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden border-2 border-border">
        <div className="bg-secondary" style={{ width: `${ownPct}%` }} />
        <div className="bg-warning" style={{ width: `${100 - ownPct}%` }} />
      </div>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {usd(own)} own committee · {usd(outside)} outside <span className="italic">(estimated)</span>
      </p>
    </div>
  );
}

function CandidateMoneyCard({ c }: { c: CandidateAdMoney }) {
  return (
    <div className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <h3 className="font-display text-lg">{c.name}</h3>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="font-mono text-lg font-bold text-foreground">{usd(c.supportSpend)}</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Supporting</p>
        </div>
        <div>
          <p className="font-mono text-lg font-bold text-foreground">{usd(c.attackSpend)}</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Attacking</p>
        </div>
        <div>
          <p className="font-mono text-lg font-bold text-foreground">{compact(c.impressions)}</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Reach</p>
        </div>
      </div>
      <div className="mt-3">
        <SplitBar own={c.ownSpend} outside={c.outsideSpend} />
      </div>
      {c.unclassifiedCount > 0 && (
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">
          {c.unclassifiedCount} ad(s) not yet classified support/attack.
        </p>
      )}
    </div>
  );
}

/** Layout-B per-race ad-money panel: candidate money cards + a "who's paying" takeaway. */
export function RaceAdMoney({ data }: { data: RaceAdMoney }) {
  if (data.candidates.length === 0) {
    return (
      <section id="ad-money" className="mt-8 scroll-mt-16">
        <h2 className="font-display text-2xl">Ad money in this race</h2>
        <p className="mt-3 border-2 border-dashed border-border p-6 text-center text-muted-foreground">
          No ads tracked in this race yet.
        </p>
      </section>
    );
  }
  const mostAttackedName = data.mostAttacked
    ? data.candidates.find((c) => c.slug === data.mostAttacked)?.name
    : null;
  const outsidePct = data.totalSpend ? Math.round((data.outsideSpend / data.totalSpend) * 100) : 0;
  return (
    <section id="ad-money" className="mt-8 scroll-mt-16">
      <h2 className="font-display text-2xl">Ad money in this race</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Who is paying to influence this race — supporting or attacking each candidate, and how much
        is a candidate&apos;s own committee vs. outside groups. Spend and reach are platform-disclosed
        ranges; figures are estimated midpoints. This shows pressure, not who wins.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {data.candidates.map((c) => (
          <CandidateMoneyCard key={c.slug} c={c} />
        ))}
      </div>
      <div className="mt-4 border-2 border-border bg-warning p-4 text-sm text-foreground shadow-[var(--shadow-brutal)]">
        <strong>Who&apos;s paying.</strong> {usd(data.totalSpend)} in tracked ads
        {outsidePct > 0 && <> — an estimated {outsidePct}% from outside groups</>}
        {mostAttackedName && <>. {mostAttackedName} is the most-attacked candidate here</>}.
      </div>
    </section>
  );
}
