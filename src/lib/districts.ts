/**
 * Address → ballot relevance (MOO-307, spec §4).
 * Pure parsing/filtering over Census geocoder responses; no fetching here.
 */

const WISCONSIN_FIPS = "55";

export type Districts = {
  congressional: number;
  senate: number;
  assembly: number;
};

export type GeocodeResult =
  | ({ ok: true; matchedAddress: string } & Districts)
  | { ok: false; error: "no_match" | "not_wisconsin" };

type GeographyEntry = { NAME?: string; BASENAME?: string; STATE?: string };
type AddressMatch = {
  matchedAddress?: string;
  geographies?: Record<string, GeographyEntry[]>;
};

const layerNumber = (
  geographies: Record<string, GeographyEntry[]>,
  suffix: string,
): number | undefined => {
  // Layer names carry a vintage prefix ("119th Congressional Districts",
  // "2024 State Legislative Districts - Upper") — match by suffix.
  const entry = Object.entries(geographies).find(([k]) => k.endsWith(suffix))?.[1]?.[0];
  const n = Number(entry?.BASENAME);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export function parseGeocoderResponse(payload: unknown): GeocodeResult {
  const match = (payload as { result?: { addressMatches?: AddressMatch[] } })?.result
    ?.addressMatches?.[0];
  const geographies = match?.geographies;
  if (!match || !geographies) return { ok: false, error: "no_match" };

  const stateFips = Object.values(geographies)
    .flat()
    .find((e) => e.STATE)?.STATE;
  if (stateFips !== WISCONSIN_FIPS) return { ok: false, error: "not_wisconsin" };

  const congressional = layerNumber(geographies, "Congressional Districts");
  const senate = layerNumber(geographies, "State Legislative Districts - Upper");
  const assembly = layerNumber(geographies, "State Legislative Districts - Lower");
  if (!congressional || !senate || !assembly) return { ok: false, error: "no_match" };

  return {
    ok: true,
    matchedAddress: match.matchedAddress ?? "",
    congressional,
    senate,
    assembly,
  };
}

type RaceLike = {
  raceId: string;
  level: string;
  districts?: { district?: number }[] | null;
};

/** "WI-STATE-SENATE-D7-2026" -> 7. Null for the old chamber-wide races. */
const raceDistrict = (raceId: string): number | null => {
  const m = /-D(\d+)-\d{4}$/.exec(raceId);
  return m ? Number(m[1]) : null;
};

/**
 * Filter seeded races to the user's ballot. Statewide (executive/judicial)
 * always apply; U.S. House by raceId district; senate only when the user's
 * district is among those up this cycle (odd districts in 2026); assembly
 * covers all 99 districts every cycle.
 *
 * State legislative races are now ONE RACE PER DISTRICT, with the district in
 * the raceId. The chamber-wide rows that preceded them carried their districts
 * in a `districts` blob instead, so both shapes are matched: a deployment where
 * the per-district races exist but the old rows have not yet been removed would
 * otherwise show a voter their assembly race twice, and reading only the blob
 * matches none of the new races at all.
 */
export function relevantRaces<R extends RaceLike>(districts: Districts, races: R[]): R[] {
  const perDistrict = new Set(
    races
      .filter((r) => r.level === "State Legislative" && raceDistrict(r.raceId) !== null)
      .map((r) => (r.raceId.includes("SENATE") ? "SENATE" : "ASSEMBLY")),
  );

  return races.filter((race) => {
    if (race.level === "State Executive" || race.level === "State Judicial") return true;
    if (race.level === "Federal") {
      return race.raceId === `WI-US-HOUSE-D${districts.congressional}-2026`;
    }
    if (race.level === "State Legislative") {
      const chamber = race.raceId.includes("SENATE") ? "SENATE" : "ASSEMBLY";
      const want = chamber === "SENATE" ? districts.senate : districts.assembly;
      const mine = raceDistrict(race.raceId);
      if (mine !== null) return mine === want;
      // A chamber-wide row: only still relevant while no per-district race
      // exists for that chamber, otherwise it duplicates the real one.
      if (perDistrict.has(chamber)) return false;
      return (race.districts ?? []).some((d) => d.district === want);
    }
    return false;
  });
}
