import type { Metadata } from "next";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";
import { MixBarMini, MixLegend } from "@/components/guide/financeBreakdown";
import { DonorSearch } from "@/components/guide/donorSearch";
import { raceIdToSlug } from "@/lib/site";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Follow the money — Wisconsin 2026 | BadgerBrief",
  description:
    "Who funds Wisconsin's 2026 campaigns — every reported donor, searchable, with funding breakdowns for each state race.",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export default async function MoneyPage() {
  const races = await fetchQuery(api.donors.raceMoney, {});
  const coverages = [
    ...new Set(
      races.flatMap((r) => r.candidates.map((c) => c.coverageEndDate)).filter(Boolean),
    ),
  ];
  const coverage = coverages.length === 1 ? coverages[0] : undefined;
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl">Follow the money</h1>
      <p className="mt-2 text-sm">
        Who funds Wisconsin&apos;s 2026 campaigns — every reported donor, searchable.
        Tap a candidate for their full donor list.
      </p>
      <div className="mt-4">
        <DonorSearch />
      </div>

      {races.length > 0 ? (
        <>
          <h2 className="mt-8 font-display text-2xl">Race by race</h2>
          <MixLegend keys={["individuals", "party", "union", "pac", "business", "other"]} />
          {races.map((race) => (
            <section key={race.raceId} className="mt-4 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
              <h3 className="font-display text-xl">{race.office}</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {race.candidates.map((c) => (
                  <li key={c.slug} className="flex items-center justify-between gap-2 border-b border-dashed border-border pb-1">
                    <Link href={`/candidates/${c.slug}`} className="min-w-0 font-bold underline">
                      {c.name}
                    </Link>
                    <span className="flex shrink-0 items-center gap-2">
                      {c.categories ? (
                        <MixBarMini categories={c.categories} />
                      ) : (
                        <span className="font-mono text-xs">—</span>
                      )}
                      <span className="w-20 text-right font-mono">{fmt(c.receipts)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-wide">
                <Link href={`/races/${raceIdToSlug(race.raceId)}#money`} className="underline">
                  Full race money breakdown →
                </Link>
              </p>
            </section>
          ))}
        </>
      ) : (
        <p className="mt-8 text-sm text-muted-foreground">Money data is being updated.</p>
      )}

      <p className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {coverage ? `Itemized contributions, ${coverage} · ` : ""}Source:{" "}
        <a href="https://campaignfinance.wi.gov" className="underline" rel="noopener noreferrer" target="_blank">
          WI Ethics Commission (Sunshine)
        </a>{" "}
        · non-commercial voter education use
      </p>
    </main>
  );
}
