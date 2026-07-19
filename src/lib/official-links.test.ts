import { describe, expect, test } from "vitest";
import { OFFICIAL_LINKS, OFFICIAL_LINK_TOPICS } from "./official-links";

describe("official links", () => {
  test("every topic has a label and an https wi.gov URL", () => {
    expect(OFFICIAL_LINK_TOPICS.length).toBeGreaterThan(0);
    for (const topic of OFFICIAL_LINK_TOPICS) {
      const { label, url } = OFFICIAL_LINKS[topic];
      expect(label.length).toBeGreaterThan(0);
      expect(url).toMatch(/^https:\/\/[a-z.]*wi\.gov/);
    }
  });
});
