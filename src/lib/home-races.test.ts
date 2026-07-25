import { describe, expect, test } from "vitest";
import { splitHomeRaces } from "./home-races";

const race = (raceId: string, level: string) => ({ raceId, level }) as any;

describe("splitHomeRaces", () => {
  test("drops chamber-wide legislative rows when per-district races exist", () => {
    const races = [
      race("WI-GOV-2026", "Statewide"),
      race("WI-STATE-SENATE-2026", "State Legislative"),
      race("WI-SD-D1-2026", "State Legislative"),
    ];
    const { listed } = splitHomeRaces(races);
    expect(listed.map((r) => r.raceId)).toContain("WI-SD-D1-2026");
    expect(listed.map((r) => r.raceId)).not.toContain("WI-STATE-SENATE-2026");
  });

  test("keeps all rows when there are no per-district legislative races", () => {
    const races = [race("WI-GOV-2026", "Statewide"), race("WI-STATE-SENATE-2026", "State Legislative")];
    const { listed } = splitHomeRaces(races);
    expect(listed).toHaveLength(2);
  });
});
