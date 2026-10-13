"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import type { Districts, GeocodeResult } from "@/lib/districts";

/**
 * The site's address lookup. The address goes to the lookup in the request
 * body and comes back as districts; it is never put in a web address and never
 * kept in this component once the answer arrives.
 */

type Status = { kind: "idle" } | { kind: "looking" } | { kind: "problem"; message: string };

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const FIELD = `min-h-11 border-2 border-border bg-card px-3 py-2 ${FOCUS}`;
const LINK = `font-bold underline decoration-2 underline-offset-2 ${FOCUS}`;

const PROBLEM = {
  no_match: "We couldn’t match that address. Pick your districts below.",
  not_wisconsin: "That address isn’t in Wisconsin. This guide covers Wisconsin ballots only.",
  rate_limited: "Too many lookups from this connection. Wait a few minutes, or pick your districts below.",
  upstream: "The address lookup isn’t answering. Pick your districts below, or use MyVote.",
} as const;

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

const DISTRICT_PICKS = [
  ["U.S. House district", "congressional", 8],
  ["State Senate district", "senate", 33],
  ["Assembly district", "assembly", 99],
] as const;

export function BallotLookup({
  counties,
  onFound,
}: {
  counties: readonly { key: string; name: string }[];
  onFound: (districts: Districts, matchedAddress?: string) => void;
}) {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [byHand, setByHand] = useState(false);
  const [picked, setPicked] = useState({ congressional: 0, senate: 0, assembly: 0, county: "" });

  const fail = (error: keyof typeof PROBLEM) => {
    setStatus({ kind: "problem", message: PROBLEM[error] });
    if (error !== "not_wisconsin") setByHand(true);
  };

  const lookup = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus({ kind: "looking" });
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const result = (await res.json()) as GeocodeResult;
      if (result.ok) {
        track("ballot_lookup", { status: "ok" }); // status only, never the address or the districts
        setAddress("");
        setStatus({ kind: "idle" });
        onFound(
          { congressional: result.congressional, senate: result.senate, assembly: result.assembly, ...(result.county ? { county: result.county } : {}) },
          result.matchedAddress,
        );
        return;
      }
      track("ballot_lookup", { status: result.error === "upstream" || result.error === "rate_limited" ? "error" : "no_match" });
      fail(result.error);
    } catch {
      track("ballot_lookup", { status: "error" });
      fail("upstream");
    }
  };

  const ready = picked.congressional > 0 && picked.senate > 0 && picked.assembly > 0;

  return (
    <div>
      <form onSubmit={lookup} className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 basis-64 text-sm font-bold">
          Your Wisconsin address
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="200 E Wells St, Milwaukee"
            autoComplete="street-address"
            required
            minLength={5}
            maxLength={200}
            className={`mt-1 block w-full font-normal ${FIELD}`}
          />
        </label>
        <button
          type="submit"
          disabled={status.kind === "looking"}
          className={`press min-h-11 border-2 border-border bg-primary px-4 font-bold text-primary-foreground shadow-[var(--shadow-brutal)] disabled:opacity-60 ${FOCUS}`}
        >
          Show my ballot
        </button>
      </form>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Your address goes to the U.S. Census Bureau’s address lookup and comes back as districts. It is never put in a link, and BadgerBrief
        doesn’t keep it unless you’re signed in.
      </p>

      <div aria-live="polite" className="mt-3">
        {status.kind === "looking" && <p className="font-bold">Finding your districts…</p>}
        {status.kind === "problem" && <p className="border-2 border-border bg-warning p-3 font-bold">{status.message}</p>}
      </div>

      {byHand ? (
        <fieldset className="mt-4 border-t-2 border-dashed border-border pt-4">
          <legend className="font-bold">Pick your districts</legend>
          <p className="mt-1 max-w-2xl text-sm">
            Your district numbers are on your voter record at{" "}
            <a href="https://myvote.wi.gov/en-us/My-Voter-Info" target="_blank" rel="noopener noreferrer" className={LINK}>
              MyVote Wisconsin
            </a>
            .
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            {DISTRICT_PICKS.map(([label, key, max]) => (
              <label key={key} className="text-sm font-bold">
                {label}
                <select value={picked[key] || ""} onChange={(event) => setPicked({ ...picked, [key]: Number(event.target.value) })} className={`mt-1 block ${FIELD}`}>
                  <option value="" disabled>
                    Pick
                  </option>
                  {range(max).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {counties.length > 0 && (
              <label className="text-sm font-bold">
                County
                <select value={picked.county} onChange={(event) => setPicked({ ...picked, county: event.target.value })} className={`mt-1 block ${FIELD}`}>
                  <option value="">Not sure</option>
                  {counties.map((county) => (
                    <option key={county.key} value={county.key}>
                      {county.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              disabled={!ready}
              onClick={() =>
                onFound({ congressional: picked.congressional, senate: picked.senate, assembly: picked.assembly, ...(picked.county ? { county: picked.county } : {}) })
              }
              className={`press min-h-11 border-2 border-border bg-secondary px-4 font-bold shadow-[var(--shadow-brutal)] disabled:opacity-60 ${FOCUS}`}
            >
              Show this ballot
            </button>
          </div>
        </fieldset>
      ) : (
        <p className="mt-3 text-sm">
          <button type="button" onClick={() => setByHand(true)} className={`min-h-11 ${LINK}`}>
            Pick your districts by hand instead
          </button>
        </p>
      )}
    </div>
  );
}
