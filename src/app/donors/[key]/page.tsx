import type { Metadata } from "next";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import { CATEGORY_META } from "@/lib/financeSegments";

export const revalidate = 300;

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

type Props = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params;
  const profile = await fetchQuery(api.donors.profile, { donorKey: decodeURIComponent(key) });
  return {
    title: profile
      ? `${profile.donors[0].donorName} — campaign giving | BadgerBrief`
      : "Donor not found | BadgerBrief",
    robots: { index: false, follow: false }, // public record on-site, not Google-surfaced (spec)
  };
}

export default async function DonorPage({ params }: Props) {
  const { key } = await params;
  const donorKey = decodeURIComponent(key);
  const profile = await fetchQuery(api.donors.profile, { donorKey });

  if (!profile) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="font-display text-2xl">No donor found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No reported contributions under this exact name. Names must match the
          WI Ethics Commission filings exactly — try a search:
        </p>
        <p className="mt-3 text-sm">
          Browse donors from any candidate&apos;s page — each money section has a
          full searchable donor list.{" "}
          <Link href="/races/wi-gov-2026" className="underline">
            Governor&apos;s race →
          </Link>
        </p>
      </main>
    );
  }

  const { donors, grandTotal } = profile;
  const display = donors[0];
  const gifts = donors
    .flatMap((d) => d.gifts.map((g) => ({ ...g, candidateSlug: d.candidateSlug })))
    .sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? 1 : -1));
  const truncated = donors.some((d) => d.giftsTruncated);
  const coverage = display.coverageEndDate;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl">{display.donorName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {display.location ?? ""}
        {display.location ? " · " : ""}
        {CATEGORY_META[display.category]?.label ?? display.category}
      </p>
      <p className="mt-3 border-2 border-border bg-card p-3 font-mono text-xl shadow-[var(--shadow-brutal)]">
        {fmt(grandTotal)}{" "}
        <span className="text-xs text-muted-foreground">
          to {donors.length} campaign{donors.length === 1 ? "" : "s"} tracked by BadgerBrief
        </span>
      </p>

      <h2 className="mt-6 font-display text-xl">By candidate</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {donors.map((d) => (
          <li key={d._id} className="flex justify-between gap-2 border-b border-dashed border-border pb-1">
            <Link href={`/candidates/${d.candidateSlug}`} className="font-bold underline">
              {d.candidateSlug.replaceAll("-", " ")}
            </Link>
            <span className="font-mono">
              {fmt(d.total)} <span className="text-[10px] text-muted-foreground">·{d.giftCount} gifts</span>
            </span>
          </li>
        ))}
      </ul>

      <h2 className="mt-6 font-display text-xl">Gifts</h2>
      <div className="mt-2 overflow-x-auto border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
        <table className="w-full min-w-[360px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-border bg-secondary text-left">
              <th className="px-3 py-2 font-mono text-xs font-bold uppercase">Date</th>
              <th className="px-3 py-2 font-mono text-xs font-bold uppercase">Amount</th>
              <th className="px-3 py-2 font-mono text-xs font-bold uppercase">To</th>
            </tr>
          </thead>
          <tbody>
            {gifts.map((g, i) => (
              <tr key={i} className="border-b border-dashed border-border">
                <td className="px-3 py-2 font-mono text-xs">{g.date ?? "—"}</td>
                <td className="px-3 py-2 font-mono">{fmt(g.amount)}</td>
                <td className="px-3 py-2">{g.candidateSlug.replaceAll("-", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated && (
        <p className="mt-1 text-xs text-muted-foreground">
          Gift list truncated to the 500 most recent per campaign; totals include all gifts.
        </p>
      )}

      <p className="mt-6 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        Names appear exactly as reported to the{" "}
        <a href="https://campaignfinance.wi.gov" className="underline" rel="noopener noreferrer" target="_blank">
          WI Ethics Commission (Sunshine)
        </a>
        ; the same person may appear under multiple spellings.
        {coverage ? ` Itemized contributions, ${coverage}.` : ""} Non-commercial voter education use.
      </p>
    </main>
  );
}
