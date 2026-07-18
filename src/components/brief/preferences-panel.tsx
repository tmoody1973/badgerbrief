"use client";

import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { relevantRaces, type Districts } from "@/lib/districts";
import { BallotFinder } from "@/components/guide/ballot-finder";

const DETAIL_LEVELS = [
  ["short", "Short — the essentials"],
  ["standard", "Standard — races + comparisons"],
  ["deep", "Deep — quotes and money too"],
] as const;

/** MOO-311 preferences: address→districts (BallotFinder), starred races, issues, detail level. */
export function PreferencesPanel() {
  // Repo convention (review-queue.tsx, store-user.tsx): gate on useConvexAuth,
  // not Clerk's <SignedIn> — this panel is only meaningful for signed-in users.
  const { isAuthenticated } = useConvexAuth();
  const prefs = useQuery(api.preferences.getMine, {});
  const races = useQuery(api.public.listRaces, {});
  const issueSlugs = useQuery(api.public.listIssueSlugs, {});
  const savePrefs = useMutation(api.preferences.savePrefs);
  const generate = useMutation(api.briefs.generate);
  const [generateError, setGenerateError] = useState<string | null>(null);

  if (!isAuthenticated || prefs === undefined || races === undefined) return null;

  const districts: Districts | null = prefs?.congressionalDistrict
    ? {
        congressional: Number(prefs.congressionalDistrict),
        senate: Number(prefs.stateSenateDistrict),
        assembly: Number(prefs.stateAssemblyDistrict),
      }
    : null;
  const ballot = districts ? relevantRaces(districts, races) : [];
  const saved = {
    savedRaceIds: prefs?.savedRaceIds ?? [],
    savedIssues: prefs?.savedIssues ?? [],
    detailLevel: prefs?.detailLevel ?? ("standard" as const),
  };
  const patch = (partial: Partial<typeof saved>) => void savePrefs({ ...saved, ...partial });
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  return (
    <section className="mb-8 border-2 border-border bg-card p-6 shadow-[var(--shadow-brutal)] print:hidden">
      <h2 className="font-display text-2xl">Your brief, your ballot</h2>
      {!districts && <BallotFinder races={races} />}
      {districts && (
        <>
          <p className="mt-1 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
            CD {districts.congressional} · Senate {districts.senate} · Assembly {districts.assembly}
            {prefs?.address ? ` · ${prefs.address}` : ""}
          </p>
          <fieldset className="mt-4">
            <legend className="text-sm font-bold">Star the races you care about most</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {ballot.map((race) => (
                <label key={race.raceId} className="flex items-center gap-1.5 border-2 border-border bg-background px-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={saved.savedRaceIds.includes(race.raceId)}
                    onChange={() => patch({ savedRaceIds: toggle(saved.savedRaceIds, race.raceId) })}
                  />
                  {race.office}
                </label>
              ))}
            </div>
          </fieldset>
          {issueSlugs && issueSlugs.length > 0 && (
            <fieldset className="mt-4">
              <legend className="text-sm font-bold">Issues to highlight</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {issueSlugs.map((slug) => (
                  <label key={slug} className="flex items-center gap-1.5 border-2 border-border bg-background px-2 py-1 text-sm capitalize">
                    <input
                      type="checkbox"
                      checked={saved.savedIssues.includes(slug)}
                      onChange={() => patch({ savedIssues: toggle(saved.savedIssues, slug) })}
                    />
                    {slug.replace(/-/g, " ")}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset className="mt-4">
            <legend className="text-sm font-bold">Detail level</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {DETAIL_LEVELS.map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5 border-2 border-border bg-background px-2 py-1 text-sm">
                  <input
                    type="radio"
                    name="detailLevel"
                    checked={saved.detailLevel === value}
                    onChange={() => patch({ detailLevel: value })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            onClick={() => {
              setGenerateError(null);
              void generate({}).catch(() =>
                setGenerateError("Couldn't start your brief — try again."),
              );
            }}
            className="mt-5 border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground shadow-[var(--shadow-brutal)] press"
          >
            Generate my brief
          </button>
          {generateError && (
            <p role="alert" className="mt-3 border-2 border-border bg-warning p-3 text-sm font-bold">
              {generateError}
            </p>
          )}
        </>
      )}
    </section>
  );
}
