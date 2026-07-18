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

/**
 * Filter seeded races to the user's ballot. Statewide (executive/judicial)
 * always apply; U.S. House by raceId district; senate only when the user's
 * district is among those up this cycle (odd districts in 2026); assembly
 * covers all 99 districts every cycle.
 */
export function relevantRaces<R extends RaceLike>(districts: Districts, races: R[]): R[] {
  return races.filter((race) => {
    if (race.level === "State Executive" || race.level === "State Judicial") return true;
    if (race.level === "Federal") {
      return race.raceId === `WI-US-HOUSE-D${districts.congressional}-2026`;
    }
    if (race.level === "State Legislative") {
      const up = (race.districts ?? []).some(
        (d) =>
          d.district ===
          (race.raceId.includes("SENATE") ? districts.senate : districts.assembly),
      );
      return up;
    }
    return false;
  });
}
