"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { track } from "@/lib/analytics";
import { SITE_URL } from "@/lib/site";
import { buildIssueMatch, type RaceInput } from "@/lib/issue-match";
import { relevantRaces, type Districts } from "@/lib/districts";
import { useMyDistricts } from "@/lib/my-districts";
import { IssuePicker } from "./issue-picker";
import { MatchResults } from "./match-results";
import { ShareButton } from "@/components/contribute/share-button";

type RaceMeta = { raceId: string; office: string; level: string };
const STATEWIDE = new Set(["State Executive", "State Judicial"]);
// ponytail: local rank, not home-races LEVEL_ORDER — that order interleaves
// Federal between the two statewide levels, which isn't "statewide-first".
const levelRank = (level: string) => (STATEWIDE.has(level) ? 0 : 1);

export function MatchExperience({ raceMeta }: { raceMeta: RaceMeta[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const selected = useMemo(
    () => (params.get("issues") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    [params],
  );

  const setSelected = useCallback(
    (next: string[]) => {
      const q = next.join(",");
      const sp = new URLSearchParams(params.toString());
      if (q) sp.set("issues", q);
      else sp.delete("issues");
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, params],
  );

  const toggle = useCallback(
    (slug: string) => {
      const adding = !selected.includes(slug);
      // First pick from an empty state = the voter starting the match tool.
      // Deep-link arrivals (?issues=…) skip this but still count as complete.
      if (adding && selected.length === 0) track("match_start");
      setSelected(adding ? [...selected, slug] : selected.filter((s) => s !== slug));
    },
    [selected, setSelected],
  );

  // From My Ballot, the one address lookup on the site.
  const districts = useMyDistricts();

  // Statewide always; when the voter adds an address, relevantRaces returns
  // their full personalized set (statewide + U.S. House + legislative).
  // Sorted statewide-first below since relevantRaces doesn't guarantee order.
  const activeRaceIds = useMemo(() => {
    const chosen = districts
      ? relevantRaces(districts, raceMeta as { raceId: string; level: string; districts?: { district?: number }[] | null }[])
      : raceMeta.filter((r) => STATEWIDE.has(r.level));
    return [...chosen].sort((a, b) => levelRank(a.level) - levelRank(b.level)).map((r) => r.raceId);
  }, [districts, raceMeta]);

  const data = useQuery(
    api.public.positionsForRaces,
    selected.length > 0 ? { raceIds: activeRaceIds } : "skip",
  );

  const result = useMemo(() => {
    if (!data) return null;
    return buildIssueMatch(data as RaceInput[], selected);
  }, [data, selected]);

  // Fire once when a real match result first renders — the "complete" half of
  // the start→complete funnel. answered = how many issues the voter weighed.
  const completed = useRef(false);
  useEffect(() => {
    if (result && selected.length > 0 && !completed.current) {
      completed.current = true;
      track("match_complete", { answered: selected.length });
    }
  }, [result, selected.length]);

  return (
    <>
      <IssuePicker selected={selected} onToggle={toggle} />
      <p className="mt-6 border-2 border-border bg-card p-4 text-sm shadow-[var(--shadow-brutal)]">
        {districts ? (
          <>
            Showing statewide races plus your U.S. House and legislative races, from{" "}
            <Link href="/ballot" className="font-bold underline decoration-2 underline-offset-2">
              My Ballot
            </Link>
            .
          </>
        ) : (
          <>
            Statewide races only.{" "}
            <Link href="/ballot" className="font-bold underline decoration-2 underline-offset-2">
              Find my ballot first
            </Link>{" "}
            to add your U.S. House and legislative races.
          </>
        )}
      </p>

      {selected.length === 0 ? (
        <p className="mt-8 border-2 border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          Pick one or more issues above to see where candidates stand.
        </p>
      ) : result === null ? (
        <p className="mt-8 font-mono text-xs text-muted-foreground">Finding positions…</p>
      ) : (
        <>
          <MatchResults groups={result.groups} guide={params.get("guide")} />
          {result.uncovered.length > 0 && (
            <section className="mt-10 border-2 border-dashed border-border bg-card p-6">
              <h2 className="font-display text-2xl">
                Also on your ballot — no published position on these issues
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                These races are on your ballot. We have no sourced position on the issues you picked for
                their candidates, so they can’t appear in the match above. See each candidate’s page for
                background, finance, and coverage.
              </p>
              <div className="mt-4 space-y-4">
                {result.uncovered.map((race) => (
                  <div key={race.raceId}>
                    <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      {race.office}
                    </h3>
                    <p className="mt-1 text-sm">
                      {race.candidates.map((c, i) => (
                        <span key={c.slug}>
                          {i > 0 ? ", " : ""}
                          <Link href={`/candidates/${c.slug}`} className="underline decoration-2 underline-offset-2">
                            {c.name}
                          </Link>
                        </span>
                      ))}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {/* Share the personalized match so a recipient lands on the same
              issues (the ?issues=… state lives in the URL). */}
          <div className="mt-10">
            <p className="mb-3 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Share this match
            </p>
            <ShareButton
              url={`${SITE_URL}${pathname}${params.toString() ? `?${params.toString()}` : ""}`}
              title="See where Wisconsin candidates stand on the issues I care about — BadgerBrief"
            />
          </div>
        </>
      )}
    </>
  );
}
