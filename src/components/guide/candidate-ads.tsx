import { SponsorLink } from "@/components/guide/sponsor-link";
import type { Doc } from "../../../convex/_generated/dataModel";

/**
 * Ads a human confirmed are about this candidate (MOO-309) — shown on the
 * candidate page, split by whether they support or attack. Only attributed ads
 * (candidateSlug set) reach here, so nothing unverified appears.
 */

function mid(l?: number, u?: number): number {
  if (l !== undefined && u !== undefined) return (l + u) / 2;
  return l ?? u ?? 0;
}

function usd(n: number): string {
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

function spendRange(ad: Doc<"ads">): string {
  const lo = ad.spendLower;
  const hi = ad.spendUpper;
  if (lo === undefined && hi === undefined) return "spend n/a";
  const f = (n: number) => `$${n.toLocaleString()}`;
  if (lo !== undefined && hi !== undefined)
    return lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`;
  return hi !== undefined ? `up to ${f(hi)}` : `${f(lo!)}+`;
}

export function CandidateAds({
  ads,
  candidateName,
  enrichedKeys,
}: {
  ads: Doc<"ads">[];
  candidateName: string;
  enrichedKeys: string[];
}) {
  if (ads.length === 0) return null;
  const support = ads.filter((a) => a.stance === "support");
  const attack = ads.filter((a) => a.stance === "oppose");
  const supportSpend = support.reduce((s, a) => s + mid(a.spendLower, a.spendUpper), 0);
  const attackSpend = attack.reduce((s, a) => s + mid(a.spendLower, a.spendUpper), 0);
  const sorted = [...ads].sort((a, b) => (b.spendUpper ?? 0) - (a.spendUpper ?? 0));

  return (
    <section id="ads" className="mt-6 scroll-mt-16">
      <h2 className="font-display text-xl">Political ads about {candidateName}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ads a BadgerBrief editor confirmed are about {candidateName}, from the
        Meta Ad Library. Spend is the range Meta discloses.
      </p>

      <div className="mt-3 flex flex-wrap gap-2 font-mono text-xs font-bold">
        {support.length > 0 && (
          <span className="border-2 border-border bg-accent px-2 py-1 text-accent-foreground">
            Supporting ~{usd(supportSpend)} · {support.length} ad
            {support.length === 1 ? "" : "s"}
          </span>
        )}
        {attack.length > 0 && (
          <span className="border-2 border-border bg-primary px-2 py-1 text-primary-foreground">
            Attacking ~{usd(attackSpend)} · {attack.length} ad
            {attack.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <ul className="mt-4 space-y-3">
        {sorted.map((ad) => (
          <li
            key={ad._id}
            className="border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`border-2 border-border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest ${
                  ad.stance === "oppose"
                    ? "bg-primary text-primary-foreground"
                    : "bg-accent text-accent-foreground"
                }`}
              >
                {ad.stance === "oppose" ? "Attack" : "Support"}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {spendRange(ad)}
              </span>
            </div>
            <p className="mt-2">
              <SponsorLink name={ad.pageOrCommittee} enrichedKeys={enrichedKeys} className="font-bold" />
            </p>
            {ad.fundingEntity && ad.fundingEntity !== ad.pageOrCommittee && (
              <p className="text-xs text-muted-foreground">
                Paid for by {ad.fundingEntity}
              </p>
            )}
            {ad.creativeText && (
              <p className="mt-1 line-clamp-3 text-sm">{ad.creativeText}</p>
            )}
            {ad.snapshotUrl && (
              <a
                href={ad.snapshotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block font-mono text-xs underline decoration-2 underline-offset-2"
              >
                View ad on Meta ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
