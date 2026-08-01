import { describe, expect, test } from "vitest";
import { toShares, blend, rank } from "./signals";

describe("signals math", () => {
  test("toShares normalizes to sum 1, floors negatives, handles empty field", () => {
    const s = toShares({ a: 30, b: 10 });
    expect(s.a).toBeCloseTo(0.75);
    expect(s.b).toBeCloseTo(0.25);
    expect(toShares({ a: -5, b: 0 })).toEqual({ a: 0, b: 0 }); // all non-positive
    expect(Object.values(toShares({ a: 1, b: 3 })).reduce((x, y) => x + y, 0)).toBeCloseTo(1);
  });

  test("blend weight-averages only signals with data AND positive weight", () => {
    const shares = {
      polls: { a: 0.7, b: 0.3 },
      social: { a: 0.4, b: 0.6 },
    };
    // equal weights → simple average
    const even = blend(shares, { polls: 1, social: 1 });
    expect(even.a).toBeCloseTo(0.55);
    expect(even.b).toBeCloseTo(0.45);
    // zero-weight social drops out → polls only
    const pollsOnly = blend(shares, { polls: 1, social: 0 });
    expect(pollsOnly.a).toBeCloseTo(0.7);
    // a signal with no data is ignored even at positive weight
    const withEmpty = blend({ ...shares, news: {} }, { polls: 1, social: 1, news: 5 });
    expect(withEmpty.a).toBeCloseTo(0.55);
  });

  test("rank orders candidates high to low", () => {
    expect(rank({ a: 0.2, b: 0.5, c: 0.3 }).map((r) => r.slug)).toEqual(["b", "c", "a"]);
  });
});

import { applyTurnoutTilt, TURNOUT_PROFILE } from "./signals";

describe("turnout tilt", () => {
  test("broad scenario leaves shares unchanged", () => {
    const s = { "francesca-hong": 0.6, "kelda-roys": 0.4 };
    expect(applyTurnoutTilt(s, "broad")).toEqual(s);
  });

  test("hardcore scenario tilts by profile then renormalizes to sum 1", () => {
    const s = { a: 0.5, b: 0.5 };
    const tilted = applyTurnoutTilt(s, "hardcore", { a: 0.5, b: 1.5 });
    expect(tilted.b).toBeGreaterThan(tilted.a);
    expect(tilted.a + tilted.b).toBeCloseTo(1);
  });

  test("default profile has an entry for every active Dem slug", () => {
    for (const slug of ["francesca-hong", "david-crowley", "joel-brennan", "kelda-roys"]) {
      expect(TURNOUT_PROFILE[slug]).toBeGreaterThan(0);
    }
  });
});
