// @vitest-environment node
import { expect, test } from "vitest";
import { electionEventNode } from "./jsonld";

test("the election event describes the general election, not the primary", () => {
  const node = electionEventNode({ generalDate: "November 3, 2026" }) as Record<string, unknown>;
  expect(node.name).toBe("Wisconsin General Election 2026");
  expect(node.startDate).toBe("2026-11-03");
  expect(String(node["@id"])).toContain("#election-2026-general");
  expect(String(node.description)).not.toMatch(/primary/i);
  expect(String(node.description)).toContain("November 3, 2026");
});

test("the election event carries the fields Google's Event rich result recommends", () => {
  const node = electionEventNode({ generalDate: "November 3, 2026" }) as Record<string, unknown>;
  expect(node.endDate).toBe("2026-11-03");
  expect(String(node.image)).toMatch(/^https:\/\/.+\/opengraph-image$/);
  expect(node.location).toMatchObject({
    "@type": "Place",
    address: { "@type": "PostalAddress", addressRegion: "WI", addressCountry: "US" },
  });
});
