import { describe, expect, test } from "vitest";
import { handoffExtras, pollingPlacePayload } from "./pollingPlaceTool";

const found = { ok: true as const, matchedAddress: "200 E WELLS ST, MILWAUKEE, WI, 53202", congressional: 4, senate: 7, assembly: 19, county: "milwaukee" };
const zeidler = {
  ward: "141",
  pollingPlace: "Zeidler, Frank P. Municipal Building",
  address: "841 N Broadway",
  accessibleEntrance: "The accessible entrance is the main building entrance on N Broadway St",
  syncedAt: 1,
};

describe("pollingPlacePayload", () => {
  test("gives a City of Milwaukee voter their polling place, its source, and MyVote to confirm", () => {
    const p = pollingPlacePayload(found, zeidler);
    expect(p.pollingPlace).toMatchObject({ ward: "141", pollingPlace: "Zeidler, Frank P. Municipal Building" });
    expect(p.mustTellUser).toMatch(/City of Milwaukee/);
    expect(p.mustTellUser).toMatch(/Election Day/);
    expect(p.official.url).toMatch(/myvote\.wi\.gov/);
  });

  test("gives the race ids for the voter's districts, so the ballot comes from the race tool", () => {
    expect(pollingPlacePayload(found, zeidler).raceIds).toEqual([
      "WI-US-HOUSE-D4-2026",
      "WI-STATE-SENATE-D7-2026",
      "WI-STATE-ASSEMBLY-D19-2026",
    ]);
  });

  test("outside the City of Milwaukee, says BadgerBrief has no polling place there and hands off to MyVote", () => {
    const p = pollingPlacePayload({ ...found, county: "dane" }, null);
    expect(p.pollingPlace).toBeNull();
    expect(p.mustTellUser).toMatch(/only for the City of Milwaukee/);
    expect(p.official.url).toMatch(/myvote\.wi\.gov/);
  });

  test("an address that cannot be matched gets a plain answer and MyVote, nothing guessed", () => {
    const p = pollingPlacePayload({ ok: false, error: "no_match" }, null);
    expect(p).toMatchObject({ found: false });
    expect(p.official.url).toMatch(/myvote\.wi\.gov/);
  });

  test("never carries the address's map point", () => {
    const withPoint = { ...found, point: { lat: 43.04112, lon: -87.90967 } };
    expect(JSON.stringify(pollingPlacePayload(withPoint, zeidler))).not.toMatch(/43\.04|-87\.9|point/);
  });
});

describe("handoffExtras", () => {
  test("the polling-place handoff carries the offer to look up a Milwaukee address, so the offer comes from a tool", () => {
    expect(handoffExtras("pollingPlace").alsoOffer).toMatch(/City of Milwaukee/);
  });

  test("other handoffs carry nothing extra", () => {
    expect(handoffExtras("register")).toEqual({});
  });
});
