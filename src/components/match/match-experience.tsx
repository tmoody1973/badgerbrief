"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { buildIssueMatch, type RaceInput } from "@/lib/issue-match";
import { relevantRaces, type Districts } from "@/lib/districts";
import { labelForSlug } from "@/lib/candidate-order";
import { BallotControl } from "./ballot-control";
import { IssuePicker } from "./issue-picker";
import { MatchResults } from "./match-results";

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
      router.replace(q ? `${pathname}?issues=${encodeURIComponent(q)}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const toggle = useCallback(
    (slug: string) =>
      setSelected(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]),
    [selected, setSelected],
  );

  const [districts, setDistricts] = useState<Districts | null>(null);

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

  // Every selected issue gets a line, even with zero coverage — never implied
  // by omission. buildIssueMatch only returns groups with coverage, so refill
  // the gaps here in selection order rather than changing its contract.
  const ordered = useMemo(() => {
    if (!result) return [];
    const bySlug = new Map(result.groups.map((g) => [g.issueSlug, g]));
    return selected.map(
      (slug) => bySlug.get(slug) ?? { issueSlug: slug, label: labelForSlug(slug), races: [] },
    );
  }, [result, selected]);

  return (
    <>
      <IssuePicker selected={selected} onToggle={toggle} />
      <BallotControl onFound={(d) => setDistricts(d)} />

      {selected.length === 0 ? (
        <p className="mt-8 border-2 border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          Pick one or more issues above to see where candidates stand.
        </p>
      ) : result === null ? (
        <p className="mt-8 font-mono text-xs text-muted-foreground">Finding positions…</p>
      ) : (
        <MatchResults groups={ordered} />
      )}
    </>
  );
}
