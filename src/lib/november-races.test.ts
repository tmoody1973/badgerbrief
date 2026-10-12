import { expect, test } from "vitest";
import { novemberRaces } from "./november-races";

test("lists races that are November contests, and races not yet loaded", () => {
  const races = [
    { raceId: "WI-GOV-2026", general: { onBallot: true } },
    { raceId: "WI-LTGOV-2026", general: { onBallot: false } },
    { raceId: "WI-SCOTUS-2026", general: { onBallot: false } },
    // No block: shown, so a race is never hidden just because data is missing.
    { raceId: "WI-NEW-2026" },
  ];
  expect(novemberRaces(races).map((r) => r.raceId)).toEqual(["WI-GOV-2026", "WI-NEW-2026"]);
  expect(races).toHaveLength(4);
});
