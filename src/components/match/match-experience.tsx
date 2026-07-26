"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { buildIssueMatch, type RaceInput } from "@/lib/issue-match";
import { IssuePicker } from "./issue-picker";
import { MatchResults } from "./match-results";

type RaceMeta = { raceId: string; office: string; level: string };
const STATEWIDE = new Set(["State Executive", "State Judicial"]);

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

  // Statewide races are on every ballot; ordered statewide-first (they're the only
  // ones here until Task 5 adds district races).
  const activeRaceIds = useMemo(
    () => raceMeta.filter((r) => STATEWIDE.has(r.level)).map((r) => r.raceId),
    [raceMeta],
  );

  const data = useQuery(
    api.public.positionsForRaces,
    selected.length > 0 ? { raceIds: activeRaceIds } : "skip",
  );

  const result = useMemo(() => {
    if (!data) return null;
    return buildIssueMatch(data as RaceInput[], selected);
  }, [data, selected]);

  return (
    <>
      <IssuePicker selected={selected} onToggle={toggle} />

      {selected.length === 0 ? (
        <p className="mt-8 border-2 border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          Pick one or more issues above to see where candidates stand.
        </p>
      ) : result === null ? (
        <p className="mt-8 font-mono text-xs text-muted-foreground">Finding positions…</p>
      ) : result.totalOnRecord === 0 ? (
        <p className="mt-8 border-2 border-border bg-warning p-4 text-sm font-bold">
          None of the statewide candidates have a sourced position on{" "}
          {selected.length > 1 ? "these issues" : "this issue"} on record yet. We only show
          positions we can link to a source.
        </p>
      ) : (
        <MatchResults groups={result.groups} />
      )}
    </>
  );
}
