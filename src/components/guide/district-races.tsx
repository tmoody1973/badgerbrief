import Link from "next/link";
import { raceIdToSlug } from "@/lib/site";

/**
 * Compact browser for the 116 state legislative district races.
 *
 * WHY NOT CARDS. Every other level renders as RaceCards, and that is right for
 * them — 14 heterogeneous statewide and congressional races a voter might
 * genuinely browse. The legislature is a different shape: 116 near-identical
 * rows, of which exactly TWO are on any given voter's ballot. Rendering them as
 * cards costs ~39 rows of grid and buries the rest of the page, and folding is
 * the documented remedy precisely because the content is repetitive.
 *
 * The real entry point is the address lookup above this section, which resolves
 * a voter straight to their own two districts. This list is the fallback for
 * someone who already knows their district number, or who wants to see the
 * whole field — so it is dense, numeric, and closed by default.
 *
 * Built on <details> deliberately: every link stays in the DOM when collapsed,
 * so crawlers still reach all 116 race pages, and it needs no JavaScript.
 */
type DistrictRace = {
  raceId: string;
  office: string;
  incumbent?: string | null;
};

const districtNumber = (raceId: string): number => {
  const m = /-D(\d+)-\d{4}$/.exec(raceId);
  return m ? Number(m[1]) : 0;
};

function Chamber({
  label,
  blurb,
  races,
}: {
  label: string;
  blurb: string;
  races: DistrictRace[];
}) {
  if (races.length === 0) return null;
  const sorted = [...races].sort(
    (a, b) => districtNumber(a.raceId) - districtNumber(b.raceId),
  );
  return (
    <details className="mt-3 border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
      <summary className="cursor-pointer px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.1em]">
        {label}{" "}
        <span className="font-normal text-muted-foreground">
          · {sorted.length} districts
        </span>
      </summary>
      <div className="border-t-2 border-dashed border-border px-4 py-3">
        <p className="max-w-[60ch] text-sm text-muted-foreground">{blurb}</p>
        <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
          {sorted.map((race) => (
            <li key={race.raceId}>
              <Link
                href={`/races/${raceIdToSlug(race.raceId)}`}
                className="flex h-full flex-col border-2 border-border bg-card px-2 py-1.5 hover:bg-secondary/40"
              >
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em]">
                  District {districtNumber(race.raceId)}
                </span>
                {/* The incumbent's name is the only thing that makes one of 99
                    identical rows recognisable to a voter who knows their rep
                    but not their district number. */}
                <span className="mt-0.5 truncate text-xs text-muted-foreground">
                  {race.incumbent ? race.incumbent : "Open seat"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

export function DistrictRaces({ races }: { races: DistrictRace[] }) {
  const senate = races.filter((r) => r.raceId.includes("SENATE"));
  const assembly = races.filter((r) => r.raceId.includes("ASSEMBLY"));
  return (
    <div className="mt-2">
      <p className="max-w-[60ch] text-sm text-muted-foreground">
        You vote in one Senate district and one Assembly district. Enter your
        address above to jump straight to yours, or browse by number.
      </p>
      <Chamber
        label="State Senate"
        blurb="Only odd-numbered districts are on the 2026 ballot — senators serve four-year terms, so half the chamber is up each cycle."
        races={senate}
      />
      <Chamber
        label="State Assembly"
        blurb="All 99 Assembly seats are on the ballot every two years."
        races={assembly}
      />
    </div>
  );
}
