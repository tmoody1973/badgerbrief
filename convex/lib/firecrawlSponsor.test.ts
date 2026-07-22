import { describe, expect, test } from "vitest";
import { buildSourceUrls, mergeNarrative } from "./firecrawlSponsor";

describe("firecrawlSponsor", () => {
  test("buildSourceUrls includes ProPublica, OpenSecrets, Ballotpedia, Wikipedia", () => {
    const urls = buildSourceUrls("Americans for Prosperity");
    expect(urls.some((u) => u.includes("projects.propublica.org/nonprofits"))).toBe(true);
    expect(urls.some((u) => u.includes("opensecrets.org"))).toBe(true);
    expect(urls.some((u) => u.includes("ballotpedia.org"))).toBe(true);
    expect(urls.some((u) => u.includes("wikipedia.org"))).toBe(true);
  });
  test("mergeNarrative takes first narrative, unions leadership, records sources", () => {
    const merged = mergeNarrative([
      { url: "https://opensecrets.org/x", json: { narrative: "First.", leadership: [{ name: "A", role: "CEO" }] } },
      { url: "https://ballotpedia.org/y", json: { narrative: "Second.", leadership: [{ name: "B", role: "Treasurer" }] } },
      { url: "https://dead.example/z", json: null },
    ]);
    expect(merged.narrative).toBe("First.");
    expect(merged.leadership).toEqual([{ name: "A", role: "CEO" }, { name: "B", role: "Treasurer" }]);
    expect(merged.sources.map((s) => s.url)).toEqual(["https://opensecrets.org/x", "https://ballotpedia.org/y"]);
  });
});
