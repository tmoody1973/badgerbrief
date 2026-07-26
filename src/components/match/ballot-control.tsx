"use client";

import { useState } from "react";
import type { Districts, GeocodeResult } from "@/lib/districts";

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export function BallotControl({
  onFound,
}: {
  onFound: (districts: Districts, matchedAddress?: string) => void;
}) {
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [picked, setPicked] = useState({ congressional: 0, senate: 0, assembly: 0 });

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
      const data: GeocodeResult = await res.json();
      if (data.ok) {
        onFound(
          { congressional: data.congressional, senate: data.senate, assembly: data.assembly },
          data.matchedAddress,
        );
      } else {
        setError(
          data.error === "not_wisconsin"
            ? "That address isn't in Wisconsin."
            : "Couldn't match that address — pick your districts below.",
        );
        setManual(true);
      }
    } catch {
      setError("Address lookup is unavailable — pick your districts below.");
      setManual(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)]">
      <h2 className="font-display text-lg">Add your local races</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Optional — your address adds your U.S. House and legislative races. We never store it.
      </p>
      <form onSubmit={lookup} className="mt-3 flex flex-wrap gap-3">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="123 Main St, Milwaukee, WI"
          aria-label="Your address"
          required
          minLength={5}
          className="min-w-0 flex-1 border-2 border-border bg-background px-3 py-2"
        />
        <button
          type="submit"
          disabled={busy}
          className="press border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground shadow-[var(--shadow-brutal)] disabled:opacity-60"
        >
          {busy ? "Looking…" : "Add my races"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 border-2 border-border bg-warning p-3 text-sm font-bold">
          {error}
        </p>
      )}

      {manual && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {(
            [
              ["U.S. House", "congressional", 8],
              ["State Senate", "senate", 33],
              ["Assembly", "assembly", 99],
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
          <button
            type="button"
            disabled={!picked.congressional || !picked.senate || !picked.assembly}
            onClick={() => onFound(picked)}
            className="press border-2 border-border bg-secondary px-3 py-1.5 font-bold shadow-[var(--shadow-brutal)] disabled:opacity-60"
          >
            Show my races
          </button>
        </div>
      )}
    </section>
  );
}
