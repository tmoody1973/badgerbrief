// @vitest-environment node
import { describe, expect, test } from "vitest";
import { pathOnlyUrl } from "./analytics-url";

describe("pathOnlyUrl", () => {
  test("removes what follows a # — a shared ballot carries districts there", () => {
    expect(pathOnlyUrl("https://badgerbrief.org/ballot#cd=7&sd=31&ad=93&co=st-croix")).toBe("https://badgerbrief.org/ballot");
  });

  test("removes what follows a ?", () => {
    expect(pathOnlyUrl("https://badgerbrief.org/ads?view=tv")).toBe("https://badgerbrief.org/ads");
  });

  test("removes both when both are there", () => {
    expect(pathOnlyUrl("https://badgerbrief.org/ballot?utm_source=share&utm_medium=copy#cd=7&sd=31&ad=93")).toBe("https://badgerbrief.org/ballot");
  });

  test("leaves a plain address exactly as it was", () => {
    expect(pathOnlyUrl("https://badgerbrief.org/races/wi-gov-2026")).toBe("https://badgerbrief.org/races/wi-gov-2026");
    expect(pathOnlyUrl("https://badgerbrief.org/")).toBe("https://badgerbrief.org/");
  });

  test("an address it cannot read is still cut at the first ? or #, never passed through whole", () => {
    expect(pathOnlyUrl("/ballot#cd=7&sd=31&ad=93")).toBe("/ballot");
    expect(pathOnlyUrl("not a url?address=200 E Wells St")).toBe("not a url");
    expect(pathOnlyUrl("")).toBe("");
  });
});
