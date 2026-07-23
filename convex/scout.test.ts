import { describe, expect, test } from "vitest";
import { decorateCoverageRow } from "./lib/outlets";

describe("decorateCoverageRow", () => {
  const ctx = { candidateNames: ["Francesca Hong"], raceKeywords: ["governor"] };
  test("candidate-named article becomes hub:auto with outletKey", () => {
    const d = decorateCoverageRow({ outlet: "Urban Milwaukee", headline: "Francesca Hong on housing" }, ctx);
    expect(d.outletKey).toBe("urban milwaukee");
    expect(d.hubStatus).toBe("auto");
    expect(d.relevanceScore).toBeGreaterThanOrEqual(0.5);
  });
  test("off-topic article is not hub:auto", () => {
    const d = decorateCoverageRow({ outlet: "ESPN", headline: "Packers trade news" }, ctx);
    expect(d.hubStatus).toBeUndefined();
  });
});
