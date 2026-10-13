import { describe, expect, test } from "vitest";
import { GENERAL_COVERAGE_STARTS, isPrimaryEra } from "./coverageEra";

const onBallot = new Set(["tom-tiffany", "david-crowley"]);
const day = (iso: string) => Date.parse(`${iso}T17:00:00Z`);

describe("isPrimaryEra", () => {
  test("coverage from before the day after the primary is archive material", () => {
    expect(isPrimaryEra({ when: day("2026-08-11"), candidateSlug: "tom-tiffany" }, onBallot)).toBe(true);
    expect(isPrimaryEra({ when: day("2026-07-11") }, onBallot)).toBe(true);
  });

  test("later coverage of someone on the ballot is current", () => {
    expect(isPrimaryEra({ when: day("2026-08-12"), candidateSlug: "tom-tiffany" }, onBallot)).toBe(false);
  });

  test("later coverage of someone who is not on the ballot is archive material", () => {
    expect(isPrimaryEra({ when: day("2026-09-20"), candidateSlug: "francesca-hong" }, onBallot)).toBe(true);
  });

  test("later coverage tied to no candidate is current", () => {
    expect(isPrimaryEra({ when: day("2026-09-20") }, onBallot)).toBe(false);
  });

  test("a story dated August 12 is current: verified dates carry no time of day", () => {
    // A verified publication date is a bare day, which parses to midnight UTC.
    // A cutoff later in that day sent all 25 stories dated August 12 to the archive.
    expect(isPrimaryEra({ when: Date.parse("2026-08-12"), candidateSlug: "tom-tiffany" }, onBallot)).toBe(false);
    expect(isPrimaryEra({ when: Date.parse("2026-08-11"), candidateSlug: "tom-tiffany" }, onBallot)).toBe(true);
  });

  test("the cutoff is the start of August 12, the day after the primary", () => {
    expect(new Date(GENERAL_COVERAGE_STARTS).toISOString()).toBe("2026-08-12T00:00:00.000Z");
  });
});
