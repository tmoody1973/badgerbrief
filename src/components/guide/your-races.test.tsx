import { describe, expect, test } from "vitest";
import { pick } from "./your-races";
import type { Districts } from "@/lib/districts";

type RaceCard = Parameters<typeof pick>[0][number];

/** Minimal race card — pick() only reads raceId, level, districts. */
function card(partial: Pick<RaceCard, "raceId" | "level" | "districts">): RaceCard {
  return {
    office: "",
    totalSpend: 0,
    outsideSpend: 0,
    supportShare: 0,
    attackShare: 0,
    adCount: 0,
    mostAttacked: null,
    ...partial,
  } as RaceCard;
}

const races: RaceCard[] = [
  card({ raceId: "WI-GOV-2026", level: "State Executive", districts: undefined }),
  card({ raceId: "WI-US-HOUSE-D4-2026", level: "Federal", districts: undefined }),
  card({ raceId: "WI-STATE-SENATE-2026", level: "State Legislative", districts: [{ district: 1 }, { district: 3 }] }),
  card({ raceId: "WI-STATE-ASSEMBLY-2026", level: "State Legislative", districts: [{ district: 47 }, { district: 48 }] }),
];

const ids = (rs: RaceCard[]) => rs.map((r) => r.raceId).sort();

describe("pick — Your races personalization (MOO-349)", () => {
  test("matches statewide + US House + the voter's Senate & Assembly races", () => {
    const districts: Districts = { congressional: 4, senate: 3, assembly: 47 };
    expect(ids(pick(races, districts))).toEqual([
      "WI-GOV-2026",
      "WI-STATE-ASSEMBLY-2026",
      "WI-STATE-SENATE-2026",
      "WI-US-HOUSE-D4-2026",
    ]);
  });

  test("excludes leg races whose district isn't the voter's (or isn't up this cycle)", () => {
    // Senate district 2 is not in [1,3] (even = not up in 2026); assembly 99 not listed.
    const districts: Districts = { congressional: 4, senate: 2, assembly: 99 };
    expect(ids(pick(races, districts))).toEqual(["WI-GOV-2026", "WI-US-HOUSE-D4-2026"]);
  });

  test("excludes a US House race in a different district", () => {
    const districts: Districts = { congressional: 5, senate: 1, assembly: 48 };
    const got = ids(pick(races, districts));
    expect(got).not.toContain("WI-US-HOUSE-D4-2026");
    expect(got).toContain("WI-STATE-SENATE-2026"); // senate 1 is in [1,3]
    expect(got).toContain("WI-STATE-ASSEMBLY-2026"); // assembly 48 is in [47,48]
  });
});
