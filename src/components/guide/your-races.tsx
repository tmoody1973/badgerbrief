// src/components/guide/your-races.tsx
"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
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
  const prefs = useQuery(api.preferences.getMine, {});
  const [entered, setEntered] = useState<Districts | null>(null);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const districts: Districts | null =
    entered ??
    (prefs?.congressionalDistrict
      ? {
          congressional: Number(prefs.congressionalDistrict),
          senate: Number(prefs.stateSenateDistrict),
          assembly: Number(prefs.stateAssemblyDistrict),
        }
      : null);

  const mine = districts ? pick(races, districts) : [];

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
      const data = await res.json();
      if (data.ok) {
        setEntered({ congressional: data.congressional, senate: data.senate, assembly: data.assembly });
      } else {
        setError("We couldn't match that address. Try the street, city, and ZIP.");
      }
    } catch {
      setError("Address lookup is unavailable right now.");
    } finally {
      setLoading(false);
    }
  };

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
        Enter your address to highlight the races on your ballot. We only use it to look up your
        districts — we never store the address for anonymous visitors.
      </p>
      <form onSubmit={lookup} className="mt-3 flex flex-wrap gap-2">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="123 Main St, Madison, WI"
          className="min-w-0 flex-1 border-2 border-border bg-background px-3 py-2"
          aria-label="Your address"
        />
        <button type="submit" className="press border-2 border-border bg-secondary px-4 py-2 font-bold shadow-[var(--shadow-brutal)]">
          {loading ? "Looking up…" : "Find my races"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {districts && mine.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">No tracked ads in your races yet.</p>
      )}
    </section>
  );
}
