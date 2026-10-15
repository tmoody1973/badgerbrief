import { describe, expect, test } from "vitest";
import { districtsToHash } from "./ballot-link";
import { pickDistricts } from "./my-districts";

const stored = districtsToHash({ congressional: 4, senate: 7, assembly: 19, county: "milwaukee" });

describe("pickDistricts", () => {
  test("a signed-in voter's saved districts come first", () => {
    const prefs = { congressionalDistrict: "1", stateSenateDistrict: "21", stateAssemblyDistrict: "63" };
    expect(pickDistricts(prefs, stored)).toEqual({ congressional: 1, senate: 21, assembly: 63 });
  });

  test("otherwise, the districts My Ballot remembered on this device", () => {
    expect(pickDistricts(null, stored)).toMatchObject({ congressional: 4, senate: 7, assembly: 19 });
  });

  test("none when the voter has not found their ballot yet", () => {
    expect(pickDistricts(null, "")).toBeNull();
    expect(pickDistricts({ congressionalDistrict: undefined }, "")).toBeNull();
  });
});
