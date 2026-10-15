// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  hasStateSenateRace,
  parseGeocoderResponse,
  relevantRaces,
} from "./districts";
import mke from "./__fixtures__/census-mke.json";
import madison from "./__fixtures__/census-madison.json";
import medford from "./__fixtures__/census-medford.json";
import nomatch from "./__fixtures__/census-nomatch.json";
import mkeCounty from "./__fixtures__/census-mke-county.json";

// Fixtures are real Census geocoder responses captured 2026-07-18 (trimmed to
// the layers we parse). Expected districts verified against the live API.

describe("parseGeocoderResponse", () => {
  it("parses Milwaukee city hall → CD 4, SD 7, AD 19", () => {
    expect(parseGeocoderResponse(mke)).toEqual({
      ok: true,
      matchedAddress: "200 E WELLS ST, MILWAUKEE, WI, 53202",
      congressional: 4,
      senate: 7,
      assembly: 19,
    });
  });

  it("parses Madison → CD 2, SD 26, AD 76", () => {
    const r = parseGeocoderResponse(madison);
    expect(r).toMatchObject({ ok: true, congressional: 2, senate: 26, assembly: 76 });
  });

  it("parses rural Medford → CD 7, SD 23, AD 69", () => {
    const r = parseGeocoderResponse(medford);
    expect(r).toMatchObject({ ok: true, congressional: 7, senate: 23, assembly: 69 });
  });

  it("returns no_match for nonsense input", () => {
    expect(parseGeocoderResponse(nomatch)).toEqual({ ok: false, error: "no_match" });
  });

  it("rejects a non-Wisconsin match", () => {
    const il = JSON.parse(JSON.stringify(mke));
    for (const layer of Object.values(
      il.result.addressMatches[0].geographies,
    ) as { STATE?: string }[][]) {
      for (const entry of layer) if (entry.STATE) entry.STATE = "17";
    }
    expect(parseGeocoderResponse(il)).toEqual({ ok: false, error: "not_wisconsin" });
  });

  it("returns no_match for a malformed payload", () => {
    expect(parseGeocoderResponse({})).toEqual({ ok: false, error: "no_match" });
  });

  it("reads the voter's county when the response carries one", () => {
    expect(parseGeocoderResponse(mkeCounty)).toEqual({
      ok: true,
      matchedAddress: "200 E WELLS ST, MILWAUKEE, WI, 53202",
      congressional: 4,
      senate: 7,
      assembly: 19,
      county: "milwaukee",
    });
  });

  it("still succeeds when the response has no county layer", () => {
    const result = parseGeocoderResponse(mke);
    expect(result).toMatchObject({ ok: true, congressional: 4, senate: 7, assembly: 19 });
    expect(result).not.toHaveProperty("county");
  });

  it("makes a link-safe key from a county name with a period and a space", () => {
    const stCroix = {
      result: {
        addressMatches: [
          {
            ...mkeCounty.result.addressMatches[0],
            geographies: {
              ...mkeCounty.result.addressMatches[0].geographies,
              Counties: [{ BASENAME: "St. Croix", NAME: "St. Croix County", STATE: "55" }],
            },
          },
        ],
      },
    };
    expect(parseGeocoderResponse(stCroix)).toMatchObject({ ok: true, county: "st-croix" });
  });
});

const RACES = [
  { raceId: "WI-GOV-2026", level: "State Executive" },
  { raceId: "WI-SCOTUS-2026", level: "State Judicial" },
  { raceId: "WI-US-HOUSE-D2-2026", level: "Federal" },
  { raceId: "WI-US-HOUSE-D4-2026", level: "Federal" },
  { raceId: "WI-STATE-SENATE-2026", level: "State Legislative", districts: [{ district: 7 }, { district: 23 }] },
  { raceId: "WI-STATE-ASSEMBLY-2026", level: "State Legislative", districts: [{ district: 19 }, { district: 76 }] },
];

/** The shape that replaced the chamber-wide rows: one race per district. */
const PER_DISTRICT = [
  { raceId: "WI-GOV-2026", level: "State Executive" },
  { raceId: "WI-US-HOUSE-D4-2026", level: "Federal" },
  { raceId: "WI-STATE-SENATE-D7-2026", level: "State Legislative" },
  { raceId: "WI-STATE-SENATE-D23-2026", level: "State Legislative" },
  { raceId: "WI-STATE-ASSEMBLY-D19-2026", level: "State Legislative" },
  { raceId: "WI-STATE-ASSEMBLY-D76-2026", level: "State Legislative" },
];

describe("relevantRaces", () => {
  it("Milwaukee (CD 4, SD 7): statewide + D4 house + senate + assembly, NOT D2", () => {
    const ids = relevantRaces({ congressional: 4, senate: 7, assembly: 19 }, RACES).map(
      (r) => r.raceId,
    );
    expect(ids).toContain("WI-GOV-2026");
    expect(ids).toContain("WI-SCOTUS-2026");
    expect(ids).toContain("WI-US-HOUSE-D4-2026");
    expect(ids).not.toContain("WI-US-HOUSE-D2-2026");
    expect(ids).toContain("WI-STATE-SENATE-2026");
    expect(ids).toContain("WI-STATE-ASSEMBLY-2026");
  });

  it("Madison (SD 26, even → senate seat not up in 2026): senate race excluded", () => {
    const ids = relevantRaces({ congressional: 2, senate: 26, assembly: 76 }, RACES).map(
      (r) => r.raceId,
    );
    expect(ids).toContain("WI-US-HOUSE-D2-2026");
    expect(ids).not.toContain("WI-STATE-SENATE-2026");
    expect(ids).toContain("WI-STATE-ASSEMBLY-2026");
  });
});

describe("relevantRaces with per-district legislative races", () => {
  it("matches the voter's own senate and assembly district by raceId", () => {
    const ids = relevantRaces({ congressional: 4, senate: 7, assembly: 19 }, PER_DISTRICT).map(
      (r) => r.raceId,
    );
    expect(ids).toContain("WI-STATE-SENATE-D7-2026");
    expect(ids).toContain("WI-STATE-ASSEMBLY-D19-2026");
    expect(ids).not.toContain("WI-STATE-SENATE-D23-2026");
    expect(ids).not.toContain("WI-STATE-ASSEMBLY-D76-2026");
  });

  it("omits a senate district that is not up this cycle", () => {
    // Even districts do not appear at all in 2026, so there is no race to match.
    const ids = relevantRaces({ congressional: 4, senate: 8, assembly: 19 }, PER_DISTRICT).map(
      (r) => r.raceId,
    );
    expect(ids.some((i) => i.includes("SENATE"))).toBe(false);
    expect(ids).toContain("WI-STATE-ASSEMBLY-D19-2026");
  });

  it("never shows both a chamber-wide row and its per-district replacement", () => {
    // During a partial rollout both shapes are present. Showing the voter their
    // assembly race twice is the visible symptom; the per-district row wins.
    const mixed = [...PER_DISTRICT, ...RACES.filter((r) => r.level === "State Legislative")];
    const ids = relevantRaces({ congressional: 4, senate: 7, assembly: 19 }, mixed).map(
      (r) => r.raceId,
    );
    expect(ids).toContain("WI-STATE-ASSEMBLY-D19-2026");
    expect(ids).not.toContain("WI-STATE-ASSEMBLY-2026");
    expect(ids).not.toContain("WI-STATE-SENATE-2026");
  });

  it("still honours the chamber-wide row when no per-district race exists yet", () => {
    const ids = relevantRaces({ congressional: 4, senate: 7, assembly: 19 }, RACES).map(
      (r) => r.raceId,
    );
    expect(ids).toContain("WI-STATE-SENATE-2026");
    expect(ids).toContain("WI-STATE-ASSEMBLY-2026");
  });
});

describe("hasStateSenateRace", () => {
  it("is true when the voter's ballot includes their district's State Senate race", () => {
    // Live bug until 2026-10-13: the home page looked for the old chamber-wide id
    // "WI-STATE-SENATE-2026", so a District 7 voter was told the seat "isn't up for
    // election in 2026" directly above the District 7 race.
    expect(hasStateSenateRace([{ raceId: "WI-GOV-2026" }, { raceId: "WI-STATE-SENATE-D7-2026" }])).toBe(true);
  });

  it("is false when no State Senate race is on the ballot (an even-numbered district in 2026)", () => {
    expect(hasStateSenateRace([{ raceId: "WI-GOV-2026" }, { raceId: "WI-STATE-ASSEMBLY-D19-2026" }])).toBe(false);
  });

  it("still recognises the old chamber-wide row", () => {
    expect(hasStateSenateRace([{ raceId: "WI-STATE-SENATE-2026" }])).toBe(true);
  });

  it("is not fooled by another office with a similar id", () => {
    expect(hasStateSenateRace([{ raceId: "WI-US-SENATE-2026" }])).toBe(false);
  });
});

describe("parseGeocoderResponse: the polling-place lookup", () => {
  const inMilwaukee = (place: string) => {
    const copy = structuredClone(mke) as typeof mke & { result: { addressMatches: Record<string, unknown>[] } };
    const match = copy.result.addressMatches[0] as { coordinates?: unknown; geographies: Record<string, unknown> };
    match.coordinates = { x: -87.9097, y: 43.0411 };
    match.geographies["Incorporated Places"] = [{ BASENAME: place, NAME: `${place} city`, STATE: "55" }];
    return copy;
  };

  it("keeps the map point of an address in the City of Milwaukee, for the server's ward lookup", () => {
    const r = parseGeocoderResponse(inMilwaukee("Milwaukee"));
    expect(r).toMatchObject({ ok: true, point: { lat: 43.0411, lon: -87.9097 } });
  });

  it("keeps no map point for an address outside the City of Milwaukee", () => {
    const r = parseGeocoderResponse(inMilwaukee("Wauwatosa"));
    expect(r).toMatchObject({ ok: true });
    expect(r).not.toHaveProperty("point");
  });
});
