import { describe, expect, test } from "vitest";
import { inNewsScope, metaSearchTerms, onBallotOnly } from "./jobScope";

const SOURCE = { url: "https://elections.wi.gov/media/41846/download", documentDate: "2026-10-06", retrievedAt: "2026-10-12T21:32:56Z" };
const ON = { onBallot: true, source: SOURCE };
const OFF = { onBallot: false, source: SOURCE };

describe("inNewsScope", () => {
  test("covers on-ballot candidates for statewide executive offices and the U.S. House", () => {
    expect(inNewsScope({ raceId: "WI-GOV-2026", general: ON }, "State Executive")).toBe(true);
    expect(inNewsScope({ raceId: "WI-US-HOUSE-D4-2026", general: ON }, "Federal")).toBe(true);
  });

  test("covers a governor running mate: on the ballot, in a statewide executive race", () => {
    expect(inNewsScope({ raceId: "WI-LTGOV-2026", general: ON }, "State Executive")).toBe(true);
  });

  test("leaves out the legislature: 220 people do not fit in a daily search budget", () => {
    expect(inNewsScope({ raceId: "WI-STATE-ASSEMBLY-D3-2026", general: ON }, "State Legislative")).toBe(false);
  });

  test("leaves out anyone not on the ballot, including a row with no ballot facts at all", () => {
    expect(inNewsScope({ raceId: "WI-GOV-2026", general: OFF }, "State Executive")).toBe(false);
    expect(inNewsScope({ raceId: "WI-GOV-2026" }, "State Executive")).toBe(false);
  });
});

describe("metaSearchTerms", () => {
  test("searches the ad library only for candidates on the ballot", () => {
    const terms = metaSearchTerms([
      { name: "Tom Tiffany", onBallot: true },
      { name: "Francesca Hong", onBallot: false },
      { name: "No Flag" },
    ]);
    expect(terms).toEqual(["Tom Tiffany"]);
  });
});

describe("onBallotOnly", () => {
  test("keeps the rows flagged as on the ballot, for any job that builds a list from the ad-matching candidates", () => {
    // The TV-ad sync builds the list of surnames it opens files for from this.
    const rows = [{ name: "Tom Tiffany", onBallot: true }, { name: "Mandela Barnes", onBallot: false }, { name: "No Flag" }];
    expect(onBallotOnly(rows).map((r) => r.name)).toEqual(["Tom Tiffany"]);
    expect(rows).toHaveLength(3);
  });
});
