"use client";

import { useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { relevantRaces, type Districts } from "@/lib/districts";
import { RaceCard } from "./cards";

/** Home-page "find your ballot" section: address → districts → your races (MOO-307). */

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "found"; districts: Districts; matchedAddress?: string };

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

function MyVoteCtas() {
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {[
        ["Find your polling place", "https://myvote.wi.gov/en-us/Find-My-Polling-Place"],
        ["Request an absentee ballot", "https://myvote.wi.gov/en-us/Vote-Absentee-By-Mail"],
      ].map(([label, href]) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="border-2 border-border bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-[var(--shadow-brutal)] press"
        >
          {label} →{" "}
          <span className="font-mono text-[10px] uppercase tracking-wide">
            official · MyVote WI
          </span>
        </a>
      ))}
    </div>
  );
}

export function BallotFinder({ races }: { races: Doc<"races">[] }) {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [manual, setManual] = useState(false);
  const [picked, setPicked] = useState({ congressional: 0, senate: 0, assembly: 0 });

  const { isAuthenticated } = useConvexAuth();
  const save = useMutation(api.preferences.saveDistricts);
  const prefs = useQuery(api.preferences.getMine, {});

  // Prefill from saved preferences once, if the user hasn't searched yet.
  useEffect(() => {
    if (status.kind !== "idle" || !prefs?.congressionalDistrict) return;
    setStatus({
      kind: "found",
      matchedAddress: prefs.address,
      districts: {
        congressional: Number(prefs.congressionalDistrict),
        senate: Number(prefs.stateSenateDistrict),
        assembly: Number(prefs.stateAssemblyDistrict),
      },
    });
  }, [prefs, status.kind]);

  const applyDistricts = (districts: Districts, matchedAddress?: string) => {
    setStatus({ kind: "found", districts, matchedAddress });
    if (isAuthenticated) {
      void save({
        address: matchedAddress ?? "",
        congressionalDistrict: String(districts.congressional),
        stateSenateDistrict: String(districts.senate),
        stateAssemblyDistrict: String(districts.assembly),
      });
    }
  };

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ kind: "loading" });
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
      const data = await res.json();
      if (data.ok) {
        applyDistricts(
          { congressional: data.congressional, senate: data.senate, assembly: data.assembly },
          data.matchedAddress,
        );
      } else if (data.error === "not_wisconsin") {
        setStatus({
          kind: "error",
          message:
            "That address doesn't look like it's in Wisconsin — this guide covers Wisconsin ballots only.",
        });
      } else {
        setStatus({
          kind: "error",
          message:
            "We couldn't match that address. Check the street, city, and ZIP — or pick your districts below.",
        });
        setManual(true);
      }
    } catch {
      setStatus({
        kind: "error",
        message: "The address lookup is unavailable right now. You can pick your districts below.",
      });
      setManual(true);
    }
  };

  const matches =
    status.kind === "found" ? relevantRaces(status.districts, races) : [];
  const senateOnBallot =
    status.kind === "found" &&
    matches.some((r) => r.raceId === "WI-STATE-SENATE-2026");

  return (
    <section className="mt-8 border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)]">
      <h2 className="font-display text-2xl">What&apos;s on your ballot?</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter your Wisconsin address — we match it to your congressional and
        state legislative districts via the U.S. Census Bureau. We don&apos;t
        store it unless you&apos;re signed in.
      </p>
      <form onSubmit={lookup} className="mt-4 flex flex-wrap gap-3">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="200 E Wells St, Milwaukee, WI 53202"
          aria-label="Wisconsin street address"
          required
          minLength={5}
          className="min-w-0 flex-1 border-2 border-border bg-background px-3 py-2"
        />
        <button
          type="submit"
          disabled={status.kind === "loading"}
          className="border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground shadow-[var(--shadow-brutal)] press disabled:opacity-60"
        >
          {status.kind === "loading" ? "Looking up…" : "Find my races"}
        </button>
      </form>

      {status.kind === "error" && (
        <p role="alert" className="mt-3 border-2 border-border bg-warning p-3 text-sm font-bold">
          {status.message}
        </p>
      )}

      {manual && status.kind !== "found" && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {(
            [
              ["Congressional", "congressional", 8],
              ["State Senate", "senate", 33],
              ["Assembly", "assembly", 99],
            ] as const
          ).map(([label, key, max]) => (
            <label key={key} className="text-sm font-bold">
              {label} district
              <select
                value={picked[key] || ""}
                onChange={(e) => setPicked({ ...picked, [key]: Number(e.target.value) })}
                className="mt-1 block border-2 border-border bg-background px-2 py-1.5"
              >
                <option value="" disabled>
                  Pick…
                </option>
                {range(max).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button
            type="button"
            disabled={!picked.congressional || !picked.senate || !picked.assembly}
            onClick={() => applyDistricts(picked)}
            className="border-2 border-border bg-secondary px-3 py-1.5 font-bold shadow-[var(--shadow-brutal)] press disabled:opacity-60"
          >
            Show my races
          </button>
        </div>
      )}

      {status.kind === "found" && (
        <div className="mt-5">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {status.matchedAddress ? `${status.matchedAddress} · ` : ""}
            CD {status.districts.congressional} · Senate {status.districts.senate} ·
            Assembly {status.districts.assembly}
          </p>
          {!senateOnBallot && (
            <p className="mt-2 text-sm text-muted-foreground">
              Your state senate seat (District {status.districts.senate}) isn&apos;t up
              for election in 2026 — even-numbered senate districts vote in 2028.
            </p>
          )}
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((race) => (
              <RaceCard key={race.raceId} race={race} />
            ))}
          </div>
          <MyVoteCtas />
        </div>
      )}
    </section>
  );
}
