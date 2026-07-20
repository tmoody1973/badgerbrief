// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  baseDomain,
  isPolicyPath,
  isSameSite,
  selectPolicySubpages,
} from "./campaignMap";

describe("baseDomain", () => {
  it("strips www and lowercases", () => {
    expect(baseDomain("https://www.crowleyforwi.com")).toBe("crowleyforwi.com");
    expect(baseDomain("https://FrancescaHong.com/policy")).toBe(
      "francescahong.com",
    );
  });

  it("returns null for non-http(s) and unparseable input", () => {
    expect(baseDomain("javascript:alert(1)")).toBeNull();
    expect(baseDomain("not a url")).toBeNull();
  });
});

describe("isSameSite", () => {
  const home = "https://crowleyforwi.com";

  it("accepts the bare domain and www (map returns www even when bare is registered)", () => {
    expect(isSameSite(home, "https://crowleyforwi.com/Plan")).toBe(true);
    expect(isSameSite(home, "https://www.crowleyforwi.com/Plan")).toBe(true);
  });

  it("accepts other subdomains of the same registrable domain", () => {
    expect(
      isSameSite("https://francescahong.com", "https://store.francescahong.com/goods"),
    ).toBe(true);
  });

  it("rejects lookalike and suffix-attack domains", () => {
    expect(isSameSite(home, "https://crowleyforwi.com.evil.com/Plan")).toBe(false);
    expect(isSameSite(home, "https://evilcrowleyforwi.com/Plan")).toBe(false);
    expect(isSameSite(home, "https://actblue.com/donate/crowleyforwi.com")).toBe(
      false,
    );
  });

  it("rejects non-http schemes", () => {
    expect(isSameSite(home, "mailto:info@crowleyforwi.com")).toBe(false);
  });
});

describe("isPolicyPath", () => {
  it("accepts policy-shaped first segments, case-insensitively", () => {
    expect(isPolicyPath("https://x.com/Plan")).toBe(true);
    expect(isPolicyPath("https://x.com/issues")).toBe(true);
    expect(isPolicyPath("https://x.com/POLICY/")).toBe(true);
  });

  it("accepts children of a policy segment", () => {
    expect(isPolicyPath("https://x.com/policy/veterans")).toBe(true);
  });

  it("rejects segments that merely start with a keyword", () => {
    expect(isPolicyPath("https://store.x.com/about-us")).toBe(false);
    expect(isPolicyPath("https://x.com/badger-basics")).toBe(false);
    expect(isPolicyPath("https://x.com/planning-a-visit")).toBe(false);
  });

  it("rejects the homepage, sitemaps, and non-policy pages", () => {
    expect(isPolicyPath("https://x.com")).toBe(false);
    expect(isPolicyPath("https://x.com/")).toBe(false);
    expect(isPolicyPath("https://x.com/sitemap.xml")).toBe(false);
    expect(isPolicyPath("https://x.com/volunteer")).toBe(false);
  });
});

describe("selectPolicySubpages", () => {
  // Real /map output shapes, captured 2026-07-19.
  it("picks Crowley's policy pages and drops the rest", () => {
    const links = [
      "https://www.crowleyforwi.com/Plan",
      "https://www.crowleyforwi.com",
      "https://www.crowleyforwi.com/badger-basics",
      "https://www.crowleyforwi.com/sitemap.xml",
      "https://www.crowleyforwi.com/events",
      "https://www.crowleyforwi.com/issues",
      "https://www.crowleyforwi.com/privacy",
      "https://www.crowleyforwi.com/volunteer",
    ];
    expect(
      selectPolicySubpages({
        homepageUrl: "https://crowleyforwi.com",
        links,
        cap: 10,
      }),
      // Same depth, so ordering is alphabetical and case-insensitive:
      // "issues" sorts before "Plan".
    ).toEqual([
      "https://www.crowleyforwi.com/issues",
      "https://www.crowleyforwi.com/Plan",
    ]);
  });

  it("never registers the homepage itself, in any spelling", () => {
    const out = selectPolicySubpages({
      homepageUrl: "https://crowleyforwi.com",
      links: [
        "https://crowleyforwi.com",
        "https://www.crowleyforwi.com/",
        "https://crowleyforwi.com/plan",
      ],
      cap: 10,
    });
    expect(out).toEqual(["https://crowleyforwi.com/plan"]);
  });

  it("drops off-domain links (ActBlue, socials)", () => {
    const out = selectPolicySubpages({
      homepageUrl: "https://crowleyforwi.com",
      links: [
        "https://secure.actblue.com/donate/crowley/issues",
        "https://twitter.com/crowley/plan",
        "https://crowleyforwi.com/issues",
      ],
      cap: 10,
    });
    expect(out).toEqual(["https://crowleyforwi.com/issues"]);
  });

  it("caps at N, preferring shallower paths then alphabetical", () => {
    const links = [
      "https://francescahong.com/policy/veterans",
      "https://francescahong.com/policy/universal-childcare",
      "https://francescahong.com/policy",
      "https://francescahong.com/policy/firewall",
    ];
    expect(
      selectPolicySubpages({
        homepageUrl: "https://francescahong.com",
        links,
        cap: 2,
      }),
    ).toEqual([
      "https://francescahong.com/policy",
      "https://francescahong.com/policy/firewall",
    ]);
  });

  it("dedups the same page seen twice (trailing slash, scheme)", () => {
    const out = selectPolicySubpages({
      homepageUrl: "https://francescahong.com",
      links: [
        "https://francescahong.com/policy",
        "https://francescahong.com/policy/",
        "http://francescahong.com/policy",
      ],
      cap: 10,
    });
    expect(out).toHaveLength(1);
  });

  it("returns [] when the homepage is unparseable", () => {
    expect(
      selectPolicySubpages({
        homepageUrl: "nonsense",
        links: ["https://x.com/policy"],
        cap: 10,
      }),
    ).toEqual([]);
  });
});
