// @vitest-environment node
import { describe, expect, test } from "vitest";
import { NAV_LINKS } from "./nav-links";
import { PRIMARY_TAB_HREFS, moreLinks } from "./bottom-tabs";

describe("bottom tab derivation", () => {
  test("More = NAV_LINKS minus the primary tab hrefs", () => {
    const more = moreLinks(NAV_LINKS);
    expect(more.some((l) => PRIMARY_TAB_HREFS.includes(l.href))).toBe(false);
    // the non-primary NAV_LINKS (Ads, News, Brief, About, Methodology) remain
    expect(more.map((l) => l.href)).toContain("/about");
    expect(more.map((l) => l.href)).toContain("/news");
  });

  test("every NAV_LINK is either a primary tab or in More (no link is lost)", () => {
    const more = new Set(moreLinks(NAV_LINKS).map((l) => l.href));
    for (const l of NAV_LINKS) {
      expect(PRIMARY_TAB_HREFS.includes(l.href) || more.has(l.href)).toBe(true);
    }
  });
});