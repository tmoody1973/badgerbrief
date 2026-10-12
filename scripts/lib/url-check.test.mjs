import { describe, expect, test } from "vitest";
import { failures, pathsFromSitemap } from "./url-check.mjs";

describe("pathsFromSitemap", () => {
  test("returns each address's path, in order, without the site name", () => {
    const xml = `<urlset><url><loc>https://badgerbrief.org</loc></url><url><loc>https://badgerbrief.org/races/wi-gov-2026</loc></url></urlset>`;
    expect(pathsFromSitemap(xml)).toEqual(["/", "/races/wi-gov-2026"]);
  });

  test("an empty sitemap is an error, not a pass", () => {
    expect(() => pathsFromSitemap("<urlset></urlset>")).toThrow(/no addresses/);
  });
});

describe("failures", () => {
  test("only a 200 counts as still working", () => {
    const results = [
      { path: "/a", status: 200 },
      { path: "/b", status: 404 },
      { path: "/c", status: 500 },
      { path: "/d", status: 0 },
    ];
    expect(failures(results).map((r) => r.path)).toEqual(["/b", "/c", "/d"]);
  });
});
