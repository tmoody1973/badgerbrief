// src/components/guide/your-races.tsx
"use client";

import Link from "next/link";
import { useMyDistricts } from "@/lib/my-districts";
import { relevantRaces, type Districts } from "@/lib/districts";
import { RaceMoneyCard } from "@/components/guide/ads-overview";
import type { getAdMoneyOverview } from "@/lib/data";

type RaceCard = Awaited<ReturnType<typeof getAdMoneyOverview>>["races"][number];

/** Filter the overview's race cards to the viewer's ballot: statewide + their
 * US House, State Senate, and State Assembly races (MOO-349). Leg-district
 * matching uses the district numbers now carried on each card. */
export function pick(races: RaceCard[], districts: Districts): RaceCard[] {
  const likes = races.map((r) => ({
    raceId: r.raceId,
    level: r.level,
    districts: r.districts,
  }));
  const keep = new Set(relevantRaces(districts, likes).map((r) => r.raceId));
  return races.filter((r) => keep.has(r.raceId));
}

export function YourRaces({ races }: { races: RaceCard[] }) {
  // From My Ballot, the one address lookup on the site.
  const districts = useMyDistricts();

  const mine = districts ? pick(races, districts) : [];

  if (districts && mine.length > 0) {
    return (
      <section className="mt-8">
        <h2 className="font-display text-2xl">Ad money in your races</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Statewide offices are on every Wisconsin ballot; the rest are matched
          to your districts.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mine.map((r) => (
            <RaceMoneyCard key={r.raceId} race={r} />
          ))}
        </div>
      </section>
    );
  }

  // No districts (or none of your races have tracked ads) → prompt, never blocks the statewide view.
  return (
    <section className="mt-8 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <h2 className="font-display text-xl">See the ad money in your races</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        <Link href="/ballot" className="font-bold text-foreground underline decoration-2 underline-offset-2">
          Find my ballot first
        </Link>{" "}
        to highlight the races on your ballot. My Ballot looks up your districts once and remembers them on this device.
      </p>
      {districts && mine.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">No tracked ads in your races yet.</p>
      )}
    </section>
  );
}
