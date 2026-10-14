// @vitest-environment node
import { describe, expect, test } from "vitest";
import { districtsFromHash, districtsToHash } from "./ballot-link";

const KNOWN = new Set(["milwaukee", "st-croix", "fond-du-lac"]);

describe("districtsToHash", () => {
  test("writes districts and county, with no leading #", () => {
    expect(districtsToHash({ congressional: 4, senate: 7, assembly: 19, county: "milwaukee" })).toBe("cd=4&sd=7&ad=19&co=milwaukee");
  });

  test("leaves the county off when it is not known", () => {
    expect(districtsToHash({ congressional: 4, senate: 7, assembly: 19 })).toBe("cd=4&sd=7&ad=19");
  });
});

describe("districtsFromHash", () => {
  test("reads back what was written, with or without the #", () => {
    const districts = { congressional: 4, senate: 7, assembly: 19, county: "milwaukee" };
    expect(districtsFromHash(districtsToHash(districts), KNOWN)).toEqual(districts);
    expect(districtsFromHash(`#${districtsToHash(districts)}`, KNOWN)).toEqual(districts);
  });

  test("a link with no county reads as districts with no county", () => {
    expect(districtsFromHash("cd=4&sd=7&ad=19", KNOWN)).toEqual({ congressional: 4, senate: 7, assembly: 19 });
  });

  test("accepts the highest district of each kind", () => {
    expect(districtsFromHash("cd=8&sd=33&ad=99", KNOWN)).toEqual({ congressional: 8, senate: 33, assembly: 99 });
  });

  test.each([
    "cd=9&sd=7&ad=19",
    "cd=0&sd=7&ad=19",
    "cd=4&sd=34&ad=19",
    "cd=4&sd=7&ad=100",
    "cd=4&sd=7&ad=1.5",
    "cd=4x&sd=7&ad=19",
    "cd=4&sd=&ad=19",
    "cd=-4&sd=7&ad=19",
    "cd=04&sd=7&ad=19",
    "cd=4&sd=7",
    "sd=7&ad=19",
    "cd=4e0&sd=7&ad=19",
    "cd=%34&sd=7&ad=019",
  ])("refuses %s", (hash) => {
    expect(districtsFromHash(hash, KNOWN)).toBeNull();
  });

  test.each(["", "#", "hello", "decisions", "cd", "=&=&="])("text that is not a ballot link (%j) is nothing", (hash) => {
    expect(districtsFromHash(hash, KNOWN)).toBeNull();
  });

  test("a county the guide does not know is dropped, and the districts are kept", () => {
    expect(districtsFromHash("cd=4&sd=7&ad=19&co=atlantis", KNOWN)).toEqual({ congressional: 4, senate: 7, assembly: 19 });
  });

  test.each(["<script>alert(1)</script>", "../x", "Milwaukee County", "MILWAUKEE", "st--croix", "-milwaukee", "milwaukee-", "constructor", "__proto__", "a".repeat(60)])(
    "a county written as %j is dropped",
    (county) => {
      expect(districtsFromHash(`cd=4&sd=7&ad=19&co=${encodeURIComponent(county)}`, KNOWN)).toEqual({ congressional: 4, senate: 7, assembly: 19 });
    },
  );

  test("reads a county with a hyphen", () => {
    expect(districtsFromHash("cd=3&sd=10&ad=30&co=st-croix", KNOWN)?.county).toBe("st-croix");
  });

  test("when the county list is not available, a well-formed county key is kept as given", () => {
    expect(districtsFromHash("cd=4&sd=7&ad=19&co=milwaukee", null)?.county).toBe("milwaukee");
    expect(districtsFromHash("cd=4&sd=7&ad=19&co=Not%20A%20Key", null)).toEqual({ congressional: 4, senate: 7, assembly: 19 });
  });

  test("ignores extra keys and takes the first of a repeated one", () => {
    expect(districtsFromHash("cd=4&cd=5&sd=7&ad=19&utm_source=share&x=y", KNOWN)).toEqual({ congressional: 4, senate: 7, assembly: 19 });
  });
});
