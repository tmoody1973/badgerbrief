import { describe, expect, test } from "vitest";
import sample from "./fixtures/mke-wards-sample.json";
import { parseWards, wardAt } from "./wards";

// Three real wards from the City of Milwaukee's "Voting Wards and Polling
// Places" map service (2026-10-14): 1, 2 and 141 (City Hall's ward).
const wards = parseWards(sample, 3);

describe("parseWards", () => {
  test("reads each ward's polling place and its door and parking notes", () => {
    const w141 = wards.find((w) => w.ward === "141");
    expect(w141).toMatchObject({
      pollingPlace: "Zeidler, Frank P. Municipal Building",
      address: "841 N Broadway",
      accessibleEntrance: "The accessible entrance is the main building entrance on N Broadway St",
    });
    expect(w141?.bbox).toHaveLength(4);
  });

  test("refuses a download with too few wards, so a bad night never replaces the good copy", () => {
    expect(() => parseWards(sample, 300)).toThrow(/3 wards/);
  });
});

describe("wardAt", () => {
  test("finds City Hall's ward and polling place from its map point", () => {
    expect(wardAt(wards, -87.9094, 43.0418)?.ward).toBe("141");
  });

  test("finds nothing for a point outside every ward", () => {
    // Madison: not in the City of Milwaukee.
    expect(wardAt(wards, -89.3838, 43.0747)).toBeNull();
  });
});
