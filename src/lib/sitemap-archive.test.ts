// @vitest-environment node
import { expect, test } from "vitest";
import { archiveEntries } from "./sitemap-archive";

test("the sitemap lists the archive hub and one archived page per race", () => {
  const when = new Date("2026-10-12T00:00:00Z");
  const entries = archiveEntries(["WI-GOV-2026", "WI-US-HOUSE-D4-2026"], when);
  expect(entries.map((e) => new URL(e.url).pathname)).toEqual([
    "/primary-2026",
    "/primary-2026/races/wi-gov-2026",
    "/primary-2026/races/wi-us-house-d4-2026",
  ]);
  expect(entries.every((e) => e.changeFrequency === "yearly")).toBe(true);
});
