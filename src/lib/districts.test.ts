// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseGeocoderResponse, relevantRaces } from "./districts";
import mke from "./__fixtures__/census-mke.json";
import madison from "./__fixtures__/census-madison.json";
import medford from "./__fixtures__/census-medford.json";
import nomatch from "./__fixtures__/census-nomatch.json";

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
});

const RACES = [
  { raceId: "WI-GOV-2026", level: "State Executive" },
  { raceId: "WI-SCOTUS-2026", level: "State Judicial" },
  { raceId: "WI-US-HOUSE-D2-2026", level: "Federal" },
  { raceId: "WI-US-HOUSE-D4-2026", level: "Federal" },
  { raceId: "WI-STATE-SENATE-2026", level: "State Legislative", districts: [{ district: 7 }, { district: 23 }] },
  { raceId: "WI-STATE-ASSEMBLY-2026", level: "State Legislative", districts: [{ district: 19 }, { district: 76 }] },
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
