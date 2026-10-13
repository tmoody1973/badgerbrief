// @vitest-environment node
import { describe, expect, test } from "vitest";
import { NAV_LINKS } from "./nav-links";
import { PRIMARY_TAB_HREFS, TABS, isActive, moreLinks } from "./bottom-tabs";

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

describe("the phone tabs", () => {
  test("are Home, My Ballot, Vote and Chat, and the primary list cannot drift from them", () => {
    expect(TABS.map((t) => t.href)).toEqual(["/", "/ballot", "/vote", "/chat"]);
    expect(TABS.map((t) => t.en)).toEqual(["Home", "My Ballot", "Vote", "Chat"]);
    expect(PRIMARY_TAB_HREFS).toEqual(TABS.map((t) => t.href));
  });

  test("Races is no longer a tab, so it moves to More", () => {
    expect(moreLinks(NAV_LINKS).map((l) => l.href)).toContain("/races/wi-gov-2026");
  });

  test("My Ballot is in the site navigation", () => {
    expect(NAV_LINKS.map((l) => l.href)).toContain("/ballot");
  });

  test("My Ballot is lit on its own page and not on Ballot Basics", () => {
    expect(isActive("/ballot", "/ballot")).toBe(true);
    expect(isActive("/ballot-basics", "/ballot")).toBe(false);
  });

  test("Home is lit only at home; Vote and Chat on their pages and anything under them", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/vote", "/")).toBe(false);
    expect(isActive("/vote", "/vote")).toBe(true);
    expect(isActive("/chat/thread", "/chat")).toBe(true);
    expect(isActive("/ballot", "/vote")).toBe(false);
  });
});
