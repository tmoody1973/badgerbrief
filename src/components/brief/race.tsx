"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { RaceCard as GuideRaceCard } from "@/components/guide/cards";
import { PartyBadge, StatusBadge } from "@/components/guide/labels";
import { raceIdToSlug } from "@/lib/site";
import { BriefSkeleton, NotFoundCard } from "./chrome";

export function BriefRaceCardView({ raceId }: { raceId: string }) {
  const data = useQuery(api.public.getRace, { raceId });
  if (data === undefined) return <BriefSkeleton lines={4} />;
  if (data === null) return <NotFoundCard entity={`race ${raceId}`} />;
  return (
    <div>
      <GuideRaceCard race={data.race} candidateCount={data.candidates.length} />
      {data.candidates.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          {data.candidates.map((c) => c.name).join(" · ")}
        </p>
      )}
    </div>
  );
}

export function CandidateCompareCardView({
  raceId,
  candidateSlugs,
}: {
  raceId: string;
  candidateSlugs: string[];
}) {
  const data = useQuery(api.public.getRace, { raceId });
  if (data === undefined) return <BriefSkeleton lines={6} />;
  if (data === null) return <NotFoundCard entity={`race ${raceId}`} />;
  const picked = candidateSlugs
    .slice(0, 4)
    .map((slug) => data.candidates.find((c) => c.slug === slug))
    .filter((c) => c !== undefined);
  if (picked.length === 0)
    return <NotFoundCard entity={`candidates in ${raceId}`} />;
  const cash = (slug: string) =>
    data.finance.find(
      (f) => f.candidateSlug === slug && f.cashOnHand !== undefined,
    )?.cashOnHand;
  const fmt = (n?: number) =>
    n === undefined
      ? "—"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(n);
  return (
    <section className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <h3 className="font-display text-lg">{data.race.office} — compare</h3>
      <div className="mt-3 overflow-x-auto">
        <div
          className="grid min-w-[36rem] gap-3"
          style={{ gridTemplateColumns: `repeat(${picked.length}, minmax(0, 1fr))` }}
        >
          {picked.map((c) => (
            <div key={c.slug} className="border-2 border-border p-3">
              <Link href={`/candidates/${c.slug}`} className="font-display text-base underline">
                {c.name}
              </Link>
              <div className="mt-2 flex flex-wrap gap-1">
                <PartyBadge party={c.party} />
                <StatusBadge status={c.status} />
              </div>
              {c.currentOccupation && c.currentOccupation !== "Unknown" && (
                <p className="mt-2 text-xs text-muted-foreground">{c.currentOccupation}</p>
              )}
              {c.keyPriorities && c.keyPriorities.length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-xs">
                  {c.keyPriorities.slice(0, 2).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Cash on hand
              </p>
              <p className="font-display">{fmt(cash(c.slug))}</p>
            </div>
          ))}
        </div>
      </div>
      {data.candidates.length > picked.length && (
        <Link
          href={`/races/${raceIdToSlug(raceId)}`}
          className="mt-3 inline-block border-2 border-border bg-secondary px-2 py-1 text-sm font-bold"
        >
          See full race ({data.candidates.length} candidates) →
        </Link>
      )}
    </section>
  );
}
