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
    ], "First Second");
    expect(merged.narrative).toBe("First.");
    expect(merged.leadership).toEqual([{ name: "A", role: "CEO" }, { name: "B", role: "Treasurer" }]);
    expect(merged.sources.map((s) => s.url)).toEqual(["https://opensecrets.org/x", "https://ballotpedia.org/y"]);
  });
  test("mergeNarrative rejects a result about a different entity (leadership dropped too)", () => {
    const merged = mergeNarrative([
      { url: "https://projects.propublica.org/x", json: { narrative: "ProPublica is an independent nonprofit newsroom.", leadership: [{ name: "Wrong", role: "Editor" }] } },
      { url: "https://ballotpedia.org/y", json: { narrative: "Americans for Prosperity is a conservative advocacy group.", leadership: [{ name: "Right", role: "President" }] } },
    ], "Americans for Prosperity");
    expect(merged.narrative).toBe("Americans for Prosperity is a conservative advocacy group.");
    expect(merged.leadership).toEqual([{ name: "Right", role: "President" }]);
    expect(merged.sources.map((s) => s.url)).toEqual(["https://ballotpedia.org/y"]);
  });
  test("mergeNarrative returns no narrative when no result is relevant", () => {
    const merged = mergeNarrative([
      { url: "https://projects.propublica.org/x", json: { narrative: "ProPublica is an independent nonprofit newsroom.", leadership: [{ name: "Wrong", role: "Editor" }] } },
    ], "Americans for Prosperity");
    expect(merged.narrative).toBeUndefined();
    expect(merged.leadership).toBeUndefined();
    expect(merged.sources).toEqual([]);
  });
});
