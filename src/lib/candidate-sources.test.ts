import { describe, expect, test } from "vitest";
import { candidateSources, pageUpdated } from "./candidate-sources";

const primary = { name: "Wisconsin Elections Commission — 2026 Partisan Primary candidate list", url: "https://elections.wi.gov/media/40146/download" };
const general = { onBallot: true, source: { url: "https://elections.wi.gov/certified.xlsx", documentDate: "2026-10-06", retrievedAt: "2026-10-07T00:00:00Z" } };

describe("candidateSources", () => {
  test("puts the certified November list first, named and dated", () => {
    const out = candidateSources([primary], general);
    expect(out[0].url).toBe("https://elections.wi.gov/certified.xlsx");
    expect(out[0].name).toMatch(/certified.*Nov.*3.*candidate list.*October 6, 2026/i);
    expect(out[1]).toEqual(primary);
  });

  test("keeps the candidate's own sources as they are when there is no November record", () => {
    expect(candidateSources([primary], undefined)).toEqual([primary]);
  });

  test("does not list the certified file twice", () => {
    const already = { name: "WEC certified list", url: general.source.url };
    expect(candidateSources([already], general).filter((s) => s.url === general.source.url)).toHaveLength(1);
  });
});

describe("pageUpdated", () => {
  test("dates the page by the certified November list when there is one", () => {
    expect(pageUpdated(general, "July 17, 2026")).toBe("October 6, 2026");
  });

  test("falls back to the page's own date without a November record", () => {
    expect(pageUpdated(undefined, "July 17, 2026")).toBe("July 17, 2026");
  });
});
