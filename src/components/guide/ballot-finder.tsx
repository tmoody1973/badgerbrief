"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { relevantRaces, type Districts } from "@/lib/districts";
import { localeFromPath } from "@/lib/i18n/chrome-dict";
import { ballotFinderDict, type BallotFinderDict } from "@/lib/i18n/ballot-finder-dict";
import { RaceCard } from "./cards";

/** Home-page "find your ballot" section: address → districts → your races (MOO-307). */

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "found"; districts: Districts; matchedAddress?: string };

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

function MyVoteCtas({ dict }: { dict: BallotFinderDict }) {
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {[
        [dict.myVotePolling, "https://myvote.wi.gov/en-us/Find-My-Polling-Place"],
        [dict.myVoteAbsentee, "https://myvote.wi.gov/en-us/Vote-Absentee-By-Mail"],
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
            {dict.officialTag}
          </span>
        </a>
      ))}
    </div>
  );
}

export function BallotFinder({ races }: { races: Doc<"races">[] }) {
  const dict = ballotFinderDict(localeFromPath(usePathname()));
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
        track("ballot_lookup", { status: "ok" }); // status only — never the address
        applyDistricts(
          { congressional: data.congressional, senate: data.senate, assembly: data.assembly },
          data.matchedAddress,
        );
      } else if (data.error === "not_wisconsin") {
        track("ballot_lookup", { status: "no_match" });
        setStatus({ kind: "error", message: dict.errNotWisconsin });
      } else {
        track("ballot_lookup", { status: "no_match" });
        setStatus({ kind: "error", message: dict.errNoMatch });
        setManual(true);
      }
    } catch {
      track("ballot_lookup", { status: "error" });
      setStatus({ kind: "error", message: dict.errUnavailable });
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
      <h2 className="font-display text-2xl">{dict.heading}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{dict.instructions}</p>
      <form onSubmit={lookup} className="mt-4 flex flex-wrap gap-3">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={dict.placeholder}
          aria-label={dict.addressAria}
          required
          minLength={5}
          className="min-w-0 flex-1 border-2 border-border bg-background px-3 py-2"
        />
        <button
          type="submit"
          disabled={status.kind === "loading"}
          className="border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground shadow-[var(--shadow-brutal)] press disabled:opacity-60"
        >
          {status.kind === "loading" ? dict.looking : dict.findRaces}
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
              [dict.manualCongressional, "congressional", 8],
              [dict.manualSenate, "senate", 33],
              [dict.manualAssembly, "assembly", 99],
            ] as const
          ).map(([label, key, max]) => (
            <label key={key} className="text-sm font-bold">
              {label}
              <select
                value={picked[key] || ""}
                onChange={(e) => setPicked({ ...picked, [key]: Number(e.target.value) })}
                className="mt-1 block border-2 border-border bg-background px-2 py-1.5"
              >
                <option value="" disabled>
                  {dict.pick}
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
            {dict.showRaces}
          </button>
        </div>
      )}

      {status.kind === "found" && (
        <div className="mt-5">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {status.matchedAddress ? `${status.matchedAddress} · ` : ""}
            {dict.foundLine(status.districts)}
          </p>
          {!senateOnBallot && (
            <p className="mt-2 text-sm text-muted-foreground">
              {dict.senateNotUp(status.districts.senate)}
            </p>
          )}
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((race) => (
              <RaceCard key={race.raceId} race={race} />
            ))}
          </div>
          <MyVoteCtas dict={dict} />
        </div>
      )}
    </section>
  );
}
