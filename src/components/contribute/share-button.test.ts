// @vitest-environment node
import { describe, expect, test } from "vitest";
import { shareSurface } from "./share-button";

describe("shareSurface", () => {
  test("a shared ballot is counted as a ballot", () => {
    expect(shareSurface("https://badgerbrief.org/ballot#cd=4&sd=7&ad=19&co=milwaukee")).toBe("ballot");
    expect(shareSurface("https://badgerbrief.org/ballot")).toBe("ballot");
    expect(shareSurface("https://badgerbrief.org/ballot?utm_source=share#cd=4&sd=7&ad=19")).toBe("ballot");
  });

  test("the Ballot Basics explainer is not a ballot", () => {
    expect(shareSurface("https://badgerbrief.org/ballot-basics")).toBeNull();
  });

  test("the surfaces already counted are unchanged", () => {
    expect(shareSurface("https://badgerbrief.org/compare/wi-gov-2026")).toBe("compare");
    expect(shareSurface("https://badgerbrief.org/candidates/tom-tiffany")).toBe("candidate");
    expect(shareSurface("https://badgerbrief.org/races/wi-gov-2026")).toBe("race");
    expect(shareSurface("https://badgerbrief.org/match")).toBe("match");
    expect(shareSurface("https://badgerbrief.org/brief")).toBe("brief");
    expect(shareSurface("https://badgerbrief.org/about")).toBeNull();
  });
});
